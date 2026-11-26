import { signedHeaders } from "../lib/proxy.js";
import type { EdgeConfig } from "../config.js";
import type { SessionIdentity } from "../lib/jwt.js";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
}

interface KpiRow {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  report_month: string;
  total_claims_submitted: number;
  total_claims_approved_amount: string;
  claim_approval_rate_pct: string;
  avg_turnaround_hours: string;
  total_payroll_disbursed: string;
  total_pph21_collected: string;
  budget_utilization_pct: string;
  mom_variance_pct: string;
}

interface WhatIfRow {
  id: string;
  simulation_name: string;
  base_policy_version_tag: string | null;
  actual_total_cost: string;
  simulated_total_cost: string;
  variance_amount: string;
  variance_percentage: string;
  impact_breakdown: Record<string, unknown>;
  created_at: string;
}

interface ClaimDetailRow {
  id: string;
  claim_number: string;
  claimant_name: string;
  claimant_nik_masked: string;
  bank_account_masked: string;
  claim_category: string;
  requested_amount: string;
  approved_amount: string | null;
  risk_score: number;
  status: string;
  policy_version_tag: string;
  bound_policy_rules: Record<string, unknown>;
  documents: Array<{
    id: string;
    document_type: string;
    secure_url: string;
    uploaded_at: string;
  }>;
  anomaly_flags: Array<{
    id: string;
    conflict_type: string;
    severity: string;
    matched_personnel_code: string | null;
    matched_personnel_name: string | null;
    matched_personnel_type: string | null;
    matched_claim_number: string | null;
    evidence_summary: Record<string, unknown>;
    resolution_status: string;
    detected_at: string;
  }>;
  audit_history: Array<{
    id: string;
    actor_name: string;
    actor_role: string;
    action: string;
    policy_version_tag: string | null;
    decision_context: Record<string, unknown>;
    record_hash: string;
    recorded_at: string;
  }>;
}

export class BffClient {
  private readonly config: EdgeConfig;
  private readonly identity: SessionIdentity;
  private readonly correlationId: string;
  private readonly traceparent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, Promise<unknown>>();
  public upstreamCalls = 0;

  public constructor(input: {
    config: EdgeConfig;
    identity: SessionIdentity;
    correlationId: string;
    traceparent: string;
    fetchImpl?: typeof fetch;
  }) {
    this.config = input.config;
    this.identity = input.identity;
    this.correlationId = input.correlationId;
    this.traceparent = input.traceparent;
    this.fetchImpl = input.fetchImpl ?? ((request, init) => fetch(request, init));
  }

