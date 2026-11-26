import { pool } from "@aletheia/database";
import {
  ReimbursementDecisionRequestSchema,
  ReimbursementListQuerySchema,
  ReimbursementPageSchema,
  ReimbursementSchema,
  type Reimbursement,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

const IdParamSchema = z.string().uuid();

interface ReimbursementRow {
  id: string;
  personnel_id: string;
  category: string;
  expense_date: string;
  amount: string;
  description: string;
  receipt_url: string | null;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_notes: string | null;
  paid_by: string | null;
  paid_at: Date | null;
  created_at: Date;
}

function toReimbursement(row: ReimbursementRow): Reimbursement {
  return ReimbursementSchema.parse({
    id: row.id,
    personnel_id: row.personnel_id,
    category: row.category,
    expense_date: row.expense_date,
    amount: row.amount,
    description: row.description,
    receipt_url: row.receipt_url,
    status: row.status,
    decided_by: row.decided_by,
    decided_at: row.decided_at?.toISOString() ?? null,
    decision_notes: row.decision_notes,
    paid_by: row.paid_by,
    paid_at: row.paid_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  });
}

const SELECT_COLUMNS = `
  id, personnel_id, category, expense_date::text as expense_date, amount::text as amount,
  description, receipt_url, status, decided_by, decided_at, decision_notes, paid_by,
  paid_at, created_at`;

export const reimbursementRouter: RouterType = Router();

reimbursementRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const query = ReimbursementListQuerySchema.parse(request.query);
    const conditions = ["r.tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (query.status !== undefined) {
      values.push(query.status);
      conditions.push(`r.status = $${values.length}`);
    }
    if (query.personnel_id !== undefined) {
      values.push(query.personnel_id);
      conditions.push(`r.personnel_id = $${values.length}`);
    }
    if (query.branch_id !== undefined) {
      values.push(query.branch_id);
      conditions.push(`p.branch_id = $${values.length}`);
    }
    if (auth.role === "BRANCH_MANAGER") {
      values.push(auth.branchId);
      conditions.push(`p.branch_id = $${values.length}`);
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(r.created_at, r.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }
    values.push(query.limit + 1);

    const result = await pool.query<ReimbursementRow & { created_at: Date }>(
      `select r.id, r.personnel_id, r.category, r.expense_date::text as expense_date,
              r.amount::text as amount, r.description, r.receipt_url, r.status,
              r.decided_by, r.decided_at, r.decision_notes, r.paid_by, r.paid_at, r.created_at
         from payroll.reimbursements r
         join payroll.personnel p on p.id = r.personnel_id and p.tenant_id = r.tenant_id
        where ${conditions.join(" AND ")}
        order by r.created_at desc, r.id desc
        limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    const data = {
      items: rows.map(toReimbursement),
      meta: {
        next_cursor: hasMore && last !== undefined ? encodeCursor(last.created_at, last.id) : null,
        has_more: hasMore,
      },
    };
    ReimbursementPageSchema.parse(data);
    sendData(response, data);
  },
);

reimbursementRouter.post(
  "/:id/decide",
  requireRoles("HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const input = ReimbursementDecisionRequestSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await client.query<
        ReimbursementRow & { user_id: string | null; branch_id: string }
      >(
        `select r.id, r.personnel_id, r.category, r.expense_date::text as expense_date,
                r.amount::text as amount, r.description, r.receipt_url, r.status,
                r.decided_by, r.decided_at, r.decision_notes, r.paid_by, r.paid_at,
                r.created_at, p.user_id, p.branch_id
           from payroll.reimbursements r
           join payroll.personnel p on p.id = r.personnel_id and p.tenant_id = r.tenant_id
          where r.tenant_id = $1 and r.id = $2
          for update of r`,
        [auth.tenantId, id],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw ApiError.notFound("Reimburse tidak ditemukan");
      }
      if (auth.role === "BRANCH_MANAGER" && row.branch_id !== auth.branchId) {
        throw ApiError.notFound("Reimburse tidak ditemukan");
      }
      if (row.user_id !== null && row.user_id === auth.userId) {
        throw new ApiError(403, "ERR_SOD_VIOLATION", "Tidak dapat memutuskan reimburse sendiri");
      }
      if (row.status !== "PENDING") {
        throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Reimburse sudah diputuskan");
      }

      const result = await client.query<ReimbursementRow>(
        `update payroll.reimbursements
            set status = $3,
                decided_by = $4,
                decided_at = now(),
                decision_notes = $5,
                updated_at = now()
          where tenant_id = $1 and id = $2
          returning ${SELECT_COLUMNS}`,
        [auth.tenantId, id, input.decision, auth.userId, input.notes ?? null],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "REIMBURSEMENT",
          entityId: id,
          action: "REIMBURSEMENT_DECIDED",
          policyVersionId: null,
          decisionContext: {
            decision: input.decision,
            notes: input.notes ?? null,
            personnel_id: row.personnel_id,
            amount: row.amount,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, toReimbursement(result.rows[0]!));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

reimbursementRouter.post("/:id/pay", requireRoles("FINANCE_MANAGER"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query<ReimbursementRow>(
      `select ${SELECT_COLUMNS}
           from payroll.reimbursements
          where tenant_id = $1 and id = $2
          for update`,
      [auth.tenantId, id],
    );
    const row = existing.rows[0];
    if (row === undefined) {
      throw ApiError.notFound("Reimburse tidak ditemukan");
    }
    if (row.status !== "APPROVED") {
      throw new ApiError(409, "ERR_PAYMENT_STATE_CONFLICT", "Reimburse belum disetujui");
    }
    const result = await client.query<ReimbursementRow>(
      `update payroll.reimbursements
            set status = 'PAID',
                paid_by = $3,
                paid_at = now(),
                updated_at = now()
          where tenant_id = $1 and id = $2
          returning ${SELECT_COLUMNS}`,
      [auth.tenantId, id, auth.userId],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "REIMBURSEMENT",
        entityId: id,
        action: "REIMBURSEMENT_PAID",
        policyVersionId: null,
        decisionContext: {
          personnel_id: row.personnel_id,
          amount: row.amount,
          provider: "MOCK",
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, toReimbursement(result.rows[0]!));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});
