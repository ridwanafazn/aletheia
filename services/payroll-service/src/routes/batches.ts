import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import { incrementCounter, withSpan } from "@aletheia/observability";
import {
  ApproveBatchRequestSchema,
  DisburseBatchRequestSchema,
  PayrollBatchCreateSchema,
  PayrollBatchDetailSchema,
  PayrollBatchListQuerySchema,
  PayrollBatchPageSchema,
  PayrollBatchSchema,
  PayrollBranchListResponseSchema,
  PayrollPaymentSchema,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import {
  BATCH_SELECT_COLUMNS,
  getBatchItems,
  getBatchRow,
  toPayrollBatch,
  toPayrollItem,
  type BatchRow,
} from "../lib/batch-model.js";
import { ApiError } from "../lib/errors.js";
import { isLockNotAvailable, isUniqueViolation } from "../lib/db-errors.js";
import { beginIdempotency, completeIdempotency } from "../lib/idempotency.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { getPaymentProvider } from "../lib/payments.js";
import { getActivePayrollPolicy } from "../lib/policy.js";
import { buildBatchCalculateEvent, publishPayrollEvent } from "../lib/qstash.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "../lib/request-idempotency.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

const IdParamSchema = z.string().uuid();

export interface PaymentRow {
  id: string;
  batch_id: string;
  personnel_id: string;
  policy_version_id: string;
  provider: "MOCK" | "XENDIT" | "MIDTRANS";
  provider_reference: string | null;
  amount: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REVERSED";
  idempotency_key: string;
  attempt_no: number;
  requested_by: string;
  approved_by: string;
  requested_at: Date;
  paid_at: Date | null;
  failure_reason: string | null;
}

export function toPayment(row: PaymentRow) {
  return PayrollPaymentSchema.parse({
    id: row.id,
    batch_id: row.batch_id,
    personnel_id: row.personnel_id,
    policy_version_id: row.policy_version_id,
    provider: row.provider,
    provider_reference: row.provider_reference,
    amount: row.amount,
    status: row.status,
    idempotency_key: row.idempotency_key,
    attempt_no: row.attempt_no,
    requested_by: row.requested_by,
    approved_by: row.approved_by,
    requested_at: row.requested_at.toISOString(),
    paid_at: row.paid_at?.toISOString() ?? null,
    failure_reason: row.failure_reason,
  });
}

export async function lockBatch(
  client: PoolClient,
  tenantId: string,
  batchId: string,
): Promise<BatchRow> {
  try {
    const row = await getBatchRow(client, tenantId, batchId, true);
    if (row === null) {
      throw ApiError.notFound("Batch payroll tidak ditemukan");
    }
    return row;
  } catch (error) {
    if (isLockNotAvailable(error)) {
      throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Batch sedang diproses permintaan lain");
    }
    throw error;
  }
}

export async function detailFor(client: PoolClient, tenantId: string, batchId: string) {
  const batch = await getBatchRow(client, tenantId, batchId);
  if (batch === null) {
    throw ApiError.notFound("Batch payroll tidak ditemukan");
  }
  const items = await getBatchItems(client, tenantId, batchId);
  return PayrollBatchDetailSchema.parse({
    batch: toPayrollBatch(batch),
    items: items.map(toPayrollItem),
  });
}

async function batchCodeFor(
  client: PoolClient,
  tenantId: string,
  branchId: string,
  periodMonth: string,
  correctionSeq: number,
): Promise<string> {
  const rows = await client.query<{ tenant_code: string; branch_code: string }>(
    `select t.code as tenant_code, b.code as branch_code
       from governance.branches b
       join governance.tenants t on t.id = b.tenant_id
      where b.id = $1
        and b.tenant_id = $2
      limit 1`,
    [branchId, tenantId],
  );
  const row = rows.rows[0];
  if (row === undefined) {
    throw ApiError.notFound("Cabang tidak ditemukan pada tenant ini");
  }
  const month = periodMonth.slice(0, 7).replace("-", "");
  return `PAY-${row.tenant_code}-${month}-${row.branch_code}${correctionSeq > 0 ? `-C${correctionSeq}` : ""}`;
}

export const payrollReferenceRouter: RouterType = Router();

export const batchRouter: RouterType = Router();

payrollReferenceRouter.get(
  "/branches",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"),
  async (request, response) => {
    const auth = request.auth!;
    const result = await pool.query<{
      id: string;
      code: string;
      name: string;
      region: string;
      monthly_disbursement_cap: string;
    }>(
      `select id, code, name, region, monthly_disbursement_cap::text as monthly_disbursement_cap
         from governance.branches
        where tenant_id = $1
        order by code asc`,
      [auth.tenantId],
    );
    const data = { items: result.rows };
    PayrollBranchListResponseSchema.parse(data);
    sendData(response, data);
  },
);

batchRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"),
  async (request, response) => {
    const auth = request.auth!;
    const query = PayrollBatchListQuerySchema.parse(request.query);
    const conditions = ["tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (query.branch_id !== undefined) {
      values.push(query.branch_id);
      conditions.push(`branch_id = $${values.length}`);
    }
    if (query.period_month !== undefined) {
      values.push(query.period_month);
      conditions.push(`period_month = $${values.length}::date`);
    }
    if (query.status !== undefined) {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }
    if (query.batch_type !== undefined) {
      values.push(query.batch_type);
      conditions.push(`batch_type = $${values.length}`);
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }
    values.push(query.limit + 1);

    const result = await pool.query<BatchRow>(
      `select ${BATCH_SELECT_COLUMNS}
         from payroll.batches
        where ${conditions.join(" AND ")}
        order by created_at desc, id desc
        limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    const data = {
      items: rows.map(toPayrollBatch),
      meta: {
        next_cursor: hasMore && last !== undefined ? encodeCursor(last.created_at, last.id) : null,
        has_more: hasMore,
      },
    };
    PayrollBatchPageSchema.parse(data);
    sendData(response, data);
  },
);

batchRouter.post("/", requireRoles("HR_SPECIALIST"), async (request, response) => {
  const auth = request.auth!;
  const input = PayrollBatchCreateSchema.parse(request.body);
  const key = requireIdempotencyKey(request);
  const requestHash = idempotencyRequestHash(input);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const idempotency = await beginIdempotency(client, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      scope: "POST:/api/v1/payroll/batches",
      key,
      requestHash,
    });
    if (idempotency.kind === "replay") {
      await client.query("ROLLBACK");
      response.setHeader("x-idempotent-replay", "true");
      sendData(response, idempotency.response.data, 200);
      return;
    }

    const policy = await getActivePayrollPolicy(client, auth.tenantId);
    const correctionSeq = input.correction_seq ?? (input.batch_type === "CORRECTION" ? 1 : 0);
    if (input.batch_type === "REGULAR" && correctionSeq !== 0) {
      throw ApiError.policyViolation("Batch REGULAR harus memakai correction_seq 0");
    }
    if (input.batch_type === "CORRECTION" && correctionSeq < 1) {
      throw ApiError.policyViolation("Batch CORRECTION harus memakai correction_seq minimal 1");
    }
    if (input.variance_vs_batch_id !== undefined && input.variance_vs_batch_id !== null) {
      const comparison = await client.query(
        `select 1 from payroll.batches
          where tenant_id = $1 and id = $2 and branch_id = $3`,
        [auth.tenantId, input.variance_vs_batch_id, input.branch_id],
      );
      if (comparison.rowCount !== 1) {
        throw ApiError.notFound("Batch pembanding tidak ditemukan pada cabang ini");
      }
    }

    const batchCode = await batchCodeFor(
      client,
      auth.tenantId,
      input.branch_id,
      input.period_month,
      correctionSeq,
    );
    const id = randomUUID();
    await client.query<BatchRow>(
      `insert into payroll.batches
        (id, tenant_id, batch_code, branch_id, period_month, batch_type, correction_seq,
         period_start, period_end, policy_version_id, status, created_by, idempotency_key,
         variance_vs_batch_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',$11,$12,$13)
       returning ${BATCH_SELECT_COLUMNS}`,
      [
        id,
        auth.tenantId,
        batchCode,
        input.branch_id,
        input.period_month,
        input.batch_type,
        correctionSeq,
        input.period_start,
        input.period_end,
        policy.id,
        auth.userId,
        key,
        input.variance_vs_batch_id ?? null,
      ],
    );

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "PAYROLL_BATCH",
        entityId: id,
        action: "BATCH_CREATED",
        policyVersionId: policy.id,
        decisionContext: {
          batch_code: batchCode,
          period_month: input.period_month,
          batch_type: input.batch_type,
          correction_seq: correctionSeq,
          branch_id: input.branch_id,
          policy_version_tag: policy.versionTag,
        },
        correlationId: request.correlationId,
      },
      client,
    );

    const detail = await detailFor(client, auth.tenantId, id);
    await completeIdempotency(client, idempotency.recordId, {
      status: 201,
      data: detail as unknown as Record<string, unknown>,
    });
    await client.query("COMMIT");
    sendData(response, detail, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isUniqueViolation(error)) {
      throw ApiError.conflict(
        "ERR_IDEMPOTENCY_CONFLICT",
        "Batch untuk periode, tipe, dan cabang ini sudah ada",
      );
    }
    throw error;
  } finally {
    client.release();
  }
});

batchRouter.get(
  "/:id",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const detail = await detailFor(client, auth.tenantId, id);
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

batchRouter.post("/:id/calculate", requireRoles("HR_SPECIALIST"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const client = await pool.connect();
  let event: ReturnType<typeof buildBatchCalculateEvent> | undefined;

  try {
    await client.query("BEGIN");
    const batch = await lockBatch(client, auth.tenantId, id);
    if (batch.status !== "DRAFT") {
      throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Hanya batch DRAFT yang dapat dikalkulasi");
    }
    const updated = await client.query<BatchRow>(
      `update payroll.batches
          set status = 'CALCULATING'
        where tenant_id = $1 and id = $2
        returning ${BATCH_SELECT_COLUMNS}`,
      [auth.tenantId, id],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "PAYROLL_BATCH",
        entityId: id,
        action: "BATCH_CALCULATION_REQUESTED",
        policyVersionId: batch.policy_version_id,
        decisionContext: {
          batch_code: batch.batch_code,
          period_start: batch.period_start,
          period_end: batch.period_end,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    event = buildBatchCalculateEvent({
      tenantId: auth.tenantId,
      correlationId: request.correlationId,
      requestedBy: auth.userId,
      batchId: id,
      policyVersionId: batch.policy_version_id,
      branchId: batch.branch_id,
      periodStart: batch.period_start,
      periodEnd: batch.period_end,
    });
    await client.query("COMMIT");
    sendData(response, PayrollBatchSchema.parse(toPayrollBatch(updated.rows[0]!)), 202);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (event !== undefined) {
    await publishPayrollEvent(event);
  }
});

batchRouter.post("/:id/approve", requireRoles("FINANCE_MANAGER"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const input = ApproveBatchRequestSchema.parse(request.body ?? {});
  const key = requireIdempotencyKey(request);
  const requestHash = idempotencyRequestHash({ input, batch_id: id });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const batch = await lockBatch(client, auth.tenantId, id);
    const idempotency = await beginIdempotency(client, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      scope: `POST:/api/v1/payroll/batches/${id}/approve`,
      key,
      requestHash,
    });
    if (idempotency.kind === "replay") {
      await client.query("ROLLBACK");
      response.setHeader("x-idempotent-replay", "true");
      sendData(response, idempotency.response.data, 200);
      return;
    }
    if (batch.created_by === auth.userId) {
      throw new ApiError(403, "ERR_SOD_VIOLATION", "Pembuat batch tidak boleh menyetujui");
    }
    if (batch.status !== "READY_FOR_APPROVAL") {
      throw new ApiError(
        409,
        "ERR_CONCURRENT_LOCK",
        "Batch hanya dapat disetujui setelah kalkulasi selesai",
      );
    }

    await client.query(
      `update payroll.batches
            set status = 'APPROVED',
                approved_by = $3,
                approved_at = now()
          where tenant_id = $1 and id = $2`,
      [auth.tenantId, id, auth.userId],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "PAYROLL_BATCH",
        entityId: id,
        action: "BATCH_APPROVED",
        policyVersionId: batch.policy_version_id,
        decisionContext: {
          batch_code: batch.batch_code,
          total_net_disbursed: batch.total_net_disbursed,
          headcount: batch.headcount,
          notes: input.notes ?? null,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    const detail = await detailFor(client, auth.tenantId, id);
    await completeIdempotency(client, idempotency.recordId, {
      status: 200,
      data: detail as unknown as Record<string, unknown>,
    });
    await client.query("COMMIT");
    sendData(response, detail);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

batchRouter.post("/:id/disburse", requireRoles("FINANCE_MANAGER"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const input = DisburseBatchRequestSchema.parse(request.body);
  const key = requireIdempotencyKey(request);
  const requestHash = idempotencyRequestHash({ input, batch_id: id });
  const provider = getPaymentProvider(input.provider);
  const client = await pool.connect();
  const tasks: Array<{
    paymentId: string;
    itemId: string;
    amount: string;
    personnelId: string;
    provider: "MOCK" | "XENDIT" | "MIDTRANS";
  }> = [];
  let approvedBy: string | undefined;
  let batchForAudit: BatchRow | undefined;
  let idempotencyRecordId = "";
  let replayResponse: Record<string, unknown> | undefined;

  try {
    await client.query("BEGIN");
    const batch = await lockBatch(client, auth.tenantId, id);
    batchForAudit = batch;
    approvedBy = batch.approved_by ?? auth.userId;
    const idempotency = await beginIdempotency(client, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      scope: `POST:/api/v1/payroll/batches/${id}/disburse`,
      key,
      requestHash,
    });
    if (idempotency.kind === "replay") {
      replayResponse = idempotency.response.data;
      await client.query("ROLLBACK");
    } else {
      idempotencyRecordId = idempotency.recordId;
      if (batch.status !== "APPROVED") {
        throw new ApiError(
          409,
          "ERR_PAYMENT_STATE_CONFLICT",
          "Hanya batch APPROVED yang dapat dicairkan",
        );
      }
      const items = await getBatchItems(client, auth.tenantId, id, true);
      if (items.length === 0) {
        throw ApiError.policyViolation("Batch belum memiliki item kalkulasi");
      }

      for (const item of items) {
        if (BigInt(item.net_take_home_pay.replace(".", "")) <= 0n) {
          await client.query(
            `update payroll.items set payment_status = 'PAID'
                where tenant_id = $1 and id = $2`,
            [auth.tenantId, item.id],
          );
          continue;
        }
        const paymentId = randomUUID();
        const paymentKey = idempotencyRequestHash({
          requestKey: key,
          batchId: id,
          personnelId: item.personnel_id,
        });
        await client.query(
          `insert into payroll.payments
              (id, tenant_id, batch_id, personnel_id, policy_version_id, provider, amount,
               status, idempotency_key, attempt_no, requested_by, approved_by, requested_at)
             values ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,1,$9,$10,now())`,
          [
            paymentId,
            auth.tenantId,
            id,
            item.personnel_id,
            batch.policy_version_id,
            input.provider,
            item.net_take_home_pay,
            paymentKey,
            auth.userId,
            approvedBy,
          ],
        );
        await client.query(
          `update payroll.items
                set payment_status = 'PROCESSING',
                    payment_intent_id = $3
              where tenant_id = $1 and id = $2`,
          [auth.tenantId, item.id, paymentId],
        );
        tasks.push({
          paymentId,
          itemId: item.id,
          amount: item.net_take_home_pay,
          personnelId: item.personnel_id,
          provider: input.provider,
        });
      }

      await client.query(
        `update payroll.batches set status = 'DISBURSING' where tenant_id = $1 and id = $2`,
        [auth.tenantId, id],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "PAYROLL_BATCH",
          entityId: id,
          action: "BATCH_DISBURSEMENT_REQUESTED",
          policyVersionId: batch.policy_version_id,
          decisionContext: {
            batch_code: batch.batch_code,
            provider: input.provider,
            payment_count: tasks.length,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (replayResponse !== undefined) {
    response.setHeader("x-idempotent-replay", "true");
    sendData(response, replayResponse, 200);
    return;
  }

  const results: Array<{
    paymentId: string;
    itemId: string;
    status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REVERSED";
    reference: string | null;
    paidAt: string | null;
    failureReason: string | null;
  }> = [];

  const approver = approvedBy ?? auth.userId;
  for (const task of tasks) {
    try {
      const intent = await withSpan(
        "payment.call",
        { "payment.provider": task.provider, "payment.operation": "create" },
        () =>
          provider.createPayment({
            tenantId: auth.tenantId,
            entityType: "PAYROLL_ITEM",
            entityId: task.itemId,
            provider: task.provider,
            amount: task.amount,
            idempotencyKey: `payment:${task.paymentId}`,
            requestedBy: auth.userId,
            approvedBy: approver,
            metadata: { batch_id: id, personnel_id: task.personnelId },
          }),
      );
      if (intent.status === "PAID") {
        incrementCounter("payment_success_total", { provider: task.provider });
      } else if (intent.status === "FAILED") {
        incrementCounter("payment_failure_total", { provider: task.provider });
      }
      results.push({
        paymentId: task.paymentId,
        itemId: task.itemId,
        status: intent.status,
        reference: intent.provider_reference,
        paidAt: intent.paid_at,
        failureReason: intent.failure_reason,
      });
    } catch (error) {
      results.push({
        paymentId: task.paymentId,
        itemId: task.itemId,
        status: "FAILED",
        reference: null,
        paidAt: null,
        failureReason: error instanceof Error ? error.message : "Provider gagal",
      });
    }
  }

  const finalClient = await pool.connect();
  try {
    await finalClient.query("BEGIN");
    for (const result of results) {
      await finalClient.query(
        `update payroll.payments
              set status = $3,
                  provider_reference = $4,
                  paid_at = $5,
                  failure_reason = $6
            where tenant_id = $1 and id = $2`,
        [
          auth.tenantId,
          result.paymentId,
          result.status,
          result.reference,
          result.paidAt,
          result.failureReason,
        ],
      );
      await finalClient.query(
        `update payroll.items set payment_status = $3
            where tenant_id = $1 and id = $2`,
        [auth.tenantId, result.itemId, result.status],
      );
    }

    const statuses = await finalClient.query<{
      total: string;
      paid: string;
      failed: string;
      processing: string;
      paid_amount: string;
    }>(
      `select count(*)::text as total,
                count(*) filter (where payment_status = 'PAID')::text as paid,
                count(*) filter (where payment_status = 'FAILED')::text as failed,
                count(*) filter (where payment_status in ('PENDING','PROCESSING'))::text as processing,
                coalesce(sum(net_take_home_pay) filter (where payment_status = 'PAID'), 0)::text as paid_amount
           from payroll.items
          where tenant_id = $1 and batch_id = $2`,
      [auth.tenantId, id],
    );
    const counts = statuses.rows[0]!;
    const allPaid = Number(counts.paid) === Number(counts.total);
    const anyFailed = Number(counts.failed) > 0;
    const batchStatus = allPaid
      ? "DISBURSED"
      : anyFailed && Number(counts.paid) > 0
        ? "PARTIAL"
        : anyFailed
          ? "FAILED"
          : "DISBURSING";

    await finalClient.query(
      `update payroll.batches
            set status = $3,
                total_net_disbursed = $4,
                disbursed_at = coalesce($5::timestamptz, disbursed_at)
          where tenant_id = $1 and id = $2`,
      [
        auth.tenantId,
        id,
        batchStatus,
        counts.paid_amount,
        batchStatus === "DISBURSED" ? new Date() : null,
      ],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "PAYROLL_BATCH",
        entityId: id,
        action:
          batchStatus === "DISBURSED"
            ? "BATCH_DISBURSED"
            : batchStatus === "PARTIAL"
              ? "BATCH_DISBURSED_PARTIAL"
              : "BATCH_DISBURSEMENT_FAILED",
        policyVersionId: batchForAudit?.policy_version_id ?? null,
        decisionContext: {
          batch_code: batchForAudit?.batch_code ?? null,
          provider: input.provider,
          paid: Number(counts.paid),
          failed: Number(counts.failed),
          processing: Number(counts.processing),
          paid_amount: counts.paid_amount,
        },
        correlationId: request.correlationId,
      },
      finalClient,
    );
    const detail = await detailFor(finalClient, auth.tenantId, id);
    await completeIdempotency(finalClient, idempotencyRecordId, {
      status: 200,
      data: detail as unknown as Record<string, unknown>,
    });
    await finalClient.query("COMMIT");
    sendData(response, detail, batchStatus === "DISBURSING" ? 202 : 200);
  } catch (error) {
    await finalClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    finalClient.release();
  }
});

export const paymentRouter: RouterType = Router();

paymentRouter.get(
  "/:id",
  requireRoles("FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const result = await pool.query<PaymentRow>(
      `select id, batch_id, personnel_id, policy_version_id, provider,
              provider_reference, amount, status, idempotency_key, attempt_no,
              requested_by, approved_by, requested_at, paid_at, failure_reason
         from payroll.payments
        where tenant_id = $1 and id = $2
        limit 1`,
      [auth.tenantId, id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Payment payroll tidak ditemukan");
    }
    sendData(response, toPayment(row));
  },
);
