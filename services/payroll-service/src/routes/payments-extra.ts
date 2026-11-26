import { randomUUID } from "node:crypto";

import { pool, runWithTenant, systemQuery } from "@aletheia/database";
import { incrementCounter, withSpan } from "@aletheia/observability";
import {
  PaymentWebhookEventSchema,
  PaymentWebhookRequestSchema,
  RetryBatchRequestSchema,
  ReversePaymentRequestSchema,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";
import { getPaymentProvider } from "../lib/payments.js";
import { verifyMockWebhookSignature } from "../lib/payment-webhook.js";
import { beginIdempotency, completeIdempotency } from "../lib/idempotency.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "../lib/request-idempotency.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";
import { detailFor, lockBatch, type PaymentRow, toPayment } from "./batches.js";

const IdParamSchema = z.string().uuid();

async function syncBatchPaymentState(
  client: PoolClient,
  tenantId: string,
  batchId: string,
): Promise<"DISBURSED" | "PARTIAL" | "FAILED" | "DISBURSING"> {
  const statuses = await client.query<{
    total: string;
    paid: string;
    failed: string;
    processing: string;
    paid_amount: string;
  }>(
    `select count(*)::text as total,
            count(*) filter (where payment_status = 'PAID')::text as paid,
            count(*) filter (where payment_status in ('FAILED','REVERSED'))::text as failed,
            count(*) filter (where payment_status in ('PENDING','PROCESSING'))::text as processing,
            coalesce(sum(net_take_home_pay) filter (where payment_status = 'PAID'), 0)::text as paid_amount
       from payroll.items
      where tenant_id = $1 and batch_id = $2`,
    [tenantId, batchId],
  );
  const counts = statuses.rows[0]!;
  const allPaid = Number(counts.paid) === Number(counts.total);
  const anyFailed = Number(counts.failed) > 0;
  const status = allPaid
    ? "DISBURSED"
    : anyFailed && Number(counts.paid) > 0
      ? "PARTIAL"
      : anyFailed
        ? "FAILED"
        : "DISBURSING";
  await client.query(
    `update payroll.batches
        set status = $3::varchar,
            total_net_disbursed = $4,
            disbursed_at = case when $3::text = 'DISBURSED' then coalesce(disbursed_at, now()) else disbursed_at end
      where tenant_id = $1 and id = $2`,
    [tenantId, batchId, status, counts.paid_amount],
  );
  return status;
}

export const paymentWebhookRouter: RouterType = Router();

paymentWebhookRouter.post("/webhook/:provider", async (request, response) => {
  const provider = z.enum(["MOCK", "XENDIT", "MIDTRANS"]).parse(request.params.provider);
  const input = PaymentWebhookRequestSchema.parse(request.body);
  const event = PaymentWebhookEventSchema.parse(input.body);
  if (event.provider !== provider) {
    throw new ApiError(422, "ERR_PAYMENT_STATE_CONFLICT", "Provider webhook tidak cocok");
  }
  const expectedStatus = {
    PAYMENT_PAID: "PAID",
    PAYMENT_FAILED: "FAILED",
    PAYMENT_REVERSED: "REVERSED",
  }[event.event_type];
  if (event.status !== expectedStatus) {
    throw new ApiError(422, "ERR_PAYMENT_STATE_CONFLICT", "Status webhook tidak konsisten");
  }
  if (provider !== "MOCK") {
    throw new ApiError(424, "ERR_PAYMENT_PROVIDER_FAILED", "Provider webhook belum dikonfigurasi");
  }
  if (!verifyMockWebhookSignature(event, input.signature)) {
    throw new ApiError(401, "ERR_UNAUTHORIZED_ACCESS", "Signature webhook tidak valid");
  }

  const resolved = await systemQuery<{ tenant_id: string }>(
    `select payroll.resolve_payment_tenant($1, $2) as tenant_id`,
    [provider, event.provider_reference],
  );
  const tenantId = resolved.rows[0]?.tenant_id;
  if (tenantId === undefined) {
    throw new ApiError(404, "ERR_NOT_FOUND", "Payment payroll untuk webhook tidak ditemukan");
  }

  await runWithTenant(tenantId, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const payments = await client.query<PaymentRow & { tenant_id: string }>(
        `select id, tenant_id, batch_id, personnel_id, policy_version_id, provider,
              provider_reference, amount, status, idempotency_key, attempt_no,
              requested_by, approved_by, requested_at, paid_at, failure_reason
         from payroll.payments
        where provider = $1 and provider_reference = $2
        order by requested_at desc
        limit 1
        for update`,
        [provider, event.provider_reference],
      );
      const payment = payments.rows[0];
      if (payment === undefined) {
        throw new ApiError(404, "ERR_NOT_FOUND", "Payment payroll untuk webhook tidak ditemukan");
      }
      if (Number(event.amount) !== Number(payment.amount)) {
        throw new ApiError(422, "ERR_PAYMENT_STATE_CONFLICT", "Nominal webhook tidak cocok");
      }

      const inserted = await client.query(
        `insert into payroll.payment_webhook_events
         (id, tenant_id, provider, event_id, payment_id, event_type, status, payload)
       values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7::jsonb)
       on conflict (tenant_id, provider, event_id) do nothing
       returning id`,
        [
          payment.tenant_id,
          provider,
          event.event_id,
          payment.id,
          event.event_type,
          event.status,
          JSON.stringify(event.payload),
        ],
      );
      if (inserted.rowCount === 0) {
        await client.query("COMMIT");
        sendData(response, { received: true });
        return;
      }

      if (event.status === "PAID") {
        if (!["PENDING", "PROCESSING", "FAILED"].includes(payment.status)) {
          throw new ApiError(
            409,
            "ERR_PAYMENT_STATE_CONFLICT",
            "Payment tidak dapat berpindah ke PAID dari status saat ini",
          );
        }
        await client.query(
          `update payroll.payments
            set status = 'PAID', paid_at = $2, failure_reason = null
          where id = $1`,
          [payment.id, event.occurred_at],
        );
        await client.query(
          `update payroll.items set payment_status = 'PAID'
          where tenant_id = $1 and payment_intent_id = $2`,
          [payment.tenant_id, payment.id],
        );
      } else if (event.status === "FAILED") {
        if (!["PENDING", "PROCESSING"].includes(payment.status)) {
          throw new ApiError(
            409,
            "ERR_PAYMENT_STATE_CONFLICT",
            "Payment tidak dapat berpindah ke FAILED dari status saat ini",
          );
        }
        await client.query(
          `update payroll.payments
            set status = 'FAILED', failure_reason = 'Provider melaporkan kegagalan'
          where id = $1`,
          [payment.id],
        );
        await client.query(
          `update payroll.items set payment_status = 'FAILED'
          where tenant_id = $1 and payment_intent_id = $2`,
          [payment.tenant_id, payment.id],
        );
      } else {
        if (payment.status !== "PAID") {
          throw new ApiError(
            409,
            "ERR_PAYMENT_STATE_CONFLICT",
            "Hanya payment PAID yang dapat di-reverse",
          );
        }
        await client.query(
          `update payroll.payments
            set status = 'REVERSED', failure_reason = 'Provider melaporkan reversal'
          where id = $1`,
          [payment.id],
        );
        await client.query(
          `update payroll.items set payment_status = 'REVERSED'
          where tenant_id = $1 and payment_intent_id = $2`,
          [payment.tenant_id, payment.id],
        );
      }

      const batchStatus = await syncBatchPaymentState(client, payment.tenant_id, payment.batch_id);
      await appendAudit(
        {
          tenantId: payment.tenant_id,
          actorId: payment.requested_by,
          actorRole: "FINANCE_MANAGER",
          domain: "PAYROLL",
          entityType: "PAYROLL_BATCH",
          entityId: payment.batch_id,
          action:
            event.status === "PAID"
              ? "PAYROLL_PAYMENT_PAID"
              : event.status === "FAILED"
                ? "PAYROLL_PAYMENT_FAILED"
                : "PAYROLL_PAYMENT_REVERSED",
          policyVersionId: payment.policy_version_id,
          decisionContext: {
            payment_id: payment.id,
            provider: payment.provider,
            provider_reference: payment.provider_reference,
            amount: payment.amount,
            batch_status: batchStatus,
            source: "PROVIDER_WEBHOOK",
            event_id: event.event_id,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, { received: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});

export const paymentActionRouter: RouterType = Router();

paymentActionRouter.post(
  "/:id/reverse",
  requireRoles("FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const input = ReversePaymentRequestSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<PaymentRow>(
        `select id, batch_id, personnel_id, policy_version_id, provider, provider_reference,
                amount, status, idempotency_key, attempt_no, requested_by, approved_by,
                requested_at, paid_at, failure_reason
           from payroll.payments
          where tenant_id = $1 and id = $2
          for update`,
        [auth.tenantId, id],
      );
      const payment = result.rows[0];
      if (payment === undefined) {
        throw new ApiError(404, "ERR_NOT_FOUND", "Payment payroll tidak ditemukan");
      }
      if (payment.status !== "PAID" || payment.provider_reference === null) {
        throw new ApiError(
          409,
          "ERR_PAYMENT_STATE_CONFLICT",
          "Hanya payment PAID yang dapat di-reverse",
        );
      }
      const provider = getPaymentProvider(payment.provider);
      try {
        await provider.reversePayment(payment.provider_reference, input.reason);
      } catch (error) {
        if (payment.provider !== "MOCK") {
          throw error;
        }
      }
      await client.query(
        `update payroll.payments
            set status = 'REVERSED', failure_reason = $3
          where tenant_id = $1 and id = $2`,
        [auth.tenantId, id, input.reason],
      );
      await client.query(
        `update payroll.items set payment_status = 'REVERSED'
          where tenant_id = $1 and payment_intent_id = $2`,
        [auth.tenantId, id],
      );
      const batchStatus = await syncBatchPaymentState(client, auth.tenantId, payment.batch_id);
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "PAYROLL_BATCH",
          entityId: payment.batch_id,
          action: "PAYROLL_PAYMENT_REVERSED",
          policyVersionId: payment.policy_version_id,
          decisionContext: {
            payment_id: payment.id,
            amount: payment.amount,
            reason: input.reason,
            batch_status: batchStatus,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(
        response,
        toPayment({ ...payment, status: "REVERSED", failure_reason: input.reason }),
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

export const batchRetryRouter: RouterType = Router();

batchRetryRouter.post("/:id/retry", requireRoles("FINANCE_MANAGER"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const input = RetryBatchRequestSchema.parse(request.body);
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
  let idempotencyRecordId = "";
  let replayResponse: Record<string, unknown> | undefined;
  let approvedBy = auth.userId;
  try {
    await client.query("BEGIN");
    const batch = await lockBatch(client, auth.tenantId, id);
    if (batch.approved_by !== null) {
      approvedBy = batch.approved_by;
    }
    const idempotency = await beginIdempotency(client, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      scope: `POST:/api/v1/payroll/batches/${id}/retry`,
      key,
      requestHash,
    });
    if (idempotency.kind === "replay") {
      replayResponse = idempotency.response.data;
      await client.query("ROLLBACK");
    } else {
      idempotencyRecordId = idempotency.recordId;
      if (!["FAILED", "PARTIAL"].includes(batch.status)) {
        throw new ApiError(
          409,
          "ERR_PAYMENT_STATE_CONFLICT",
          "Retry hanya untuk batch FAILED atau PARTIAL",
        );
      }
      const items = await client.query<{
        id: string;
        personnel_id: string;
        net_take_home_pay: string;
      }>(
        `select id, personnel_id, net_take_home_pay::text
           from payroll.items
          where tenant_id = $1 and batch_id = $2
            and payment_status in ('FAILED','REVERSED')
          for update`,
        [auth.tenantId, id],
      );
      if (items.rowCount === 0) {
        throw new ApiError(
          409,
          "ERR_PAYMENT_STATE_CONFLICT",
          "Tidak ada item gagal untuk dicoba ulang",
        );
      }
      for (const item of items.rows) {
        const attempt = await client.query<{ attempt_no: number }>(
          `select coalesce(max(attempt_no), 0) + 1 as attempt_no
             from payroll.payments
            where tenant_id = $1 and batch_id = $2 and personnel_id = $3`,
          [auth.tenantId, id, item.personnel_id],
        );
        const attemptNo = attempt.rows[0]?.attempt_no ?? 2;
        const paymentId = randomUUID();
        const paymentKey = idempotencyRequestHash({
          requestKey: key,
          batchId: id,
          personnelId: item.personnel_id,
          attempt: attemptNo,
        });
        await client.query(
          `insert into payroll.payments
             (id, tenant_id, batch_id, personnel_id, policy_version_id, provider, amount,
              status, idempotency_key, attempt_no, requested_by, approved_by, requested_at)
           values ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10,$11,now())`,
          [
            paymentId,
            auth.tenantId,
            id,
            item.personnel_id,
            batch.policy_version_id,
            input.provider,
            item.net_take_home_pay,
            paymentKey,
            attemptNo,
            auth.userId,
            approvedBy,
          ],
        );
        await client.query(
          `update payroll.items
              set payment_status = 'PROCESSING', payment_intent_id = $3
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
          action: "BATCH_RETRY_REQUESTED",
          policyVersionId: batch.policy_version_id,
          decisionContext: {
            batch_code: batch.batch_code,
            provider: input.provider,
            retry_count: tasks.length,
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
  for (const task of tasks) {
    try {
      const intent = await withSpan(
        "payment.call",
        { "payment.provider": task.provider, "payment.operation": "retry" },
        () =>
          provider.createPayment({
            tenantId: auth.tenantId,
            entityType: "PAYROLL_ITEM",
            entityId: task.itemId,
            provider: task.provider,
            amount: task.amount,
            idempotencyKey: `payment:${task.paymentId}`,
            requestedBy: auth.userId,
            approvedBy,
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
            set status = $3, provider_reference = $4, paid_at = $5, failure_reason = $6
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
    const batchStatus = await syncBatchPaymentState(finalClient, auth.tenantId, id);
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
