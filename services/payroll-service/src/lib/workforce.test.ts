import { describe, expect, it } from "vitest";

import {
  leaveMonthAllocations,
  leaveYear,
  monthStart,
  remainingDays,
  requiresLeaveBalance,
} from "./workforce.js";

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

describe("leave month allocations", () => {
  it("allocates a single-month leave to its payroll period", () => {
    expect(leaveMonthAllocations("2026-12-10", "2026-12-11", 2)).toEqual([
      { period_month: "2026-12-01", days: 2 },
    ]);
  });

  it("splits a cross-month leave by working days", () => {
    expect(leaveMonthAllocations("2026-12-30", "2027-01-03", 3)).toEqual([
      { period_month: "2026-12-01", days: 2 },
      { period_month: "2027-01-01", days: 1 },
    ]);
  });

  it("does not allocate weekend-only leave", () => {
    expect(leaveMonthAllocations("2026-12-26", "2026-12-27", 2)).toEqual([]);
  });

  it("floors fractional days so attendance never overstates leave", () => {
    expect(leaveMonthAllocations("2026-12-10", "2026-12-11", 2.5)).toEqual([
      { period_month: "2026-12-01", days: 2 },
    ]);
  });

  it("splits a proportional remainder across months", () => {
    expect(leaveMonthAllocations("2026-12-30", "2027-01-02", 2)).toEqual([
      { period_month: "2026-12-01", days: 1 },
      { period_month: "2027-01-01", days: 1 },
    ]);
  });
});
