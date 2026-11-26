import { describe, expect, it } from "vitest";

import {
  ClaimListQuerySchema,
  CreateClaimRequestSchema,
  DecideClaimRequestSchema,
} from "./claims.js";

describe("CreateClaimRequestSchema", () => {
  it("menerima payload klaim yang valid", () => {
    const result = CreateClaimRequestSchema.safeParse({
      claimant_name: "Budi Santoso",
      claimant_nik: "3273000000000004",
      claimant_bank_account: "1234567890",
      claim_category: "HEALTH",
      requested_amount: "18500000.00",
    });
    expect(result.success).toBe(true);
  });

  it("menolak NIK yang bukan 16 digit", () => {
    const result = CreateClaimRequestSchema.safeParse({
      claimant_name: "Budi Santoso",
      claimant_nik: "123",
      claimant_bank_account: "1234567890",
      claim_category: "HEALTH",
      requested_amount: "18500000.00",
    });
    expect(result.success).toBe(false);
  });

  it("menolak nominal negatif", () => {
    const result = CreateClaimRequestSchema.safeParse({
      claimant_name: "Budi Santoso",
      claimant_nik: "3273000000000004",
      claimant_bank_account: "1234567890",
      claim_category: "HEALTH",
      requested_amount: "-1.00",
    });
    expect(result.success).toBe(false);
  });
});

describe("DecideClaimRequestSchema", () => {
  it("mewajibkan approved_amount untuk APPROVED", () => {
    const result = DecideClaimRequestSchema.safeParse({ decision: "APPROVED" });
    expect(result.success).toBe(false);
  });

  it("menerima APPROVED dengan nominal", () => {
    const result = DecideClaimRequestSchema.safeParse({
      decision: "APPROVED",
      approved_amount: "5000000.00",
    });
    expect(result.success).toBe(true);
  });

  it("mewajibkan alasan minimal 15 karakter untuk REJECTED", () => {
    const result = DecideClaimRequestSchema.safeParse({
      decision: "REJECTED",
      reason_notes: "tidak lengkap",
    });
    expect(result.success).toBe(false);
  });

  it("menerima REJECTED dengan alasan yang memadai", () => {
    const result = DecideClaimRequestSchema.safeParse({
      decision: "REJECTED",
      reason_notes: "Dokumen bukti tidak lengkap dan tidak dapat diverifikasi",
    });
    expect(result.success).toBe(true);
  });
});

describe("ClaimListQuerySchema", () => {
  it("mengubah string boolean menjadi boolean", () => {
    const result = ClaimListQuerySchema.parse({ has_conflict_flag: "true" });
    expect(result.has_conflict_flag).toBe(true);
  });
});
