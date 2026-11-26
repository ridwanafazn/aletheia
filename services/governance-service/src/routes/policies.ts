import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  ApprovePolicyRequestSchema,
  ClaimsPolicySchema,
  IsoDateTimeSchema,
  PayrollPolicySchema,
  PolicyDomainSchema,
  PolicyListQuerySchema,
  PublishPolicyRequestSchema,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";
import { sha256Hex } from "../lib/hmac.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { sendData } from "../lib/response.js";
import { stableStringify } from "../lib/stable-json.js";
import { requireRoles } from "../middleware/authorize.js";

interface PolicyRow {
  id: string;
  tenant_id: string;
  domain: "CLAIMS_POLICY" | "PAYROLL_TAX_POLICY";
  version_tag: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  rules_payload: Record<string, unknown>;
  checksum_sha256: string;
  effective_from: Date;
  published_by: string;
  approved_by: string | null;
  created_at: Date;
}

const IdParamSchema = z.string().uuid();

const CreatePolicyEnvelopeSchema = z
  .object({
    domain: PolicyDomainSchema,
    version_tag: z.string().min(3).max(32),
    rules_payload: z.unknown(),
    effective_from: IsoDateTimeSchema,
  })
  .strict();

export const policyRouter: RouterType = Router();

policyRouter.get("/", async (request, response) => {
  const auth = request.auth!;
  const query = PolicyListQuerySchema.parse(request.query);
  const conditions = ["tenant_id = $1"];
  const values: unknown[] = [auth.tenantId];

  if (query.domain !== undefined) {
    values.push(query.domain);
    conditions.push(`domain = $${values.length}`);
  }
  if (query.status !== undefined) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }
  if (query.cursor !== undefined) {
    const cursor = decodeCursor(query.cursor);
    values.push(cursor.createdAt, cursor.id);
    conditions.push(
      `(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
    );
  }

  values.push(query.limit + 1);
  const limitIdx = values.length;
  const result = await pool.query<PolicyRow>(
    `select id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
            effective_from, published_by, approved_by, created_at
       from governance.policy_versions
      where ${conditions.join(" AND ")}
      order by created_at desc, id desc
      limit $${limitIdx}`,
    values,
  );

  const hasMore = result.rows.length > query.limit;
  const items = hasMore ? result.rows.slice(0, query.limit) : result.rows;
  const last = items.at(-1);
  sendData(response, items, 200, {
    next_cursor: hasMore && last !== undefined ? encodeCursor(last.created_at, last.id) : null,
    has_more: hasMore,
  });
});

policyRouter.get("/active/:domain", async (request, response) => {
  const auth = request.auth!;
  const domain = PolicyDomainSchema.parse(request.params.domain);
  const result = await pool.query<PolicyRow>(
    `select id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
            effective_from, published_by, approved_by, created_at
       from governance.policy_versions
      where tenant_id = $1
        and domain = $2
        and status = 'ACTIVE'
      limit 1`,
    [auth.tenantId, domain],
  );

  if (result.rows.length !== 1) {
    throw ApiError.notFound("Kebijakan aktif tidak ditemukan");
  }

  sendData(response, result.rows[0]);
});

policyRouter.post("/", requireRoles("COMPLIANCE_ADMIN"), async (request, response) => {
  const auth = request.auth!;
  const input = CreatePolicyEnvelopeSchema.parse(request.body);
  const rulesSchema = input.domain === "CLAIMS_POLICY" ? ClaimsPolicySchema : PayrollPolicySchema;
  const rulesResult = rulesSchema.safeParse(input.rules_payload);
  if (!rulesResult.success) {
    const firstIssue = rulesResult.error.issues[0];
    const location =
      firstIssue === undefined || firstIssue.path.length === 0
        ? "rules_payload"
        : `rules_payload.${firstIssue.path.join(".")}`;
    throw ApiError.policyViolation(
      `Payload kebijakan tidak lengkap atau tidak valid pada ${location}`,
    );
  }

  const checksum = sha256Hex(stableStringify(rulesResult.data));
  const id = randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<PolicyRow>(
      `insert into governance.policy_versions
          (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
           effective_from, published_by, approved_by)
         values ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,null)
         returning id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
                   effective_from, published_by, approved_by, created_at`,
      [
        id,
        auth.tenantId,
        input.domain,
        input.version_tag,
        rulesResult.data,
        checksum,
        new Date(input.effective_from),
        auth.userId,
      ],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "GOVERNANCE",
        entityType: "POLICY_VERSION",
        entityId: id,
        action: "POLICY_DRAFT_CREATED",
        policyVersionId: id,
        decisionContext: {
          domain: input.domain,
          version_tag: input.version_tag,
          checksum_sha256: checksum,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, result.rows[0], 201);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

policyRouter.post(
  "/:id/approve",
  requireRoles("COMPLIANCE_ADMIN", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const input = ApprovePolicyRequestSchema.parse(request.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const policies = await client.query<PolicyRow>(
        `select id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
                effective_from, published_by, approved_by, created_at
           from governance.policy_versions
          where id = $1
            and tenant_id = $2
          for update`,
        [id, auth.tenantId],
      );

      if (policies.rows.length !== 1) {
        await client.query("ROLLBACK");
        throw ApiError.notFound("Kebijakan tidak ditemukan");
      }

      const policy = policies.rows[0]!;
      if (policy.status !== "DRAFT") {
        await client.query("ROLLBACK");
        throw ApiError.policyViolation("Hanya draf yang dapat disetujui");
      }
      if (policy.published_by === auth.userId) {
        await client.query("ROLLBACK");
        throw new ApiError(
          403,
          "ERR_SOD_VIOLATION",
          "Pembuat draf tidak boleh menyetujui draf sendiri",
        );
      }

      const updated = await client.query<PolicyRow>(
        `update governance.policy_versions
            set approved_by = $1
          where id = $2
          returning id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
                    effective_from, published_by, approved_by, created_at`,
        [auth.userId, id],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "GOVERNANCE",
          entityType: "POLICY_VERSION",
          entityId: id,
          action: "POLICY_APPROVED",
          policyVersionId: id,
          decisionContext: {
            version_tag: policy.version_tag,
            notes: input.notes ?? null,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

policyRouter.post("/:id/publish", requireRoles("COMPLIANCE_ADMIN"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  PublishPolicyRequestSchema.parse(request.body ?? {});

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const policies = await client.query<PolicyRow>(
      `select id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
                effective_from, published_by, approved_by, created_at
           from governance.policy_versions
          where id = $1
            and tenant_id = $2
          for update`,
      [id, auth.tenantId],
    );

    if (policies.rows.length !== 1) {
      await client.query("ROLLBACK");
      throw ApiError.notFound("Kebijakan tidak ditemukan");
    }

    const policy = policies.rows[0]!;
    if (policy.status !== "DRAFT") {
      await client.query("ROLLBACK");
      throw ApiError.policyViolation("Hanya draf yang dapat diterbitkan");
    }
    if (policy.approved_by === null) {
      await client.query("ROLLBACK");
      throw ApiError.policyViolation("Kebijakan belum disetujui checker kedua");
    }
    if (policy.approved_by === policy.published_by) {
      await client.query("ROLLBACK");
      throw new ApiError(403, "ERR_SOD_VIOLATION", "Checker kedua harus berbeda dari pembuat draf");
    }

    const archived = await client.query(
      `update governance.policy_versions
            set status = 'ARCHIVED'
          where tenant_id = $1
            and domain = $2
            and status = 'ACTIVE'
            and id <> $3`,
      [auth.tenantId, policy.domain, id],
    );
    const published = await client.query<PolicyRow>(
      `update governance.policy_versions
            set status = 'ACTIVE'
          where id = $1
          returning id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
                    effective_from, published_by, approved_by, created_at`,
      [id],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "GOVERNANCE",
        entityType: "POLICY_VERSION",
        entityId: id,
        action: "POLICY_PUBLISHED",
        policyVersionId: id,
        decisionContext: {
          domain: policy.domain,
          version_tag: policy.version_tag,
          archived_count: archived.rowCount ?? 0,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, published.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});
