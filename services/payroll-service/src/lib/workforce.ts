import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type { LeaveBalance, OvertimeRequest } from "@aletheia/shared-contracts";

import { ApiError } from "./errors.js";

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface SelfPersonnelRow {
  personnel_id: string;
  personnel_code: string;
  full_name: string;
  branch_id: string;
  branch_name: string;
  personnel_type: string;
  employment_status: string;
  ptkp_status: string;
  join_date: string;
  is_active: boolean;
}

export interface LeaveBalanceRow {
  id: string;
  personnel_id: string;
  leave_type: string;
  year: number;
  entitlement_days: string;
  used_days: string;
  pending_days: string;
}

export interface OvertimeRequestRow {
  id: string;
  personnel_id: string;
  work_date: string;
  hours: string;
  reason: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_notes: string | null;
  created_at: Date;
}

export function leaveYear(startDate: string): number {
  return Number(startDate.slice(0, 4));
}

export function monthStart(workDate: string): string {
  return `${workDate.slice(0, 7)}-01`;
}

export function remainingDays(
  entitlementDays: string,
  usedDays: string,
  pendingDays: string,
): number {
  return Math.max(0, Number(entitlementDays) - Number(usedDays) - Number(pendingDays));
}

export function requiresLeaveBalance(leaveType: string): boolean {
  return leaveType !== "UNPAID";
}

