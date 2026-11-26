import type { ClaimsPolicy } from "@aletheia/shared-contracts";
import { ClaimsPolicySchema } from "@aletheia/shared-contracts";
import type { PoolClient, Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendAudit } from "./audit.js";
import {
  findClaimById,
  getClaimDetail,
  toAnomalyFlag,
  toClaimSummary,
  type ClaimRow,
} from "./claim-model.js";
import { assertTrustedCloudinaryUrl, createUploadSignature } from "./cloudinary.js";
import { ApiError } from "./errors.js";
import { compareMoney, isPositiveMoney, toMinorUnits } from "./money.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
import { getActiveClaimsPolicy, getBoundClaimsPolicy } from "./policy.js";
import { getPaymentProvider, signMockWebhook, verifyMockWebhookSignature } from "./payments.js";
import { hashBankAccount, hashNik, maskBankAccount, maskNik } from "./pii.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "./request-idempotency.js";
import { evaluateClaimRisk } from "./risk.js";
import { stableStringify } from "./stable-json.js";

vi.mock("./audit.js", () => ({
  appendAudit: vi.fn(async () => undefined),
}));

const TENANT = "019361a2-7c00-7000-8000-000000000001";
const CLAIM = "019361a2-7c00-7000-8000-000000000010";
const POLICY = "019361a2-7c00-7000-8000-000000000020";
const USER = "019361a2-7c00-7000-8000-000000000030";

function policy(): ClaimsPolicy {
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

function claimRow(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: CLAIM,
    tenant_id: TENANT,
    claim_number: "CLM-TEST-0001",
    branch_id: "019361a2-7c00-7000-8000-000000000011",
    policy_version_id: POLICY,
    policy_version_tag: "v2026.11.01",
    claimant_name: "Andi Wijaya",
    claimant_nik_hash: "nik-hash",
    claimant_nik_masked: "3273********0777",
    bank_account_hash: "bank-hash",
    bank_account_masked: "******1234",
    claim_category: "HEALTH",
    requested_amount: "5000000.00",
    approved_amount: null,
    risk_score: 0,
    risk_evaluated_at: null,
    has_conflict_flag: false,
    status: "DRAFT",
    compliance_reviewed_by: null,
    compliance_reviewed_at: null,
    created_by: USER,
    idempotency_key: "claim-key",
    submitted_at: null,
    finalized_at: null,
    created_at: new Date("2026-11-01T10:00:00.000Z"),
    updated_at: new Date("2026-11-01T10:00:00.000Z"),
    ...overrides,
  };
}

function queryable(rows: unknown[]): Pool {
  return { query: vi.fn(async () => ({ rows })) } as unknown as Pool;
}

