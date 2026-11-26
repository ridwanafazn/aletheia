import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  AttendanceSummarySchema,
  AttendanceUpsertSchema,
  EmployeeCreateRequestSchema,
  EmployeeListQuerySchema,
  EmployeePageSchema,
  EmployeeSchema,
  EmployeeUpdateRequestSchema,
  LeaveDecisionRequestSchema,
  LeaveRequestCreateSchema,
  LeaveRequestSchema,
  SalesAchievementSchema,
  SalesAchievementUpsertSchema,
  type AttendanceSummary,
  type LeaveRequest,
  type SalesAchievement,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";

import { appendAudit } from "../lib/audit.js";
import {
  EMPLOYEE_SELECT_COLUMNS,
  findEmployee,
  toEmployee,
  type EmployeeRow,
} from "../lib/employee-model.js";
import { ApiError } from "../lib/errors.js";
import { isUniqueViolation } from "../lib/db-errors.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";
import { hashBankAccount, hashNik, maskBankAccount, maskNik } from "../lib/pii.js";
import { sendData } from "../lib/response.js";
import { requireRoles } from "../middleware/authorize.js";

const IdParamSchema = z.string().uuid();
const PeriodParamSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);

function normalizePeriod(value: string): string {
  const parsed = PeriodParamSchema.parse(value);
  return parsed.length === 7 ? `${parsed}-01` : parsed;
}

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

interface SalesRow {
  id: string;
  personnel_id: string;
  period_month: string;
  verified_sales: string;
  verification_status: string;
  source: string;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
}

function toSales(row: SalesRow): SalesAchievement {
  return SalesAchievementSchema.parse({
    id: row.id,
    personnel_id: row.personnel_id,
    period_month: row.period_month,
    verified_sales: row.verified_sales,
    verification_status: row.verification_status,
    source: row.source,
    verified_by: row.verified_by,
    verified_at: row.verified_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  });
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

async function verifyBranch(client: PoolClient, tenantId: string, branchId: string): Promise<void> {
  const branch = await client.query(
    `select 1 from governance.branches where id = $1 and tenant_id = $2`,
    [branchId, tenantId],
  );
  if (branch.rowCount !== 1) {
    throw ApiError.notFound("Cabang tidak ditemukan pada tenant ini");
  }
}

async function verifyUser(
  client: PoolClient,
  tenantId: string,
  userId: string | null | undefined,
): Promise<void> {
  if (userId === null || userId === undefined) {
    return;
  }
  const user = await client.query(
    `select 1 from governance.users where id = $1 and tenant_id = $2`,
    [userId, tenantId],
  );
  if (user.rowCount !== 1) {
    throw ApiError.notFound("Akun pengguna tidak ditemukan pada tenant ini");
  }
}

export const employeeRouter: RouterType = Router();

employeeRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"),
  async (request, response) => {
    const auth = request.auth!;
    const query = EmployeeListQuerySchema.parse(request.query);
    const conditions = ["tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];

    if (query.branch_id !== undefined) {
      values.push(query.branch_id);
      conditions.push(`branch_id = $${values.length}`);
    }
    if (query.personnel_type !== undefined) {
      values.push(query.personnel_type);
      conditions.push(`personnel_type = $${values.length}`);
    }
    if (query.status !== undefined) {
      values.push(query.status);
      conditions.push(`employment_status = $${values.length}`);
    }
    if (query.active !== undefined) {
      values.push(query.active);
      conditions.push(`is_active = $${values.length}`);
    }
    if (query.search !== undefined) {
      values.push(`%${query.search}%`);
      conditions.push(
        `(full_name ilike $${values.length} or personnel_code ilike $${values.length})`,
      );
    }
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(
        `(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }
    values.push(query.limit + 1);

    const result = await pool.query<EmployeeRow>(
      `select ${EMPLOYEE_SELECT_COLUMNS}
         from payroll.personnel
        where ${conditions.join(" AND ")}
        order by created_at desc, id desc
        limit $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const last = rows.at(-1);
    const data = {
      items: rows.map(toEmployee),
      meta: {
        next_cursor: hasMore && last !== undefined ? encodeCursor(last.created_at, last.id) : null,
        has_more: hasMore,
      },
    };
    EmployeePageSchema.parse(data);
    sendData(response, data);
  },
);

employeeRouter.post("/", requireRoles("HR_SPECIALIST"), async (request, response) => {
  const auth = request.auth!;
  const input = EmployeeCreateRequestSchema.parse(request.body);
  const branchId = input.branch_id ?? auth.branchId;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await verifyBranch(client, auth.tenantId, branchId);
    await verifyUser(client, auth.tenantId, input.user_id);

    const id = randomUUID();
    const inserted = await client.query<EmployeeRow>(
      `insert into payroll.personnel
        (id, tenant_id, branch_id, user_id, personnel_code, personnel_type, full_name,
         nik_hash, nik_masked, bank_account_hash, bank_account_masked, bank_code, bank_name,
         ptkp_status, risk_class, employment_status, base_salary, fixed_allowance, join_date,
         termination_date, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       returning ${EMPLOYEE_SELECT_COLUMNS}`,
      [
        id,
        auth.tenantId,
        branchId,
        input.user_id ?? null,
        input.personnel_code,
        input.personnel_type,
        input.full_name,
        hashNik(input.nik),
        maskNik(input.nik),
        hashBankAccount(input.bank_account_number),
        maskBankAccount(input.bank_account_number),
        input.bank_code,
        input.bank_name,
        input.ptkp_status,
        input.risk_class,
        input.employment_status,
        input.base_salary,
        input.fixed_allowance,
        input.join_date,
        input.termination_date ?? null,
        input.is_active ?? true,
      ],
    );

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "EMPLOYEE",
        entityId: id,
        action: "EMPLOYEE_CREATED",
        policyVersionId: null,
        decisionContext: {
          personnel_code: input.personnel_code,
          personnel_type: input.personnel_type,
          branch_id: branchId,
          ptkp_status: input.ptkp_status,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, EmployeeSchema.parse(toEmployee(inserted.rows[0]!)), 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isUniqueViolation(error)) {
      throw ApiError.conflict("ERR_IDEMPOTENCY_CONFLICT", "Kode personel atau NIK sudah terdaftar");
    }
    throw error;
  } finally {
    client.release();
  }
});

employeeRouter.get(
  "/:id",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const row = await findEmployee(pool, auth.tenantId, id);
    if (row === null) {
      throw ApiError.notFound("Karyawan tidak ditemukan");
    }
    sendData(response, EmployeeSchema.parse(toEmployee(row)));
  },
);

