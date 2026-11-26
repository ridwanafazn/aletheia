import { z } from "zod";

import {
  ClaimCategorySchema,
  CommissionModeSchema,
  DocumentTypeSchema,
  PolicyDomainSchema,
  PolicyStatusSchema,
  PtkpStatusSchema,
  RiskClassSchema,
  TerCategorySchema,
  WageComponentSchema,
} from "./enums.js";
import {
  DateOnlySchema,
  IsoDateTimeSchema,
  MoneySchema,
  RateSchema,
  UuidSchema,
} from "./primitives.js";

const DecimalRateSchema = RateSchema.refine((value) => Number(value) >= 0 && Number(value) <= 1, {
  message: "Rate harus berada di antara 0 dan 1",
});

const ALL_PTKP = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;

const ALL_CATEGORIES = ["HEALTH", "ACCIDENT", "PROPERTY", "GUARANTEE"] as const;
const ALL_RISK_CLASSES = ["I", "II", "III", "IV", "V"] as const;

const DocumentRequirementSchema = z.record(ClaimCategorySchema, z.array(DocumentTypeSchema));
const OptionalDocumentRequirementSchema = z.record(
  ClaimCategorySchema,
  z.array(DocumentTypeSchema),
);

const ApprovalTiersSchema = z
  .object({
    level_1_branch_manager_max: MoneySchema,
    level_2_finance_manager_max: MoneySchema,
    auto_escalate_risk_threshold: z.number().int().min(0).max(100),
    force_escalate_on_conflict: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      Number(value.level_1_branch_manager_max) <= Number(value.level_2_finance_manager_max),
    {
      message: "level_1_branch_manager_max tidak boleh melebihi level_2_finance_manager_max",
      path: ["level_1_branch_manager_max"],
    },
  );

const RiskScoringWeightsSchema = z
  .object({
    missing_optional_evidence_points: z.number().int().min(0).max(100),
    high_amount_ratio_threshold: z.number().min(0).max(1),
    high_amount_ratio_points: z.number().int().min(0).max(100),
    repeat_bank_account_30d_points: z.number().int().min(0).max(100),
    cross_domain_conflict_points: z.number().int().min(0).max(100),
  })
  .strict();

function hasAllCategories(value: Record<string, unknown>): boolean {
  return ALL_CATEGORIES.every((category) => category in value);
}

export const ClaimsPolicySchema = z
  .object({
    approval_tiers: ApprovalTiersSchema,
    required_documents_by_category: DocumentRequirementSchema,
    optional_documents_by_category: OptionalDocumentRequirementSchema,
    risk_scoring_weights: RiskScoringWeightsSchema,
    sla_target_hours: z.number().int().positive().max(720),
  })
  .strict()
  .refine((value) => hasAllCategories(value.required_documents_by_category), {
    message:
      "required_documents_by_category harus memuat HEALTH, ACCIDENT, PROPERTY, dan GUARANTEE",
    path: ["required_documents_by_category"],
  })
  .refine((value) => hasAllCategories(value.optional_documents_by_category), {
    message:
      "optional_documents_by_category harus memuat HEALTH, ACCIDENT, PROPERTY, dan GUARANTEE",
    path: ["optional_documents_by_category"],
  });
export type ClaimsPolicy = z.infer<typeof ClaimsPolicySchema>;

const BpjsParametersSchema = z
  .object({
    kesehatan_employee_rate: DecimalRateSchema,
    kesehatan_salary_cap: MoneySchema,
    jht_employee_rate: DecimalRateSchema,
    jht_salary_cap: MoneySchema.nullable(),
    jp_employee_rate: DecimalRateSchema,
    jp_salary_cap: MoneySchema,
    bpjs_wage_base_components: z.array(WageComponentSchema).min(1),
    agent_bpjs_applicable: z.boolean(),
  })
  .strict();

const BpjsEmployerRatesSchema = z
  .object({
    kesehatan_employer_rate: DecimalRateSchema,
    jht_employer_rate: DecimalRateSchema,
    jp_employer_rate: DecimalRateSchema,
    jkk_rate_by_risk_class: z.record(RiskClassSchema, DecimalRateSchema),
    jkm_rate: DecimalRateSchema,
  })
  .strict()
  .refine(
    (value) => ALL_RISK_CLASSES.every((riskClass) => riskClass in value.jkk_rate_by_risk_class),
    {
      message: "jkk_rate_by_risk_class harus memuat kelas I sampai V",
      path: ["jkk_rate_by_risk_class"],
    },
  );

const TerBracketSchema = z
  .object({
    max_gross: MoneySchema,
    rate: DecimalRateSchema,
  })
  .strict();

function isSortedBracketList(brackets: Array<z.infer<typeof TerBracketSchema>>): boolean {
  return brackets.every(
    (bracket, index) =>
      index === 0 || Number(bracket.max_gross) > Number(brackets[index - 1]?.max_gross ?? -1),
  );
}

const AnnualBracketSchema = z
  .object({
    max_pkp: MoneySchema,
    rate: DecimalRateSchema,
  })
  .strict();

function isSortedAnnualBracketList(brackets: Array<z.infer<typeof AnnualBracketSchema>>): boolean {
  return brackets.every(
    (bracket, index) =>
      index === 0 || Number(bracket.max_pkp) > Number(brackets[index - 1]?.max_pkp ?? -1),
  );
}

const TerBracketsSchema = z
  .record(TerCategorySchema, z.array(TerBracketSchema).min(1))
  .refine((value) => Object.values(value).every(isSortedBracketList), {
    message:
      "Setiap kategori TER harus memiliki max_gross yang naik dan bracket terakhir tak terhingga",
  })
  .refine(
    (value) =>
      Object.values(value).every((brackets) => {
        const last = brackets.at(-1);
        return last !== undefined && Number(last.max_gross) >= 100_000_000_000;
      }),
    {
      message: "Bracket TER terakhir harus mencakup 100 miliar",
    },
  )
  .refine(
    (value) =>
      Object.values(value).every((brackets) => {
        const last = brackets.at(-1);
        return last !== undefined && Number(last.rate) >= 0.15;
      }),
    {
      message: "Bracket TER terakhir harus memakai tarif minimal 15 persen",
    },
  );

const AnnualBracketsSchema = z
  .array(AnnualBracketSchema)
  .min(1)
  .refine(isSortedAnnualBracketList, {
    message: "max_pkp harus naik dan bracket terakhir tak terhingga",
  })
  .refine(
    (brackets) => {
      const last = brackets.at(-1);
      return last !== undefined && Number(last.max_pkp) >= 100_000_000_000;
    },
    {
      message: "Bracket tahunan terakhir harus mencakup 100 miliar",
    },
  )
  .refine(
    (brackets) => {
      const last = brackets.at(-1);
      return last !== undefined && Number(last.rate) >= 0.3;
    },
    {
      message: "Bracket tahunan terakhir harus memakai tarif minimal 30 persen",
    },
  );

const AgentCommissionTierSchema = z
  .object({
    min_sales: MoneySchema,
    max_sales: MoneySchema,
    commission_rate: DecimalRateSchema,
  })
  .strict();

const AgentCommissionTiersSchema = z
  .array(AgentCommissionTierSchema)
  .min(1)
  .refine(
    (tiers) =>
      tiers.every(
        (tier, index) =>
          Number(tier.min_sales) <= Number(tier.max_sales) &&
          (index === 0 || Number(tier.min_sales) > Number(tiers[index - 1]?.max_sales ?? -1)),
      ),
    {
      message:
        "Tier komisi harus naik, tidak overlap, dan min_sales harus di atas max_sales sebelumnya",
    },
  )
  .refine((tiers) => Number(tiers[0]?.min_sales ?? -1) === 0, {
    message: "Tier komisi pertama harus dimulai dari 0",
  })
  .refine(
    (tiers) => {
      const last = tiers.at(-1);
      return last !== undefined && Number(last.max_sales) >= 100_000_000_000;
    },
    {
      message: "Tier komisi terakhir harus mencakup 100 miliar",
    },
  );

const PtkpAmountsSchema = z
  .record(PtkpStatusSchema, MoneySchema)
  .refine((value) => ALL_PTKP.every((status) => status in value), {
    message: "ptkp_amounts harus memuat seluruh 8 status PTKP",
  });

const Pph21TerMappingSchema = z.record(TerCategorySchema, z.array(PtkpStatusSchema).min(1)).refine(
  (value) => {
    const mapped = Object.values(value).flat();
    return mapped.length === ALL_PTKP.length && ALL_PTKP.every((status) => mapped.includes(status));
  },
  { message: "pph21_ter_mapping harus memetakan setiap status PTKP tepat satu kali" },
);

const AnnualDeductionsSchema = z
  .object({
    biaya_jabatan_rate: DecimalRateSchema,
    biaya_jabatan_max_annual: MoneySchema,
    deductible_employee_contributions: z.array(z.enum(["JHT", "JP"])).min(1),
  })
  .strict();

const AttendancePolicySchema = z
  .object({
    proration_basis: z.enum(["working_days", "calendar_days"]),
    daily_rate_basis: z.string().min(1),
    hourly_rate_basis: z.string().min(1),
    overtime_first_hour_multiplier: RateSchema,
    overtime_subsequent_multiplier: RateSchema,
    overtime_rest_day_multiplier: RateSchema,
    max_overtime_hours_per_month: z.number().int().min(0).max(200),
  })
  .strict();

export const PayrollPolicySchema = z
  .object({
    bpjs_parameters: BpjsParametersSchema,
    pph21_ter_mapping: Pph21TerMappingSchema,
    ter_base_components: z.array(WageComponentSchema).min(1),
    ter_base_exclusions: z.array(WageComponentSchema),
    pph21_ter_brackets: TerBracketsSchema,
    pph21_annual_brackets: AnnualBracketsSchema,
    agent_commission_tiers: AgentCommissionTiersSchema,
    commission_mode: CommissionModeSchema,
    bpjs_employer_rates: BpjsEmployerRatesSchema,
    ptkp_amounts: PtkpAmountsSchema,
    annual_deductions: AnnualDeductionsSchema,
    reconciliation_posting_period: z.enum(["DECEMBER", "JANUARY"]),
    overpayment_treatment: z.enum(["REFUND_OR_CREDIT", "CARRY_FORWARD"]),
    negative_net_policy: z.enum(["REJECT", "CARRY_FORWARD"]),
    tax_remittance_rounding: z.number().int().min(0).max(2),
    prorate_fixed_allowance: z.boolean(),
    attendance: AttendancePolicySchema,
  })
  .strict();
export type PayrollPolicy = z.infer<typeof PayrollPolicySchema>;

export const PayrollCostPolicySchema = z
  .object({
    bjo_rate: DecimalRateSchema,
    management_fee_rate: DecimalRateSchema,
    invoice_rounding: z.enum(["NONE", "UP_1000", "NEAREST_1000"]),
  })
  .strict();
export type PayrollCostPolicy = z.infer<typeof PayrollCostPolicySchema>;

export const PolicyRulesSchema = z.union([
  ClaimsPolicySchema,
  PayrollPolicySchema,
  PayrollCostPolicySchema,
]);
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

const PolicyVersionBaseSchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  version_tag: z.string().min(3).max(32),
  status: PolicyStatusSchema,
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  effective_from: IsoDateTimeSchema,
  published_by: UuidSchema.nullable(),
  approved_by: UuidSchema.nullable(),
  created_at: IsoDateTimeSchema,
});

