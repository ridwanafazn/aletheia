import { randomUUID } from "node:crypto";

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
      limit 1`,
    [tenantId, userId],
  );
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
  actorId: string,
): Promise<void> {
  const period = monthStart(workDate);
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
  await client.query(
    `insert into payroll.attendance_summaries
       (id, tenant_id, personnel_id, period_month, working_days, present_days,
        paid_leave_days, unpaid_leave_days, absent_days, overtime_hours, source,
        approved_by, approved_at)
     values ($1,$2,$3,$4,0,0,0,0,0,$5,'API',$6,now())
     on conflict (tenant_id, personnel_id, period_month)
     do update set overtime_hours = excluded.overtime_hours,
                   source = 'API',
                   approved_by = excluded.approved_by,
                   approved_at = now(),
                   updated_at = now()`,
    [randomUUID(), tenantId, personnelId, period, total.rows[0]?.total ?? "0", actorId],
  );
}