employeeRouter.patch("/:id", requireRoles("HR_SPECIALIST"), async (request, response) => {
  const auth = request.auth!;
  const id = IdParamSchema.parse(request.params.id);
  const input = EmployeeUpdateRequestSchema.parse(request.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query<EmployeeRow>(
      `select ${EMPLOYEE_SELECT_COLUMNS}
         from payroll.personnel
        where tenant_id = $1 and id = $2
        for update`,
      [auth.tenantId, id],
    );
    const before = existing.rows[0];
    if (before === undefined) {
      throw ApiError.notFound("Karyawan tidak ditemukan");
    }
    await verifyUser(client, auth.tenantId, input.user_id);

    const bankHash =
      input.bank_account_number === undefined
        ? before.bank_account_hash
        : hashBankAccount(input.bank_account_number);
    const bankMasked =
      input.bank_account_number === undefined
        ? before.bank_account_masked
        : maskBankAccount(input.bank_account_number);

    const updated = await client.query<EmployeeRow>(
      `update payroll.personnel
          set full_name = $3,
              bank_account_hash = $4,
              bank_account_masked = $5,
              bank_code = $6,
              bank_name = $7,
              ptkp_status = $8,
              risk_class = $9,
              employment_status = $10,
              base_salary = $11,
              fixed_allowance = $12,
              termination_date = $13,
              user_id = $14,
              is_active = $15
        where tenant_id = $1 and id = $2
        returning ${EMPLOYEE_SELECT_COLUMNS}`,
      [
        auth.tenantId,
        id,
        input.full_name ?? before.full_name,
        bankHash,
        bankMasked,
        input.bank_code ?? before.bank_code,
        input.bank_name ?? before.bank_name,
        input.ptkp_status ?? before.ptkp_status,
        input.risk_class ?? before.risk_class,
        input.employment_status ?? before.employment_status,
        input.base_salary ?? before.base_salary,
        input.fixed_allowance ?? before.fixed_allowance,
        input.termination_date === undefined ? before.termination_date : input.termination_date,
        input.user_id === undefined ? before.user_id : input.user_id,
        input.is_active ?? before.is_active,
      ],
    );

    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "EMPLOYEE",
        entityId: id,
        action: "EMPLOYEE_UPDATED",
        policyVersionId: null,
        decisionContext: {
          changed_fields: Object.keys(input),
          before: {
            full_name: before.full_name,
            bank_account_masked: before.bank_account_masked,
            ptkp_status: before.ptkp_status,
            base_salary: before.base_salary,
            fixed_allowance: before.fixed_allowance,
            employment_status: before.employment_status,
          },
          after: {
            full_name: updated.rows[0]!.full_name,
            bank_account_masked: updated.rows[0]!.bank_account_masked,
            ptkp_status: updated.rows[0]!.ptkp_status,
            base_salary: updated.rows[0]!.base_salary,
            fixed_allowance: updated.rows[0]!.fixed_allowance,
            employment_status: updated.rows[0]!.employment_status,
          },
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, EmployeeSchema.parse(toEmployee(updated.rows[0]!)));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

export const attendanceRouter: RouterType = Router();

attendanceRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const conditions = ["a.tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (request.query.period !== undefined) {
      values.push(normalizePeriod(z.string().parse(request.query.period)));
      conditions.push(`a.period_month = $${values.length}::date`);
    }
    if (request.query.personnel_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.personnel_id));
      conditions.push(`a.personnel_id = $${values.length}`);
    }
    if (request.query.branch_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.branch_id));
      conditions.push(`p.branch_id = $${values.length}`);
    }

    const result = await pool.query<AttendanceRow>(
      `select a.id, a.personnel_id, a.period_month::text as period_month,
              a.working_days, a.present_days, a.paid_leave_days, a.unpaid_leave_days,
              a.absent_days, a.overtime_hours, a.source, a.approved_by, a.approved_at
         from payroll.attendance_summaries a
         join payroll.personnel p on p.id = a.personnel_id and p.tenant_id = a.tenant_id
        where ${conditions.join(" AND ")}
        order by a.period_month desc, a.personnel_id asc
        limit 200`,
      values,
    );
    sendData(response, { items: result.rows.map(toAttendance) });
  },
);

