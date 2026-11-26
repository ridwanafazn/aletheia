import { randomUUID } from "node:crypto";

import type { ClaimsPolicy } from "@aletheia/shared-contracts";
import type { PoolClient } from "pg";

import { appendAudit } from "./audit.js";
import type { ClaimRow } from "./claim-model.js";
import { ApiError } from "./errors.js";
import { routeClaim } from "./routing.js";

interface PersonnelMatchRow {
  id: string;
  personnel_code: string;
  full_name: string;
  personnel_type: string;
  bank_match: boolean;
  nik_match: boolean;
}

export interface RiskEvaluationResult {
  riskScore: number;
  hasConflictFlag: boolean;
  status: "UNDER_REVIEW" | "ESCALATED" | "COMPLIANCE_REVIEW";
  flags: number;
}

export async function evaluateClaimRisk(
  client: PoolClient,
  claim: ClaimRow,
  rules: ClaimsPolicy,
  correlationId: string,
): Promise<RiskEvaluationResult> {
  const weights = rules.risk_scoring_weights;
  let score = 0;
  let criticalFlags = 0;
  let flagCount = 0;

  await client.query(`delete from analytics.anomaly_flags where tenant_id = $1 and claim_id = $2`, [
    claim.tenant_id,
    claim.id,
  ]);

  const level1Max = Number(rules.approval_tiers.level_1_branch_manager_max);
  const amountRatio =
    level1Max === 0 ? Number.POSITIVE_INFINITY : Number(claim.requested_amount) / level1Max;
  if (amountRatio >= weights.high_amount_ratio_threshold) {
    score += weights.high_amount_ratio_points;
  }

  const repeat = await client.query<{ count: string }>(
    `select count(*)::text as count
       from claims.submissions
      where tenant_id = $1
        and bank_account_hash = $2
        and id <> $3
        and status <> 'DRAFT'
        and created_at >= now() - interval '30 days'`,
    [claim.tenant_id, claim.bank_account_hash, claim.id],
  );
  const otherClaims = Number(repeat.rows[0]?.count ?? "0");
  if (otherClaims >= 2) {
    score += weights.repeat_bank_account_30d_points;
  }

  const personnel = await client.query<PersonnelMatchRow>(
    `select id, personnel_code, full_name, personnel_type,
            (bank_account_hash = $2) as bank_match,
            (personnel_type = 'SALES_AGENT' and nik_hash = $3) as nik_match
       from payroll.personnel
      where tenant_id = $1
        and employment_status <> 'INACTIVE'
        and (bank_account_hash = $2 or (personnel_type = 'SALES_AGENT' and nik_hash = $3))`,
    [claim.tenant_id, claim.bank_account_hash, claim.claimant_nik_hash],
  );

  for (const match of personnel.rows) {
    if (match.bank_match) {
      await client.query(
        `insert into analytics.anomaly_flags
          (id, tenant_id, claim_id, matched_personnel_id, conflict_type, severity,
           evidence_summary, resolution_status)
         values ($1,$2,$3,$4,'SHARED_BANK_ACCOUNT','CRITICAL',$5,'OPEN')`,
        [
          randomUUID(),
          claim.tenant_id,
          claim.id,
          match.id,
          {
            matched_field: "bank_account_hash",
            matched_personnel_code: match.personnel_code,
            matched_personnel_type: match.personnel_type,
            policy_version_tag: claim.policy_version_tag,
          },
        ],
      );
      criticalFlags += 1;
      flagCount += 1;
    }

    if (match.nik_match) {
      await client.query(
        `insert into analytics.anomaly_flags
          (id, tenant_id, claim_id, matched_personnel_id, conflict_type, severity,
           evidence_summary, resolution_status)
         values ($1,$2,$3,$4,'SHARED_NIK_IDENTITY','CRITICAL',$5,'OPEN')`,
        [
          randomUUID(),
          claim.tenant_id,
          claim.id,
          match.id,
          {
            matched_field: "claimant_nik_hash",
            matched_personnel_code: match.personnel_code,
            matched_personnel_type: match.personnel_type,
            policy_version_tag: claim.policy_version_tag,
          },
        ],
      );
      criticalFlags += 1;
      flagCount += 1;
    }
  }

  if (personnel.rows.length > 0) {
    score += weights.cross_domain_conflict_points;
  }

  const multi = await client.query<{ count: string; latest_claim_id: string | null }>(
    `select count(*)::text as count,
            (array_agg(id order by created_at desc))[1] as latest_claim_id
       from claims.submissions
      where tenant_id = $1
        and bank_account_hash = $2
        and id <> $3
        and status <> 'DRAFT'
        and created_at >= now() - interval '30 days'`,
    [claim.tenant_id, claim.bank_account_hash, claim.id],
  );
  const totalSameAccount = Number(multi.rows[0]?.count ?? "0") + 1;
  const latestClaimId = multi.rows[0]?.latest_claim_id ?? null;
  if (totalSameAccount >= 3 && latestClaimId !== null) {
    await client.query(
      `insert into analytics.anomaly_flags
        (id, tenant_id, claim_id, matched_claim_id, conflict_type, severity,
         evidence_summary, resolution_status)
       values ($1,$2,$3,$4,'MULTI_CLAIM_SAME_ACCOUNT','HIGH',$5,'OPEN')`,
      [
        randomUUID(),
        claim.tenant_id,
        claim.id,
        latestClaimId,
        {
          claims_in_30_days: totalSameAccount,
          matched_field: "bank_account_hash",
          policy_version_tag: claim.policy_version_tag,
        },
      ],
    );
    flagCount += 1;
  }

  const documents = await client.query<{ document_type: string }>(
    `select document_type from claims.documents where tenant_id = $1 and claim_id = $2`,
    [claim.tenant_id, claim.id],
  );
  const presentDocuments = new Set(documents.rows.map((row) => row.document_type));
  const optionalDocuments = rules.optional_documents_by_category[claim.claim_category] ?? [];
  const missingOptional = optionalDocuments.filter((type) => !presentDocuments.has(type));
  if (missingOptional.length > 0) {
    score += weights.missing_optional_evidence_points;
  }

  const riskScore = Math.min(100, score);
  const route = routeClaim({
    requestedAmount: claim.requested_amount,
    riskScore,
    hasConflictFlag: criticalFlags > 0 || flagCount > 0,
    rules,
  });

  if (route.kind === "LIMIT_EXCEEDED") {
    throw ApiError.policyViolation("Nominal klaim melebihi pagu kebijakan");
  }

  const status =
    criticalFlags > 0
      ? "COMPLIANCE_REVIEW"
      : route.kind === "LEVEL_2"
        ? "ESCALATED"
        : "UNDER_REVIEW";
  const hasConflictFlag = flagCount > 0;

  await client.query(
    `update claims.submissions
        set risk_score = $3,
            risk_evaluated_at = now(),
            has_conflict_flag = $4,
            status = $5,
            updated_at = now()
      where tenant_id = $1
        and id = $2`,
    [claim.tenant_id, claim.id, riskScore, hasConflictFlag, status],
  );

  await appendAudit(
    {
      tenantId: claim.tenant_id,
      actorId: claim.created_by,
      actorRole: "CLAIMS_OFFICER",
      domain: "CLAIMS",
      entityType: "CLAIM",
      entityId: claim.id,
      action: "CLAIM_RISK_EVALUATED",
      policyVersionId: claim.policy_version_id,
      decisionContext: {
        risk_score: riskScore,
        route: route.kind,
        anomaly_flags: flagCount,
        missing_optional_documents: missingOptional,
      },
      correlationId,
    },
    client,
  );

  return { riskScore, hasConflictFlag, status, flags: flagCount };
}
