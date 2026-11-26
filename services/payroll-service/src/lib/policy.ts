import type { Pool, PoolClient } from "pg";

import { PayrollPolicySchema, type PayrollPolicy } from "@aletheia/shared-contracts";

import { ApiError } from "./errors.js";

export type Queryable = Pick<Pool | PoolClient, "query">;

export interface BoundPayrollPolicy {
  id: string;
  versionTag: string;
  rules: PayrollPolicy;
}

interface PolicyRow {
  id: string;
  version_tag: string;
  rules_payload: Record<string, unknown>;
}

function parsePolicy(row: PolicyRow | undefined): BoundPayrollPolicy {
  if (row === undefined) {
    throw ApiError.policyViolation("Kebijakan pajak payroll tidak ditemukan");
  }

  const parsed = PayrollPolicySchema.safeParse(row.rules_payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location =
      issue === undefined || issue.path.length === 0
        ? "rules_payload"
        : `rules_payload.${issue.path.join(".")}`;
    throw ApiError.policyViolation(
      `Kebijakan payroll tidak lengkap atau tidak valid pada ${location}`,
    );
  }

  return { id: row.id, versionTag: row.version_tag, rules: parsed.data };
}

export async function getActivePayrollPolicy(
  queryable: Queryable,
  tenantId: string,
): Promise<BoundPayrollPolicy> {
  const result = await queryable.query<PolicyRow>(
    `select id, version_tag, rules_payload
       from governance.policy_versions
      where tenant_id = $1
        and domain = 'PAYROLL_TAX_POLICY'
        and status = 'ACTIVE'
      limit 1`,
    [tenantId],
  );
  return parsePolicy(result.rows[0]);
}

export async function getBoundPayrollPolicy(
  queryable: Queryable,
  tenantId: string,
  policyVersionId: string,
): Promise<BoundPayrollPolicy> {
  const result = await queryable.query<PolicyRow>(
    `select id, version_tag, rules_payload
       from governance.policy_versions
      where tenant_id = $1
        and id = $2
        and domain = 'PAYROLL_TAX_POLICY'
      limit 1`,
    [tenantId, policyVersionId],
  );
  return parsePolicy(result.rows[0]);
}
