import { describe, expect, it } from "vitest";

import {
  AttendanceUpsertSchema,
  CalculationBreakdownSchema,
  EmployeeCreateRequestSchema,
  PayrollBatchCreateSchema,
} from "./payroll.js";

describe("EmployeeCreateRequestSchema", () => {
  it("menerima data karyawan yang valid", () => {
    const result = EmployeeCreateRequestSchema.safeParse({
      personnel_code: "EMP-BDG-001",
      personnel_type: "EMPLOYEE",
      full_name: "Siti Aminah",
      nik: "3273000000000004",
      bank_account_number: "1234567890",
      bank_code: "BCA",
      bank_name: "Bank Central Asia",
      ptkp_status: "K/1",
      risk_class: "II",
      employment_status: "PERMANENT",
      base_salary: "9000000.00",
      fixed_allowance: "2000000.00",
      join_date: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });
});

describe("AttendanceUpsertSchema", () => {
  it("menolak cuti tak dibayar melebihi hari kerja", () => {
    const result = AttendanceUpsertSchema.safeParse({
      working_days: 22,
      present_days: 20,
      paid_leave_days: 1,
      unpaid_leave_days: 2,
      absent_days: 0,
      overtime_hours: 0,
      source: "MANUAL",
    });
    expect(result.success).toBe(false);
  });
});

describe("PayrollBatchCreateSchema", () => {
  it("menolak periode yang berakhir sebelum mulai", () => {
    const result = PayrollBatchCreateSchema.safeParse({
      branch_id: "019361a2-7c00-7000-8000-000000000001",
      period_month: "2026-11-01",
      batch_type: "REGULAR",
      period_start: "2026-11-30",
      period_end: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("CalculationBreakdownSchema", () => {
  it("menerima breakdown perhitungan lengkap", () => {
    const result = CalculationBreakdownSchema.safeParse({
      policy_version_tag: "v2026.11.01",
      ptkp_status: "K/1",
      ter_category: "CATEGORY_B",
      applied_ter_rate: "0.0200",
      ter_base: "11000000.00",
      gross_components: {
        base_salary: "9000000.00",
        fixed_allowance: "2000000.00",
        variable_allowance: "0.00",
        overtime_pay: "0.00",
        agent_commission: "0.00",
      },
      deduction_components: {
        bpjs_kesehatan: "110000.00",
        bpjs_jht: "220000.00",
        bpjs_jp: "100423.00",
        pph21_tax: "220000.00",
      },
      employer_components: {
        bpjs_kesehatan: "440000.00",
        bpjs_jht: "407000.00",
        bpjs_jp: "200846.00",
        bpjs_jkk: "26400.00",
        bpjs_jkm: "33000.00",
      },
      net_take_home_pay: "10349577.00",
      rounding_adjustment: "0.00",
    });
    expect(result.success).toBe(true);
  });
});