export interface LeaveMonthAllocation {
  period_month: string;
  days: number;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function periodMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function leaveMonthAllocations(
  startDate: string,
  endDate: string,
  days: number,
): LeaveMonthAllocation[] {
  const end = parseDateOnly(endDate);
  const cursor = parseDateOnly(startDate);
  const workingDaysByPeriod = new Map<string, number>();

  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const period = periodMonthOf(cursor);
      workingDaysByPeriod.set(period, (workingDaysByPeriod.get(period) ?? 0) + 1);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totalWorkingDays = [...workingDaysByPeriod.values()].reduce(
    (total, count) => total + count,
    0,
  );
  const targetDays = Math.min(Math.floor(days), totalWorkingDays);
  if (targetDays <= 0) {
    return [];
  }

  const allocations = [...workingDaysByPeriod.entries()].map(([period_month, workingDays]) => {
    const exact = (workingDays / totalWorkingDays) * targetDays;
    const whole = Math.floor(exact);
    return { period_month, workingDays, whole, remainder: exact - whole };
  });

  let remaining = targetDays - allocations.reduce((total, row) => total + row.whole, 0);
  allocations.sort(
    (left, right) =>
      right.remainder - left.remainder || left.period_month.localeCompare(right.period_month),
  );
  for (const allocation of allocations) {
    if (remaining <= 0) {
      break;
    }
    allocation.whole += 1;
    remaining -= 1;
  }

  return allocations
    .filter((allocation) => allocation.whole > 0)
    .sort((left, right) => left.period_month.localeCompare(right.period_month))
    .map((allocation) => ({ period_month: allocation.period_month, days: allocation.whole }));
}

export async function resolveSelf(
  queryable: Queryable,
  tenantId: string,
  userId: string,
): Promise<SelfPersonnelRow> {
  const result = await queryable.query<SelfPersonnelRow>(
    `select p.id as personnel_id, p.personnel_code, p.full_name, p.branch_id,
            b.name as branch_name, p.personnel_type, p.employment_status,
            p.ptkp_status, p.join_date::text as join_date, p.is_active
       from payroll.personnel p
       join governance.branches b on b.id = p.branch_id and b.tenant_id = p.tenant_id
      where p.tenant_id = $1 and p.user_id = $2 and p.is_active
      limit 2`,
    [tenantId, userId],
  );
  if (result.rows.length > 1) {
    throw new ApiError(
      409,
      "ERR_EMPLOYEE_LINK_CONFLICT",
      "Akun ini terhubung ke lebih dari satu data personel",
    );
  }
  const row = result.rows[0];
  if (row === undefined) {
    throw new ApiError(403, "ERR_RBAC_FORBIDDEN", "Akun ini tidak terhubung ke data personel");
  }
  return row;
}

export function toLeaveBalance(row: LeaveBalanceRow): LeaveBalance {
  return {
    id: row.id,
    personnel_id: row.personnel_id,
    leave_type: row.leave_type as LeaveBalance["leave_type"],
    year: row.year,
    entitlement_days: Number(row.entitlement_days),
    used_days: Number(row.used_days),
    pending_days: Number(row.pending_days),
    remaining_days: remainingDays(row.entitlement_days, row.used_days, row.pending_days),
  };
}

export function toOvertimeRequest(row: OvertimeRequestRow): OvertimeRequest {
  return {
    id: row.id,
    personnel_id: row.personnel_id,
    work_date: row.work_date,
    hours: Number(row.hours),
    reason: row.reason,
    status: row.status as OvertimeRequest["status"],
    decided_by: row.decided_by,
    decided_at: row.decided_at?.toISOString() ?? null,
    decision_notes: row.decision_notes,
    created_at: row.created_at.toISOString(),
  };
}

export async function lockLeaveBalance(
  client: PoolClient,
  tenantId: string,
  personnelId: string,
  leaveType: string,
  year: number,
): Promise<LeaveBalanceRow> {
  const result = await client.query<LeaveBalanceRow>(
    `select id, personnel_id, leave_type, year, entitlement_days, used_days, pending_days
       from payroll.leave_balances
      where tenant_id = $1 and personnel_id = $2 and leave_type = $3 and year = $4
      for update`,
    [tenantId, personnelId, leaveType, year],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ApiError(
      422,
      "ERR_LEAVE_BALANCE_NOT_CONFIGURED",
      "Saldo cuti belum diatur untuk jenis cuti dan tahun ini",
    );
  }
  return row;
}

export async function recomputeOvertimeSummary(
  client: PoolClient,
  tenantId: string,
  personnelId: string,
  workDate: string,
  _actorId: string,
): Promise<void> {
  const period = monthStart(workDate);
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${tenantId}:${personnelId}:${period}:overtime`,
  ]);
  const total = await client.query<{ total: string }>(
    `select coalesce(sum(hours), 0)::text as total
       from payroll.overtime_requests
      where tenant_id = $1
        and personnel_id = $2
        and status = 'APPROVED'
        and work_date >= $3::date
        and work_date < ($3::date + interval '1 month')`,
    [tenantId, personnelId, period],
  );
  const updated = await client.query(
    `update payroll.attendance_summaries
        set overtime_hours = $4,
            updated_at = now()
      where tenant_id = $1 and personnel_id = $2 and period_month = $3::date`,
    [tenantId, personnelId, period, total.rows[0]?.total ?? "0"],
  );
  if (updated.rowCount === 0) {
    throw new ApiError(
      409,
      "ERR_ATTENDANCE_MISSING",
      "Ringkasan absensi bulan ini belum tersedia. Minta HR mengisi absensi sebelum menyetujui lembur.",
    );
  }
}

interface AttendanceLeaveRow {
  id: string;
  period_month: string;
  working_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
}

export interface LeaveAttendanceAllocationResult {
  period_month: string;
  days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
}

export interface LeaveAttendanceSync {
  requested_days: number;
  applied_days: number;
  allocations: LeaveAttendanceAllocationResult[];
}

export async function applyApprovedLeaveToAttendance(
  client: PoolClient,
  input: {
    tenantId: string;
    personnelId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
  },
): Promise<LeaveAttendanceSync> {
  const allocations = leaveMonthAllocations(input.startDate, input.endDate, input.days);
  if (allocations.length === 0) {
    return { requested_days: input.days, applied_days: 0, allocations: [] };
  }

  for (const allocation of allocations) {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${input.tenantId}:${input.personnelId}:${allocation.period_month}:attendance`,
    ]);
  }

  const periods = allocations.map((allocation) => allocation.period_month);
  const rows = await client.query<AttendanceLeaveRow>(
    `select id, period_month::text as period_month, working_days, present_days,
            paid_leave_days, unpaid_leave_days, absent_days
       from payroll.attendance_summaries
      where tenant_id = $1 and personnel_id = $2 and period_month = any($3::date[])
      order by period_month
      for update`,
    [input.tenantId, input.personnelId, periods],
  );
  if (rows.rowCount !== allocations.length) {
    const found = new Set(rows.rows.map((row) => row.period_month));
    const missing = periods.filter((period) => !found.has(period));
    throw new ApiError(
      409,
      "ERR_ATTENDANCE_MISSING",
      `Ringkasan absensi belum tersedia untuk periode ${missing.join(", ")}. Minta HR mengisi absensi sebelum menyetujui cuti.`,
    );
  }

  const countsAsUnpaid = input.leaveType === "UNPAID";
  const results: LeaveAttendanceAllocationResult[] = [];
  for (const allocation of allocations) {
    const row = rows.rows.find((candidate) => candidate.period_month === allocation.period_month);
    if (row === undefined) {
      throw new ApiError(409, "ERR_ATTENDANCE_MISSING", "Ringkasan absensi tidak lengkap");
    }
    const nextPaidLeave = row.paid_leave_days + (countsAsUnpaid ? 0 : allocation.days);
    const nextUnpaidLeave = row.unpaid_leave_days + (countsAsUnpaid ? allocation.days : 0);
    const nextTotal = row.present_days + nextPaidLeave + nextUnpaidLeave + row.absent_days;
    if (nextTotal > row.working_days) {
      throw new ApiError(
        422,
        "ERR_ATTENDANCE_CAPACITY",
        `Ringkasan absensi ${allocation.period_month} tidak memiliki kapasitas untuk ${allocation.days} hari cuti. Sesuaikan present_days terlebih dahulu.`,
      );
    }
    await client.query(
      `update payroll.attendance_summaries
          set paid_leave_days = $4,
              unpaid_leave_days = $5,
              updated_at = now()
        where tenant_id = $1 and id = $2 and personnel_id = $3`,
      [input.tenantId, row.id, input.personnelId, nextPaidLeave, nextUnpaidLeave],
    );
    results.push({
      period_month: allocation.period_month,
      days: allocation.days,
      paid_leave_days: nextPaidLeave,
      unpaid_leave_days: nextUnpaidLeave,
    });
  }

  return {
    requested_days: input.days,
    applied_days: results.reduce((total, result) => total + result.days, 0),
    allocations: results,
  };
}