export const ClaimsPolicyVersionSchema = PolicyVersionBaseSchema.extend({
  domain: z.literal("CLAIMS_POLICY"),
  rules_payload: ClaimsPolicySchema,
}).strict();

export const PayrollPolicyVersionSchema = PolicyVersionBaseSchema.extend({
  domain: z.literal("PAYROLL_TAX_POLICY"),
  rules_payload: PayrollPolicySchema,
}).strict();

export const PayrollCostPolicyVersionSchema = PolicyVersionBaseSchema.extend({
  domain: z.literal("PAYROLL_COST_POLICY"),
  rules_payload: PayrollCostPolicySchema,
}).strict();

export const PolicyVersionSchema = z.discriminatedUnion("domain", [
  ClaimsPolicyVersionSchema,
  PayrollPolicyVersionSchema,
  PayrollCostPolicyVersionSchema,
]);
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export const CreatePolicyRequestSchema = z.discriminatedUnion("domain", [
  z
    .object({
      domain: z.literal("CLAIMS_POLICY"),
      version_tag: z.string().min(3).max(32),
      rules_payload: ClaimsPolicySchema,
      effective_from: IsoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      domain: z.literal("PAYROLL_TAX_POLICY"),
      version_tag: z.string().min(3).max(32),
      rules_payload: PayrollPolicySchema,
      effective_from: IsoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      domain: z.literal("PAYROLL_COST_POLICY"),
      version_tag: z.string().min(3).max(32),
      rules_payload: PayrollCostPolicySchema,
      effective_from: IsoDateTimeSchema,
    })
    .strict(),
]);
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

export const ApprovePolicyRequestSchema = z
  .object({
    notes: z.string().trim().min(15).max(2000).optional(),
  })
  .strict();
export type ApprovePolicyRequest = z.infer<typeof ApprovePolicyRequestSchema>;

export const PublishPolicyRequestSchema = z.object({}).strict();
export type PublishPolicyRequest = z.infer<typeof PublishPolicyRequestSchema>;

export const PolicyListQuerySchema = z
  .object({
    domain: PolicyDomainSchema.optional(),
    status: PolicyStatusSchema.optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type PolicyListQuery = z.infer<typeof PolicyListQuerySchema>;

export const PolicySummarySchema = PolicyVersionBaseSchema.extend({
  domain: PolicyDomainSchema,
}).strict();
export type PolicySummary = z.infer<typeof PolicySummarySchema>;

export const DateOnlyPolicySchema = DateOnlySchema;
