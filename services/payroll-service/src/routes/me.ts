import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  AttendanceSummarySchema,
  FileDownloadResponseSchema,
  LeaveBalanceListResponseSchema,
  LeaveRequestListResponseSchema,
  LeaveRequestSchema,
  MeProfileSchema,
  OvertimeRequestCreateSchema,
  OvertimeRequestListResponseSchema,
  PayslipListQuerySchema,
  PayslipPageSchema,
  PayslipSchema,
  SelfLeaveRequestCreateSchema,
  type AttendanceSummary,
  type LeaveRequest,
  type OvertimeRequest,
  type Payslip,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import { isUniqueViolation } from "../lib/db-errors.js";
import { ApiError } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { signFileToken, signedFilePath } from "../lib/files.js";
import { sendData } from "../lib/response.js";
import {
  leaveYear,
  lockLeaveBalance,
  remainingDays,
  requiresLeaveBalance,
  resolveSelf,
  toLeaveBalance,
  toOvertimeRequest,
  type LeaveBalanceRow,
  type OvertimeRequestRow,
  type SelfPersonnelRow,
} from "../lib/workforce.js";
import { requireAuthenticated } from "../middleware/authorize.js";

const IdParamSchema = z.string().uuid();
const PeriodQuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
const YearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

interface AttendanceRow {
  id: string;
  personnel_id: string;
  period_month: string;
  working_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  overtime_hours: string;
  source: string;
  approved_by: string | null;
  approved_at: Date | null;
}

interface PayslipRow {
  id: string;
  batch_id: string;
  personnel_id: string;
  period_month: string;
  version: number;
  secure_url: string;
  snapshot_hash_sha256: string;
  file_checksum_sha256: string;
  gross_income: string;
  net_take_home_pay: string;
  verification_code: string;
  published_at: Date | null;
  viewed_at: Date | null;
  supersedes_id: string | null;
}

interface LeaveRow {
  id: string;
  personnel_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: string;
  status: string;
  reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_notes: string | null;
  created_at: Date;
}

function toAttendance(row: AttendanceRow): AttendanceSummary {
  return AttendanceSummarySchema.parse({
    id: row.id,
    personnel_id: row.personnel_id,
    period_month: row.period_month,
    working_days: row.working_days,
    present_days: row.present_days,
    paid_leave_days: row.paid_leave_days,
    unpaid_leave_days: row.unpaid_leave_days,
    absent_days: row.absent_days,
    overtime_hours: Number(row.overtime_hours),
    source: row.source,
    approved_by: row.approved_by,
    approved_at: row.approved_at?.toISOString() ?? null,
  });
}

function toPayslip(row: PayslipRow): Payslip {
  return PayslipSchema.parse({
    id: row.id,
    batch_id: row.batch_id,
    personnel_id: row.personnel_id,
    period_month: row.period_month,
    version: row.version,
    secure_url: row.secure_url,
    snapshot_hash_sha256: row.snapshot_hash_sha256,
    file_checksum_sha256: row.file_checksum_sha256,
    gross_income: row.gross_income,
    net_take_home_pay: row.net_take_home_pay,
    verification_code: row.verification_code,
    published_at: row.published_at?.toISOString() ?? null,
    viewed_at: row.viewed_at?.toISOString() ?? null,
    supersedes_id: row.supersedes_id,
  });
}

function toLeave(row: LeaveRow): LeaveRequest {
  return LeaveRequestSchema.parse({
    id: row.id,
    personnel_id: row.personnel_id,
    leave_type: row.leave_type,
    start_date: row.start_date,
    end_date: row.end_date,
    days: Number(row.days),
    status: row.status,
    reason: row.reason ?? "",
    decided_by: row.decided_by,
    decided_at: row.decided_at?.toISOString() ?? null,
    decision_notes: row.decision_notes,
    created_at: row.created_at.toISOString(),
  });
}

function toMeProfile(self: SelfPersonnelRow) {
  return MeProfileSchema.parse({
    personnel_id: self.personnel_id,
    personnel_code: self.personnel_code,
    full_name: self.full_name,
    branch_id: self.branch_id,
    branch_name: self.branch_name,
    personnel_type: self.personnel_type,
    employment_status: self.employment_status,
    ptkp_status: self.ptkp_status,
    join_date: self.join_date,
    is_active: self.is_active,
  });
}

async function selfOrThrow(tenantId: string, userId: string): Promise<SelfPersonnelRow> {
  return resolveSelf(pool, tenantId, userId);
}

