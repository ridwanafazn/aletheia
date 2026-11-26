import { z } from "zod";

import {
  TenantFeatureSchema,
  TenantPlanSchema,
  type TenantFeature,
  type TenantPlan,
} from "./enums.js";

export const TENANT_PLAN_FEATURES = {
  BASIC: ["PAYROLL_CORE", "EMPLOYEE_SELF_SERVICE"],
  HRIS_PLUS: ["PAYROLL_CORE", "EMPLOYEE_SELF_SERVICE", "REIMBURSEMENT", "ORGANIZATION"],
  HRIS_PRO: [
    "PAYROLL_CORE",
    "EMPLOYEE_SELF_SERVICE",
    "REIMBURSEMENT",
    "ORGANIZATION",
    "PAYROLL_COST_INVOICE",
  ],
  ENTERPRISE: [
    "PAYROLL_CORE",
    "EMPLOYEE_SELF_SERVICE",
    "REIMBURSEMENT",
    "ORGANIZATION",
    "PAYROLL_COST_INVOICE",
  ],
} as const satisfies Record<TenantPlan, readonly TenantFeature[]>;

export function tenantPlanFeatures(plan: TenantPlan): readonly TenantFeature[] {
  return TENANT_PLAN_FEATURES[plan];
}

export function tenantPlanHasFeature(plan: TenantPlan, feature: TenantFeature): boolean {
  return (TENANT_PLAN_FEATURES[plan] as readonly TenantFeature[]).includes(feature);
}

export const TenantProfileSchema = z
  .object({
    code: z.string().min(1).max(24),
    name: z.string().min(1).max(120),
    plan: TenantPlanSchema,
    features: z.array(TenantFeatureSchema),
  })
  .strict();
export type TenantProfile = z.infer<typeof TenantProfileSchema>;
