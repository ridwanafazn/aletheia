import { describe, expect, it, vi } from "vitest";

import { hashBankAccount, maskBankAccount, maskNik } from "./pii.js";
import {
  buildBatchCalculateEvent,
  buildPayslipGenerateEvent,
  buildReportGenerateEvent,
  publishPayrollEvent,
  qstashDestination,
} from "./qstash.js";

const TENANT = "019361a2-7c00-7000-8000-000000000001";
const CORRELATION = "019361a2-7c00-7000-8000-000000000002";
const USER = "019361a2-7c00-7000-8000-000000000003";

describe("PII payroll", () => {
  it("menyamarkan NIK dan rekening", () => {
    expect(maskNik("3273000000000004")).toBe("3273********0004");
    expect(maskBankAccount("1234567890")).toBe("******7890");
    expect(hashBankAccount("1234567890")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("payroll events", () => {
  it("membangun satu event kalkulasi batch dengan metadata lengkap", () => {
    const event = buildBatchCalculateEvent({
      tenantId: TENANT,
      correlationId: CORRELATION,
      requestedBy: USER,
      batchId: "019361a2-7c00-7000-8000-000000000010",
      policyVersionId: "019361a2-7c00-7000-8000-000000000011",
      branchId: "019361a2-7c00-7000-8000-000000000012",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    expect(event.event_type).toBe("PAYROLL_BATCH_CALCULATE");
    expect(event.batch_id).toContain("000000010");
    expect(event.policy_version_id).toContain("000000011");
    expect(event.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.requested_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("membangun event payslip dan report", () => {
    const payslip = buildPayslipGenerateEvent({
      tenantId: TENANT,
      correlationId: CORRELATION,
      requestedBy: USER,
      batchId: "019361a2-7c00-7000-8000-000000000010",
      policyVersionId: "019361a2-7c00-7000-8000-000000000011",
      periodMonth: "2026-11-01",
      itemCount: 3,
    });
    expect(payslip.event_type).toBe("PAYSLIP_GENERATE");
    expect(payslip.item_count).toBe(3);

    const report = buildReportGenerateEvent({
      tenantId: TENANT,
      correlationId: CORRELATION,
      requestedBy: USER,
      reportId: "019361a2-7c00-7000-8000-000000000013",
      reportType: "PPH21_MONTHLY",
      policyVersionId: "019361a2-7c00-7000-8000-000000000011",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      branchId: null,
    });
    expect(report.event_type).toBe("REPORT_GENERATE");
    expect(report.branch_id).toBeNull();
  });

  it("mengirim tepat satu pesan QStash per event", async () => {
    const event = buildBatchCalculateEvent({
      tenantId: TENANT,
      correlationId: CORRELATION,
      requestedBy: USER,
      batchId: "019361a2-7c00-7000-8000-000000000010",
      policyVersionId: "019361a2-7c00-7000-8000-000000000011",
      branchId: "019361a2-7c00-7000-8000-000000000012",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sent = await publishPayrollEvent(event, fetchImpl as unknown as typeof fetch);
    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`https://qstash.test/v2/publish/${qstashDestination()}`);
    expect(JSON.parse(String(init.body)).event_type).toBe("PAYROLL_BATCH_CALCULATE");
  });
});
