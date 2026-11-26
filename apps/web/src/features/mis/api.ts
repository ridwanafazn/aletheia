import { PayrollPolicyVersionSchema } from "@aletheia/shared-contracts";

import { apiRequest, graphqlRequest } from "../../shared/api/client";

export interface BranchKpi {
  branchId: string;
  branchCode: string;
  branchName: string;
  reportMonth: string;
  totalClaimsSubmitted: number;
  totalClaimsApprovedAmount: string;
  claimApprovalRatePct: number;
  avgTurnaroundHours: number;
  totalPayrollDisbursed: string;
  totalPph21Collected: string;
  budgetUtilizationPct: number;
  momVariancePct: number;
}

export interface WhatIfSimulation {
  id: string;
  simulationName: string;
  basePolicyVersionTag: string;
  actualTotalCost: string;
  simulatedTotalCost: string;
  varianceAmount: string;
  variancePercentage: number;
  impactBreakdown: Record<string, unknown>;
  createdAt: string;
}

export interface WhatIfRunResult {
  eventId: string;
  status: string;
  enqueued: boolean;
  requestedAt: string;
}

const KPI_FIELDS = `
  branchId
  branchCode
  branchName
  reportMonth
  totalClaimsSubmitted
  totalClaimsApprovedAmount
  claimApprovalRatePct
  avgTurnaroundHours
  totalPayrollDisbursed
  totalPph21Collected
  budgetUtilizationPct
  momVariancePct
`;

export async function fetchMisDashboard(input: {
  reportMonth: string;
  branchId?: string | undefined;
  months: number;
}): Promise<{ summary: BranchKpi[]; trend: BranchKpi[] }> {
  const data = await graphqlRequest<{
    misExecutiveSummary: BranchKpi[];
    misTrend: BranchKpi[];
  }>(
    `query MisDashboard($reportMonth: String!, $branchId: ID, $months: Int!) {
      misExecutiveSummary(reportMonth: $reportMonth, branchId: $branchId) { ${KPI_FIELDS} }
      misTrend(reportMonth: $reportMonth, branchId: $branchId, months: $months) { ${KPI_FIELDS} }
    }`,
    {
      reportMonth: input.reportMonth,
      branchId: input.branchId,
      months: input.months,
    },
  );
  return { summary: data.misExecutiveSummary, trend: data.misTrend };
}

export async function fetchWhatIfSimulations(limit = 10): Promise<WhatIfSimulation[]> {
  const data = await graphqlRequest<{ whatIfSimulations: WhatIfSimulation[] }>(
    `query WhatIfList($limit: Int!) {
      whatIfSimulations(limit: $limit) {
        id
        simulationName
        basePolicyVersionTag
        actualTotalCost
        simulatedTotalCost
        varianceAmount
        variancePercentage
        impactBreakdown
        createdAt
      }
    }`,
    { limit },
  );
  return data.whatIfSimulations;
}

export async function runWhatIf(input: {
  simulationName: string;
  basePolicyVersionId: string;
  simulatedRulesPayload: Record<string, unknown>;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  branchId?: string;
}): Promise<WhatIfRunResult> {
  const data = await graphqlRequest<{ runWhatIfSimulation: WhatIfRunResult }>(
    `mutation RunWhatIf($input: WhatIfSimulationInput!) {
      runWhatIfSimulation(input: $input) {
        eventId
        status
        enqueued
        requestedAt
      }
    }`,
    { input },
  );
  return data.runWhatIfSimulation;
}

export function getActivePayrollPolicy() {
  return apiRequest("/api/v1/policies/active/PAYROLL_TAX_POLICY", {
    schema: PayrollPolicyVersionSchema,
  });
}
