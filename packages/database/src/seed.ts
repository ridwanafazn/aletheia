import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { hash as argonHash } from "@node-rs/argon2";
import type { PoolClient } from "pg";

import { adminPool as pool, closeAdminDatabase } from "./admin.js";

function uid(value: number): string {
  return `019361a2-7c00-7000-8000-${String(value).padStart(12, "0")}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const pepper =
  process.env.PII_PEPPER !== undefined && process.env.PII_PEPPER.length > 0
    ? process.env.PII_PEPPER
    : "aletheia-demo-pepper";
const hashNik = (nik: string) => sha256(`${pepper}:${nik}`);
const hashBank = (account: string) => sha256(`${pepper}:${account}`);

const T_SAU = uid(1);
const T_BPUI = uid(2);
const BR_JKT = uid(10);
const BR_BDG = uid(11);
const BR_SBY = uid(12);
const BR_BPUI = uid(13);

const U_OFFICER_BDG = uid(20);
const U_HR = uid(21);
const U_BRANCH_BDG = uid(22);
const U_FINANCE = uid(23);
const U_MIS = uid(24);
const U_COMPLIANCE = uid(25);
const U_OFFICER_SBY = uid(26);
const U_BPUI_COMPLIANCE = uid(27);
const U_EMPLOYEE = uid(28);

const P_CLAIMS_OLD = uid(100);
const P_CLAIMS_ACTIVE = uid(101);
const P_PAYROLL_ACTIVE = uid(102);
const P_PAYROLL_COST = uid(103);

const PERSON_SITI = uid(200);
const PERSON_BUDI = uid(201);
const PERSON_RINA = uid(202);
const AGENT_AGUS = uid(203);
const AGENT_DEWI = uid(204);

const CLAIM_A = uid(300);
const CLAIM_B = uid(301);
const CLAIM_C = uid(302);
const DOC_A_ID = uid(310);
const DOC_A_INVOICE = uid(311);
const DOC_B_ID = uid(312);
const DOC_B_INVOICE = uid(313);
const APPROVAL_A = uid(320);
const DISBURSEMENT_A = uid(330);
const ANOMALY_B = uid(340);

const BATCH_NOV = uid(400);
const ITEM_SITI = uid(401);
const ITEM_BUDI = uid(402);
const ITEM_AGUS = uid(403);
const PAYMENT_SITI = uid(410);
const PAYMENT_BUDI = uid(411);
const PAYMENT_AGUS = uid(412);
const PAYSLIP_SITI = uid(420);
const REPORT_PPH21 = uid(430);
const REPORT_COST = uid(431);
const RECON_SITI = uid(440);
const WHATIF = uid(450);
const AUDIT_POLICY = uid(460);
const AUDIT_CLAIM = uid(461);
const AUDIT_BATCH = uid(462);
const FILE_PAYSLIP_SITI = uid(470);
const FILE_REPORT_PPH21 = uid(471);
const FILE_REPORT_COST = uid(472);
const DEPT_FINANCE = uid(500);
const DEPT_HR = uid(501);
const DEPT_CLAIMS = uid(502);
const DEPT_MIS = uid(503);
const DEPT_COMPLIANCE = uid(504);
const POS_MANAGER = uid(510);
const POS_OFFICER = uid(511);
const POS_ANALYST = uid(512);
const POS_SPECIALIST = uid(513);
const REIMB_SITI = uid(520);

const demoPayslipContent = readFileSync(new URL("../fixtures/demo-payslip.pdf", import.meta.url));
const demoPayslipChecksum = sha256(demoPayslipContent);
const demoReportContent = Buffer.from(
  [
    "personnel_code,name,gross,employee_bpjs,pph21,net",
    "EMP-BDG-001,Siti Aminah,11000000.00,430423.00,220000.00,10349577.00",
    "EMP-BDG-002,Budi Santoso,8000000.00,320000.00,100000.00,7580000.00",
    "AGT-BDG-001,Agus Setiawan,12000000.00,0.00,420000.00,11580000.00",
    "",
  ].join("\n"),
);
const demoReportChecksum = sha256(demoReportContent);
const demoCostInvoiceContent = Buffer.from(
  [
    "# report_type PAYROLL_COST_INVOICE",
    "# period_start 2026-11-01",
    "# period_end 2026-11-30",
    "# policy v2026.11.cost",
    "# bjo_rate 0.0250",
    "# management_fee_rate 0.0500",
    "# invoice_rounding UP_1000",
    "branch_code,branch_name,headcount,gross,employer_bpjs,bjo,management_fee,total_invoice",
    "BDG-01,Bandung,3,31000000.00,1926446.00,775000.00,1685072.30,35387000.00",
    "",
  ].join("\n"),
);
const demoCostInvoiceChecksum = sha256(demoCostInvoiceContent);

const claimsPolicy = {
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
};

const payrollPolicy = {
  bpjs_parameters: {
    kesehatan_employee_rate: "0.0100",
    kesehatan_salary_cap: "12000000.00",
    jht_employee_rate: "0.0200",
    jht_salary_cap: null,
    jp_employee_rate: "0.0100",
    jp_salary_cap: "10042300.00",
    bpjs_wage_base_components: ["base_salary", "fixed_allowance"],
    agent_bpjs_applicable: false,
  },
  pph21_ter_mapping: {
    CATEGORY_A: ["TK/0", "TK/1", "K/0"],
    CATEGORY_B: ["TK/2", "TK/3", "K/1", "K/2"],
    CATEGORY_C: ["K/3"],
  },
  ter_base_components: [
    "base_salary",
    "fixed_allowance",
    "variable_allowance",
    "overtime_pay",
    "agent_commission",
  ],
  ter_base_exclusions: [],
  pph21_ter_brackets: {
    CATEGORY_A: [
      { max_gross: "5400000.00", rate: "0.0000" },
      { max_gross: "999999999999.00", rate: "0.1500" },
    ],
    CATEGORY_B: [
      { max_gross: "6200000.00", rate: "0.0000" },
      { max_gross: "999999999999.00", rate: "0.1500" },
    ],
    CATEGORY_C: [
      { max_gross: "6600000.00", rate: "0.0000" },
      { max_gross: "999999999999.00", rate: "0.1500" },
    ],
  },
  pph21_annual_brackets: [
    { max_pkp: "60000000.00", rate: "0.0500" },
    { max_pkp: "250000000.00", rate: "0.1500" },
    { max_pkp: "500000000.00", rate: "0.2500" },
    { max_pkp: "5000000000.00", rate: "0.3000" },
    { max_pkp: "999999999999.00", rate: "0.3500" },
  ],
  agent_commission_tiers: [
    { min_sales: "0.00", max_sales: "50000000.00", commission_rate: "0.0250" },
    { min_sales: "50000000.01", max_sales: "150000000.00", commission_rate: "0.0400" },
    { min_sales: "150000000.01", max_sales: "999999999999.00", commission_rate: "0.0550" },
  ],
  commission_mode: "FLAT_TIER",
  bpjs_employer_rates: {
    kesehatan_employer_rate: "0.0400",
    jht_employer_rate: "0.0370",
    jp_employer_rate: "0.0200",
    jkk_rate_by_risk_class: {
      I: "0.0024",
      II: "0.0054",
      III: "0.0089",
      IV: "0.0127",
      V: "0.0174",
    },
    jkm_rate: "0.0030",
  },
  ptkp_amounts: {
    "TK/0": "54000000.00",
    "TK/1": "58500000.00",
    "TK/2": "63000000.00",
    "TK/3": "67500000.00",
    "K/0": "58500000.00",
    "K/1": "63000000.00",
    "K/2": "67500000.00",
    "K/3": "72000000.00",
  },
  annual_deductions: {
    biaya_jabatan_rate: "0.0500",
    biaya_jabatan_max_annual: "6000000.00",
    deductible_employee_contributions: ["JHT", "JP"],
  },
  reconciliation_posting_period: "DECEMBER",
  overpayment_treatment: "REFUND_OR_CREDIT",
  negative_net_policy: "REJECT",
  tax_remittance_rounding: 0,
  prorate_fixed_allowance: true,
  attendance: {
    proration_basis: "working_days",
    daily_rate_basis: "base_salary/working_days",
    hourly_rate_basis: "base_salary/(working_days*8)",
    overtime_first_hour_multiplier: "1.5000",
    overtime_subsequent_multiplier: "2.0000",
    overtime_rest_day_multiplier: "2.0000",
    max_overtime_hours_per_month: 40,
  },
};

const costPolicy = {
  bjo_rate: "0.0250",
  management_fee_rate: "0.0500",
  invoice_rounding: "UP_1000",
};

async function upsert(
  client: PoolClient,
  table: string,
  data: Record<string, unknown>,
  conflictColumn = "id",
): Promise<void> {
  const keys = Object.keys(data);
  const columns = keys.map((key) => `"${key}"`).join(", ");
  const values = keys.map((_, index) => `$${index + 1}`).join(", ");
  const updates = keys
    .filter((key) => key !== conflictColumn)
    .map((key) => `"${key}" = EXCLUDED."${key}"`)
    .join(", ");

  const statement = updates
    ? `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT ("${conflictColumn}") DO UPDATE SET ${updates}`
    : `INSERT INTO ${table} (${columns}) VALUES (${values}) ON CONFLICT ("${conflictColumn}") DO NOTHING`;

  await client.query(
    statement,
    keys.map((key) => data[key]),
  );
}

async function appendAudit(
  client: PoolClient,
  eventUuid: string,
  actorId: string,
  actorRole: string,
  domain: string,
  entityType: string,
  entityId: string,
  action: string,
  policyVersionId: string,
  context: Record<string, unknown>,
): Promise<void> {
  await client.query(`select governance.append_audit_log($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    T_SAU,
    eventUuid,
    uid(999),
    actorId,
    actorRole,
    domain,
    entityType,
    entityId,
    action,
    policyVersionId,
    context,
  ]);
}

