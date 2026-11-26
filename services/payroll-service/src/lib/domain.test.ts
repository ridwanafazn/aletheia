import type { PoolClient, Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validPayrollPolicy } from "../../../../packages/shared-contracts/src/test-fixtures.js";
import {
  getBatchItems,
  getBatchRow,
  toPayrollBatch,
  toPayrollItem,
  type BatchRow,
  type ItemRow,
} from "./batch-model.js";
import { findEmployee, requireEmployee, toEmployee, type EmployeeRow } from "./employee-model.js";
import { signFileToken, signedFilePath, verifyFileToken } from "./files.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
import { signMockWebhook, verifyMockWebhookSignature } from "./payment-webhook.js";
import { getPaymentProvider } from "./payments.js";
import { hashBankAccount, hashNik, maskBankAccount, maskNik } from "./pii.js";
import { getActivePayrollPolicy, getBoundPayrollPolicy } from "./policy.js";
import { idempotencyRequestHash, requireIdempotencyKey } from "./request-idempotency.js";
import { stableStringify } from "./stable-json.js";

const TENANT = "019361a2-7c00-7000-8000-000000000001";
const BATCH = "019361a2-7c00-7000-8000-000000000010";
const ITEM = "019361a2-7c00-7000-8000-000000000011";
const PERSON = "019361a2-7c00-7000-8000-000000000012";
const POLICY = "019361a2-7c00-7000-8000-000000000020";

function batchRow(overrides: Partial<BatchRow> = {}): BatchRow {
  return {
    id: BATCH,
    tenant_id: TENANT,
    batch_code: "PAY-SAU-202611-BDG-01",
    branch_id: "019361a2-7c00-7000-8000-000000000013",
    period_month: "2026-11-01",
    batch_type: "REGULAR",
    correction_seq: 0,
    period_start: "2026-11-01",
    period_end: "2026-11-30",
    policy_version_id: POLICY,
    status: "READY_FOR_APPROVAL",
    total_gross_amount: "31000000.00",
    total_tax_pph21: "1000000.00",
    total_bpjs_deduction: "500000.00",
    total_bpjs_employer: "700000.00",
    total_net_disbursed: "29500000.00",
    headcount: 5,
    created_by: "user-1",
    approved_by: null,
    approved_at: null,
    idempotency_key: "batch-key-1",
    disbursed_at: null,
    created_at: new Date("2026-11-01T10:00:00.000Z"),
    ...overrides,
  };
}

function itemRow(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: ITEM,
    tenant_id: TENANT,
    batch_id: BATCH,
    personnel_id: PERSON,
    gross_income: "6000000.00",
    variable_allowance: "0.00",
    overtime_pay: "0.00",
    agent_commission: "0.00",
    unpaid_leave_deduction: "0.00",
    absence_deduction: "0.00",
    bpjs_kesehatan_deduction: "60000.00",
    bpjs_jht_deduction: "120000.00",
    bpjs_jp_deduction: "60000.00",
    bpjs_kesehatan_employer: "240000.00",
    bpjs_jht_employer: "222000.00",
    bpjs_jp_employer: "120000.00",
    bpjs_jkk_employer: "14400.00",
    bpjs_jkm_employer: "18000.00",
    pph21_tax_deduction: "150000.00",
    net_take_home_pay: "5610000.00",
    taxable_income: "6000000.00",
    ytd_gross: "6000000.00",
    ytd_tax: "150000.00",
    payment_status: "PENDING",
    payment_intent_id: null,
    calculation_breakdown: { bruto: { base_salary: "5000000.00" } },
    ...overrides,
  };
}

function employeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: PERSON,
    branch_id: "019361a2-7c00-7000-8000-000000000013",
    personnel_code: "EMP-BDG-001",
    personnel_type: "EMPLOYEE",
    full_name: "Siti Aminah",
    nik_hash: "nik-hash",
    nik_masked: "3273********0001",
    bank_account_hash: "bank-hash",
    bank_account_masked: "******1234",
    bank_code: "BCA",
    bank_name: "Bank Central Asia",
    ptkp_status: "TK/0",
    risk_class: "I",
    employment_status: "PERMANENT",
    base_salary: "5000000.00",
    fixed_allowance: "500000.00",
    join_date: "2025-01-01",
    termination_date: null,
    user_id: null,
    is_active: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function client(rows: unknown[]): PoolClient {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PoolClient;
}

function queryable(rows: unknown[]): Pool {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as Pool;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("batch model", () => {
  it("memetakan batch dan item dengan tanggal ISO", () => {
    const mapped = toPayrollBatch(
      batchRow({
        approved_at: new Date("2026-11-02T00:00:00.000Z"),
        disbursed_at: new Date("2026-11-03T00:00:00.000Z"),
      }),
    );
    expect(mapped.approved_at).toBe("2026-11-02T00:00:00.000Z");
    expect(mapped.disbursed_at).toBe("2026-11-03T00:00:00.000Z");
    expect(mapped.status).toBe("READY_FOR_APPROVAL");

    const item = toPayrollItem(itemRow());
    expect(item.batch_id).toBe(BATCH);
    expect(item.net_take_home_pay).toBe("5610000.00");
    expect(item.calculation_breakdown).toHaveProperty("bruto");
  });

  it("membaca batch dan item dengan opsi lock", async () => {
    const batchClient = client([batchRow()]);
    const batch = await getBatchRow(batchClient, TENANT, BATCH, true);
    expect(batch?.id).toBe(BATCH);
    expect(batchClient.query).toHaveBeenCalledWith(expect.stringContaining("for update nowait"), [
      TENANT,
      BATCH,
    ]);

    const itemClient = client([itemRow()]);
    const items = await getBatchItems(itemClient, TENANT, BATCH);
    expect(items).toHaveLength(1);
    expect(itemClient.query).toHaveBeenCalledWith(expect.not.stringContaining("for update"), [
      TENANT,
      BATCH,
    ]);

    const missing = await getBatchRow(client([]), TENANT, BATCH);
    expect(missing).toBeNull();
  });
});

describe("employee model", () => {
  it("memetakan employee dan mencari berdasarkan tenant", async () => {
    expect(toEmployee(employeeRow()).join_date).toBe("2025-01-01");
    const found = await findEmployee(queryable([employeeRow()]), TENANT, PERSON);
    expect(found?.full_name).toBe("Siti Aminah");
    expect(await findEmployee(queryable([]), TENANT, PERSON)).toBeNull();
  });

  it("melempar error saat employee wajib tidak ditemukan", async () => {
    await expect(requireEmployee(client([employeeRow()]), TENANT, PERSON)).resolves.toMatchObject({
      id: PERSON,
    });
    await expect(requireEmployee(client([]), TENANT, PERSON)).rejects.toThrow(/tidak ditemukan/);
  });
});

describe("signed files", () => {
  it("menandatangani token dan memverifikasi payload", () => {
    const signed = signFileToken({ tenantId: TENANT, kind: "PAYSLIP", entityId: ITEM });
    expect(signed.token).toContain(".");
    expect(verifyFileToken(signed.token)).toMatchObject({
      tenant_id: TENANT,
      kind: "PAYSLIP",
      entity_id: ITEM,
    });
    expect(signedFilePath(signed.token)).toBe(`/api/v1/payroll-files/${signed.token}`);
  });

  it("menolak token rusak, kedaluwarsa, dan salah tanda tangan", () => {
    expect(verifyFileToken("bukan-token")).toBeNull();
    expect(verifyFileToken("a.b")).toBeNull();

    const signed = signFileToken({ tenantId: TENANT, kind: "REPORT", entityId: ITEM });
    expect(verifyFileToken(`${signed.token}x`)).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
    const expired = signFileToken({ tenantId: TENANT, kind: "REPORT", entityId: ITEM });
    vi.setSystemTime(new Date("2026-11-01T00:06:00.000Z"));
    expect(verifyFileToken(expired.token)).toBeNull();
  });
});

describe("payment webhook dan provider", () => {
  it("menandatangani webhook dan menolak signature salah", () => {
    const body = { event: "PAYMENT_PAID", amount: "100.00", nested: { b: 2, a: 1 } };
    const signature = signMockWebhook(body);
    expect(verifyMockWebhookSignature(body, signature)).toBe(true);
    expect(verifyMockWebhookSignature(body, `sha256=${signature}`)).toBe(true);
    expect(verifyMockWebhookSignature(body, signature.toUpperCase())).toBe(true);
    expect(verifyMockWebhookSignature(body, "0".repeat(64))).toBe(false);
    expect(verifyMockWebhookSignature(body, "short")).toBe(false);
  });

  it("mengembalikan provider MOCK dan menolak provider lain", () => {
    expect(getPaymentProvider("MOCK").name).toBe("MOCK");
    expect(() => getPaymentProvider("MIDTRANS")).toThrow(/belum dikonfigurasi/);
  });
});

describe("payroll policy", () => {
  it("memuat policy aktif dan policy terikat", async () => {
    const row = { id: POLICY, version_tag: "v2026.11.01", rules_payload: validPayrollPolicy };
    await expect(getActivePayrollPolicy(queryable([row]), TENANT)).resolves.toMatchObject({
      id: POLICY,
    });
    await expect(getBoundPayrollPolicy(queryable([row]), TENANT, POLICY)).resolves.toMatchObject({
      versionTag: "v2026.11.01",
    });
  });

  it("gagal closed saat policy hilang atau tidak valid", async () => {
    await expect(getActivePayrollPolicy(queryable([]), TENANT)).rejects.toThrow(/tidak ditemukan/);
    await expect(
      getActivePayrollPolicy(
        queryable([{ id: POLICY, version_tag: "x", rules_payload: { bpjs_parameters: {} } }]),
        TENANT,
      ),
    ).rejects.toThrow(/tidak lengkap/);
  });
});

describe("request idempotency payroll", () => {
  it("menerima kunci valid dan menolak kunci tidak valid", () => {
    const request = (header: string | undefined) => ({ header: vi.fn(() => header) });
    expect(requireIdempotencyKey(request("idem-key-0001") as never)).toBe("idem-key-0001");
    expect(() => requireIdempotencyKey(request(undefined) as never)).toThrow(/wajib/);
    expect(() => requireIdempotencyKey(request("x".repeat(65)) as never)).toThrow(/tidak valid/);
    expect(idempotencyRequestHash({ a: 1, b: 2 })).toBe(idempotencyRequestHash({ b: 2, a: 1 }));
  });
});

describe("PII payroll", () => {
  it("menyamar dan menghash NIK serta rekening", () => {
    expect(maskNik("3273000000000004")).toBe("3273********0004");
    expect(maskBankAccount("1234567890")).toBe("******7890");
    expect(hashNik("3273000000000004")).toHaveLength(64);
    expect(hashBankAccount("1234567890")).toHaveLength(64);
  });
});

describe("pagination dan stable json payroll", () => {
  it("roundtrip cursor dan menolak cursor rusak", () => {
    const cursor = encodeCursor(new Date("2026-11-01T00:00:00.000Z"), "7");
    expect(decodeCursor(cursor)).toEqual({ createdAt: "2026-11-01T00:00:00.000Z", id: "7" });
    expect(decodeCursor(encodeCursor("2026-11-01T00:00:00.000Z", "8")).id).toBe("8");
    expect(() => decodeCursor("rusak")).toThrow(/tidak valid/);
  });

  it("menstabilkan JSON", () => {
    expect(stableStringify({ b: [2], a: null })).toBe('{"a":null,"b":[2]}');
    expect(stableStringify(true)).toBe("true");
  });
});
