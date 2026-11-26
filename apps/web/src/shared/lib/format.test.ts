import { describe, expect, it } from "vitest";

import {
  actionLabel,
  ageLabel,
  batchTypeLabel,
  categoryLabel,
  contextLabel,
  domainLabel,
  employmentLabel,
  formatMoney,
  formatPeriod,
  formatRate,
  leaveTypeLabel,
  personnelTypeLabel,
  riskBand,
  statusLabel,
} from "./format";

describe("format", () => {
  it("memformat nominal rupiah tanpa desimal", () => {
    expect(formatMoney("5000000.00")).toContain("5.000.000");
    expect(formatMoney(null)).toBe("Belum ada");
  });

  it("memetakan label operasional", () => {
    expect(statusLabel("COMPLIANCE_REVIEW")).toBe("Review kepatuhan");
    expect(categoryLabel("HEALTH")).toBe("Kesehatan");
    expect(domainLabel("CLAIMS")).toBe("Klaim");
    expect(actionLabel("CLAIM_DISBURSED")).toBe("Klaim dicairkan");
    expect(contextLabel("requested_amount")).toBe("Nominal diajukan");
  });

  it("menentukan pita risiko", () => {
    expect(riskBand(10)).toBe("low");
    expect(riskBand(40)).toBe("medium");
    expect(riskBand(80)).toBe("high");
  });

  it("menampilkan usia klaim", () => {
    expect(ageLabel(new Date().toISOString())).toBe("Baru saja");
  });

  it("memetakan label payroll", () => {
    expect(statusLabel("READY_FOR_APPROVAL")).toBe("Siap disetujui");
    expect(statusLabel("CALCULATING")).toBe("Kalkulasi berjalan");
    expect(employmentLabel("PERMANENT")).toBe("Tetap");
    expect(personnelTypeLabel("SALES_AGENT")).toBe("Agen penjualan");
    expect(batchTypeLabel("CORRECTION")).toBe("Koreksi");
    expect(leaveTypeLabel("ANNUAL")).toBe("Cuti tahunan");
  });

  it("memformat periode dan tarif", () => {
    expect(formatPeriod("2026-11-01")).toContain("November 2026");
    expect(formatRate("0.1500")).toContain("15");
  });
});
