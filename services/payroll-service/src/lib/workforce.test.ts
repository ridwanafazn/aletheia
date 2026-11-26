import { describe, expect, it } from "vitest";

import { leaveYear, monthStart, remainingDays, requiresLeaveBalance } from "./workforce.js";

describe("workforce helpers", () => {
  it("derives the leave year from the start date", () => {
    expect(leaveYear("2026-11-10")).toBe(2026);
  });

  it("derives the payroll month start from a work date", () => {
    expect(monthStart("2026-11-05")).toBe("2026-11-01");
  });

  it("computes remaining leave days", () => {
    expect(remainingDays("12.00", "2.00", "1.00")).toBe(9);
  });

  it("does not require a balance for unpaid leave", () => {
    expect(requiresLeaveBalance("UNPAID")).toBe(false);
    expect(requiresLeaveBalance("ANNUAL")).toBe(true);
  });
});