function fakeClient(handler: (sql: string, values?: unknown[]) => { rows: unknown[] }): PoolClient {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => handler(sql, values)),
  } as unknown as PoolClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("claim model", () => {
  it("memetakan ringkasan klaim dengan tanggal null dan ISO", () => {
    const summary = toClaimSummary(
      claimRow({
        approved_amount: "4500000.00",
        risk_evaluated_at: new Date("2026-11-02T00:00:00.000Z"),
        submitted_at: new Date("2026-11-03T00:00:00.000Z"),
        finalized_at: new Date("2026-11-04T00:00:00.000Z"),
      }),
    );
    expect(summary.risk_evaluated_at).toBe("2026-11-02T00:00:00.000Z");
    expect(summary.submitted_at).toBe("2026-11-03T00:00:00.000Z");
    expect(summary.finalized_at).toBe("2026-11-04T00:00:00.000Z");
    expect(summary.approved_amount).toBe("4500000.00");

    const empty = toClaimSummary(claimRow());
    expect(empty.risk_evaluated_at).toBeNull();
    expect(empty.submitted_at).toBeNull();
    expect(empty.finalized_at).toBeNull();
  });

  it("memetakan anomaly flag dan audit history lengkap", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("from claims.submissions s")) {
        return { rows: [claimRow({ status: "UNDER_REVIEW" })] };
      }
      if (sql.includes("from claims.documents")) {
        return {
          rows: [
            {
              id: "doc-1",
              document_type: "IDENTITY_CARD",
              secure_url: "https://res.cloudinary.com/demo/id.pdf",
              mime_type: "application/pdf",
              file_size_bytes: 1024,
              uploaded_at: new Date("2026-11-01T10:01:00.000Z"),
            },
          ],
        };
      }
      if (sql.includes("from analytics.anomaly_flags")) {
        return {
          rows: [
            {
              id: "flag-1",
              conflict_type: "SHARED_BANK_ACCOUNT",
              severity: "CRITICAL",
              matched_personnel_code: "EMP-001",
              matched_personnel_name: "Siti Aminah",
              matched_personnel_type: "EMPLOYEE",
              matched_claim_number: "CLM-OLD",
              evidence_summary: { matched_field: "bank_account_hash" },
              resolution_status: "OPEN",
              detected_at: new Date("2026-11-01T10:02:00.000Z"),
            },
          ],
        };
      }
      if (sql.includes("from governance.audit_logs")) {
        return {
          rows: [
            {
              id: "1",
              actor_name: null,
              actor_role: "SYSTEM",
              action: "CLAIM_RISK_EVALUATED",
              policy_version_tag: "v2026.11.01",
              decision_context: { risk_score: 0 },
              record_hash: "hash",
              recorded_at: new Date("2026-11-01T10:03:00.000Z"),
            },
          ],
        };
      }
      return { rows: [{ rules_payload: { approval_tiers: { level_1_branch_manager_max: "1" } } }] };
    });

    const detail = await getClaimDetail(client, TENANT, CLAIM);
    expect(detail?.documents).toHaveLength(1);
    expect(detail?.anomaly_flags[0]?.severity).toBe("CRITICAL");
    expect(detail?.audit_history[0]?.actor_name).toBe("Sistem");
    expect(detail?.bound_policy_rules).toHaveProperty("approval_tiers");

    const flag = toAnomalyFlag({
      id: "flag-2",
      conflict_type: "MULTI_CLAIM_SAME_ACCOUNT",
      severity: "HIGH",
      matched_personnel_code: null,
      matched_personnel_name: null,
      matched_personnel_type: null,
      matched_claim_number: "CLM-OLD",
      evidence_summary: {},
      resolution_status: "RESOLVED",
      detected_at: new Date("2026-11-01T10:04:00.000Z"),
    });
    expect(flag.detected_at).toBe("2026-11-01T10:04:00.000Z");
  });

  it("mengembalikan null saat klaim atau policy tidak ditemukan", async () => {
    const empty = fakeClient(() => ({ rows: [] }));
    await expect(getClaimDetail(empty, TENANT, CLAIM)).resolves.toBeNull();

    const client = fakeClient((sql) => {
      if (sql.includes("from claims.submissions s")) {
        return { rows: [claimRow({ status: "UNDER_REVIEW" })] };
      }
      return { rows: [] };
    });
    const detail = await getClaimDetail(client, TENANT, CLAIM, "branch-1");
    expect(detail?.bound_policy_rules).toEqual({});
    expect(detail?.documents).toEqual([]);
    expect(detail?.audit_history).toEqual([]);
  });

  it("mencari klaim berdasarkan id dengan scope tenant", async () => {
    const found = await findClaimById(queryable([claimRow()]), TENANT, CLAIM);
    expect(found?.id).toBe(CLAIM);
    const missing = await findClaimById(queryable([]), TENANT, CLAIM);
    expect(missing).toBeNull();
  });
});

