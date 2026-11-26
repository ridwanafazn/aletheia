import { randomInt, randomUUID } from "node:crypto";

import { pool, runWithTenant, systemQuery } from "@aletheia/database";
import { incrementCounter, withSpan } from "@aletheia/observability";
import {
  ClaimListQuerySchema,
  ClaimSummaryPageSchema,
  ComplianceReviewRequestSchema,
  CreateClaimRequestSchema,
  DecideClaimRequestSchema,
  DisburseClaimRequestSchema,
  PaymentWebhookEventSchema,
  PaymentWebhookRequestSchema,
  SubmitClaimRequestSchema,
  UpdateClaimRequestSchema,
  UploadSignatureRequestSchema,
  type ClaimPayment,
  type ClaimStatus,
  type Role,
} from "@aletheia/shared-contracts";
import { Router, type Request, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import {
  CLAIM_SELECT_COLUMNS,
  getClaimDetail,
  toClaimSummary,
  type ClaimRow,
} from "../lib/claim-model.js";
import { assertTrustedCloudinaryUrl, createUploadSignature } from "../lib/cloudinary.js";
import { isLockNotAvailable } from "../lib/db-errors.js";
import { ApiError } from "../lib/errors.js";
import { beginIdempotency, completeIdempotency } from "../lib/idempotency.js";
import { compareMoney, isPositiveMoney } from "../lib/money.js";
import { getPaymentProvider, verifyMockWebhookSignature } from "../lib/payments.js";
import { hashBankAccount, hashNik, maskBankAccount, maskNik } from "../lib/pii.js";
import { getActiveClaimsPolicy, getBoundClaimsPolicy } from "../lib/policy.js";
import { buildClaimRiskEvent, publishClaimRiskEvent } from "../lib/qstash.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { requireRoles } from "../middleware/authorize.js";
import { requireIdempotencyKey, idempotencyRequestHash } from "../lib/request-idempotency.js";
import { routeClaim } from "../lib/routing.js";
import { evaluateClaimRisk } from "../lib/risk.js";
import { sendData } from "../lib/response.js";

const ClaimIdParamSchema = z.string().uuid();

const CLAIM_READ_ROLES: Role[] = [
  "CLAIMS_OFFICER",
  "BRANCH_MANAGER",
  "FINANCE_MANAGER",
  "COMPLIANCE_ADMIN",
  "MIS_ANALYST",
];

interface DisbursementRow {
  id: string;
  claim_id: string;
  provider: "MOCK" | "XENDIT" | "MIDTRANS";
  provider_reference: string | null;
  amount: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REVERSED";
  idempotency_key: string;
  requested_by: string;
  approved_by: string;
  requested_at: Date;
  paid_at: Date | null;
  failure_reason: string | null;
}

function toClaimPayment(row: DisbursementRow): ClaimPayment {
  return {
    id: row.id,
    claim_id: row.claim_id,
    provider: row.provider,
    provider_reference: row.provider_reference,
    amount: row.amount,
    status: row.status,
    idempotency_key: row.idempotency_key,
    requested_by: row.requested_by,
    approved_by: row.approved_by,
    requested_at: row.requested_at.toISOString(),
    paid_at: row.paid_at?.toISOString() ?? null,
    failure_reason: row.failure_reason,
  };
}

function scopedBranchId(auth: NonNullable<Request["auth"]>): string | undefined {
  return auth.role === "CLAIMS_OFFICER" || auth.role === "BRANCH_MANAGER"
    ? auth.branchId
    : undefined;
}

async function insertDocuments(
  client: PoolClient,
  tenantId: string,
  claimId: string,
  uploadedBy: string,
  documents: Array<{
    document_type: string;
    cloudinary_public_id: string;
    secure_url: string;
    mime_type: string;
    file_size_bytes: number;
  }>,
): Promise<void> {
  for (const document of documents) {
    assertTrustedCloudinaryUrl(document.secure_url);
    await client.query(
      `insert into claims.documents
        (id, tenant_id, claim_id, document_type, cloudinary_public_id, secure_url,
         mime_type, file_size_bytes, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        tenantId,
        claimId,
        document.document_type,
        document.cloudinary_public_id,
        document.secure_url,
        document.mime_type,
        document.file_size_bytes,
        uploadedBy,
      ],
    );
  }
}

async function generateClaimNumber(client: PoolClient, tenantId: string): Promise<string> {
  const tenant = await client.query<{ code: string }>(
    `select code from governance.tenants where id = $1 and status = 'ACTIVE' limit 1`,
    [tenantId],
  );
  const code = tenant.rows[0]?.code;
  if (code === undefined) {
    throw ApiError.notFound("Tenant tidak ditemukan atau tidak aktif");
  }
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `CLM-${code}-${year}${month}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

async function lockClaim(client: PoolClient, tenantId: string, claimId: string): Promise<ClaimRow> {
  let row: ClaimRow | undefined;
  try {
    const result = await client.query<ClaimRow>(
      `select ${CLAIM_SELECT_COLUMNS}
         from claims.submissions s
         join governance.policy_versions p
           on p.id = s.policy_version_id
          and p.tenant_id = s.tenant_id
        where s.tenant_id = $1
          and s.id = $2
        for update of s nowait`,
      [tenantId, claimId],
    );
    row = result.rows[0];
  } catch (error) {
    if (isLockNotAvailable(error)) {
      throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Klaim sedang diproses oleh permintaan lain");
    }
    throw error;
  }

  if (row === undefined) {
    throw ApiError.notFound("Klaim tidak ditemukan");
  }
  return row;
}

async function requireClaimDocuments(
  client: PoolClient,
  claim: ClaimRow,
  required: readonly string[],
): Promise<void> {
  const documents = await client.query<{ document_type: string }>(
    `select document_type from claims.documents where tenant_id = $1 and claim_id = $2`,
    [claim.tenant_id, claim.id],
  );
  const present = new Set(documents.rows.map((row) => row.document_type));
  const missing = required.filter((type) => !present.has(type));
  if (missing.length > 0) {
    throw ApiError.policyViolation(`Dokumen wajib belum lengkap: ${missing.join(", ")}`);
  }
}

export const claimsRouter: RouterType = Router();

claimsRouter.post("/upload-signature", requireRoles("CLAIMS_OFFICER"), (request, response) => {
  const auth = request.auth!;
  const input = UploadSignatureRequestSchema.parse(request.body);
  sendData(
    response,
    createUploadSignature({
      tenantId: auth.tenantId,
      documentType: input.document_type,
      mimeType: input.mime_type,
    }),
  );
});

claimsRouter.post("/", requireRoles("CLAIMS_OFFICER"), async (request, response) => {
  const auth = request.auth!;
  const input = CreateClaimRequestSchema.parse(request.body);
  const idempotencyKey = requireIdempotencyKey(request);
  const requestHash = idempotencyRequestHash({ body: input, branch_id: auth.branchId });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const idempotency = await beginIdempotency(client, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      scope: "POST:/api/v1/claims",
      key: idempotencyKey,
      requestHash,
    });

    if (idempotency.kind === "replay") {
      await client.query("ROLLBACK");
      response.setHeader("x-idempotent-replay", "true");
      sendData(response, idempotency.response.data, 200);
      return;
    }

    const policy = await getActiveClaimsPolicy(client, auth.tenantId);
    if (
      compareMoney(
        input.requested_amount,
        policy.rules.approval_tiers.level_2_finance_manager_max,
      ) > 0
    ) {
      throw ApiError.policyViolation("Nominal klaim melebihi pagu maksimal kebijakan");
    }

    const branch = await client.query<{ id: string }>(
      `select id from governance.branches where id = $1 and tenant_id = $2 limit 1`,
      [auth.branchId, auth.tenantId],
    );
    if (branch.rows.length !== 1) {
      throw ApiError.notFound("Cabang tidak ditemukan pada tenant ini");
    }

    let claimId: string | null = null;
    for (let attempt = 0; attempt < 5 && claimId === null; attempt += 1) {
      const claimNumber = await generateClaimNumber(client, auth.tenantId);
      const inserted = await client.query<{ id: string }>(
        `insert into claims.submissions
          (id, tenant_id, claim_number, branch_id, policy_version_id, claimant_name,
           claimant_nik_hash, claimant_nik_masked, bank_account_hash, bank_account_masked,
           claim_category, requested_amount, status, created_by, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'DRAFT',$13,$14)
         on conflict (tenant_id, claim_number) do nothing
         returning id`,
        [
          randomUUID(),
          auth.tenantId,
          claimNumber,
          auth.branchId,
          policy.id,
          input.claimant_name,
          hashNik(input.claimant_nik),
          maskNik(input.claimant_nik),
          hashBankAccount(input.claimant_bank_account),
          maskBankAccount(input.claimant_bank_account),
          input.claim_category,
          input.requested_amount,
          auth.userId,
          idempotencyKey,
        ],
      );
      claimId = inserted.rows[0]?.id ?? null;
    }

    if (claimId === null) {
      throw new Error("Gagal membuat nomor klaim unik");
    }

    await insertDocuments(client, auth.tenantId, claimId, auth.userId, input.documents ?? []);

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "CLAIMS",
        entityType: "CLAIM",
        entityId: claimId,
        action: "CLAIM_DRAFT_CREATED",
        policyVersionId: policy.id,
        decisionContext: {
          claim_category: input.claim_category,
          requested_amount: input.requested_amount,
          document_count: input.documents?.length ?? 0,
          policy_version_tag: policy.versionTag,
        },
        correlationId: request.correlationId,
      },
      client,
    );

    const detail = await getClaimDetail(client, auth.tenantId, claimId);
    if (detail === null) {
      throw new Error("Klaim yang baru dibuat tidak ditemukan");
    }

    await completeIdempotency(client, idempotency.recordId, {
      status: 201,
      data: detail as unknown as Record<string, unknown>,
    });
    await client.query("COMMIT");
    sendData(response, detail, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

claimsRouter.get("/", requireRoles(...CLAIM_READ_ROLES), async (request, response) => {
  const auth = request.auth!;
  const query = ClaimListQuerySchema.parse(request.query);
  const conditions = ["s.tenant_id = $1"];
  const values: unknown[] = [auth.tenantId];

  const branchScope = scopedBranchId(auth);
  if (branchScope !== undefined) {
    values.push(branchScope);
    conditions.push(`s.branch_id = $${values.length}`);
  }
  if (query.branch_id !== undefined) {
    values.push(query.branch_id);
    conditions.push(`s.branch_id = $${values.length}`);
  }
  if (query.status !== undefined) {
    values.push(query.status);
    conditions.push(`s.status = $${values.length}`);
  }
  if (query.claim_category !== undefined) {
    values.push(query.claim_category);
    conditions.push(`s.claim_category = $${values.length}`);
  }
  if (query.has_conflict_flag !== undefined) {
    values.push(query.has_conflict_flag);
    conditions.push(`s.has_conflict_flag = $${values.length}`);
  }
  if (query.from !== undefined) {
    values.push(query.from);
    conditions.push(`s.created_at >= $${values.length}::date`);
  }
  if (query.to !== undefined) {
    values.push(query.to);
    conditions.push(`s.created_at < ($${values.length}::date + interval '1 day')`);
  }
  if (query.cursor !== undefined) {
    const cursor = decodeCursor(query.cursor);
    values.push(cursor.createdAt, cursor.id);
    conditions.push(
      `(s.created_at, s.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
    );
  }

  values.push(query.limit + 1);
  const result = await pool.query<ClaimRow>(
    `select ${CLAIM_SELECT_COLUMNS}
       from claims.submissions s
       join governance.policy_versions p
         on p.id = s.policy_version_id
        and p.tenant_id = s.tenant_id
      where ${conditions.join(" AND ")}
      order by s.created_at desc, s.id desc
      limit $${values.length}`,
    values,
  );

  const hasMore = result.rows.length > query.limit;
  const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
  const last = rows.at(-1);
  const data = {
    items: rows.map(toClaimSummary),
    meta: {
      next_cursor: hasMore && last !== undefined ? encodeCursor(last.created_at, last.id) : null,
      has_more: hasMore,
    },
  };
  ClaimSummaryPageSchema.parse(data);
  sendData(response, data);
});

claimsRouter.get(
  "/payments/:id",
  requireRoles("FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const paymentId = ClaimIdParamSchema.parse(request.params.id);
    const result = await pool.query<DisbursementRow>(
      `select id, claim_id, provider, provider_reference, amount, status, idempotency_key,
              requested_by, approved_by, requested_at, paid_at, failure_reason
         from claims.disbursements
        where tenant_id = $1
          and id = $2
        limit 1`,
      [auth.tenantId, paymentId],
    );
    const payment = result.rows[0];
    if (payment === undefined) {
      throw ApiError.notFound("Payment klaim tidak ditemukan");
    }
    sendData(response, toClaimPayment(payment));
  },
);

claimsRouter.post("/payments/webhook/:provider", async (request, response) => {
  const provider = z.enum(["MOCK", "XENDIT", "MIDTRANS"]).parse(request.params.provider);
  const input = PaymentWebhookRequestSchema.parse(request.body);
  const event = PaymentWebhookEventSchema.parse(input.body);

  if (event.provider !== provider) {
    throw new ApiError(422, "ERR_PAYMENT_STATE_CONFLICT", "Provider webhook tidak cocok");
  }
  if (provider !== "MOCK") {
    throw new ApiError(424, "ERR_PAYMENT_PROVIDER_FAILED", "Provider webhook belum dikonfigurasi");
  }
  if (!verifyMockWebhookSignature(event, input.signature)) {
    throw ApiError.unauthorized("Signature webhook tidak valid");
  }

  const resolved = await systemQuery<{ tenant_id: string }>(
    `select claims.resolve_disbursement_tenant($1, $2) as tenant_id`,
    [provider, event.provider_reference],
  );
  const tenantId = resolved.rows[0]?.tenant_id;
  if (tenantId === undefined) {
    throw ApiError.notFound("Payment untuk webhook tidak ditemukan");
  }

  await runWithTenant(tenantId, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const disbursements = await client.query<DisbursementRow>(
        `select id, claim_id, provider, provider_reference, amount, status, idempotency_key,
              requested_by, approved_by, requested_at, paid_at, failure_reason
         from claims.disbursements
        where provider = $1
          and provider_reference = $2
        for update`,
        [provider, event.provider_reference],
      );
      const disbursement = disbursements.rows[0];
      if (disbursement === undefined) {
        await client.query("ROLLBACK");
        throw ApiError.notFound("Payment untuk webhook tidak ditemukan");
      }
      if (compareMoney(event.amount, disbursement.amount) !== 0) {
        await client.query("ROLLBACK");
        throw new ApiError(422, "ERR_PAYMENT_STATE_CONFLICT", "Nominal webhook tidak cocok");
      }

      if (
        event.status === "PAID" &&
        (disbursement.status === "PENDING" ||
          disbursement.status === "PROCESSING" ||
          disbursement.status === "FAILED")
      ) {
        await client.query(
          `update claims.disbursements
            set status = 'PAID',
                paid_at = $2,
                failure_reason = null
          where id = $1`,
          [disbursement.id, event.occurred_at],
        );
        await client.query(
          `update claims.submissions
            set status = 'DISBURSED',
                finalized_at = coalesce(finalized_at, now()),
                updated_at = now()
          where tenant_id = $1
            and id = $2
            and status = 'APPROVED'`,
          [tenantId, disbursement.claim_id],
        );
        await appendAudit(
          {
            tenantId,
            actorId: disbursement.requested_by,
            actorRole: "FINANCE_MANAGER",
            domain: "CLAIMS",
            entityType: "CLAIM",
            entityId: disbursement.claim_id,
            action: "CLAIM_DISBURSED",
            policyVersionId: null,
            decisionContext: {
              payment_id: disbursement.id,
              provider: disbursement.provider,
              provider_reference: disbursement.provider_reference,
              amount: disbursement.amount,
              source: "PROVIDER_WEBHOOK",
            },
            correlationId: request.correlationId,
          },
          client,
        );
      } else if (
        event.status === "FAILED" &&
        (disbursement.status === "PENDING" || disbursement.status === "PROCESSING")
      ) {
        await client.query(
          `update claims.disbursements
            set status = 'FAILED',
                failure_reason = 'Provider melaporkan kegagalan'
          where id = $1`,
          [disbursement.id],
        );
        await appendAudit(
          {
            tenantId,
            actorId: disbursement.requested_by,
            actorRole: "FINANCE_MANAGER",
            domain: "CLAIMS",
            entityType: "CLAIM",
            entityId: disbursement.claim_id,
            action: "CLAIM_DISBURSEMENT_FAILED",
            policyVersionId: null,
            decisionContext: {
              payment_id: disbursement.id,
              provider: disbursement.provider,
              source: "PROVIDER_WEBHOOK",
            },
            correlationId: request.correlationId,
          },
          client,
        );
      }

      await client.query("COMMIT");
      if (event.status === "PAID") {
        incrementCounter("payment_success_total", { provider });
      } else if (event.status === "FAILED") {
        incrementCounter("payment_failure_total", { provider });
      }
      sendData(response, { received: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});

claimsRouter.get("/:id", requireRoles(...CLAIM_READ_ROLES), async (request, response) => {
  const auth = request.auth!;
  const claimId = ClaimIdParamSchema.parse(request.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const detail = await getClaimDetail(client, auth.tenantId, claimId, scopedBranchId(auth));
    if (detail === null) {
      throw ApiError.notFound("Klaim tidak ditemukan");
    }
    await client.query("COMMIT");
    sendData(response, detail);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

claimsRouter.patch("/:id", requireRoles("CLAIMS_OFFICER"), async (request, response) => {
  const auth = request.auth!;
  const claimId = ClaimIdParamSchema.parse(request.params.id);
  const input = UpdateClaimRequestSchema.parse(request.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const claim = await lockClaim(client, auth.tenantId, claimId);
    if (claim.created_by !== auth.userId || claim.branch_id !== auth.branchId) {
      throw ApiError.forbidden("Hanya pembuat klaim pada cabang yang sama dapat merevisi");
    }
    if (claim.status !== "DRAFT" && claim.status !== "RETURNED") {
      throw new ApiError(
        409,
        "ERR_CONCURRENT_LOCK",
        "Klaim hanya dapat direvisi pada status DRAFT atau RETURNED",
      );
    }

    const nextNikHash =
      input.claimant_nik === undefined ? claim.claimant_nik_hash : hashNik(input.claimant_nik);
    const nextNikMasked =
      input.claimant_nik === undefined ? claim.claimant_nik_masked : maskNik(input.claimant_nik);
    const nextBankHash =
      input.claimant_bank_account === undefined
        ? claim.bank_account_hash
        : hashBankAccount(input.claimant_bank_account);
    const nextBankMasked =
      input.claimant_bank_account === undefined
        ? claim.bank_account_masked
        : maskBankAccount(input.claimant_bank_account);

    await client.query(
      `update claims.submissions
          set claimant_name = $3,
              claimant_nik_hash = $4,
              claimant_nik_masked = $5,
              bank_account_hash = $6,
              bank_account_masked = $7,
              claim_category = $8,
              requested_amount = $9,
              approved_amount = null,
              risk_score = 0,
              risk_evaluated_at = null,
              has_conflict_flag = false,
              compliance_reviewed_by = null,
              compliance_reviewed_at = null,
              submitted_at = null,
              finalized_at = null,
              updated_at = now()
        where tenant_id = $1
          and id = $2`,
      [
        auth.tenantId,
        claimId,
        input.claimant_name ?? claim.claimant_name,
        nextNikHash,
        nextNikMasked,
        nextBankHash,
        nextBankMasked,
        input.claim_category ?? claim.claim_category,
        input.requested_amount ?? claim.requested_amount,
      ],
    );

    if (input.documents !== undefined) {
      await client.query(`delete from claims.documents where tenant_id = $1 and claim_id = $2`, [
        auth.tenantId,
        claimId,
      ]);
      await insertDocuments(client, auth.tenantId, claimId, auth.userId, input.documents);
    }

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "CLAIMS",
        entityType: "CLAIM",
        entityId: claimId,
        action: "CLAIM_UPDATED",
        policyVersionId: claim.policy_version_id,
        decisionContext: {
          changed_fields: Object.keys(input),
          before: {
            claimant_name: claim.claimant_name,
            claimant_nik_masked: claim.claimant_nik_masked,
            bank_account_masked: claim.bank_account_masked,
            claim_category: claim.claim_category,
            requested_amount: claim.requested_amount,
          },
          after: {
            claimant_name: input.claimant_name ?? claim.claimant_name,
            claimant_nik_masked: nextNikMasked,
            bank_account_masked: nextBankMasked,
            claim_category: input.claim_category ?? claim.claim_category,
            requested_amount: input.requested_amount ?? claim.requested_amount,
          },
        },
        correlationId: request.correlationId,
      },
      client,
    );

    const detail = await getClaimDetail(client, auth.tenantId, claimId);
    if (detail === null) {
      throw new Error("Klaim hasil revisi tidak ditemukan");
    }
    await client.query("COMMIT");
    sendData(response, detail);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

claimsRouter.post("/:id/submit", requireRoles("CLAIMS_OFFICER"), async (request, response) => {
  const auth = request.auth!;
  const claimId = ClaimIdParamSchema.parse(request.params.id);
  SubmitClaimRequestSchema.parse(request.body ?? {});
  const client = await pool.connect();
  let event: ReturnType<typeof buildClaimRiskEvent> | undefined;

  try {
    await client.query("BEGIN");
    const claim = await lockClaim(client, auth.tenantId, claimId);
    if (claim.created_by !== auth.userId || claim.branch_id !== auth.branchId) {
      throw ApiError.forbidden("Hanya pembuat klaim pada cabang yang sama dapat submit");
    }
    if (claim.status !== "DRAFT" && claim.status !== "RETURNED") {
      throw new ApiError(
        409,
        "ERR_CONCURRENT_LOCK",
        "Klaim hanya dapat disubmit pada status DRAFT atau RETURNED",
      );
    }

    const policy = await getBoundClaimsPolicy(client, auth.tenantId, claim.policy_version_id);
    const route = routeClaim({
      requestedAmount: claim.requested_amount,
      riskScore: 0,
      hasConflictFlag: false,
      rules: policy.rules,
    });
    if (route.kind === "LIMIT_EXCEEDED") {
      throw ApiError.policyViolation("Nominal klaim melebihi pagu maksimal kebijakan");
    }

    const required = policy.rules.required_documents_by_category[claim.claim_category];
    await requireClaimDocuments(client, claim, required);

    await client.query(
      `update claims.submissions
          set status = 'RISK_PENDING',
              submitted_at = now(),
              approved_amount = null,
              risk_score = 0,
              risk_evaluated_at = null,
              has_conflict_flag = false,
              compliance_reviewed_by = null,
              compliance_reviewed_at = null,
              finalized_at = null,
              updated_at = now()
        where tenant_id = $1
          and id = $2`,
      [auth.tenantId, claimId],
    );

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "CLAIMS",
        entityType: "CLAIM",
        entityId: claimId,
        action: "CLAIM_SUBMITTED",
        policyVersionId: claim.policy_version_id,
        decisionContext: {
          claim_category: claim.claim_category,
          requested_amount: claim.requested_amount,
          policy_version_tag: policy.versionTag,
        },
        correlationId: request.correlationId,
      },
      client,
    );

    await evaluateClaimRisk(client, claim, policy.rules, request.correlationId);

    const detail = await getClaimDetail(client, auth.tenantId, claimId);
    if (detail === null) {
      throw new Error("Klaim hasil submit tidak ditemukan");
    }

    event = buildClaimRiskEvent({
      tenant_id: auth.tenantId,
      claim_id: claimId,
      policy_version_id: claim.policy_version_id,
      correlation_id: request.correlationId,
    });
    await client.query("COMMIT");
    incrementCounter("claims_submitted_total", {
      tenant_id: auth.tenantId,
      claim_category: claim.claim_category,
    });
    sendData(response, detail);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (event !== undefined) {
    await publishClaimRiskEvent(event);
  }
});

claimsRouter.post(
  "/:id/decide",
  requireRoles("CLAIMS_OFFICER", "BRANCH_MANAGER", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const claimId = ClaimIdParamSchema.parse(request.params.id);
    const input = DecideClaimRequestSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const requestHash = idempotencyRequestHash({ body: input, claim_id: claimId });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const claim = await lockClaim(client, auth.tenantId, claimId);
      if (auth.role === "BRANCH_MANAGER" && claim.branch_id !== auth.branchId) {
        throw ApiError.notFound("Klaim tidak ditemukan");
      }

      const idempotency = await beginIdempotency(client, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        scope: `POST:/api/v1/claims/${claimId}/decide`,
        key: idempotencyKey,
        requestHash,
      });
      if (idempotency.kind === "replay") {
        await client.query("ROLLBACK");
        response.setHeader("x-idempotent-replay", "true");
        sendData(response, idempotency.response.data, 200);
        return;
      }

      if (claim.created_by === auth.userId) {
        throw new ApiError(
          403,
          "ERR_SOD_VIOLATION",
          "Pembuat klaim tidak boleh menyetujui klaim sendiri",
        );
      }
      if (auth.role === "CLAIMS_OFFICER") {
        throw ApiError.forbidden("Claims Officer tidak berwenang memutuskan klaim");
      }

      if (claim.status === "RISK_PENDING" || claim.status === "SUBMITTED") {
        throw new ApiError(409, "ERR_RISK_PENDING", "Evaluasi risiko belum selesai");
      }
      if (claim.status === "COMPLIANCE_REVIEW") {
        throw new ApiError(409, "ERR_COMPLIANCE_REVIEW_PENDING", "Klaim menunggu review kepatuhan");
      }
      if (claim.has_conflict_flag && claim.compliance_reviewed_at === null) {
        throw new ApiError(
          409,
          "ERR_COMPLIANCE_REVIEW_PENDING",
          "Klaim dengan konflik wajib direview kepatuhan",
        );
      }

      const policy = await getBoundClaimsPolicy(client, auth.tenantId, claim.policy_version_id);
      const route = routeClaim({
        requestedAmount: claim.requested_amount,
        riskScore: claim.risk_score,
        hasConflictFlag: claim.has_conflict_flag,
        rules: policy.rules,
      });
      if (route.kind === "LIMIT_EXCEEDED") {
        throw ApiError.policyViolation("Nominal klaim melebihi pagu maksimal kebijakan");
      }

      const requiredStatus: ClaimStatus = route.kind === "LEVEL_2" ? "ESCALATED" : "UNDER_REVIEW";
      if (claim.status !== requiredStatus) {
        throw new ApiError(
          409,
          "ERR_CONCURRENT_LOCK",
          "Status klaim tidak sesuai dengan jalur persetujuannya",
        );
      }
      if (route.kind === "LEVEL_2" && auth.role !== "FINANCE_MANAGER") {
        throw ApiError.forbidden("Klaim ini memerlukan persetujuan Finance Manager");
      }

      if (
        input.decision === "APPROVED" &&
        input.approved_amount !== undefined &&
        compareMoney(input.approved_amount, claim.requested_amount) > 0
      ) {
        throw ApiError.policyViolation("Nominal disetujui melebihi nominal yang diajukan");
      }

      const reasonNotes =
        input.reason_notes ?? "Disetujui sesuai kebijakan dan batas kewenangan yang berlaku";
      const stepLevel = route.kind === "LEVEL_2" ? 2 : 1;
      const nextStatus: ClaimStatus =
        input.decision === "APPROVED"
          ? "APPROVED"
          : input.decision === "REJECTED"
            ? "REJECTED"
            : "RETURNED";

      await client.query(
        `insert into claims.approval_steps
          (id, tenant_id, claim_id, step_level, approver_id, decision, reason_notes)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), auth.tenantId, claimId, stepLevel, auth.userId, input.decision, reasonNotes],
      );

      await client.query(
        `update claims.submissions
            set status = $3,
                approved_amount = $4,
                finalized_at = $5,
                updated_at = now()
          where tenant_id = $1
            and id = $2`,
        [
          auth.tenantId,
          claimId,
          nextStatus,
          input.decision === "APPROVED" ? (input.approved_amount ?? null) : null,
          nextStatus === "APPROVED" || nextStatus === "REJECTED" ? new Date() : null,
        ],
      );

      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "CLAIMS",
          entityType: "CLAIM",
          entityId: claimId,
          action:
            input.decision === "APPROVED"
              ? "CLAIM_APPROVED"
              : input.decision === "REJECTED"
                ? "CLAIM_REJECTED"
                : "CLAIM_RETURNED",
          policyVersionId: claim.policy_version_id,
          decisionContext: {
            decision: input.decision,
            step_level: stepLevel,
            approved_amount: input.approved_amount ?? null,
            requested_amount: claim.requested_amount,
            reason_notes: reasonNotes,
            risk_score: claim.risk_score,
          },
          correlationId: request.correlationId,
        },
        client,
      );

      const detail = await getClaimDetail(client, auth.tenantId, claimId);
      if (detail === null) {
        throw new Error("Klaim hasil keputusan tidak ditemukan");
      }
      await completeIdempotency(client, idempotency.recordId, {
        status: 200,
        data: detail as unknown as Record<string, unknown>,
      });
      await client.query("COMMIT");
      incrementCounter("claims_decided_total", {
        tenant_id: auth.tenantId,
        decision: input.decision,
        level: String(stepLevel),
      });
      sendData(response, detail);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

claimsRouter.post(
  "/:id/compliance-review",
  requireRoles("COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const claimId = ClaimIdParamSchema.parse(request.params.id);
    const input = ComplianceReviewRequestSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const claim = await lockClaim(client, auth.tenantId, claimId);
      if (!claim.has_conflict_flag && claim.status !== "COMPLIANCE_REVIEW") {
        throw ApiError.policyViolation("Klaim tidak memiliki konflik yang perlu direview");
      }
      if (claim.compliance_reviewed_at !== null) {
        throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Review kepatuhan sudah dicatat");
      }

      await client.query(
        `update analytics.anomaly_flags
            set resolution_status = $3,
                resolved_by = $4
          where tenant_id = $1
            and claim_id = $2`,
        [auth.tenantId, claimId, input.resolution, auth.userId],
      );

      const policy = await getBoundClaimsPolicy(client, auth.tenantId, claim.policy_version_id);
      const route = routeClaim({
        requestedAmount: claim.requested_amount,
        riskScore: claim.risk_score,
        hasConflictFlag: claim.has_conflict_flag,
        rules: policy.rules,
      });
      if (route.kind === "LIMIT_EXCEEDED") {
        throw ApiError.policyViolation("Nominal klaim melebihi pagu maksimal kebijakan");
      }
      const nextStatus: ClaimStatus =
        input.resolution === "CONFIRMED_FRAUD"
          ? "REJECTED"
          : route.kind === "LEVEL_2"
            ? "ESCALATED"
            : "UNDER_REVIEW";

      await client.query(
        `update claims.submissions
            set status = $3,
                compliance_reviewed_by = $4,
                compliance_reviewed_at = now(),
                finalized_at = $5,
                updated_at = now()
          where tenant_id = $1
            and id = $2`,
        [
          auth.tenantId,
          claimId,
          nextStatus,
          auth.userId,
          nextStatus === "REJECTED" ? new Date() : null,
        ],
      );

      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "CLAIMS",
          entityType: "CLAIM",
          entityId: claimId,
          action:
            input.resolution === "CONFIRMED_FRAUD"
              ? "CLAIM_FRAUD_CONFIRMED"
              : "CLAIM_COMPLIANCE_REVIEWED",
          policyVersionId: claim.policy_version_id,
          decisionContext: {
            resolution: input.resolution,
            reason_notes: input.reason_notes,
          },
          correlationId: request.correlationId,
        },
        client,
      );

      const detail = await getClaimDetail(client, auth.tenantId, claimId);
      if (detail === null) {
        throw new Error("Klaim hasil review tidak ditemukan");
      }
      await client.query("COMMIT");
      sendData(response, detail);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

claimsRouter.post("/:id/disburse", requireRoles("FINANCE_MANAGER"), async (request, response) => {
  const auth = request.auth!;
  const claimId = ClaimIdParamSchema.parse(request.params.id);
  const input = DisburseClaimRequestSchema.parse(request.body);
  const idempotencyKey = requireIdempotencyKey(request);
  const provider = getPaymentProvider(input.provider);
  const client = await pool.connect();
  let disbursementId: string | undefined;
  let disbursementAmount: string | undefined;

  try {
    await client.query("BEGIN");
    const claim = await lockClaim(client, auth.tenantId, claimId);

    const existingKey = await client.query<DisbursementRow>(
      `select id, claim_id, provider, provider_reference, amount, status, idempotency_key,
                requested_by, approved_by, requested_at, paid_at, failure_reason
           from claims.disbursements
          where tenant_id = $1
            and idempotency_key = $2
          limit 1`,
      [auth.tenantId, idempotencyKey],
    );
    if (existingKey.rows[0] !== undefined) {
      if (existingKey.rows[0].claim_id !== claimId) {
        throw new ApiError(
          409,
          "ERR_IDEMPOTENCY_CONFLICT",
          "Kunci idempotensi sudah dipakai untuk klaim lain",
        );
      }
      await client.query("ROLLBACK");
      response.setHeader("x-idempotent-replay", "true");
      sendData(response, toClaimPayment(existingKey.rows[0]), 200);
      return;
    }

    if (claim.status !== "APPROVED" || claim.approved_amount === null) {
      throw new ApiError(
        409,
        "ERR_PAYMENT_STATE_CONFLICT",
        "Hanya klaim APPROVED dengan nominal final yang dapat dicairkan",
      );
    }
    if (!isPositiveMoney(claim.approved_amount)) {
      throw ApiError.policyViolation("Nominal pencairan harus lebih besar dari nol");
    }

    const active = await client.query<{ id: string }>(
      `select id
           from claims.disbursements
          where tenant_id = $1
            and claim_id = $2
            and status in ('PENDING','PROCESSING','PAID')
          limit 1`,
      [auth.tenantId, claimId],
    );
    if (active.rows.length > 0) {
      throw new ApiError(
        409,
        "ERR_PAYMENT_STATE_CONFLICT",
        "Pencairan aktif atau lunas sudah ada untuk klaim ini",
      );
    }

    disbursementId = randomUUID();
    disbursementAmount = claim.approved_amount;
    await client.query(
      `insert into claims.disbursements
          (id, tenant_id, claim_id, policy_version_id, provider, amount, status,
           idempotency_key, requested_by, approved_by, requested_at)
         values ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$8,now())`,
      [
        disbursementId,
        auth.tenantId,
        claimId,
        claim.policy_version_id,
        input.provider,
        claim.approved_amount,
        idempotencyKey,
        auth.userId,
      ],
    );

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "CLAIMS",
        entityType: "CLAIM",
        entityId: claimId,
        action: "CLAIM_DISBURSEMENT_REQUESTED",
        policyVersionId: claim.policy_version_id,
        decisionContext: {
          disbursement_id: disbursementId,
          provider: input.provider,
          amount: claim.approved_amount,
        },
        correlationId: request.correlationId,
      },
      client,
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (disbursementId === undefined || disbursementAmount === undefined) {
    throw new Error("Disbursement tidak terbentuk");
  }

  let intent;
  try {
    intent = await withSpan(
      "payment.call",
      { "payment.provider": input.provider, "payment.operation": "create" },
      () =>
        provider.createPayment({
          tenantId: auth.tenantId,
          entityType: "CLAIM",
          entityId: claimId,
          provider: input.provider,
          amount: disbursementAmount,
          idempotencyKey: `${claimId}:${idempotencyKey}`,
          requestedBy: auth.userId,
          approvedBy: auth.userId,
          metadata: { claim_id: claimId },
        }),
    );
  } catch (error) {
    const failClient = await pool.connect();
    try {
      await failClient.query("BEGIN");
      await failClient.query(
        `update claims.disbursements
              set status = 'FAILED',
                  failure_reason = 'Provider gagal membuat payment'
            where tenant_id = $1
              and id = $2
              and status = 'PENDING'`,
        [auth.tenantId, disbursementId],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "CLAIMS",
          entityType: "CLAIM",
          entityId: claimId,
          action: "CLAIM_DISBURSEMENT_FAILED",
          policyVersionId: null,
          decisionContext: {
            disbursement_id: disbursementId,
            provider: input.provider,
            reason: error instanceof Error ? error.message : "unknown",
          },
          correlationId: request.correlationId,
        },
        failClient,
      );
      await failClient.query("COMMIT");
    } catch {
      await failClient.query("ROLLBACK").catch(() => undefined);
    } finally {
      failClient.release();
    }
    throw new ApiError(424, "ERR_PAYMENT_PROVIDER_FAILED", "Provider payment gagal");
  }

  const finalClient = await pool.connect();
  try {
    await finalClient.query("BEGIN");
    const updated = await finalClient.query<DisbursementRow>(
      `update claims.disbursements
            set provider_reference = $3,
                status = $4,
                paid_at = $5,
                failure_reason = $6
          where tenant_id = $1
            and id = $2
          returning id, claim_id, provider, provider_reference, amount, status,
                    idempotency_key, requested_by, approved_by, requested_at, paid_at,
                    failure_reason`,
      [
        auth.tenantId,
        disbursementId,
        intent.provider_reference,
        intent.status,
        intent.paid_at,
        intent.failure_reason,
      ],
    );

    if (intent.status === "PAID") {
      await finalClient.query(
        `update claims.submissions
              set status = 'DISBURSED',
                  finalized_at = coalesce(finalized_at, now()),
                  updated_at = now()
            where tenant_id = $1
              and id = $2
              and status = 'APPROVED'`,
        [auth.tenantId, claimId],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "CLAIMS",
          entityType: "CLAIM",
          entityId: claimId,
          action: "CLAIM_DISBURSED",
          policyVersionId: null,
          decisionContext: {
            disbursement_id: disbursementId,
            provider: input.provider,
            provider_reference: intent.provider_reference,
            amount: intent.amount,
          },
          correlationId: request.correlationId,
        },
        finalClient,
      );
    }

    await finalClient.query("COMMIT");
    if (intent.status === "PAID") {
      incrementCounter("payment_success_total", { provider: input.provider });
    } else if (intent.status === "FAILED") {
      incrementCounter("payment_failure_total", { provider: input.provider });
    }
    sendData(response, toClaimPayment(updated.rows[0]!), intent.status === "PAID" ? 201 : 202);
  } catch (error) {
    await finalClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    finalClient.release();
  }
});