async function main(): Promise<void> {
  const passwordHash = await argonHash("AletheiaDemo!2026");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await upsert(client, "governance.tenants", {
      id: T_SAU,
      code: "SAU",
      name: "SEIHITSU",
      status: "ACTIVE",
      plan: "HRIS_PRO",
    });
    await upsert(client, "governance.tenants", {
      id: T_BPUI,
      code: "BPUI",
      name: "BPUI Demo",
      status: "ACTIVE",
      plan: "BASIC",
    });

    await upsert(client, "governance.branches", {
      id: BR_JKT,
      tenant_id: T_SAU,
      code: "JKT-HQ",
      name: "Kantor Pusat Jakarta",
      region: "DKI Jakarta",
      monthly_disbursement_cap: "1500000000.00",
      cap_policy_version_id: P_CLAIMS_ACTIVE,
    });
    await upsert(client, "governance.branches", {
      id: BR_BDG,
      tenant_id: T_SAU,
      code: "BDG-01",
      name: "Kantor Cabang Bandung",
      region: "Jawa Barat",
      monthly_disbursement_cap: "600000000.00",
      cap_policy_version_id: P_CLAIMS_ACTIVE,
    });
    await upsert(client, "governance.branches", {
      id: BR_SBY,
      tenant_id: T_SAU,
      code: "SBY-01",
      name: "Kantor Cabang Surabaya",
      region: "Jawa Timur",
      monthly_disbursement_cap: "750000000.00",
      cap_policy_version_id: P_CLAIMS_ACTIVE,
    });
    await upsert(client, "governance.branches", {
      id: BR_BPUI,
      tenant_id: T_BPUI,
      code: "JKT-HQ",
      name: "BPUI Kantor Pusat",
      region: "DKI Jakarta",
      monthly_disbursement_cap: "1000000000.00",
    });

    const departments = [
      { id: DEPT_FINANCE, code: "FIN", name: "Finance" },
      { id: DEPT_HR, code: "HR", name: "Human Resources" },
      { id: DEPT_CLAIMS, code: "CLM", name: "Claims Operations" },
      { id: DEPT_MIS, code: "MIS", name: "Management Information" },
      { id: DEPT_COMPLIANCE, code: "CMP", name: "Compliance" },
    ];
    for (const department of departments) {
      await upsert(client, "governance.departments", {
        ...department,
        tenant_id: T_SAU,
      });
    }

    const positions = [
      { id: POS_MANAGER, code: "MGR", name: "Manager", job_level: "MANAGER" },
      { id: POS_OFFICER, code: "OFC", name: "Officer", job_level: "STAFF" },
      { id: POS_ANALYST, code: "ANL", name: "Analyst", job_level: "STAFF" },
      { id: POS_SPECIALIST, code: "SPC", name: "Specialist", job_level: "STAFF" },
    ];
    for (const position of positions) {
      await upsert(client, "governance.positions", {
        ...position,
        tenant_id: T_SAU,
      });
    }

    const users = [
      {
        id: U_OFFICER_BDG,
        tenant_id: T_SAU,
        branch_id: BR_BDG,
        employee_number: "SAU-0001",
        full_name: "Dian Permata",
        email: "officer.bdg@aletheia.id",
        role: "CLAIMS_OFFICER",
      },
      {
        id: U_HR,
        tenant_id: T_SAU,
        branch_id: BR_JKT,
        employee_number: "SAU-0002",
        full_name: "Rahmat Hidayat",
        email: "hr.ops@aletheia.id",
        role: "HR_SPECIALIST",
      },
      {
        id: U_BRANCH_BDG,
        tenant_id: T_SAU,
        branch_id: BR_BDG,
        employee_number: "SAU-0003",
        full_name: "Yuni Kartika",
        email: "manager.bdg@aletheia.id",
        role: "BRANCH_MANAGER",
      },
      {
        id: U_FINANCE,
        tenant_id: T_SAU,
        branch_id: BR_JKT,
        employee_number: "SAU-0004",
        full_name: "Arif Nugroho",
        email: "finance.vp@aletheia.id",
        role: "FINANCE_MANAGER",
      },
      {
        id: U_MIS,
        tenant_id: T_SAU,
        branch_id: BR_JKT,
        employee_number: "SAU-0005",
        full_name: "Nadia Putri",
        email: "mis.analyst@aletheia.id",
        role: "MIS_ANALYST",
      },
      {
        id: U_COMPLIANCE,
        tenant_id: T_SAU,
        branch_id: BR_JKT,
        employee_number: "SAU-0006",
        full_name: "Hendra Wijaya",
        email: "compliance@aletheia.id",
        role: "COMPLIANCE_ADMIN",
      },
      {
        id: U_OFFICER_SBY,
        tenant_id: T_SAU,
        branch_id: BR_SBY,
        employee_number: "SAU-0007",
        full_name: "Lestari Wulandari",
        email: "officer.sby@aletheia.id",
        role: "CLAIMS_OFFICER",
      },
      {
        id: U_EMPLOYEE,
        tenant_id: T_SAU,
        branch_id: BR_BDG,
        employee_number: "SAU-0008",
        full_name: "Siti Aminah",
        email: "employee.siti@aletheia.id",
        role: "EMPLOYEE",
      },
      {
        id: U_BPUI_COMPLIANCE,
        tenant_id: T_BPUI,
        branch_id: BR_BPUI,
        employee_number: "BPUI-0001",
        full_name: "Sari Maulida",
        email: "compliance@bpui.id",
        role: "COMPLIANCE_ADMIN",
      },
    ];

    for (const user of users) {
      await upsert(client, "governance.users", {
        ...user,
        password_hash: passwordHash,
        mfa_enabled: false,
        is_active: true,
      });
    }

    await client.query(
      `update governance.policy_versions
          set status = 'ARCHIVED'
        where tenant_id = $1
          and domain in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY','PAYROLL_COST_POLICY')
          and status = 'ACTIVE'`,
      [T_SAU],
    );

    await upsert(client, "governance.policy_versions", {
      id: P_CLAIMS_OLD,
      tenant_id: T_SAU,
      domain: "CLAIMS_POLICY",
      version_tag: "v2026.10.01",
      status: "ARCHIVED",
      rules_payload: claimsPolicy,
      checksum_sha256: sha256(JSON.stringify(claimsPolicy)),
      effective_from: "2026-10-01T00:00:00.000Z",
      published_by: U_COMPLIANCE,
      approved_by: U_FINANCE,
    });
    await upsert(client, "governance.policy_versions", {
      id: P_CLAIMS_ACTIVE,
      tenant_id: T_SAU,
      domain: "CLAIMS_POLICY",
      version_tag: "v2026.11.01",
      status: "ACTIVE",
      rules_payload: claimsPolicy,
      checksum_sha256: sha256(JSON.stringify(claimsPolicy)),
      effective_from: "2026-11-01T00:00:00.000Z",
      published_by: U_COMPLIANCE,
      approved_by: U_FINANCE,
    });
    await upsert(client, "governance.policy_versions", {
      id: P_PAYROLL_ACTIVE,
      tenant_id: T_SAU,
      domain: "PAYROLL_TAX_POLICY",
      version_tag: "v2026.11.01",
      status: "ACTIVE",
      rules_payload: payrollPolicy,
      checksum_sha256: sha256(JSON.stringify(payrollPolicy)),
      effective_from: "2026-11-01T00:00:00.000Z",
      published_by: U_COMPLIANCE,
      approved_by: U_FINANCE,
    });
    await upsert(client, "governance.policy_versions", {
      id: P_PAYROLL_COST,
      tenant_id: T_SAU,
      domain: "PAYROLL_COST_POLICY",
      version_tag: "v2026.11.cost",
      status: "ACTIVE",
      rules_payload: costPolicy,
      checksum_sha256: sha256(JSON.stringify(costPolicy)),
      effective_from: "2026-11-01T00:00:00.000Z",
      published_by: U_COMPLIANCE,
      approved_by: U_FINANCE,
    });

    await upsert(client, "payroll.personnel", {
      id: PERSON_SITI,
      tenant_id: T_SAU,
      branch_id: BR_BDG,
      department_id: DEPT_HR,
      position_id: POS_SPECIALIST,
      supervisor_id: PERSON_RINA,
      user_id: U_EMPLOYEE,
      personnel_code: "EMP-BDG-001",
      personnel_type: "EMPLOYEE",
      full_name: "Siti Aminah",
      nik_hash: hashNik("3273000000000004"),
      nik_masked: "3273********0004",
      bank_account_hash: hashBank("1234567890"),
      bank_account_masked: "******7890",
      bank_code: "BCA",
      bank_name: "Bank Central Asia",
      ptkp_status: "K/1",
      risk_class: "II",
      employment_status: "PERMANENT",
      base_salary: "9000000.00",
      fixed_allowance: "2000000.00",
      join_date: "2024-01-15",
      is_active: true,
    });
    await upsert(client, "payroll.personnel", {
      id: PERSON_BUDI,
      tenant_id: T_SAU,
      branch_id: BR_BDG,
      department_id: DEPT_HR,
      position_id: POS_OFFICER,
      supervisor_id: PERSON_RINA,
      personnel_code: "EMP-BDG-002",
      personnel_type: "EMPLOYEE",
      full_name: "Budi Santoso",
      nik_hash: hashNik("3273000000000005"),
      nik_masked: "3273********0005",
      bank_account_hash: hashBank("2345678901"),
      bank_account_masked: "******8901",
      bank_code: "BNI",
      bank_name: "Bank Negara Indonesia",
      ptkp_status: "TK/0",
      risk_class: "I",
      employment_status: "PERMANENT",
      base_salary: "7000000.00",
      fixed_allowance: "1000000.00",
      join_date: "2025-02-01",
      is_active: true,
    });
    await upsert(client, "payroll.personnel", {
      id: PERSON_RINA,
      tenant_id: T_SAU,
      branch_id: BR_BDG,
      department_id: DEPT_HR,
      position_id: POS_MANAGER,
      supervisor_id: null,
      personnel_code: "EMP-BDG-003",
      personnel_type: "EMPLOYEE",
      full_name: "Rina Maharani",
      nik_hash: hashNik("3273000000000006"),
      nik_masked: "3273********0006",
      bank_account_hash: hashBank("3456789012"),
      bank_account_masked: "******9012",
      bank_code: "BRI",
      bank_name: "Bank Rakyat Indonesia",
      ptkp_status: "K/3",
      risk_class: "III",
      employment_status: "PERMANENT",
      base_salary: "12000000.00",
      fixed_allowance: "3000000.00",
      join_date: "2023-07-10",
      is_active: true,
    });
    await upsert(client, "payroll.personnel", {
      id: AGENT_AGUS,
      tenant_id: T_SAU,
      branch_id: BR_BDG,
      department_id: DEPT_CLAIMS,
      position_id: POS_OFFICER,
      supervisor_id: PERSON_RINA,
      personnel_code: "AGT-BDG-001",
      personnel_type: "SALES_AGENT",
      full_name: "Agus Setiawan",
      nik_hash: hashNik("3273000000000007"),
      nik_masked: "3273********0007",
      bank_account_hash: hashBank("9998887776"),
      bank_account_masked: "******7776",
      bank_code: "BCA",
      bank_name: "Bank Central Asia",
      ptkp_status: "TK/0",
      risk_class: "II",
      employment_status: "CONTRACT",
      base_salary: "4000000.00",
      fixed_allowance: "0.00",
      join_date: "2025-05-01",
      is_active: true,
    });
    await upsert(client, "payroll.personnel", {
      id: AGENT_DEWI,
      tenant_id: T_SAU,
      branch_id: BR_BDG,
      department_id: DEPT_CLAIMS,
      position_id: POS_OFFICER,
      supervisor_id: PERSON_RINA,
      personnel_code: "AGT-BDG-002",
      personnel_type: "SALES_AGENT",
      full_name: "Dewi Lestari",
      nik_hash: hashNik("3273000000000008"),
      nik_masked: "3273********0008",
      bank_account_hash: hashBank("8887776665"),
      bank_account_masked: "******6665",
      bank_code: "Mandiri",
      bank_name: "Bank Mandiri",
      ptkp_status: "K/1",
      risk_class: "II",
      employment_status: "CONTRACT",
      base_salary: "5000000.00",
      fixed_allowance: "1000000.00",
      join_date: "2025-06-01",
      is_active: true,
    });

    await upsert(client, "payroll.sales_achievements", {
      id: uid(210),
      tenant_id: T_SAU,
      personnel_id: AGENT_AGUS,
      period_month: "2026-11-01",
      verified_sales: "200000000.00",
      verification_status: "VERIFIED",
      source: "IMPORT",
      verified_by: U_FINANCE,
      verified_at: "2026-11-20T09:00:00.000Z",
    });
    await upsert(client, "payroll.sales_achievements", {
      id: uid(211),
      tenant_id: T_SAU,
      personnel_id: AGENT_DEWI,
      period_month: "2026-11-01",
      verified_sales: "75000000.00",
      verification_status: "VERIFIED",
      source: "IMPORT",
      verified_by: U_FINANCE,
      verified_at: "2026-11-20T09:00:00.000Z",
    });

    const attendance = [
      {
        id: uid(220),
        personnel_id: PERSON_SITI,
        working_days: 22,
        present_days: 19,
        paid_leave_days: 2,
        unpaid_leave_days: 0,
        absent_days: 1,
        overtime_hours: "4.00",
      },
      {
        id: uid(221),
        personnel_id: PERSON_BUDI,
        working_days: 22,
        present_days: 21,
        paid_leave_days: 1,
        unpaid_leave_days: 0,
        absent_days: 0,
        overtime_hours: "2.00",
      },
      {
        id: uid(222),
        personnel_id: PERSON_RINA,
        working_days: 22,
        present_days: 19,
        paid_leave_days: 2,
        unpaid_leave_days: 1,
        absent_days: 0,
        overtime_hours: "0.00",
      },
    ];

    for (const row of attendance) {
      await upsert(client, "payroll.attendance_summaries", {
        ...row,
        tenant_id: T_SAU,
        period_month: "2026-11-01",
        source: "IMPORT",
        approved_by: U_HR,
        approved_at: "2026-11-21T09:00:00.000Z",
      });
    }

    await upsert(client, "payroll.leave_requests", {
      id: uid(230),
      tenant_id: T_SAU,
      personnel_id: PERSON_SITI,
      created_by: U_EMPLOYEE,
      leave_type: "ANNUAL",
      start_date: "2026-11-10",
      end_date: "2026-11-11",
      days: "2.00",
      status: "APPROVED",
      reason: "Keperluan keluarga",
      decided_by: U_BRANCH_BDG,
      decided_at: "2026-11-05T09:00:00.000Z",
      decision_notes: "Disetujui sesuai saldo cuti",
    });

    const leaveBalances = [
      {
        id: uid(233),
        personnel_id: PERSON_SITI,
        leave_type: "ANNUAL",
        entitlement_days: "12.00",
        used_days: "2.00",
        pending_days: "0.00",
      },
      {
        id: uid(234),
        personnel_id: PERSON_SITI,
        leave_type: "SICK",
        entitlement_days: "12.00",
        used_days: "0.00",
        pending_days: "0.00",
      },
      {
        id: uid(235),
        personnel_id: PERSON_SITI,
        leave_type: "UNPAID",
        entitlement_days: "0.00",
        used_days: "0.00",
        pending_days: "0.00",
      },
      {
        id: uid(236),
        personnel_id: PERSON_SITI,
        leave_type: "MATERNITY",
        entitlement_days: "90.00",
        used_days: "0.00",
        pending_days: "0.00",
      },
      {
        id: uid(237),
        personnel_id: PERSON_SITI,
        leave_type: "OTHER",
        entitlement_days: "5.00",
        used_days: "0.00",
        pending_days: "0.00",
      },
    ];

    for (const balance of leaveBalances) {
      await upsert(client, "payroll.leave_balances", {
        ...balance,
        tenant_id: T_SAU,
        year: 2026,
      });
    }

    const overtimeRequests = [
      {
        id: uid(231),
        work_date: "2026-11-05",
        hours: "2.00",
        reason: "Penutupan laporan bulanan",
      },
      {
        id: uid(232),
        work_date: "2026-11-12",
        hours: "2.00",
        reason: "Rekonsiliasi data klaim",
      },
    ];

    for (const overtime of overtimeRequests) {
      await upsert(client, "payroll.overtime_requests", {
        ...overtime,
        tenant_id: T_SAU,
        personnel_id: PERSON_SITI,
        status: "APPROVED",
        decided_by: U_BRANCH_BDG,
        decided_at: "2026-11-13T09:00:00.000Z",
        decision_notes: "Disetujui sesuai kebutuhan operasional",
        created_by: U_EMPLOYEE,
      });
    }

    await upsert(client, "payroll.reimbursements", {
      id: REIMB_SITI,
      tenant_id: T_SAU,
      personnel_id: PERSON_SITI,
      category: "TRANSPORT",
      expense_date: "2026-11-18",
      amount: "150000.00",
      description: "Perjalanan dinas Bandung",
      receipt_url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf",
      receipt_public_id: "demo/reimbursement-receipt",
      status: "PENDING",
      created_by: U_EMPLOYEE,
    });

    await upsert(client, "claims.submissions", {
      id: CLAIM_A,
      tenant_id: T_SAU,
      claim_number: "CLM-SAU-202610-000001",
      branch_id: BR_BDG,
      policy_version_id: P_CLAIMS_OLD,
      claimant_name: "Andi Wijaya",
      claimant_nik_hash: hashNik("3273000000000011"),
      claimant_nik_masked: "3273********0011",
      bank_account_hash: hashBank("1112223334"),
      bank_account_masked: "******3334",
      claim_category: "HEALTH",
      requested_amount: "5000000.00",
      approved_amount: "5000000.00",
      risk_score: 20,
      risk_evaluated_at: "2026-10-05T10:00:00.000Z",
      has_conflict_flag: false,
      status: "APPROVED",
      created_by: U_OFFICER_BDG,
      idempotency_key: "seed-claim-a",
      submitted_at: "2026-10-05T09:30:00.000Z",
      finalized_at: "2026-10-06T09:00:00.000Z",
    });
    await upsert(client, "claims.submissions", {
      id: CLAIM_B,
      tenant_id: T_SAU,
      claim_number: "CLM-SAU-202611-000002",
      branch_id: BR_BDG,
      policy_version_id: P_CLAIMS_ACTIVE,
      claimant_name: "Rizky Pratama",
      claimant_nik_hash: hashNik("3273000000000012"),
      claimant_nik_masked: "3273********0012",
      bank_account_hash: hashBank("9998887776"),
      bank_account_masked: "******7776",
      claim_category: "ACCIDENT",
      requested_amount: "18500000.00",
      risk_score: 75,
      risk_evaluated_at: "2026-11-02T11:00:00.000Z",
      has_conflict_flag: true,
      status: "COMPLIANCE_REVIEW",
      created_by: U_OFFICER_BDG,
      idempotency_key: "seed-claim-b",
      submitted_at: "2026-11-02T10:00:00.000Z",
    });
    await upsert(client, "claims.submissions", {
      id: CLAIM_C,
      tenant_id: T_SAU,
      claim_number: "CLM-SAU-202611-000003",
      branch_id: BR_BDG,
      policy_version_id: P_CLAIMS_ACTIVE,
      claimant_name: "Maya Sari",
      claimant_nik_hash: hashNik("3273000000000013"),
      claimant_nik_masked: "3273********0013",
      bank_account_hash: hashBank("5556667778"),
      bank_account_masked: "******7778",
      claim_category: "PROPERTY",
      requested_amount: "3000000.00",
      risk_score: 0,
      has_conflict_flag: false,
      status: "DRAFT",
      created_by: U_OFFICER_BDG,
      idempotency_key: "seed-claim-c",
    });

    await upsert(client, "claims.documents", {
      id: DOC_A_ID,
      tenant_id: T_SAU,
      claim_id: CLAIM_A,
      document_type: "IDENTITY_CARD",
      cloudinary_public_id: "aletheia/demo/claim-a-id",
      secure_url: "https://res.cloudinary.com/demo/image/upload/claim-a-id.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 128000,
      uploaded_by: U_OFFICER_BDG,
    });
    await upsert(client, "claims.documents", {
      id: DOC_A_INVOICE,
      tenant_id: T_SAU,
      claim_id: CLAIM_A,
      document_type: "MEDICAL_INVOICE",
      cloudinary_public_id: "aletheia/demo/claim-a-invoice",
      secure_url: "https://res.cloudinary.com/demo/image/upload/claim-a-invoice.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 256000,
      uploaded_by: U_OFFICER_BDG,
    });
    await upsert(client, "claims.documents", {
      id: DOC_B_ID,
      tenant_id: T_SAU,
      claim_id: CLAIM_B,
      document_type: "IDENTITY_CARD",
      cloudinary_public_id: "aletheia/demo/claim-b-id",
      secure_url: "https://res.cloudinary.com/demo/image/upload/claim-b-id.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 120000,
      uploaded_by: U_OFFICER_BDG,
    });
    await upsert(client, "claims.documents", {
      id: DOC_B_INVOICE,
      tenant_id: T_SAU,
      claim_id: CLAIM_B,
      document_type: "POLICE_REPORT",
      cloudinary_public_id: "aletheia/demo/claim-b-police",
      secure_url: "https://res.cloudinary.com/demo/image/upload/claim-b-police.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 180000,
      uploaded_by: U_OFFICER_BDG,
    });

    await upsert(client, "claims.approval_steps", {
      id: APPROVAL_A,
      tenant_id: T_SAU,
      claim_id: CLAIM_A,
      step_level: 1,
      approver_id: U_BRANCH_BDG,
      decision: "APPROVED",
      reason_notes: "Dokumen lengkap dan nominal dalam batas kewenangan cabang",
      decided_at: "2026-10-06T09:00:00.000Z",
    });

    await upsert(client, "claims.disbursements", {
      id: DISBURSEMENT_A,
      tenant_id: T_SAU,
      claim_id: CLAIM_A,
      policy_version_id: P_CLAIMS_OLD,
      provider: "MOCK",
      provider_reference: "MOCK-CLAIM-A",
      amount: "5000000.00",
      status: "PAID",
      idempotency_key: "seed-disbursement-a",
      requested_by: U_FINANCE,
      approved_by: U_FINANCE,
      requested_at: "2026-10-06T10:00:00.000Z",
      paid_at: "2026-10-06T10:01:00.000Z",
    });

    await upsert(client, "analytics.anomaly_flags", {
      id: ANOMALY_B,
      tenant_id: T_SAU,
      claim_id: CLAIM_B,
      matched_personnel_id: AGENT_AGUS,
      conflict_type: "SHARED_BANK_ACCOUNT",
      severity: "CRITICAL",
      evidence_summary: {
        matched_field: "bank_account_hash",
        matched_personnel_code: "AGT-BDG-001",
        policy_version_tag: "v2026.11.01",
      },
      resolution_status: "OPEN",
    });

    await upsert(client, "payroll.batches", {
      id: BATCH_NOV,
      tenant_id: T_SAU,
      batch_code: "PAY-SAU-202611-BDG01",
      branch_id: BR_BDG,
      period_month: "2026-11-01",
      batch_type: "REGULAR",
      correction_seq: 0,
      period_start: "2026-11-01",
      period_end: "2026-11-30",
      calculated_at: "2026-11-22T09:00:00.000Z",
      calculation_version: "v1",
      policy_version_id: P_PAYROLL_ACTIVE,
      status: "DISBURSED",
      total_gross_amount: "31000000.00",
      total_tax_pph21: "740000.00",
      total_bpjs_deduction: "750423.00",
      total_bpjs_employer: "1926446.00",
      total_net_disbursed: "29509577.00",
      headcount: 3,
      created_by: U_HR,
      approved_by: U_FINANCE,
      approved_at: "2026-11-23T09:00:00.000Z",
      idempotency_key: "seed-batch-nov",
      disbursed_at: "2026-11-24T09:00:00.000Z",
    });

    const breakdownSiti = {
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
    };

    const breakdownBudi = {
      policy_version_tag: "v2026.11.01",
      ptkp_status: "TK/0",
      ter_category: "CATEGORY_A",
      applied_ter_rate: "0.0100",
      ter_base: "8000000.00",
      gross_components: {
        base_salary: "7000000.00",
        fixed_allowance: "1000000.00",
        variable_allowance: "0.00",
        overtime_pay: "0.00",
        agent_commission: "0.00",
      },
      deduction_components: {
        bpjs_kesehatan: "80000.00",
        bpjs_jht: "160000.00",
        bpjs_jp: "80000.00",
        pph21_tax: "100000.00",
      },
      employer_components: {
        bpjs_kesehatan: "320000.00",
        bpjs_jht: "296000.00",
        bpjs_jp: "160000.00",
        bpjs_jkk: "19200.00",
        bpjs_jkm: "24000.00",
      },
      net_take_home_pay: "7580000.00",
      rounding_adjustment: "0.00",
    };

    const breakdownAgus = {
      policy_version_tag: "v2026.11.01",
      ptkp_status: "TK/0",
      ter_category: "CATEGORY_A",
      applied_ter_rate: "0.0350",
      ter_base: "12000000.00",
      gross_components: {
        base_salary: "4000000.00",
        fixed_allowance: "0.00",
        variable_allowance: "0.00",
        overtime_pay: "0.00",
        agent_commission: "8000000.00",
      },
      deduction_components: {
        bpjs_kesehatan: "0.00",
        bpjs_jht: "0.00",
        bpjs_jp: "0.00",
        pph21_tax: "420000.00",
      },
      employer_components: {
        bpjs_kesehatan: "0.00",
        bpjs_jht: "0.00",
        bpjs_jp: "0.00",
        bpjs_jkk: "0.00",
        bpjs_jkm: "0.00",
      },
      net_take_home_pay: "11580000.00",
      rounding_adjustment: "0.00",
    };

    await upsert(client, "payroll.items", {
      id: ITEM_SITI,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: PERSON_SITI,
      gross_income: "11000000.00",
      variable_allowance: "0.00",
      overtime_pay: "0.00",
      agent_commission: "0.00",
      unpaid_leave_deduction: "0.00",
      absence_deduction: "0.00",
      bpjs_kesehatan_deduction: "110000.00",
      bpjs_ketenagakerjaan_deduction: "320423.00",
      bpjs_jht_deduction: "220000.00",
      bpjs_jp_deduction: "100423.00",
      bpjs_kesehatan_employer: "440000.00",
      bpjs_jht_employer: "407000.00",
      bpjs_jp_employer: "200846.00",
      bpjs_jkk_employer: "26400.00",
      bpjs_jkm_employer: "33000.00",
      pph21_tax_deduction: "220000.00",
      net_take_home_pay: "10349577.00",
      taxable_income: "11000000.00",
      ytd_gross: "121000000.00",
      ytd_tax: "2420000.00",
      payment_status: "PAID",
      payment_intent_id: PAYMENT_SITI,
      calculation_breakdown: breakdownSiti,
    });
    await upsert(client, "payroll.items", {
      id: ITEM_BUDI,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: PERSON_BUDI,
      gross_income: "8000000.00",
      variable_allowance: "0.00",
      overtime_pay: "0.00",
      agent_commission: "0.00",
      unpaid_leave_deduction: "0.00",
      absence_deduction: "0.00",
      bpjs_kesehatan_deduction: "80000.00",
      bpjs_ketenagakerjaan_deduction: "240000.00",
      bpjs_jht_deduction: "160000.00",
      bpjs_jp_deduction: "80000.00",
      bpjs_kesehatan_employer: "320000.00",
      bpjs_jht_employer: "296000.00",
      bpjs_jp_employer: "160000.00",
      bpjs_jkk_employer: "19200.00",
      bpjs_jkm_employer: "24000.00",
      pph21_tax_deduction: "100000.00",
      net_take_home_pay: "7580000.00",
      taxable_income: "8000000.00",
      ytd_gross: "88000000.00",
      ytd_tax: "1100000.00",
      payment_status: "PAID",
      payment_intent_id: PAYMENT_BUDI,
      calculation_breakdown: breakdownBudi,
    });
    await upsert(client, "payroll.items", {
      id: ITEM_AGUS,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: AGENT_AGUS,
      gross_income: "12000000.00",
      variable_allowance: "0.00",
      overtime_pay: "0.00",
      agent_commission: "8000000.00",
      unpaid_leave_deduction: "0.00",
      absence_deduction: "0.00",
      bpjs_kesehatan_deduction: "0.00",
      bpjs_ketenagakerjaan_deduction: "0.00",
      bpjs_jht_deduction: "0.00",
      bpjs_jp_deduction: "0.00",
      bpjs_kesehatan_employer: "0.00",
      bpjs_jht_employer: "0.00",
      bpjs_jp_employer: "0.00",
      bpjs_jkk_employer: "0.00",
      bpjs_jkm_employer: "0.00",
      pph21_tax_deduction: "420000.00",
      net_take_home_pay: "11580000.00",
      taxable_income: "12000000.00",
      ytd_gross: "32000000.00",
      ytd_tax: "420000.00",
      payment_status: "PAID",
      payment_intent_id: PAYMENT_AGUS,
      calculation_breakdown: breakdownAgus,
    });

    await upsert(client, "payroll.payments", {
      id: PAYMENT_SITI,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: PERSON_SITI,
      policy_version_id: P_PAYROLL_ACTIVE,
      provider: "MOCK",
      provider_reference: "MOCK-PAY-SITI",
      amount: "10349577.00",
      status: "PAID",
      idempotency_key: "seed-pay-siti",
      attempt_no: 1,
      requested_by: U_HR,
      approved_by: U_FINANCE,
      requested_at: "2026-11-24T09:00:00.000Z",
      paid_at: "2026-11-24T09:01:00.000Z",
    });
    await upsert(client, "payroll.payments", {
      id: PAYMENT_BUDI,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: PERSON_BUDI,
      policy_version_id: P_PAYROLL_ACTIVE,
      provider: "MOCK",
      provider_reference: "MOCK-PAY-BUDI",
      amount: "7580000.00",
      status: "PAID",
      idempotency_key: "seed-pay-budi",
      attempt_no: 1,
      requested_by: U_HR,
      approved_by: U_FINANCE,
      requested_at: "2026-11-24T09:00:00.000Z",
      paid_at: "2026-11-24T09:01:00.000Z",
    });
    await upsert(client, "payroll.payments", {
      id: PAYMENT_AGUS,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: AGENT_AGUS,
      policy_version_id: P_PAYROLL_ACTIVE,
      provider: "MOCK",
      provider_reference: "MOCK-PAY-AGUS",
      amount: "11580000.00",
      status: "PAID",
      idempotency_key: "seed-pay-agus",
      attempt_no: 1,
      requested_by: U_HR,
      approved_by: U_FINANCE,
      requested_at: "2026-11-24T09:00:00.000Z",
      paid_at: "2026-11-24T09:01:00.000Z",
    });

    await upsert(client, "payroll.payslips", {
      id: PAYSLIP_SITI,
      tenant_id: T_SAU,
      batch_id: BATCH_NOV,
      personnel_id: PERSON_SITI,
      period_month: "2026-11-01",
      version: 1,
      secure_url: "https://res.cloudinary.com/demo/image/upload/payslip-siti.pdf",
      snapshot_hash_sha256: sha256("payslip-siti-snapshot"),
      file_checksum_sha256: demoPayslipChecksum,
      gross_income: "11000000.00",
      net_take_home_pay: "10349577.00",
      verification_code: "SLP-202611-001",
      published_at: "2026-11-24T09:05:00.000Z",
    });

    await upsert(client, "payroll.tax_reports", {
      id: REPORT_PPH21,
      tenant_id: T_SAU,
      report_type: "PPH21_MONTHLY",
      branch_id: BR_BDG,
      policy_version_id: P_PAYROLL_ACTIVE,
      period_start: "2026-11-01",
      period_end: "2026-11-30",
      version: 1,
      status: "READY",
      file_url: "https://res.cloudinary.com/demo/raw/upload/pph21-2026-11.csv",
      snapshot_hash_sha256: sha256("pph21-2026-11-snapshot"),
      file_checksum_sha256: demoReportChecksum,
      total_gross: "31000000.00",
      total_employee_bpjs: "750423.00",
      total_employer_bpjs: "1926446.00",
      total_pph21: "740000.00",
      total_net: "29509577.00",
      headcount: 3,
      reconciliation_delta: "0.00",
      totals: { branch_code: "BDG-01", period: "2026-11" },
      generated_by: U_FINANCE,
      generated_at: "2026-11-24T10:00:00.000Z",
    });

    await upsert(client, "payroll.generated_files", {
      id: FILE_PAYSLIP_SITI,
      tenant_id: T_SAU,
      kind: "PAYSLIP",
      entity_id: PAYSLIP_SITI,
      file_name: "payslip-siti.pdf",
      mime_type: "application/pdf",
      file_size: demoPayslipContent.length,
      content: demoPayslipContent,
      checksum_sha256: demoPayslipChecksum,
    });

    await upsert(client, "payroll.generated_files", {
      id: FILE_REPORT_PPH21,
      tenant_id: T_SAU,
      kind: "REPORT",
      entity_id: REPORT_PPH21,
      file_name: "pph21-2026-11.csv",
      mime_type: "text/csv",
      file_size: demoReportContent.length,
      content: demoReportContent,
      checksum_sha256: demoReportChecksum,
    });

    await upsert(client, "payroll.tax_reports", {
      id: REPORT_COST,
      tenant_id: T_SAU,
      report_type: "PAYROLL_COST_INVOICE",
      branch_id: BR_BDG,
      policy_version_id: P_PAYROLL_COST,
      period_start: "2026-11-01",
      period_end: "2026-11-30",
      version: 1,
      status: "READY",
      file_url: "https://res.cloudinary.com/demo/raw/upload/payroll-cost-invoice-2026-11.csv",
      snapshot_hash_sha256: sha256("payroll-cost-invoice-2026-11-snapshot"),
      file_checksum_sha256: demoCostInvoiceChecksum,
      total_gross: "31000000.00",
      total_employee_bpjs: "750423.00",
      total_employer_bpjs: "1926446.00",
      total_pph21: "740000.00",
      total_net: "29509577.00",
      headcount: 3,
      reconciliation_delta: "0.00",
      totals: {
        branch_code: "BDG-01",
        period: "2026-11",
        bjo: "775000.00",
        management_fee: "1685072.30",
        total_invoice: "35387000.00",
        bjo_rate: "0.0250",
        management_fee_rate: "0.0500",
        invoice_rounding: "UP_1000",
      },
      generated_by: U_FINANCE,
      generated_at: "2026-11-24T10:05:00.000Z",
    });

    await upsert(client, "payroll.generated_files", {
      id: FILE_REPORT_COST,
      tenant_id: T_SAU,
      kind: "REPORT",
      entity_id: REPORT_COST,
      file_name: "payroll-cost-invoice-2026-11.csv",
      mime_type: "text/csv",
      file_size: demoCostInvoiceContent.length,
      content: demoCostInvoiceContent,
      checksum_sha256: demoCostInvoiceChecksum,
    });

    await upsert(client, "payroll.tax_reconciliations", {
      id: RECON_SITI,
      tenant_id: T_SAU,
      personnel_id: PERSON_SITI,
      tax_year: 2026,
      policy_version_id: P_PAYROLL_ACTIVE,
      annual_gross: "132000000.00",
      ptkp_amount: "63000000.00",
      biaya_jabatan: "6000000.00",
      deductible_contributions: "3845076.00",
      annual_tax: "2957746.20",
      ter_credits: "2640000.00",
      difference: "317746.20",
      status: "DRAFT",
      version: 1,
      created_by: U_FINANCE,
    });

    await upsert(client, "analytics.what_if_simulations", {
      id: WHATIF,
      tenant_id: T_SAU,
      simulation_name: "Kenaikan komisi agen 50 persen",
      base_policy_version_id: P_PAYROLL_ACTIVE,
      simulated_rules_payload: {
        commission_mode: "FLAT_TIER",
        agent_commission_tiers: [
          { min_sales: "0.00", max_sales: "50000000.00", commission_rate: "0.0375" },
          { min_sales: "50000000.01", max_sales: "150000000.00", commission_rate: "0.0600" },
          {
            min_sales: "150000000.01",
            max_sales: "999999999999.00",
            commission_rate: "0.0825",
          },
        ],
      },
      target_period_start: "2026-11-01",
      target_period_end: "2026-11-30",
      actual_total_cost: "31000000.00",
      simulated_total_cost: "35000000.00",
      variance_amount: "4000000.00",
      variance_percentage: "12.9032",
      impact_breakdown: { branch_code: "BDG-01", affected_items: 1 },
      created_by: U_MIS,
    });

    await appendAudit(
      client,
      AUDIT_POLICY,
      U_COMPLIANCE,
      "COMPLIANCE_ADMIN",
      "GOVERNANCE",
      "POLICY_VERSION",
      P_CLAIMS_ACTIVE,
      "POLICY_PUBLISHED",
      P_CLAIMS_ACTIVE,
      {
        version_tag: "v2026.11.01",
        approved_by: U_FINANCE,
        domain: "CLAIMS_POLICY",
      },
    );
    await appendAudit(
      client,
      AUDIT_CLAIM,
      U_BRANCH_BDG,
      "BRANCH_MANAGER",
      "CLAIMS",
      "CLAIM_SUBMISSION",
      CLAIM_A,
      "CLAIM_APPROVED",
      P_CLAIMS_OLD,
      {
        decision: "APPROVED",
        approved_amount: "5000000.00",
        risk_score: 20,
      },
    );
    await appendAudit(
      client,
      AUDIT_BATCH,
      U_FINANCE,
      "FINANCE_MANAGER",
      "PAYROLL",
      "PAYROLL_BATCH",
      BATCH_NOV,
      "BATCH_DISBURSED",
      P_PAYROLL_ACTIVE,
      {
        total_net_disbursed: "29509577.00",
        headcount: 3,
        provider: "MOCK",
      },
    );

    await client.query("REFRESH MATERIALIZED VIEW analytics.mis_monthly_kpi");
    await client.query("COMMIT");
    console.log("Seed completed");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closeAdminDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