describe("risk evaluation", () => {
  it("memberi status UNDER_REVIEW tanpa temuan", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("delete from analytics.anomaly_flags")) return { rows: [] };
      if (sql.includes("array_agg")) return { rows: [{ count: "0", latest_claim_id: null }] };
      if (sql.includes("select count(*)::text as count")) return { rows: [{ count: "0" }] };
      if (sql.includes("from payroll.personnel")) return { rows: [] };
      if (sql.includes("from claims.documents")) {
        return { rows: [{ document_type: "IDENTITY_CARD" }, { document_type: "POLICY_CERT" }] };
      }
      return { rows: [] };
    });

    const result = await evaluateClaimRisk(client, claimRow(), policy(), "corr-1");
    expect(result).toEqual({
      riskScore: 0,
      hasConflictFlag: false,
      status: "UNDER_REVIEW",
      flags: 0,
    });
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });

  it("menaikkan skor dan mengarahkan konflik ke compliance review", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("delete from analytics.anomaly_flags")) return { rows: [] };
      if (sql.includes("array_agg")) {
        return { rows: [{ count: "2", latest_claim_id: "claim-other" }] };
      }
      if (sql.includes("select count(*)::text as count")) return { rows: [{ count: "2" }] };
      if (sql.includes("from payroll.personnel")) {
        return {
          rows: [
            {
              id: "person-1",
              personnel_code: "EMP-001",
              full_name: "Siti Aminah",
              personnel_type: "EMPLOYEE",
              bank_match: true,
              nik_match: true,
            },
          ],
        };
      }
      if (sql.includes("from claims.documents")) return { rows: [] };
      return { rows: [] };
    });

    const result = await evaluateClaimRisk(
      client,
      claimRow({ requested_amount: "30000000.00", policy_version_tag: "v2026.11.01" }),
      policy(),
      "corr-2",
    );
    expect(result.riskScore).toBe(100);
    expect(result.hasConflictFlag).toBe(true);
    expect(result.status).toBe("COMPLIANCE_REVIEW");
    expect(result.flags).toBe(3);
  });

  it("menolak klaim di atas pagu level 2", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("delete from analytics.anomaly_flags")) return { rows: [] };
      if (sql.includes("array_agg")) return { rows: [{ count: "0", latest_claim_id: null }] };
      if (sql.includes("select count(*)::text as count")) return { rows: [{ count: "0" }] };
      if (sql.includes("from payroll.personnel")) return { rows: [] };
      return { rows: [] };
    });

    await expect(
      evaluateClaimRisk(client, claimRow({ requested_amount: "200000000.00" }), policy(), "corr-3"),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("claims policy", () => {
  it("memuat policy aktif dan policy terikat", async () => {
    const row = { id: POLICY, version_tag: "v2026.11.01", rules_payload: policy() };
    await expect(getActiveClaimsPolicy(queryable([row]), TENANT)).resolves.toMatchObject({
      id: POLICY,
    });
    await expect(getBoundClaimsPolicy(queryable([row]), TENANT, POLICY)).resolves.toMatchObject({
      versionTag: "v2026.11.01",
    });
  });

  it("gagal closed saat policy hilang atau tidak valid", async () => {
    await expect(getActiveClaimsPolicy(queryable([]), TENANT)).rejects.toThrow(/tidak ditemukan/);
    await expect(
      getActiveClaimsPolicy(
        queryable([{ id: POLICY, version_tag: "x", rules_payload: { approval_tiers: {} } }]),
        TENANT,
      ),
    ).rejects.toThrow(/tidak lengkap/);
  });
});

describe("idempotency request", () => {
  function requestWith(header: string | undefined) {
    return { header: vi.fn(() => header) };
  }

  it("menerima kunci valid dan menolak kunci hilang atau terlalu panjang", () => {
    expect(requireIdempotencyKey(requestWith("idem-key-0001") as never)).toBe("idem-key-0001");
    expect(() => requireIdempotencyKey(requestWith(undefined) as never)).toThrow(/wajib/);
    expect(() => requireIdempotencyKey(requestWith("x".repeat(65)) as never)).toThrow(
      /tidak valid/,
    );
  });

  it("menghasilkan hash stabil yang tidak bergantung urutan kunci", () => {
    expect(idempotencyRequestHash({ a: 1, b: 2 })).toBe(idempotencyRequestHash({ b: 2, a: 1 }));
    expect(idempotencyRequestHash({ a: 1 })).toHaveLength(64);
  });
});

describe("PII dan uang", () => {
  it("menyamar dan menghash NIK serta rekening", () => {
    expect(maskNik("3273000000000004")).toBe("3273********0004");
    expect(maskBankAccount("1234567890")).toBe("******7890");
    expect(hashNik("3273000000000004")).toHaveLength(64);
    expect(hashBankAccount("1234567890")).toHaveLength(64);
    expect(hashNik("3273000000000004")).toBe(hashNik("3273000000000004"));
  });

  it("mengubah uang ke minor unit dan membandingkan", () => {
    expect(toMinorUnits("1")).toBe(100n);
    expect(toMinorUnits("1.2")).toBe(120n);
    expect(compareMoney("10.00", "10.00")).toBe(0);
    expect(compareMoney("10.01", "10.00")).toBe(1);
    expect(compareMoney("9.99", "10.00")).toBe(-1);
    expect(isPositiveMoney("0.01")).toBe(true);
    expect(isPositiveMoney("0.00")).toBe(false);
  });
});

describe("pagination dan stable json", () => {
  it("roundtrip cursor dari Date dan string", () => {
    const fromDate = encodeCursor(new Date("2026-11-01T00:00:00.000Z"), "10");
    expect(decodeCursor(fromDate)).toEqual({
      createdAt: "2026-11-01T00:00:00.000Z",
      id: "10",
    });
    const fromString = encodeCursor("2026-11-02T00:00:00.000Z", "11");
    expect(decodeCursor(fromString).id).toBe("11");
    expect(() => decodeCursor("bukan-cursor")).toThrow(/tidak valid/);
    expect(() => decodeCursor(Buffer.from('{"x":1}').toString("base64url"))).toThrow(/tidak valid/);
  });

  it("menstabilkan urutan kunci JSON", () => {
    expect(stableStringify({ b: [2, { z: null, a: true }], a: "x" })).toBe(
      '{"a":"x","b":[2,{"a":true,"z":null}]}',
    );
    expect(stableStringify("text")).toBe('"text"');
  });
});

describe("cloudinary dan payment claims", () => {
  it("membuat signature unggah untuk setiap mime yang didukung", () => {
    const pdf = createUploadSignature({
      tenantId: TENANT,
      documentType: "IDENTITY_CARD",
      mimeType: "application/pdf",
    });
    expect(pdf.folder).toContain(TENANT);
    expect(pdf.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(pdf.allowed_formats).toEqual(["pdf"]);

    expect(
      createUploadSignature({ tenantId: TENANT, documentType: "X", mimeType: "image/jpeg" })
        .allowed_formats,
    ).toEqual(["jpg", "jpeg"]);
    expect(
      createUploadSignature({ tenantId: TENANT, documentType: "X", mimeType: "image/png" })
        .allowed_formats,
    ).toEqual(["png"]);
    expect(
      createUploadSignature({ tenantId: TENANT, documentType: "X", mimeType: "image/webp" })
        .allowed_formats,
    ).toEqual(["webp"]);
    expect(
      createUploadSignature({ tenantId: TENANT, documentType: "X", mimeType: "text/plain" })
        .allowed_formats,
    ).toEqual(["pdf"]);
    expect(() => assertTrustedCloudinaryUrl("https://example.test/file.pdf")).not.toThrow();
  });

  it("mengembalikan provider MOCK dan menolak provider lain", () => {
    expect(getPaymentProvider("MOCK").name).toBe("MOCK");
    expect(() => getPaymentProvider("XENDIT")).toThrow(/belum dikonfigurasi/);
  });

  it("menandatangani dan memverifikasi webhook mock", () => {
    const body = { status: "PAID", amount: "100.00", nested: { b: 2, a: 1 } };
    const signature = signMockWebhook(body);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyMockWebhookSignature(body, signature)).toBe(true);
    expect(verifyMockWebhookSignature(body, `sha256=${signature}`)).toBe(true);
    expect(verifyMockWebhookSignature(body, signature.toUpperCase())).toBe(true);
    expect(verifyMockWebhookSignature(body, "0".repeat(64))).toBe(false);
    expect(verifyMockWebhookSignature(body, "short")).toBe(false);
  });
});