attendanceRouter.put(
  "/:personnelId/:period",
  requireRoles("HR_SPECIALIST"),
  async (request, response) => {
    const auth = request.auth!;
    const personnelId = IdParamSchema.parse(request.params.personnelId);
    const period = normalizePeriod(z.string().parse(request.params.period));
    const input = AttendanceUpsertSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const employee = await findEmployee(client, auth.tenantId, personnelId);
      if (employee === null) {
        throw ApiError.notFound("Karyawan tidak ditemukan");
      }
      const result = await client.query<AttendanceRow>(
        `insert into payroll.attendance_summaries
          (id, tenant_id, personnel_id, period_month, working_days, present_days,
           paid_leave_days, unpaid_leave_days, absent_days, overtime_hours, source,
           approved_by, approved_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         on conflict (tenant_id, personnel_id, period_month)
         do update set working_days = excluded.working_days,
                       present_days = excluded.present_days,
                       paid_leave_days = excluded.paid_leave_days,
                       unpaid_leave_days = excluded.unpaid_leave_days,
                       absent_days = excluded.absent_days,
                       overtime_hours = excluded.overtime_hours,
                       source = excluded.source,
                       approved_by = excluded.approved_by,
                       approved_at = now(),
                       updated_at = now()
         returning id, personnel_id, period_month::text as period_month, working_days,
                   present_days, paid_leave_days, unpaid_leave_days, absent_days,
                   overtime_hours, source, approved_by, approved_at`,
        [
          randomUUID(),
          auth.tenantId,
          personnelId,
          period,
          input.working_days,
          input.present_days,
          input.paid_leave_days,
          input.unpaid_leave_days,
          input.absent_days,
          input.overtime_hours,
          input.source,
          auth.userId,
        ],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "ATTENDANCE",
          entityId: result.rows[0]!.id,
          action: "ATTENDANCE_UPSERTED",
          policyVersionId: null,
          decisionContext: {
            personnel_id: personnelId,
            period_month: period,
            working_days: input.working_days,
            overtime_hours: input.overtime_hours,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, AttendanceSummarySchema.parse(toAttendance(result.rows[0]!)));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

export const salesRouter: RouterType = Router();

salesRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"),
  async (request, response) => {
    const auth = request.auth!;
    const conditions = ["s.tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (request.query.period !== undefined) {
      values.push(normalizePeriod(z.string().parse(request.query.period)));
      conditions.push(`s.period_month = $${values.length}::date`);
    }
    if (request.query.personnel_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.personnel_id));
      conditions.push(`s.personnel_id = $${values.length}`);
    }
    if (request.query.branch_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.branch_id));
      conditions.push(`p.branch_id = $${values.length}`);
    }

    const result = await pool.query<SalesRow>(
      `select s.id, s.personnel_id, s.period_month::text as period_month,
              s.verified_sales, s.verification_status, s.source, s.verified_by,
              s.verified_at, s.created_at
         from payroll.sales_achievements s
         join payroll.personnel p on p.id = s.personnel_id and p.tenant_id = s.tenant_id
        where ${conditions.join(" AND ")}
        order by s.period_month desc, s.personnel_id asc
        limit 200`,
      values,
    );
    sendData(response, { items: result.rows.map(toSales) });
  },
);

