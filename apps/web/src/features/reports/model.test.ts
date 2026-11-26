import { describe, expect, it } from "vitest";

import { reportPeriod } from "./model";

describe("reportPeriod", () => {
  it("maps a monthly report to the first and last day", () => {
    expect(reportPeriod({ reportType: "PPH21_MONTHLY", month: "2026-11", year: "2026" })).toEqual({
      period_start: "2026-11-01",
      period_end: "2026-11-30",
    });
  });

  it("maps an annual report to the full year", () => {
    expect(reportPeriod({ reportType: "PPH21_ANNUAL", month: "2026-11", year: "2026" })).toEqual({
      period_start: "2026-01-01",
      period_end: "2026-12-31",
    });
  });
});
