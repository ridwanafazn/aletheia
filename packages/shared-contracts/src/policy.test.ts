import { describe, expect, it } from "vitest";

import { ClaimsPolicySchema, CreatePolicyRequestSchema, PayrollPolicySchema } from "./policy.js";
import { validClaimsPolicy, validPayrollPolicy } from "./test-fixtures.js";

describe("ClaimsPolicySchema", () => {
  it("menerima payload kebijakan klaim yang valid", () => {
    expect(ClaimsPolicySchema.safeParse(validClaimsPolicy).success).toBe(true);
  });

  it("menolak level 1 yang melebihi level 2", () => {
    const invalid = JSON.parse(JSON.stringify(validClaimsPolicy)) as typeof validClaimsPolicy;
    invalid.approval_tiers.level_1_branch_manager_max = "200000000.00";
    expect(ClaimsPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak kategori dokumen wajib yang hilang", () => {
    const invalid = structuredClone(validClaimsPolicy);
    delete (invalid.required_documents_by_category as Record<string, unknown>).HEALTH;
    expect(ClaimsPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak field yang tidak dikenal", () => {
    const invalid = { ...validClaimsPolicy, unexpected: true };
    expect(ClaimsPolicySchema.safeParse(invalid).success).toBe(false);
  });
});

describe("PayrollPolicySchema", () => {
  it("menerima payload kebijakan payroll yang valid", () => {
    expect(PayrollPolicySchema.safeParse(validPayrollPolicy).success).toBe(true);
  });

  it("menolak PTKP yang tidak lengkap", () => {
    const invalid = JSON.parse(JSON.stringify(validPayrollPolicy)) as typeof validPayrollPolicy;
    delete (invalid.ptkp_amounts as Record<string, string>)["TK/3"];
    expect(PayrollPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak kelas risiko JKK yang tidak lengkap", () => {
    const invalid = JSON.parse(JSON.stringify(validPayrollPolicy)) as typeof validPayrollPolicy;
    delete (invalid.bpjs_employer_rates.jkk_rate_by_risk_class as Record<string, string>).V;
    expect(PayrollPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak tier komisi yang overlap", () => {
    const invalid = JSON.parse(JSON.stringify(validPayrollPolicy)) as typeof validPayrollPolicy;
    invalid.agent_commission_tiers.push({
      min_sales: "500000000000.00",
      max_sales: "1200000000000.00",
      commission_rate: "0.0300",
    });
    expect(PayrollPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak bracket tahunan yang tidak mencakup batas atas", () => {
    const invalid = JSON.parse(JSON.stringify(validPayrollPolicy)) as typeof validPayrollPolicy;
    invalid.pph21_annual_brackets[0] = {
      max_pkp: "1000000.00",
      rate: "0.3500",
    };
    expect(PayrollPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("menolak rate di atas 100 persen", () => {
    const invalid = JSON.parse(JSON.stringify(validPayrollPolicy)) as typeof validPayrollPolicy;
    invalid.pph21_ter_brackets.CATEGORY_A[0] = {
      max_gross: "999999999999.00",
      rate: "1.5000",
    };
    expect(PayrollPolicySchema.safeParse(invalid).success).toBe(false);
  });
});

describe("CreatePolicyRequestSchema", () => {
  it("menerima request klaim yang valid", () => {
    const result = CreatePolicyRequestSchema.safeParse({
      domain: "CLAIMS_POLICY",
      version_tag: "v2026.11.01",
      rules_payload: validClaimsPolicy,
      effective_from: "2026-11-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("menolak domain yang tidak cocok dengan payload", () => {
    const result = CreatePolicyRequestSchema.safeParse({
      domain: "CLAIMS_POLICY",
      version_tag: "v2026.11.01",
      rules_payload: validPayrollPolicy,
      effective_from: "2026-11-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
