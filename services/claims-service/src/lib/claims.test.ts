import { describe, expect, it } from "vitest";

import { buildClaimRiskEvent, CLAIM_RISK_EVENT, qstashDestination } from "./qstash.js";
import { compareMoney, toMinorUnits } from "./money.js";
import { signMockWebhook, verifyMockWebhookSignature } from "./payments.js";
import { routeClaim } from "./routing.js";
import { createUploadSignature } from "./cloudinary.js";
import { ClaimsPolicySchema } from "@aletheia/shared-contracts";

function policy() {
  return ClaimsPolicySchema.parse({
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
  });
}

describe("money", () => {
  it("membandingkan nominal tanpa floating point", () => {
    expect(toMinorUnits("1.5")).toBe(150n);
    expect(compareMoney("150000000.00", "150000000")).toBe(0);
    expect(compareMoney("150000000.01", "150000000.00")).toBe(1);
  });
});

describe("routing", () => {
  const rules = policy();

  it("mengarahkan klaim kecil tanpa konflik ke level 1", () => {
    expect(
      routeClaim({
        requestedAmount: "5000000.00",
        riskScore: 10,
        hasConflictFlag: false,
        rules,
      }).kind,
    ).toBe("LEVEL_1");
  });

  it("mengarahkan risiko tinggi atau konflik ke level 2", () => {
    expect(
      routeClaim({
        requestedAmount: "5000000.00",
        riskScore: 70,
        hasConflictFlag: false,
        rules,
      }).kind,
    ).toBe("LEVEL_2");
    expect(
      routeClaim({
        requestedAmount: "5000000.00",
        riskScore: 0,
        hasConflictFlag: true,
        rules,
      }).kind,
    ).toBe("LEVEL_2");
  });

  it("menolak nominal di atas pagu level 2", () => {
    expect(
      routeClaim({
        requestedAmount: "150000000.01",
        riskScore: 0,
        hasConflictFlag: false,
        rules,
      }).kind,
    ).toBe("LIMIT_EXCEEDED");
  });
});

describe("qstash", () => {
  it("membangun event risiko kanonik", () => {
    const event = buildClaimRiskEvent({
      tenant_id: "019361a2-7c00-7000-8000-000000000001",
      claim_id: "019361a2-7c00-7000-8000-000000000002",
      policy_version_id: "019361a2-7c00-7000-8000-000000000003",
      correlation_id: "019361a2-7c00-7000-8000-000000000004",
    });
    expect(event.event_type).toBe(CLAIM_RISK_EVENT);
    expect(event.requested_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(qstashDestination()).toContain("/internal/v1/qstash/consume");
  });
});

describe("webhook", () => {
  it("menandatangani dan memverifikasi body webhook", () => {
    const body = { event_id: "evt-1", status: "PAID" };
    const signature = signMockWebhook(body);
    expect(verifyMockWebhookSignature(body, signature)).toBe(true);
    expect(verifyMockWebhookSignature(body, "0".repeat(64))).toBe(false);
    expect(verifyMockWebhookSignature({ ...body, status: "FAILED" }, signature)).toBe(false);
  });
});

describe("cloudinary", () => {
  it("menghasilkan signature folder tenant dan batas 5 MB", () => {
    const result = createUploadSignature({
      tenantId: "019361a2-7c00-7000-8000-000000000001",
      documentType: "IDENTITY_CARD",
      mimeType: "application/pdf",
    });
    expect(result.folder).toContain("019361a2-7c00-7000-8000-000000000001");
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(result.max_file_size).toBe(5 * 1024 * 1024);
    expect(result.allowed_formats).toContain("pdf");
  });
});
