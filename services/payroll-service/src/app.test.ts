import { createHash, createHmac, randomUUID } from "node:crypto";

import { closeDatabase } from "@aletheia/database";
import { adminPool as pool, closeAdminDatabase } from "@aletheia/database/admin";
import { validPayrollPolicy } from "../../../packages/shared-contracts/src/test-fixtures.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { signMockWebhook } from "./lib/payment-webhook.js";

const integrationEnabled = process.env.RUN_PAYROLL_INTEGRATION === "true";
const app = createApp();
const gatewaySecret = "test-internal-gateway-secret";

const TENANT = "019361a2-7c00-7000-8000-000000000941";
const BRANCH = "019361a2-7c00-7000-8000-000000000942";
const HR = "019361a2-7c00-7000-8000-000000000943";
const FINANCE = "019361a2-7c00-7000-8000-000000000944";
const MANAGER = "019361a2-7c00-7000-8000-000000000945";
const COMPLIANCE = "019361a2-7c00-7000-8000-000000000946";
const MIS = "019361a2-7c00-7000-8000-000000000947";
const POLICY = "019361a2-7c00-7000-8000-000000000948";

interface Identity {
  userId: string;
  role: string;
  branchId: string;
  tenantId: string;
}

const hr: Identity = { userId: HR, role: "HR_SPECIALIST", branchId: BRANCH, tenantId: TENANT };
const finance: Identity = {
  userId: FINANCE,
  role: "FINANCE_MANAGER",
  branchId: BRANCH,
  tenantId: TENANT,
};
const manager: Identity = {
  userId: MANAGER,
  role: "BRANCH_MANAGER",
  branchId: BRANCH,
  tenantId: TENANT,
};

