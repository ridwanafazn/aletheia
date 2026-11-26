import type { PayrollBatch, PayrollItem } from "@aletheia/shared-contracts";
import type { PoolClient } from "pg";

export interface BatchRow {
  id: string;
  tenant_id: string;
  batch_code: string;
  branch_id: string;
  period_month: string;
  batch_type: string;
  correction_seq: number;
  period_start: string;
  period_end: string;
  policy_version_id: string;
  status: string;
  total_gross_amount: string;
  total_tax_pph21: string;
  total_bpjs_deduction: string;
  total_bpjs_employer: string;
  total_net_disbursed: string;
  headcount: number;
  created_by: string;
  approved_by: string | null;
  approved_at: Date | null;
  idempotency_key: string;
  disbursed_at: Date | null;
  created_at: Date;
}

export interface ItemRow {
  id: string;
  tenant_id: string;
  batch_id: string;
  personnel_id: string;
  gross_income: string;
  variable_allowance: string;
  overtime_pay: string;
  agent_commission: string;
  unpaid_leave_deduction: string;
  absence_deduction: string;
  bpjs_kesehatan_deduction: string;
  bpjs_jht_deduction: string;
  bpjs_jp_deduction: string;
  bpjs_kesehatan_employer: string;
  bpjs_jht_employer: string;
  bpjs_jp_employer: string;
  bpjs_jkk_employer: string;
  bpjs_jkm_employer: string;
  pph21_tax_deduction: string;
  net_take_home_pay: string;
  taxable_income: string;
  ytd_gross: string;
  ytd_tax: string;
  payment_status: string;
  payment_intent_id: string | null;
  calculation_breakdown: Record<string, unknown>;
}

export const BATCH_SELECT_COLUMNS = `
  id, tenant_id, batch_code, branch_id, period_month::text as period_month,
  batch_type, correction_seq, period_start::text as period_start,
  period_end::text as period_end, policy_version_id, status, total_gross_amount,
  total_tax_pph21, total_bpjs_deduction, total_bpjs_employer, total_net_disbursed,
  headcount, created_by, approved_by, approved_at, idempotency_key, disbursed_at,
  created_at`;

export const ITEM_SELECT_COLUMNS = `
  id, tenant_id, batch_id, personnel_id, gross_income, variable_allowance,
  overtime_pay, agent_commission, unpaid_leave_deduction, absence_deduction,
  bpjs_kesehatan_deduction, bpjs_jht_deduction, bpjs_jp_deduction,
  bpjs_kesehatan_employer, bpjs_jht_employer, bpjs_jp_employer,
  bpjs_jkk_employer, bpjs_jkm_employer, pph21_tax_deduction, net_take_home_pay,
  taxable_income, ytd_gross, ytd_tax, payment_status, payment_intent_id,
  calculation_breakdown`;

export function toPayrollBatch(row: BatchRow): PayrollBatch {
  return {
    id: row.id,
    batch_code: row.batch_code,
    branch_id: row.branch_id,
    period_month: row.period_month,
    batch_type: row.batch_type as PayrollBatch["batch_type"],
    correction_seq: row.correction_seq,
    period_start: row.period_start,
    period_end: row.period_end,
    policy_version_id: row.policy_version_id,
    status: row.status as PayrollBatch["status"],
    total_gross_amount: row.total_gross_amount,
    total_tax_pph21: row.total_tax_pph21,
    total_bpjs_deduction: row.total_bpjs_deduction,
    total_bpjs_employer: row.total_bpjs_employer,
    total_net_disbursed: row.total_net_disbursed,
    headcount: row.headcount,
    created_by: row.created_by,
    approved_by: row.approved_by,
    approved_at: row.approved_at?.toISOString() ?? null,
    idempotency_key: row.idempotency_key,
    disbursed_at: row.disbursed_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export function toPayrollItem(row: ItemRow): PayrollItem {
  return {
    id: row.id,
    batch_id: row.batch_id,
    personnel_id: row.personnel_id,
    gross_income: row.gross_income,
    variable_allowance: row.variable_allowance,
    overtime_pay: row.overtime_pay,
    agent_commission: row.agent_commission,
    unpaid_leave_deduction: row.unpaid_leave_deduction,
    absence_deduction: row.absence_deduction,
    bpjs_kesehatan_deduction: row.bpjs_kesehatan_deduction,
    bpjs_jht_deduction: row.bpjs_jht_deduction,
    bpjs_jp_deduction: row.bpjs_jp_deduction,
    bpjs_kesehatan_employer: row.bpjs_kesehatan_employer,
    bpjs_jht_employer: row.bpjs_jht_employer,
    bpjs_jp_employer: row.bpjs_jp_employer,
    bpjs_jkk_employer: row.bpjs_jkk_employer,
    bpjs_jkm_employer: row.bpjs_jkm_employer,
    pph21_tax_deduction: row.pph21_tax_deduction,
    net_take_home_pay: row.net_take_home_pay,
    taxable_income: row.taxable_income,
    ytd_gross: row.ytd_gross,
    ytd_tax: row.ytd_tax,
    payment_status: row.payment_status as PayrollItem["payment_status"],
    payment_intent_id: row.payment_intent_id,
    calculation_breakdown:
      row.calculation_breakdown as unknown as PayrollItem["calculation_breakdown"],
  };
}

export async function getBatchRow(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  lock = false,
): Promise<BatchRow | null> {
  const result = await client.query<BatchRow>(
    `select ${BATCH_SELECT_COLUMNS}
       from payroll.batches
      where tenant_id = $1
        and id = $2
      ${lock ? "for update nowait" : ""}
      limit 1`,
    [tenantId, batchId],
  );
  return result.rows[0] ?? null;
}

export async function getBatchItems(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  lock = false,
): Promise<ItemRow[]> {
  const result = await client.query<ItemRow>(
    `select ${ITEM_SELECT_COLUMNS}
       from payroll.items
      where tenant_id = $1
        and batch_id = $2
      order by personnel_id asc
      ${lock ? "for update nowait" : ""}`,
    [tenantId, batchId],
  );
  return result.rows;
}