  private async get<T>(base: string, path: string): Promise<T> {
    const url = new URL(path, base);
    const headers = await signedHeaders({
      method: "GET",
      path: url.pathname,
      body: new Uint8Array(),
      identity: this.identity,
      secret: this.config.internalGatewaySecret,
      correlationId: this.correlationId,
      traceparent: this.traceparent,
    });

    this.upstreamCalls += 1;
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !envelope.success) {
      throw new Error(envelope.error?.message ?? "Permintaan internal gagal");
    }
    return envelope.data;
  }

  private async post<T>(base: string, path: string, body: unknown): Promise<T> {
    const url = new URL(path, base);
    const bodyText = JSON.stringify(body);
    const bodyBytes = new TextEncoder().encode(bodyText);
    const headers = await signedHeaders({
      method: "POST",
      path: url.pathname,
      body: bodyBytes,
      identity: this.identity,
      secret: this.config.internalGatewaySecret,
      correlationId: this.correlationId,
      traceparent: this.traceparent,
    });
    headers.set("content-type", "application/json");
    this.upstreamCalls += 1;
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers,
      body: bodyText,
      signal: AbortSignal.timeout(8_000),
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !envelope.success) {
      throw new Error(envelope.error?.message ?? "Permintaan internal gagal");
    }
    return envelope.data;
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    const promise = load();
    this.cache.set(key, promise);
    return promise;
  }

  public misSummary(reportMonth: string, branchId?: string) {
    const query = new URLSearchParams({ report_month: reportMonth });
    if (branchId !== undefined) {
      query.set("branch_id", branchId);
    }
    return this.cached(`mis:${query.toString()}`, async () => {
      const data = await this.get<{ items: KpiRow[] }>(
        this.config.governanceUrl,
        `/internal/v1/analytics/mis-summary?${query.toString()}`,
      );
      return data.items.map((row) => ({
        branchId: row.branch_id,
        branchCode: row.branch_code,
        branchName: row.branch_name,
        reportMonth: row.report_month,
        totalClaimsSubmitted: row.total_claims_submitted,
        totalClaimsApprovedAmount: row.total_claims_approved_amount,
        claimApprovalRatePct: Number(row.claim_approval_rate_pct),
        avgTurnaroundHours: Number(row.avg_turnaround_hours),
        totalPayrollDisbursed: row.total_payroll_disbursed,
        totalPph21Collected: row.total_pph21_collected,
        budgetUtilizationPct: Number(row.budget_utilization_pct),
        momVariancePct: Number(row.mom_variance_pct),
      }));
    });
  }

  public misTrend(reportMonth: string, branchId: string | undefined, months: number) {
    const query = new URLSearchParams({ report_month: reportMonth, months: String(months) });
    if (branchId !== undefined) {
      query.set("branch_id", branchId);
    }
    return this.cached(`trend:${query.toString()}`, async () => {
      const data = await this.get<{ items: KpiRow[] }>(
        this.config.governanceUrl,
        `/internal/v1/analytics/mis-trend?${query.toString()}`,
      );
      return data.items.map((row) => ({
        branchId: row.branch_id,
        branchCode: row.branch_code,
        branchName: row.branch_name,
        reportMonth: row.report_month,
        totalClaimsSubmitted: row.total_claims_submitted,
        totalClaimsApprovedAmount: row.total_claims_approved_amount,
        claimApprovalRatePct: Number(row.claim_approval_rate_pct),
        avgTurnaroundHours: Number(row.avg_turnaround_hours),
        totalPayrollDisbursed: row.total_payroll_disbursed,
        totalPph21Collected: row.total_pph21_collected,
        budgetUtilizationPct: Number(row.budget_utilization_pct),
        momVariancePct: Number(row.mom_variance_pct),
      }));
    });
  }

  public async runWhatIf(input: {
    simulationName: string;
    basePolicyVersionId: string;
    simulatedRulesPayload: Record<string, unknown>;
    targetPeriodStart: string;
    targetPeriodEnd: string;
    branchId?: string;
  }) {
    const data = await this.post<{
      event_id: string;
      status: string;
      enqueued: boolean;
      requested_at: string;
    }>(this.config.governanceUrl, "/internal/v1/analytics/what-if", {
      simulation_name: input.simulationName,
      base_policy_version_id: input.basePolicyVersionId,
      simulated_rules_payload: input.simulatedRulesPayload,
      target_period_start: input.targetPeriodStart,
      target_period_end: input.targetPeriodEnd,
      ...(input.branchId === undefined ? {} : { branch_id: input.branchId }),
    });
    return {
      eventId: data.event_id,
      status: data.status,
      enqueued: data.enqueued,
      requestedAt: data.requested_at,
    };
  }

  public whatIf(limit: number) {
    return this.cached(`whatif:${limit}`, async () => {
      const data = await this.get<{ items: WhatIfRow[] }>(
        this.config.governanceUrl,
        `/internal/v1/analytics/what-if?limit=${limit}`,
      );
      return data.items.map((row) => ({
        id: row.id,
        simulationName: row.simulation_name,
        basePolicyVersionTag: row.base_policy_version_tag ?? "TIDAK_DIKETAHUI",
        actualTotalCost: row.actual_total_cost,
        simulatedTotalCost: row.simulated_total_cost,
        varianceAmount: row.variance_amount,
        variancePercentage: Number(row.variance_percentage),
        impactBreakdown: row.impact_breakdown,
        createdAt: row.created_at,
      }));
    });
  }

  public claimDetail(claimId: string) {
    return this.cached(`claim:${claimId}`, async () => {
      const row = await this.get<ClaimDetailRow>(
        this.config.claimsUrl,
        `/api/v1/claims/${claimId}`,
      );
      return {
        id: row.id,
        claimNumber: row.claim_number,
        claimantName: row.claimant_name,
        claimantNikMasked: row.claimant_nik_masked,
        bankAccountMasked: row.bank_account_masked,
        claimCategory: row.claim_category,
        requestedAmount: row.requested_amount,
        approvedAmount: row.approved_amount,
        riskScore: row.risk_score,
        status: row.status,
        boundPolicyVersionTag: row.policy_version_tag,
        boundPolicyRules: row.bound_policy_rules,
        documents: row.documents.map((document) => ({
          id: document.id,
          documentType: document.document_type,
          secureUrl: document.secure_url,
          uploadedAt: document.uploaded_at,
        })),
        anomalyFlags: row.anomaly_flags.map((flag) => ({
          id: flag.id,
          conflictType: flag.conflict_type,
          severity: flag.severity,
          matchedPersonnelCode: flag.matched_personnel_code,
          matchedPersonnelName: flag.matched_personnel_name,
          matchedPersonnelType: flag.matched_personnel_type,
          matchedClaimNumber: flag.matched_claim_number,
          evidenceSummary: flag.evidence_summary,
          resolutionStatus: flag.resolution_status,
          detectedAt: flag.detected_at,
        })),
        auditHistory: row.audit_history.map((entry) => ({
          id: entry.id,
          actorName: entry.actor_name,
          actorRole: entry.actor_role,
          action: entry.action,
          policyVersionTag: entry.policy_version_tag,
          decisionContext: entry.decision_context,
          recordHash: entry.record_hash,
          recordedAt: entry.recorded_at,
        })),
      };
    });
  }
}