salesRouter.put(
  "/:personnelId/:period",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const personnelId = IdParamSchema.parse(request.params.personnelId);
    const period = normalizePeriod(z.string().parse(request.params.period));
    const input = SalesAchievementUpsertSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const employee = await findEmployee(client, auth.tenantId, personnelId);
      if (employee === null) {
        throw ApiError.notFound("Karyawan tidak ditemukan");
      }
      if (employee.personnel_type !== "SALES_AGENT") {
        throw ApiError.policyViolation("Capaian penjualan hanya untuk agen");
      }
      const verified = input.verification_status === "VERIFIED";
      const result = await client.query<SalesRow>(
        `insert into payroll.sales_achievements
          (id, tenant_id, personnel_id, period_month, verified_sales, verification_status,
           source, verified_by, verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (tenant_id, personnel_id, period_month)
         do update set verified_sales = excluded.verified_sales,
                       verification_status = excluded.verification_status,
                       source = excluded.source,
                       verified_by = excluded.verified_by,
                       verified_at = excluded.verified_at
         returning id, personnel_id, period_month::text as period_month, verified_sales,
                   verification_status, source, verified_by, verified_at, created_at`,
        [
          randomUUID(),
          auth.tenantId,
          personnelId,
          period,
          input.verified_sales,
          input.verification_status,
          input.source,
          verified ? auth.userId : null,
          verified ? new Date() : null,
        ],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "SALES_ACHIEVEMENT",
          entityId: result.rows[0]!.id,
          action: "SALES_ACHIEVEMENT_UPSERTED",
          policyVersionId: null,
          decisionContext: {
            personnel_id: personnelId,
            period_month: period,
            verified_sales: input.verified_sales,
            verification_status: input.verification_status,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, SalesAchievementSchema.parse(toSales(result.rows[0]!)));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);

export const leaveRouter: RouterType = Router();

leaveRouter.get(
  "/",
  requireRoles("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"),
  async (request, response) => {
    const auth = request.auth!;
    const conditions = ["l.tenant_id = $1"];
    const values: unknown[] = [auth.tenantId];
    if (request.query.status !== undefined) {
      values.push(z.string().parse(request.query.status));
      conditions.push(`l.status = $${values.length}`);
    }
    if (request.query.personnel_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.personnel_id));
      conditions.push(`l.personnel_id = $${values.length}`);
    }
    if (request.query.branch_id !== undefined) {
      values.push(IdParamSchema.parse(request.query.branch_id));
      conditions.push(`p.branch_id = $${values.length}`);
    }
    const result = await pool.query<LeaveRow>(
      `select l.id, l.personnel_id, l.leave_type, l.start_date::text as start_date,
              l.end_date::text as end_date, l.days, l.status, l.reason, l.decided_by,
              l.decided_at, l.decision_notes, l.created_at
         from payroll.leave_requests l
         join payroll.personnel p on p.id = l.personnel_id and p.tenant_id = l.tenant_id
        where ${conditions.join(" AND ")}
        order by l.created_at desc, l.id desc
        limit 200`,
      values,
    );
    sendData(response, { items: result.rows.map(toLeave) });
  },
);

