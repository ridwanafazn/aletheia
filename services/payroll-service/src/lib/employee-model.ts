import type { Employee } from "@aletheia/shared-contracts";
import type { PoolClient } from "pg";

import type { Queryable } from "./policy.js";

export interface EmployeeRow {
  id: string;
  branch_id: string;
  personnel_code: string;
  personnel_type: string;
  full_name: string;
  nik_hash: string;
  nik_masked: string;
  bank_account_hash: string;
  bank_account_masked: string;
  bank_code: string;
  bank_name: string;
  ptkp_status: string;
  risk_class: string;
  employment_status: string;
  base_salary: string;
  fixed_allowance: string;
  join_date: string;
  termination_date: string | null;
  user_id: string | null;
  is_active: boolean;
  created_at: Date;
}

export const EMPLOYEE_SELECT_COLUMNS = `
  id, branch_id, personnel_code, personnel_type, full_name, nik_hash, nik_masked,
  bank_account_hash, bank_account_masked, bank_code, bank_name, ptkp_status,
  risk_class, employment_status, base_salary, fixed_allowance,
  join_date::text as join_date, termination_date::text as termination_date,
  user_id, is_active, created_at`;

export function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    branch_id: row.branch_id,
    personnel_code: row.personnel_code,
    personnel_type: row.personnel_type as Employee["personnel_type"],
    full_name: row.full_name,
    nik_masked: row.nik_masked,
    bank_account_masked: row.bank_account_masked,
    bank_code: row.bank_code,
    bank_name: row.bank_name,
    ptkp_status: row.ptkp_status as Employee["ptkp_status"],
    risk_class: row.risk_class as Employee["risk_class"],
    employment_status: row.employment_status as Employee["employment_status"],
    base_salary: row.base_salary,
    fixed_allowance: row.fixed_allowance,
    join_date: row.join_date,
    termination_date: row.termination_date,
    user_id: row.user_id,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

export async function findEmployee(
  queryable: Queryable,
  tenantId: string,
  personnelId: string,
): Promise<EmployeeRow | null> {
  const result = await queryable.query<EmployeeRow>(
    `select ${EMPLOYEE_SELECT_COLUMNS}
       from payroll.personnel
      where tenant_id = $1
        and id = $2
      limit 1`,
    [tenantId, personnelId],
  );
  return result.rows[0] ?? null;
}

export async function requireEmployee(
  client: PoolClient,
  tenantId: string,
  personnelId: string,
): Promise<EmployeeRow> {
  const row = await findEmployee(client, tenantId, personnelId);
  if (row === null) {
    throw new Error("Karyawan tidak ditemukan");
  }
  return row;
}
