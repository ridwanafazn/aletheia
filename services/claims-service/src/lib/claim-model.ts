import type {
  ClaimDetail,
  ClaimStatus,
  ClaimSummary,
  ClaimCategory,
  AnomalyFlag,
} from "@aletheia/shared-contracts";
import type { PoolClient } from "pg";

import type { Queryable } from "./policy.js";

export interface ClaimRow {
  id: string;
  tenant_id: string;
  claim_number: string;
  branch_id: string;
  policy_version_id: string;
  policy_version_tag: string;
  claimant_name: string;
  claimant_nik_hash: string;
  claimant_nik_masked: string;
  bank_account_hash: string;
  bank_account_masked: string;
  claim_category: ClaimCategory;
  requested_amount: string;
  approved_amount: string | null;
  risk_score: number;
  risk_evaluated_at: Date | null;
  has_conflict_flag: boolean;
  status: ClaimStatus;
  compliance_reviewed_by: string | null;
  compliance_reviewed_at: Date | null;
  created_by: string;
  idempotency_key: string;
  submitted_at: Date | null;
  finalized_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClaimDocumentRow {
  id: string;
  document_type: string;
  secure_url: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_at: Date;
}

export interface AnomalyRow {
  id: string;
  conflict_type: string;
  severity: string;
  matched_personnel_code: string | null;
  matched_personnel_name: string | null;
  matched_personnel_type: string | null;
  matched_claim_number: string | null;
  evidence_summary: Record<string, unknown>;
  resolution_status: string;
  detected_at: Date;
}

export interface AuditHistoryRow {
  id: string;
  actor_name: string | null;
  actor_role: string;
  action: string;
  policy_version_tag: string | null;
  decision_context: Record<string, unknown>;
  record_hash: string;
  recorded_at: Date;
}

export const CLAIM_SELECT_COLUMNS = `
  s.id, s.tenant_id, s.claim_number, s.branch_id, s.policy_version_id,
  p.version_tag as policy_version_tag, s.claimant_name, s.claimant_nik_hash,
  s.claimant_nik_masked, s.bank_account_hash, s.bank_account_masked,
  s.claim_category, s.requested_amount, s.approved_amount,
  s.risk_score, s.risk_evaluated_at, s.has_conflict_flag, s.status,
  s.compliance_reviewed_by, s.compliance_reviewed_at, s.created_by,
  s.idempotency_key, s.submitted_at, s.finalized_at, s.created_at, s.updated_at`;

export function toClaimSummary(row: ClaimRow): ClaimSummary {
  return {
    id: row.id,
    claim_number: row.claim_number,
    branch_id: row.branch_id,
    claimant_name: row.claimant_name,
    claimant_nik_masked: row.claimant_nik_masked,
    bank_account_masked: row.bank_account_masked,
    claim_category: row.claim_category,
    requested_amount: row.requested_amount,
    approved_amount: row.approved_amount,
    risk_score: row.risk_score,
    risk_evaluated_at: row.risk_evaluated_at?.toISOString() ?? null,
    has_conflict_flag: row.has_conflict_flag,
    status: row.status,
    policy_version_id: row.policy_version_id,
    policy_version_tag: row.policy_version_tag,
    created_by: row.created_by,
    submitted_at: row.submitted_at?.toISOString() ?? null,
    finalized_at: row.finalized_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export function toAnomalyFlag(row: AnomalyRow): AnomalyFlag {
  return {
    id: row.id,
    conflict_type: row.conflict_type as AnomalyFlag["conflict_type"],
    severity: row.severity as AnomalyFlag["severity"],
    matched_personnel_code: row.matched_personnel_code,
    matched_personnel_name: row.matched_personnel_name,
    matched_personnel_type: row.matched_personnel_type,
    matched_claim_number: row.matched_claim_number,
    evidence_summary: row.evidence_summary,
    resolution_status: row.resolution_status as AnomalyFlag["resolution_status"],
    detected_at: row.detected_at.toISOString(),
  };
}

export async function getClaimDetail(
  client: PoolClient,
  tenantId: string,
  claimId: string,
  branchId?: string,
): Promise<ClaimDetail | null> {
  const scopeClause = branchId === undefined ? "" : "and s.branch_id = $3";
  const values = branchId === undefined ? [tenantId, claimId] : [tenantId, claimId, branchId];
  const claims = await client.query<ClaimRow>(
    `select ${CLAIM_SELECT_COLUMNS}
       from claims.submissions s
       join governance.policy_versions p
         on p.id = s.policy_version_id
        and p.tenant_id = s.tenant_id
      where s.tenant_id = $1
        and s.id = $2
        ${scopeClause}
      limit 1`,
    values,
  );

  const row = claims.rows[0];
  if (row === undefined) {
    return null;
  }

  const documents = await client.query<ClaimDocumentRow>(
    `select id, document_type, secure_url, mime_type, file_size_bytes, uploaded_at
       from claims.documents
      where tenant_id = $1
        and claim_id = $2
      order by uploaded_at asc, id asc`,
    [tenantId, claimId],
  );

  const anomalies = await client.query<AnomalyRow>(
    `select f.id, f.conflict_type, f.severity,
            p.personnel_code as matched_personnel_code,
            p.full_name as matched_personnel_name,
            p.personnel_type as matched_personnel_type,
            s2.claim_number as matched_claim_number,
            f.evidence_summary, f.resolution_status, f.detected_at
       from analytics.anomaly_flags f
       left join payroll.personnel p
         on p.id = f.matched_personnel_id
        and p.tenant_id = f.tenant_id
       left join claims.submissions s2
         on s2.id = f.matched_claim_id
        and s2.tenant_id = f.tenant_id
      where f.tenant_id = $1
        and f.claim_id = $2
      order by f.detected_at asc, f.id asc`,
    [tenantId, claimId],
  );

  const audit = await client.query<AuditHistoryRow>(
    `select a.id::text as id,
            u.full_name as actor_name,
            a.actor_role,
            a.action,
            p.version_tag as policy_version_tag,
            a.decision_context,
            a.record_hash,
            a.recorded_at
       from governance.audit_logs a
       left join governance.users u
         on u.id = a.actor_id
        and u.tenant_id = a.tenant_id
       left join governance.policy_versions p
         on p.id = a.policy_version_id
        and p.tenant_id = a.tenant_id
      where a.tenant_id = $1
        and a.entity_id = $2
        and a.domain = 'CLAIMS'
      order by a.id asc`,
    [tenantId, claimId],
  );

  const policy = await client.query<{ rules_payload: Record<string, unknown> }>(
    `select rules_payload
       from governance.policy_versions
      where tenant_id = $1
        and id = $2
      limit 1`,
    [tenantId, row.policy_version_id],
  );

  return {
    ...toClaimSummary(row),
    documents: documents.rows.map((document) => ({
      id: document.id,
      document_type: document.document_type as ClaimDetail["documents"][number]["document_type"],
      secure_url: document.secure_url,
      mime_type: document.mime_type,
      file_size_bytes: document.file_size_bytes,
      uploaded_at: document.uploaded_at.toISOString(),
    })),
    anomaly_flags: anomalies.rows.map(toAnomalyFlag),
    audit_history: audit.rows.map((entry) => ({
      id: entry.id,
      actor_name: entry.actor_name ?? "Sistem",
      actor_role: entry.actor_role as ClaimDetail["audit_history"][number]["actor_role"],
      action: entry.action,
      policy_version_tag: entry.policy_version_tag,
      decision_context: entry.decision_context,
      record_hash: entry.record_hash,
      recorded_at: entry.recorded_at.toISOString(),
    })),
    bound_policy_rules: policy.rows[0]?.rules_payload ?? {},
    compliance_reviewed_by: row.compliance_reviewed_by,
    compliance_reviewed_at: row.compliance_reviewed_at?.toISOString() ?? null,
  };
}

export async function findClaimById(
  queryable: Queryable,
  tenantId: string,
  claimId: string,
): Promise<ClaimRow | null> {
  const result = await queryable.query<ClaimRow>(
    `select ${CLAIM_SELECT_COLUMNS}
       from claims.submissions s
       join governance.policy_versions p
         on p.id = s.policy_version_id
        and p.tenant_id = s.tenant_id
      where s.tenant_id = $1
        and s.id = $2
      limit 1`,
    [tenantId, claimId],
  );
  return result.rows[0] ?? null;
}