leaveRouter.post("/", requireRoles("HR_SPECIALIST"), async (request, response) => {
  const auth = request.auth!;
  const input = LeaveRequestCreateSchema.parse(request.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const employee = await findEmployee(client, auth.tenantId, input.personnel_id);
    if (employee === null) {
      throw ApiError.notFound("Karyawan tidak ditemukan");
    }
    const id = randomUUID();
    const result = await client.query<LeaveRow>(
      `insert into payroll.leave_requests
        (id, tenant_id, personnel_id, leave_type, start_date, end_date, days, status, reason)
       values ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)
       returning id, personnel_id, leave_type, start_date::text as start_date,
                 end_date::text as end_date, days, status, reason, decided_by, decided_at,
                 decision_notes, created_at`,
      [
        id,
        auth.tenantId,
        input.personnel_id,
        input.leave_type,
        input.start_date,
        input.end_date,
        input.days,
        input.reason,
      ],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "PAYROLL",
        entityType: "LEAVE_REQUEST",
        entityId: id,
        action: "LEAVE_REQUESTED",
        policyVersionId: null,
        decisionContext: {
          personnel_id: input.personnel_id,
          leave_type: input.leave_type,
          days: input.days,
        },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    sendData(response, LeaveRequestSchema.parse(toLeave(result.rows[0]!)), 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

leaveRouter.post(
  "/:id/decide",
  requireRoles("BRANCH_MANAGER", "FINANCE_MANAGER"),
  async (request, response) => {
    const auth = request.auth!;
    const id = IdParamSchema.parse(request.params.id);
    const input = LeaveDecisionRequestSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await client.query<LeaveRow & { user_id: string | null; branch_id: string }>(
        `select l.id, l.personnel_id, l.leave_type, l.start_date::text as start_date,
                l.end_date::text as end_date, l.days, l.status, l.reason, l.decided_by,
                l.decided_at, l.decision_notes, l.created_at, p.user_id, p.branch_id
           from payroll.leave_requests l
           join payroll.personnel p on p.id = l.personnel_id and p.tenant_id = l.tenant_id
          where l.tenant_id = $1 and l.id = $2
          for update of l`,
        [auth.tenantId, id],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw ApiError.notFound("Pengajuan cuti tidak ditemukan");
      }
      if (auth.role === "BRANCH_MANAGER" && row.branch_id !== auth.branchId) {
        throw ApiError.notFound("Pengajuan cuti tidak ditemukan");
      }
      if (row.user_id !== null && row.user_id === auth.userId) {
        throw new ApiError(403, "ERR_SOD_VIOLATION", "Tidak dapat memutuskan cuti sendiri");
      }
      if (row.status !== "PENDING") {
        throw new ApiError(409, "ERR_CONCURRENT_LOCK", "Cuti sudah diputuskan");
      }

      const result = await client.query<LeaveRow>(
        `update payroll.leave_requests
            set status = $3,
                decided_by = $4,
                decided_at = now(),
                decision_notes = $5,
                updated_at = now()
          where tenant_id = $1 and id = $2
          returning id, personnel_id, leave_type, start_date::text as start_date,
                    end_date::text as end_date, days, status, reason, decided_by,
                    decided_at, decision_notes, created_at`,
        [auth.tenantId, id, input.decision, auth.userId, input.notes ?? null],
      );
      await appendAudit(
        {
          tenantId: auth.tenantId,
          actorId: auth.userId,
          actorRole: auth.role,
          domain: "PAYROLL",
          entityType: "LEAVE_REQUEST",
          entityId: id,
          action: "LEAVE_DECIDED",
          policyVersionId: null,
          decisionContext: {
            decision: input.decision,
            notes: input.notes ?? null,
            personnel_id: row.personnel_id,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      sendData(response, LeaveRequestSchema.parse(toLeave(result.rows[0]!)));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
);
