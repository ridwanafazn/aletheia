import type { QueryResult, QueryResultRow } from "pg";

import { ClaimsPolicySchema, type ClaimsPolicy } from "@aletheia/shared-contracts";

import { ApiError } from "./errors.js";

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export interface BoundClaimsPolicy {
  id: string;
  versionTag: string;
  rules: ClaimsPolicy;
}

interface PolicyRow {
  id: string;
  version_tag: string;
  rules_payload: Record<string, unknown>;
}

function parsePolicy(row: PolicyRow | undefined): BoundClaimsPolicy {
  if (row === undefined) {
    throw ApiError.policyViolation("Kebijakan klaim tidak ditemukan");
  }

  const parsed = ClaimsPolicySchema.safeParse(row.rules_payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location =
      issue === undefined || issue.path.length === 0
        ? "rules_payload"
        : `rules_payload.${issue.path.join(".")}`;
    throw ApiError.policyViolation(
      `Kebijakan klaim tidak lengkap atau tidak valid pada ${location}`,
    );
  }

  return { id: row.id, versionTag: row.version_tag, rules: parsed.data };
}

export async function getActiveClaimsPolicy(
  queryable: Queryable,
  tenantId: string,
): Promise<BoundClaimsPolicy> {
  const result = await queryable.query<PolicyRow>(
    `select id, version_tag, rules_payload
       from governance.policy_versions
      where tenant_id = $1
        and domain = 'CLAIMS_POLICY'
        and status = 'ACTIVE'
      limit 1`,
    [tenantId],
  );
  return parsePolicy(result.rows[0]);
}

export async function getBoundClaimsPolicy(
  queryable: Queryable,
  tenantId: string,
  policyVersionId: string,
): Promise<BoundClaimsPolicy> {
  const result = await queryable.query<PolicyRow>(
    `select id, version_tag, rules_payload
       from governance.policy_versions
      where tenant_id = $1
        and id = $2
        and domain = 'CLAIMS_POLICY'
      limit 1`,
    [tenantId, policyVersionId],
  );
  return parsePolicy(result.rows[0]);
}