function gatewayHeaders(
  method: string,
  path: string,
  body: unknown,
  identity: Identity,
  idempotencyKey?: string,
): Record<string, string> {
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const timestamp = String(Date.now());
  const payload = [
    method,
    path,
    bodyHash,
    identity.userId,
    identity.role,
    identity.branchId,
    identity.tenantId,
    timestamp,
  ].join(":");
  const signature = createHmac("sha256", gatewaySecret).update(payload).digest("hex");
  return {
    "content-type": "application/json",
    "x-user-id": identity.userId,
    "x-user-role": identity.role,
    "x-branch-id": identity.branchId,
    "x-tenant-id": identity.tenantId,
    "x-gateway-timestamp": timestamp,
    "x-request-method": method,
    "x-request-path": path,
    "x-body-sha256": bodyHash,
    "x-gateway-signature": signature,
    "x-correlation-id": randomUUID(),
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

async function call(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
  identity: Identity,
  idempotencyKey?: string,
) {
  const agent =
    method === "GET"
      ? request(app).get(path)
      : method === "POST"
        ? request(app).post(path)
        : method === "PATCH"
          ? request(app).patch(path)
          : request(app).put(path);
  const signedPath = path.split("?")[0] ?? path;
  return agent
    .set(gatewayHeaders(method, signedPath, body, identity, idempotencyKey))
    .send(body === undefined ? undefined : body);
}

function breakdown(ptkp: string, terCategory: string) {
  return {
    policy_version_tag: "v2026.11.test",
    ptkp_status: ptkp,
    ter_category: terCategory,
    applied_ter_rate: "0.0200",
    ter_base: "8000000.00",
    gross_components: {
      base_salary: "8000000.00",
      fixed_allowance: "0.00",
      variable_allowance: "0.00",
      overtime_pay: "0.00",
      agent_commission: "0.00",
    },
    deduction_components: {
      bpjs_kesehatan: "80000.00",
      bpjs_jht: "160000.00",
      bpjs_jp: "80000.00",
      pph21_tax: "160000.00",
    },
    employer_components: {
      bpjs_kesehatan: "320000.00",
      bpjs_jht: "296000.00",
      bpjs_jp: "160000.00",
      bpjs_jkk: "19200.00",
      bpjs_jkm: "24000.00",
    },
    net_take_home_pay: "7520000.00",
    rounding_adjustment: "0.00",
  };
}

async function insertItem(
  batchId: string,
  personnelId: string,
  amount = "7520000.00",
): Promise<void> {
  await pool.query(
    `insert into payroll.items
      (id, tenant_id, batch_id, personnel_id, gross_income, variable_allowance, overtime_pay,
       agent_commission, unpaid_leave_deduction, absence_deduction,
       bpjs_kesehatan_deduction, bpjs_ketenagakerjaan_deduction, bpjs_jht_deduction,
       bpjs_jp_deduction, bpjs_kesehatan_employer, bpjs_jht_employer, bpjs_jp_employer,
       bpjs_jkk_employer, bpjs_jkm_employer, pph21_tax_deduction, net_take_home_pay,
       taxable_income, ytd_gross, ytd_tax, payment_status, calculation_breakdown)
     values ($1,$2,$3,$4,'8000000.00','0.00','0.00','0.00','0.00','0.00',
             '80000.00','240000.00','160000.00','80000.00','320000.00','296000.00',
             '160000.00','19200.00','24000.00','160000.00',$5,'8000000.00','0.00','0.00',
             'PENDING',$6)`,
    [randomUUID(), TENANT, batchId, personnelId, amount, breakdown("K/1", "CATEGORY_B")],
  );
}

describe.skipIf(!integrationEnabled)("payroll service integration", () => {
  let employeeId = "";
  let financeLinkedEmployeeId = "";
  let agentId = "";
  let batchId = "";
  let payslipId = "";

  beforeAll(async () => {
    await pool.query(`delete from payroll.generated_files where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.payment_webhook_events where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.payments where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.payslips where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.tax_reports where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.tax_reconciliations where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.items where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.batches where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.leave_requests where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.attendance_summaries where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.sales_achievements where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from payroll.personnel where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from governance.policy_versions where tenant_id = $1`, [TENANT]);
    await pool.query(`delete from governance.idempotency_records where tenant_id = $1`, [TENANT]);

    await pool.query(
      `insert into governance.tenants (id, code, name, status)
       values ($1, 'M31', 'M3.1 Payroll Tenant', 'ACTIVE')
       on conflict (id) do nothing`,
      [TENANT],
    );
    await pool.query(
      `insert into governance.branches (id, tenant_id, code, name, region, monthly_disbursement_cap)
       values ($1, $2, 'M31-01', 'M3.1 Branch', 'Test', '1000000000.00')
       on conflict (id) do nothing`,
      [BRANCH, TENANT],
    );
    const users = [
      [HR, "M31-01", "Payroll HR", "hr@m31.test", "HR_SPECIALIST"],
      [FINANCE, "M31-02", "Payroll Finance", "finance@m31.test", "FINANCE_MANAGER"],
      [MANAGER, "M31-03", "Payroll Manager", "manager@m31.test", "BRANCH_MANAGER"],
      [COMPLIANCE, "M31-04", "Payroll Compliance", "compliance@m31.test", "COMPLIANCE_ADMIN"],
      [MIS, "M31-05", "Payroll MIS", "mis@m31.test", "MIS_ANALYST"],
    ] as const;
    for (const [id, code, name, email, role] of users) {
      await pool.query(
        `insert into governance.users
          (id, tenant_id, branch_id, employee_number, full_name, email, password_hash, role, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true)
         on conflict (id) do nothing`,
        [id, TENANT, BRANCH, code, name, email, "x".repeat(64), role],
      );
    }
    await pool.query(
      `insert into governance.policy_versions
        (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
         effective_from, published_by, approved_by)
       values ($1,$2,'PAYROLL_TAX_POLICY','v2026.11.test','ACTIVE',$3,$4,
               '2026-11-01T00:00:00.000Z',$5,$6)`,
      [
        POLICY,
        TENANT,
        validPayrollPolicy,
        createHash("sha256").update(JSON.stringify(validPayrollPolicy)).digest("hex"),
        COMPLIANCE,
        FINANCE,
      ],
    );
  });

  afterAll(async () => {
    await closeDatabase();
    await closeAdminDatabase();
  });

  it("menolak request tanpa signature gateway", async () => {
    const response = await request(app).get("/api/v1/employees");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("ERR_UNAUTHORIZED_ACCESS");
  });

  it("membuat karyawan dengan PII masked dan menolak kode duplikat", async () => {
    const body = {
      personnel_code: "EMP-M31-001",
      personnel_type: "EMPLOYEE",
      full_name: "Siti Test",
      nik: "3273000000000941",
      bank_account_number: "1234500091",
      bank_code: "BCA",
      bank_name: "Bank Central Asia",
      ptkp_status: "K/1",
      risk_class: "II",
      employment_status: "PERMANENT",
      base_salary: "8000000.00",
      fixed_allowance: "1000000.00",
      join_date: "2024-01-15",
      user_id: null,
    };
    const created = await call("POST", "/api/v1/employees", body, hr);
    expect(created.status).toBe(201);
    expect(created.body.data.nik_masked).toBe("3273********0941");
    expect(created.body.data.bank_account_masked).toBe("******0091");
    expect(JSON.stringify(created.body)).not.toContain("3273000000000941");
    employeeId = created.body.data.id;

    const duplicate = await call("POST", "/api/v1/employees", body, hr);
    expect(duplicate.status).toBe(409);

    const second = await call(
      "POST",
      "/api/v1/employees",
      {
        ...body,
        personnel_code: "EMP-M31-002",
        full_name: "Budi Test",
        nik: "3273000000000942",
        bank_account_number: "1234500092",
        user_id: FINANCE,
      },
      hr,
    );
    expect(second.status).toBe(201);
    financeLinkedEmployeeId = second.body.data.id;

    const patched = await call(
      "PATCH",
      `/api/v1/employees/${employeeId}`,
      { bank_account_number: "9998800091", fixed_allowance: "1500000.00" },
      hr,
    );
    expect(patched.status).toBe(200);
    expect(patched.body.data.bank_account_masked).toBe("******0091");
    expect(patched.body.data.fixed_allowance).toBe("1500000.00");

    const list = await call("GET", "/api/v1/employees?search=Siti", undefined, hr);
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((item: { id: string }) => item.id === employeeId)).toBe(true);
  });

  it("membaca daftar cabang tenant untuk form payroll", async () => {
    const response = await call("GET", "/api/v1/payroll/branches", undefined, hr);
    expect(response.status).toBe(200);
    const branch = response.body.data.items.find((item: { id: string }) => item.id === BRANCH);
    expect(branch).toMatchObject({ id: BRANCH, code: "M31-01", name: "M3.1 Branch" });
    expect(branch.monthly_disbursement_cap).toBe("1000000000.00");
  });

  it("membuat agen dan mencatat capaian penjualan serta absensi", async () => {
    const agent = await call(
      "POST",
      "/api/v1/employees",
      {
        personnel_code: "AGT-M31-001",
        personnel_type: "SALES_AGENT",
        full_name: "Agen Test",
        nik: "3273000000000943",
        bank_account_number: "1234500093",
        bank_code: "BCA",
        bank_name: "Bank Central Asia",
        ptkp_status: "TK/0",
        risk_class: "II",
        employment_status: "CONTRACT",
        base_salary: "4000000.00",
        fixed_allowance: "0.00",
        join_date: "2025-01-01",
      },
      hr,
    );
    expect(agent.status).toBe(201);
    agentId = agent.body.data.id;

    const sales = await call(
      "PUT",
      `/api/v1/sales-achievements/${agentId}/2026-12`,
      {
        period_month: "2026-12-01",
        verified_sales: "50000000.00",
        verification_status: "VERIFIED",
        source: "MANUAL",
      },
      hr,
    );
    expect(sales.status).toBe(200);
    expect(sales.body.data.verification_status).toBe("VERIFIED");

    const attendance = await call(
      "PUT",
      `/api/v1/attendance/${employeeId}/2026-12`,
      {
        working_days: 22,
        present_days: 20,
        paid_leave_days: 1,
        unpaid_leave_days: 1,
        absent_days: 0,
        overtime_hours: 4.5,
        source: "MANUAL",
      },
      hr,
    );
    expect(attendance.status).toBe(200);
    expect(attendance.body.data.overtime_hours).toBe(4.5);
  });

  it("menegakkan SoD cuti dan persetujuan cuti", async () => {
    const leave = await call(
      "POST",
      "/api/v1/leave-requests",
      {
        personnel_id: financeLinkedEmployeeId,
        leave_type: "ANNUAL",
        start_date: "2026-12-10",
        end_date: "2026-12-11",
        days: 2,
        reason: "Keperluan keluarga",
      },
      hr,
    );
    expect(leave.status).toBe(201);

    const self = await call(
      "POST",
      `/api/v1/leave-requests/${leave.body.data.id}/decide`,
      { decision: "APPROVED" },
      finance,
    );
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe("ERR_SOD_VIOLATION");

    const decided = await call(
      "POST",
      `/api/v1/leave-requests/${leave.body.data.id}/decide`,
      { decision: "APPROVED" },
      manager,
    );
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe("APPROVED");
  });

  it("membuat batch idempoten dan menolak periode ganda", async () => {
    const body = {
      branch_id: BRANCH,
      period_month: "2026-12-01",
      batch_type: "REGULAR",
      period_start: "2026-12-01",
      period_end: "2026-12-31",
    };
    const key = `batch-${randomUUID()}`;
    const created = await call("POST", "/api/v1/payroll/batches", body, hr, key);
    expect(created.status).toBe(201);
    expect(created.body.data.batch.status).toBe("DRAFT");
    expect(created.body.data.batch.policy_version_id).toBe(POLICY);
    batchId = created.body.data.batch.id;

    const replay = await call("POST", "/api/v1/payroll/batches", body, hr, key);
    expect(replay.status).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");

    const duplicate = await call(
      "POST",
      "/api/v1/payroll/batches",
      body,
      hr,
      `batch-${randomUUID()}`,
    );
    expect(duplicate.status).toBe(409);
  });

  it("mengirim permintaan kalkulasi dan mempertahankan satu event", async () => {
    const response = await call("POST", `/api/v1/payroll/batches/${batchId}/calculate`, {}, hr);
    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe("CALCULATING");
  });

  it("menolak item duplikat dan menyetujui batch READY_FOR_APPROVAL", async () => {
    await insertItem(batchId, employeeId);
    await insertItem(batchId, agentId, "5000000.00");
    await expect(insertItem(batchId, employeeId)).rejects.toThrow(/duplicate|unique/i);

    await pool.query(
      `update payroll.batches
          set status = 'READY_FOR_APPROVAL',
              total_gross_amount = '16000000.00',
              total_net_disbursed = '12520000.00',
              headcount = 2
        where tenant_id = $1 and id = $2`,
      [TENANT, batchId],
    );

    const key = `approve-${randomUUID()}`;
    const approved = await call(
      "POST",
      `/api/v1/payroll/batches/${batchId}/approve`,
      { notes: "Batch lengkap" },
      finance,
      key,
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data.batch.status).toBe("APPROVED");

    const replay = await call(
      "POST",
      `/api/v1/payroll/batches/${batchId}/approve`,
      { notes: "Batch lengkap" },
      finance,
      key,
    );
    expect(replay.status).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
  });

  it("mencegah pencairan ganda pada request paralel dan memproses replay", async () => {
    const keyOne = `disburse-a-${randomUUID()}`;
    const keyTwo = `disburse-b-${randomUUID()}`;
    const [first, second] = await Promise.all([
      call(
        "POST",
        `/api/v1/payroll/batches/${batchId}/disburse`,
        { provider: "MOCK" },
        finance,
        keyOne,
      ),
      call(
        "POST",
        `/api/v1/payroll/batches/${batchId}/disburse`,
        { provider: "MOCK" },
        finance,
        keyTwo,
      ),
    ]);
    const success =
      first.status === 200 ? { response: first, key: keyOne } : { response: second, key: keyTwo };
    const failed = first.status === 200 ? second : first;
    expect(success.response.status).toBe(200);
    expect(failed.status).toBe(409);
    expect(success.response.body.data.batch.status).toBe("DISBURSED");

    const payments = await pool.query<{ count: string }>(
      `select count(*)::text as count from payroll.payments
        where tenant_id = $1 and batch_id = $2 and status = 'PAID'`,
      [TENANT, batchId],
    );
    expect(payments.rows[0]?.count).toBe("2");

    const replay = await call(
      "POST",
      `/api/v1/payroll/batches/${batchId}/disburse`,
      { provider: "MOCK" },
      finance,
      success.key,
    );
    expect(replay.status).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
  });

  it("menghasilkan metadata payslip dan report yang benar", async () => {
    const payslipRequest = await call(
      "POST",
      `/api/v1/payroll/batches/${batchId}/payslips`,
      {},
      hr,
      `payslip-${randomUUID()}`,
    );
    expect(payslipRequest.status).toBe(202);
    expect(payslipRequest.body.data.status).toBe("QUEUED");
    expect(payslipRequest.body.data.item_count).toBe(2);
    expect(payslipRequest.body.data.policy_version_id).toBe(POLICY);
    expect(payslipRequest.body.data.period_month).toBe("2026-12-01");

    payslipId = randomUUID();
    await pool.query(
      `insert into payroll.payslips
        (id, tenant_id, batch_id, personnel_id, period_month, version, secure_url,
         snapshot_hash_sha256, file_checksum_sha256, gross_income, net_take_home_pay,
         verification_code, published_at)
       values ($1,$2,$3,$4,'2026-12-01',1,$7,$5,$6,
               '8000000.00','7520000.00','VERIFY123456',now())`,
      [
        payslipId,
        TENANT,
        batchId,
        employeeId,
        "a".repeat(64),
        "b".repeat(64),
        `/api/v1/payslips/${payslipId}/download`,
      ],
    );
    const payslip = await call("GET", `/api/v1/payslips/${payslipId}`, undefined, hr);
    expect(payslip.status).toBe(200);
    expect(payslip.body.data.verification_code).toBe("VERIFY123456");
    expect(payslip.body.data.snapshot_hash_sha256).toBe("a".repeat(64));

    const reportKey = `report-${randomUUID()}`;
    const report = await call(
      "POST",
      "/api/v1/reports",
      {
        report_type: "PPH21_MONTHLY",
        period_start: "2026-12-01",
        period_end: "2026-12-31",
        branch_id: null,
      },
      hr,
      reportKey,
    );
    expect(report.status).toBe(202);
    expect(report.body.data.status).toBe("QUEUED");
    expect(report.body.data.policy_version_id).toBe(POLICY);
    expect(report.body.data.version).toBe(1);
    expect(report.body.data.generated_by).toBe(HR);

    const reportReplay = await call(
      "POST",
      "/api/v1/reports",
      {
        report_type: "PPH21_MONTHLY",
        period_start: "2026-12-01",
        period_end: "2026-12-31",
        branch_id: null,
      },
      hr,
      reportKey,
    );
    expect(reportReplay.status).toBe(200);
    expect(reportReplay.headers["x-idempotent-replay"]).toBe("true");
  });

  it("menyajikan unduhan payslip dan report bertanda tangan", async () => {
    const pdf = Buffer.from("%PDF-1.4\nDemo payslip\n");
    const checksum = createHash("sha256").update(pdf).digest("hex");
    await pool.query(
      `insert into payroll.generated_files
        (id, tenant_id, kind, entity_id, file_name, mime_type, file_size, content, checksum_sha256)
       values (gen_random_uuid(),$1,'PAYSLIP',$2,'payslip.pdf','application/pdf',$3,$4,$5)`,
      [TENANT, payslipId, pdf.length, pdf, checksum],
    );
    const payslipDownload = await call(
      "GET",
      `/api/v1/payslips/${payslipId}/download`,
      undefined,
      hr,
    );
    expect(payslipDownload.status).toBe(200);
    expect(payslipDownload.body.data.checksum).toBe(checksum);
    expect(payslipDownload.body.data.url).toMatch(/^\/api\/v1\/payroll-files\//);
    const payslipFile = await request(app).get(payslipDownload.body.data.url);
    expect(payslipFile.status).toBe(200);
    expect(payslipFile.headers["content-type"]).toContain("application/pdf");
    expect(payslipFile.body.equals(pdf)).toBe(true);

    const reportRow = await pool.query<{ id: string }>(
      `select id from payroll.tax_reports where tenant_id = $1 order by period_start desc, id desc limit 1`,
      [TENANT],
    );
    const reportId = reportRow.rows[0]!.id;
    const csv = Buffer.from("personnel_code,name\nEMP-M31-001,Siti Test\n");
    const reportChecksum = createHash("sha256").update(csv).digest("hex");
    await pool.query(
      `update payroll.tax_reports
          set status = 'READY', file_url = $3, snapshot_hash_sha256 = $4,
              file_checksum_sha256 = $5, total_gross = '8000000.00',
              total_employee_bpjs = '320000.00', total_employer_bpjs = '819200.00',
              total_pph21 = '160000.00', total_net = '7520000.00', headcount = 1
        where tenant_id = $1 and id = $2`,
      [TENANT, reportId, `/api/v1/reports/${reportId}/download`, "c".repeat(64), reportChecksum],
    );
    await pool.query(
      `insert into payroll.generated_files
        (id, tenant_id, kind, entity_id, file_name, mime_type, file_size, content, checksum_sha256)
       values (gen_random_uuid(),$1,'REPORT',$2,'pph21.csv','text/csv',$3,$4,$5)`,
      [TENANT, reportId, csv.length, csv, reportChecksum],
    );
    const reportDownload = await call("GET", `/api/v1/reports/${reportId}/download`, undefined, hr);
    expect(reportDownload.status).toBe(200);
    expect(reportDownload.body.data.checksum).toBe(reportChecksum);
    const reportFile = await request(app).get(reportDownload.body.data.url);
    expect(reportFile.status).toBe(200);
    expect(reportFile.text).toContain("EMP-M31-001");
  });

  it("membalik payment dan mencoba ulang batch partial", async () => {
    const payment = await pool.query<{ id: string }>(
      `select id from payroll.payments
        where tenant_id = $1 and batch_id = $2 and status = 'PAID'
        order by requested_at limit 1`,
      [TENANT, batchId],
    );
    const paymentId = payment.rows[0]!.id;
    const reversed = await call(
      "POST",
      `/api/v1/payroll/payments/${paymentId}/reverse`,
      { reason: "Rekening penerima perlu dikoreksi sebelum pembayaran ulang" },
      finance,
    );
    expect(reversed.status).toBe(200);
    expect(reversed.body.data.status).toBe("REVERSED");
    const partial = await pool.query<{ status: string }>(
      `select status from payroll.batches where tenant_id = $1 and id = $2`,
      [TENANT, batchId],
    );
    expect(partial.rows[0]?.status).toBe("PARTIAL");

    const retry = await call(
      "POST",
      `/api/v1/payroll/batches/${batchId}/retry`,
      { provider: "MOCK" },
      finance,
      `retry-${randomUUID()}`,
    );
    expect([200, 202]).toContain(retry.status);
    expect(retry.body.data.batch.status).toBe("DISBURSED");
    const attempts = await pool.query<{ attempt_no: number }>(
      `select max(attempt_no) as attempt_no from payroll.payments
        where tenant_id = $1 and batch_id = $2`,
      [TENANT, batchId],
    );
    expect(attempts.rows[0]?.attempt_no).toBe(2);
  });

  it("memproses webhook payment secara idempoten", async () => {
    const payment = await pool.query<{
      id: string;
      provider_reference: string;
      amount: string;
      batch_id: string;
    }>(
      `select id, provider_reference, amount, batch_id
         from payroll.payments
        where tenant_id = $1 and batch_id = $2 and status = 'PAID'
        order by requested_at desc limit 1`,
      [TENANT, batchId],
    );
    const row = payment.rows[0]!;
    await pool.query(
      `update payroll.payments set status = 'PROCESSING' where tenant_id = $1 and id = $2`,
      [TENANT, row.id],
    );
    await pool.query(
      `update payroll.items set payment_status = 'PROCESSING'
        where tenant_id = $1 and payment_intent_id = $2`,
      [TENANT, row.id],
    );
    await pool.query(
      `update payroll.batches set status = 'DISBURSING' where tenant_id = $1 and id = $2`,
      [TENANT, row.batch_id],
    );
    const event = {
      event_id: `evt-${randomUUID()}`,
      event_type: "PAYMENT_PAID" as const,
      provider: "MOCK" as const,
      provider_reference: row.provider_reference,
      status: "PAID" as const,
      amount: row.amount,
      occurred_at: new Date().toISOString(),
      payload: { source: "test" },
    };
    const body = { signature: signMockWebhook(event), body: event };
    const first = await call("POST", "/api/v1/payroll/payments/webhook/MOCK", body, finance);
    expect(first.status).toBe(200);
    const second = await call("POST", "/api/v1/payroll/payments/webhook/MOCK", body, finance);
    expect(second.status).toBe(200);
    const webhookCount = await pool.query<{ count: string }>(
      `select count(*)::text as count from payroll.payment_webhook_events
        where tenant_id = $1 and event_id = $2`,
      [TENANT, event.event_id],
    );
    expect(webhookCount.rows[0]?.count).toBe("1");
    const paid = await pool.query<{ status: string }>(
      `select status from payroll.payments where tenant_id = $1 and id = $2`,
      [TENANT, row.id],
    );
    expect(paid.rows[0]?.status).toBe("PAID");
  });

  it("membuat dan memposting rekonsiliasi tahunan tanpa mengubah item bulanan", async () => {
    const before = await pool.query<{ count: string; net: string }>(
      `select count(*)::text as count, coalesce(sum(net_take_home_pay),0)::text as net
         from payroll.items where tenant_id = $1`,
      [TENANT],
    );
    const created = await call(
      "POST",
      "/api/v1/payroll/reconciliations",
      { tax_year: 2026 },
      hr,
      `recon-${randomUUID()}`,
    );
    expect(created.status).toBe(201);
    expect(created.body.data.items.length).toBeGreaterThan(0);
    const reconciliation = created.body.data.items[0] as {
      id: string;
      status: string;
      difference: string;
    };
    expect(reconciliation.status).toBe("DRAFT");
    const posted = await call(
      "POST",
      `/api/v1/payroll/reconciliations/${reconciliation.id}/post`,
      {},
      finance,
      `recon-post-${randomUUID()}`,
    );
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe("POSTED");
    const after = await pool.query<{ count: string; net: string }>(
      `select count(*)::text as count, coalesce(sum(net_take_home_pay),0)::text as net
         from payroll.items where tenant_id = $1`,
      [TENANT],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("menolak penulisan lintas tenant pada employee", async () => {
    const crossTenantIdentity = {
      userId: HR,
      role: "HR_SPECIALIST",
      branchId: "019361a2-7c00-7000-8000-000000000010",
      tenantId: "019361a2-7c00-7000-8000-000000000001",
    };
    const response = await call(
      "POST",
      "/api/v1/employees",
      {
        branch_id: BRANCH,
        personnel_code: "EMP-CROSS-001",
        personnel_type: "EMPLOYEE",
        full_name: "Cross Tenant",
        nik: "3273000000000999",
        bank_account_number: "1234500999",
        bank_code: "BCA",
        bank_name: "Bank Central Asia",
        ptkp_status: "TK/0",
        risk_class: "I",
        employment_status: "PERMANENT",
        base_salary: "5000000.00",
        fixed_allowance: "0.00",
        join_date: "2026-01-01",
      },
      crossTenantIdentity,
    );
    expect(response.status).toBe(404);
    const leaked = await pool.query(
      `select 1 from payroll.personnel where tenant_id = $1 and personnel_code = 'EMP-CROSS-001'`,
      ["019361a2-7c00-7000-8000-000000000001"],
    );
    expect(leaked.rowCount).toBe(0);
  });

  it("menolak akses lintas tenant", async () => {
    const response = await call("GET", `/api/v1/payroll/batches/${batchId}`, undefined, {
      userId: "019361a2-7c00-7000-8000-000000000025",
      role: "COMPLIANCE_ADMIN",
      branchId: "019361a2-7c00-7000-8000-000000000010",
      tenantId: "019361a2-7c00-7000-8000-000000000001",
    });
    expect(response.status).toBe(404);
  });
});
