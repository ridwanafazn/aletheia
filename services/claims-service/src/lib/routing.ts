import type { ClaimsPolicy } from "@aletheia/shared-contracts";

import { compareMoney } from "./money.js";

export type ClaimRoute = { kind: "LEVEL_1" } | { kind: "LEVEL_2" } | { kind: "LIMIT_EXCEEDED" };

export function routeClaim(input: {
  requestedAmount: string;
  riskScore: number;
  hasConflictFlag: boolean;
  rules: ClaimsPolicy;
}): ClaimRoute {
  const { approval_tiers: tiers } = input.rules;

  if (compareMoney(input.requestedAmount, tiers.level_2_finance_manager_max) > 0) {
    return { kind: "LIMIT_EXCEEDED" };
  }

  const level1Eligible =
    compareMoney(input.requestedAmount, tiers.level_1_branch_manager_max) <= 0 &&
    input.riskScore < tiers.auto_escalate_risk_threshold &&
    !input.hasConflictFlag;

  return level1Eligible ? { kind: "LEVEL_1" } : { kind: "LEVEL_2" };
}