async function insertLeaveRequest(
  client: PoolClient,
  tenantId: string,
  self: SelfPersonnelRow,
  input: z.infer<typeof SelfLeaveRequestCreateSchema>,
  actorId: string,
  actorRole: string,
  correlationId: string,
): Promise<LeaveRequest> {
  const id = randomUUID();

  if (requiresLeaveBalance(input.leave_type)) {
    const balance = await lockLeaveBalance(
      client,
      tenantId,
      self.personnel_id,
      input.leave_type,
      leaveYear(input.start_date),
    );
    const remaining = remainingDays(
      balance.entitlement_days,
      balance.used_days,
      balance.pending_days,
    );
    if (remaining < input.days) {
      throw new ApiError(
        422,
        "ERR_LEAVE_BALANCE_INSUFFICIENT",
        "Saldo cuti tidak mencukupi untuk pengajuan ini",
      );
    }
    await client.query(
      `update payroll.leave_balances
          set pending_days = pending_days + $4::numeric,
              updated_at = now()
        where tenant_id = $1 and personnel_id = $2 and id = $3`,
      [tenantId, self.personnel_id, balance.id, input.days],
    );
  }

  const result = await client.query<LeaveRow>(
    `insert into payroll.leave_requests
       (id, tenant_id, personnel_id, leave_type, start_date, end_date, days, status, reason)
     values ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)
     returning id, personnel_id, leave_type, start_date::text as start_date,
               end_date::text as end_date, days, status, reason, decided_by, decided_at,
               decision_notes, created_at`,
    [
      id,
      tenantId,
      self.personnel_id,
      input.leave_type,
      input.start_date,
      input.end_date,
      input.days,
      input.reason,
    ],
  );

  await appendAudit(
    {
      tenantId,
      actorId,
      actorRole,
      domain: "PAYROLL",
      entityType: "LEAVE_REQUEST",
      entityId: id,
      action: "LEAVE_REQUESTED",
      policyVersionId: null,
      decisionContext: {
        personnel_id: self.personnel_id,
        leave_type: input.leave_type,
        days: input.days,
        source: "SELF_SERVICE",
      },
      correlationId,
    },
    client,
  );

  return toLeave(result.rows[0]!);
}

async function insertOvertimeRequest(
  client: PoolClient,
  tenantId: string,
  self: SelfPersonnelRow,
  input: z.infer<typeof OvertimeRequestCreateSchema>,
  actorId: string,
  actorRole: string,
  correlationId: string,
): Promise<OvertimeRequest> {
  const id = randomUUID();
  const result = await client.query<OvertimeRequestRow>(
    `insert into payroll.overtime_requests
       (id, tenant_id, personnel_id, work_date, hours, reason, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'PENDING',$7)
     returning id, personnel_id, work_date::text as work_date, hours, reason, status,
               decided_by, decided_at, decision_notes, created_at`,
    [id, tenantId, self.personnel_id, input.work_date, input.hours, input.reason, actorId],
  );

  await appendAudit(
    {
      tenantId,
      actorId,
      actorRole,
      domain: "PAYROLL",
      entityType: "OVERTIME_REQUEST",
      entityId: id,
      action: "OVERTIME_REQUESTED",
      policyVersionId: null,
      decisionContext: {
        personnel_id: self.personnel_id,
        work_date: input.work_date,
        hours: input.hours,
      },
      correlationId,
    },
    client,
  );

  return toOvertimeRequest(result.rows[0]!);
}

export const meRouter: RouterType = Router();

meRouter.use(requireAuthenticated);

meRouter.get("/profile", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  sendData(response, toMeProfile(self));
});

