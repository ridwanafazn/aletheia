import type { ClaimsPolicy, PayrollPolicy } from "./policy.js";

export const validClaimsPolicy: ClaimsPolicy = {
  approval_tiers: {
    level_1_branch_manager_max: "25000000.00",
    level_2_finance_manager_max: "150000000.00",
    auto_escalate_risk_threshold: 65,
    force_escalate_on_conflict: true,
  },
  required_documents_by_category: {
    HEALTH: ["IDENTITY_CARD", "MEDICAL_INVOICE"],
    ACCIDENT: ["IDENTITY_CARD", "MEDICAL_INVOICE", "POLICE_REPORT"],
    PROPERTY: ["IDENTITY_CARD", "POLICY_CERT", "POLICE_REPORT"],
    GUARANTEE: ["IDENTITY_CARD", "POLICY_CERT"],
  },
  optional_documents_by_category: {
    HEALTH: ["POLICY_CERT"],
    ACCIDENT: ["POLICY_CERT"],
    PROPERTY: ["MEDICAL_INVOICE"],
    GUARANTEE: ["MEDICAL_INVOICE"],
  },
  risk_scoring_weights: {
    missing_optional_evidence_points: 15,
    high_amount_ratio_threshold: 0.8,
    high_amount_ratio_points: 25,
    repeat_bank_account_30d_points: 30,
    cross_domain_conflict_points: 50,
  },
  sla_target_hours: 48,
};

export const validPayrollPolicy: PayrollPolicy = {
  bpjs_parameters: {
    kesehatan_employee_rate: "0.0100",
    kesehatan_salary_cap: "12000000.00",
    jht_employee_rate: "0.0200",
    jht_salary_cap: null,
    jp_employee_rate: "0.0100",
    jp_salary_cap: "10042300.00",
    bpjs_wage_base_components: ["base_salary", "fixed_allowance"],
    agent_bpjs_applicable: false,
  },
  pph21_ter_mapping: {
    CATEGORY_A: ["TK/0", "TK/1", "K/0"],
    CATEGORY_B: ["TK/2", "TK/3", "K/1", "K/2"],
    CATEGORY_C: ["K/3"],
  },
  ter_base_components: [
    "base_salary",
    "fixed_allowance",
    "variable_allowance",
    "overtime_pay",
    "agent_commission",
  ],
  ter_base_exclusions: [],
  pph21_ter_brackets: {
    CATEGORY_A: [{ max_gross: "999999999999.00", rate: "0.1500" }],
    CATEGORY_B: [{ max_gross: "999999999999.00", rate: "0.1500" }],
    CATEGORY_C: [{ max_gross: "999999999999.00", rate: "0.1500" }],
  },
  pph21_annual_brackets: [{ max_pkp: "999999999999.00", rate: "0.3500" }],
  agent_commission_tiers: [
    {
      min_sales: "0.00",
      max_sales: "999999999999.00",
      commission_rate: "0.0250",
    },
  ],
  commission_mode: "FLAT_TIER",
  bpjs_employer_rates: {
    kesehatan_employer_rate: "0.0400",
    jht_employer_rate: "0.0370",
    jp_employer_rate: "0.0200",
    jkk_rate_by_risk_class: {
      I: "0.0024",
      II: "0.0054",
      III: "0.0089",
      IV: "0.0127",
      V: "0.0174",
    },
    jkm_rate: "0.0030",
  },
  ptkp_amounts: {
    "TK/0": "54000000.00",
    "TK/1": "58500000.00",
    "TK/2": "63000000.00",
    "TK/3": "67500000.00",
    "K/0": "58500000.00",
    "K/1": "63000000.00",
    "K/2": "67500000.00",
    "K/3": "72000000.00",
  },
  annual_deductions: {
    biaya_jabatan_rate: "0.0500",
    biaya_jabatan_max_annual: "6000000.00",
    deductible_employee_contributions: ["JHT", "JP"],
  },
  reconciliation_posting_period: "DECEMBER",
  overpayment_treatment: "REFUND_OR_CREDIT",
  negative_net_policy: "REJECT",
  tax_remittance_rounding: 0,
  prorate_fixed_allowance: true,
  attendance: {
    proration_basis: "working_days",
    daily_rate_basis: "base_salary/working_days",
    hourly_rate_basis: "base_salary/(working_days*8)",
    overtime_first_hour_multiplier: "1.5000",
    overtime_subsequent_multiplier: "2.0000",
    overtime_rest_day_multiplier: "2.0000",
    max_overtime_hours_per_month: 40,
  },
};