meRouter.get("/payslips", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const query = PayslipListQuerySchema.omit({ personnel_id: true }).parse(request.query);
  const conditions = ["tenant_id = $1", "personnel_id = $2"];
  const values: unknown[] = [auth.tenantId, self.personnel_id];

  if (query.period_month !== undefined) {
    values.push(query.period_month);
    conditions.push(`period_month = $${values.length}::date`);
  }
  if (query.cursor !== undefined) {
    const cursor = decodeCursor(query.cursor);
    values.push(cursor.createdAt, cursor.id);
    conditions.push(`(period_month, id) < ($${values.length - 1}::date, $${values.length}::uuid)`);
  }
  values.push(query.limit + 1);

  const result = await pool.query<PayslipRow>(
    `select id, batch_id, personnel_id, period_month::text as period_month, version,
            secure_url, snapshot_hash_sha256, file_checksum_sha256, gross_income::text,
            net_take_home_pay::text, verification_code, published_at, viewed_at, supersedes_id
       from payroll.payslips
      where ${conditions.join(" AND ")}
      order by period_month desc, id desc
      limit $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > query.limit;
  const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
  const last = rows.at(-1);
  const data = {
    items: rows.map(toPayslip),
    meta: {
      next_cursor: hasMore && last !== undefined ? encodeCursor(last.period_month, last.id) : null,
      has_more: hasMore,
    },
  };
  PayslipPageSchema.parse(data);
  sendData(response, data);
});

meRouter.get("/payslips/:id/download", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const id = IdParamSchema.parse(request.params.id);
  const payslip = await pool.query<PayslipRow>(
    `select id, batch_id, personnel_id, period_month::text as period_month, version,
            secure_url, snapshot_hash_sha256, file_checksum_sha256, gross_income::text,
            net_take_home_pay::text, verification_code, published_at, viewed_at, supersedes_id
       from payroll.payslips
      where tenant_id = $1 and id = $2 and personnel_id = $3
      limit 1`,
    [auth.tenantId, id, self.personnel_id],
  );
  const row = payslip.rows[0];
  if (row === undefined) {
    throw ApiError.notFound("Slip gaji tidak ditemukan");
  }
  const file = await pool.query<{ checksum_sha256: string }>(
    `select checksum_sha256 from payroll.generated_files
      where tenant_id = $1 and kind = 'PAYSLIP' and entity_id = $2 limit 1`,
    [auth.tenantId, id],
  );
  const fileRow = file.rows[0];
  if (fileRow === undefined) {
    throw new ApiError(409, "ERR_REPORT_NOT_READY", "Berkas slip gaji belum tersedia");
  }
  const signed = signFileToken({ tenantId: auth.tenantId, kind: "PAYSLIP", entityId: id });
  await appendAudit({
    tenantId: auth.tenantId,
    actorId: auth.userId,
    actorRole: auth.role,
    domain: "PAYROLL",
    entityType: "PAYSLIP",
    entityId: id,
    action: "PAYSLIP_DOWNLOADED",
    policyVersionId: null,
    decisionContext: {
      batch_id: row.batch_id,
      personnel_id: self.personnel_id,
      version: row.version,
      checksum: fileRow.checksum_sha256,
      source: "SELF_SERVICE",
    },
    correlationId: request.correlationId,
  });
  sendData(
    response,
    FileDownloadResponseSchema.parse({
      url: signedFilePath(signed.token),
      checksum: fileRow.checksum_sha256,
      expires_at: signed.expiresAt,
    }),
  );
});

meRouter.get("/attendance", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const query = PeriodQuerySchema.parse(request.query);
  const conditions = ["tenant_id = $1", "personnel_id = $2"];
  const values: unknown[] = [auth.tenantId, self.personnel_id];
  if (query.period !== undefined) {
    values.push(`${query.period}-01`);
    conditions.push(`period_month = $${values.length}::date`);
  }
  const result = await pool.query<AttendanceRow>(
    `select id, personnel_id, period_month::text as period_month, working_days,
            present_days, paid_leave_days, unpaid_leave_days, absent_days,
            overtime_hours::text as overtime_hours, source, approved_by, approved_at
       from payroll.attendance_summaries
      where ${conditions.join(" AND ")}
      order by period_month desc
      limit 24`,
    values,
  );
  sendData(response, { items: result.rows.map(toAttendance) });
});

meRouter.get("/leave-balances", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const query = YearQuerySchema.parse(request.query);
  const year = query.year ?? new Date().getFullYear();
  const result = await pool.query<LeaveBalanceRow>(
    `select id, personnel_id, leave_type, year, entitlement_days, used_days, pending_days
       from payroll.leave_balances
      where tenant_id = $1 and personnel_id = $2 and year = $3
      order by leave_type asc`,
    [auth.tenantId, self.personnel_id, year],
  );
  const data = { items: result.rows.map(toLeaveBalance) };
  LeaveBalanceListResponseSchema.parse(data);
  sendData(response, data);
});

meRouter.get("/leave-requests", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const result = await pool.query<LeaveRow>(
    `select id, personnel_id, leave_type, start_date::text as start_date,
            end_date::text as end_date, days, status, reason, decided_by, decided_at,
            decision_notes, created_at
       from payroll.leave_requests
      where tenant_id = $1 and personnel_id = $2
      order by created_at desc, id desc
      limit 100`,
    [auth.tenantId, self.personnel_id],
  );
  const data = { items: result.rows.map(toLeave) };
  LeaveRequestListResponseSchema.parse(data);
  sendData(response, data);
});

meRouter.post("/leave-requests", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const input = SelfLeaveRequestCreateSchema.parse(request.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const leave = await insertLeaveRequest(
      client,
      auth.tenantId,
      self,
      input,
      auth.userId,
      auth.role,
      request.correlationId,
    );
    await client.query("COMMIT");
    sendData(response, leave, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

meRouter.get("/overtime-requests", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const result = await pool.query<OvertimeRequestRow>(
    `select id, personnel_id, work_date::text as work_date, hours, reason, status,
            decided_by, decided_at, decision_notes, created_at
       from payroll.overtime_requests
      where tenant_id = $1 and personnel_id = $2
      order by work_date desc, created_at desc
      limit 100`,
    [auth.tenantId, self.personnel_id],
  );
  const data = { items: result.rows.map(toOvertimeRequest) };
  OvertimeRequestListResponseSchema.parse(data);
  sendData(response, data);
});

meRouter.post("/overtime-requests", async (request, response) => {
  const auth = request.auth!;
  const self = await selfOrThrow(auth.tenantId, auth.userId);
  const input = OvertimeRequestCreateSchema.parse(request.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const overtime = await insertOvertimeRequest(
      client,
      auth.tenantId,
      self,
      input,
      auth.userId,
      auth.role,
      request.correlationId,
    );
    await client.query("COMMIT");
    sendData(response, overtime, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "ERR_OVERTIME_DUPLICATE",
        "Sudah ada pengajuan lembur pada tanggal tersebut",
      );
    }
    throw error;
  } finally {
    client.release();
  }
});
