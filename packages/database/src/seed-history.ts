import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { PoolClient } from "pg";

/**
 * Adds a realistic 15-month operating history on top of the baseline seed.
 *
 * The generator is deterministic and idempotent: every row uses a stable UUID
 * derived from its natural key, and existing periods are skipped. Baseline
 * fixtures used by E2E tests are left untouched.
 */

const HISTORY_START = "2025-09";
const HISTORY_END = "2026-11";
const DEMO_PAYSLIP = readFileSync(new URL("../fixtures/demo-payslip.pdf", import.meta.url));
const DEMO_PAYSLIP_CHECKSUM = sha256(DEMO_PAYSLIP);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableUuid(key: string): string {
  const hex = sha256(`aletheia-demo-history:${key}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function uid(value: number): string {
  return `019361a2-7c00-7000-8000-${String(value).padStart(12, "0")}`;
}

const pepper =
  process.env.PII_PEPPER !== undefined && process.env.PII_PEPPER.length > 0
    ? process.env.PII_PEPPER
    : "aletheia-demo-pepper";
const hashNik = (nik: string) => sha256(`${pepper}:${nik}`);
const hashBank = (account: string) => sha256(`${pepper}:${account}`);

function money(value: number): string {
  return value.toFixed(2);
}

function num(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function roundTo(value: number, step = 100): number {
  return Math.round(value / step) * step;
}

function rand(key: string): number {
  const digest = createHash("sha256").update(`aletheia-demo-history:${key}`).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function between(key: string, min: number, max: number): number {
  return min + rand(key) * (max - min);
}

function pick<T>(key: string, values: readonly T[]): T {
  const value = values[Math.floor(rand(key) * values.length)];
  if (value === undefined) {
    throw new Error(`Cannot pick a value for ${key}`);
  }
  return value;
}

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

interface BranchRow {
  id: string;
  code: string;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  branch_id: string;
}

interface PersonnelRow {
  id: string;
  personnel_code: string;
  full_name: string;
  personnel_type: string;
  branch_id: string;
  base_salary: string;
  fixed_allowance: string;
  join_date: string;
  termination_date: string | null;
  is_active: boolean;
}

interface PolicyRow {
  id: string;
  domain: string;
}

interface NewPerson {
  id: string;
  code: string;
  name: string;
  branchCode: string;
  deptCode: string;
  posCode: string;
  userEmail: string | null;
  base: string;
  allowance: string;
  join: string;
  ptkp: string;
  risk: string;
  employment: string;
  bankCode: string;
  bankName: string;
  account: string;
  nikSeed: string;
  supervisorCode: string | null;
}

const DEPARTMENTS = [
  { id: uid(500), code: "FIN", name: "Finance" },
  { id: uid(501), code: "HR", name: "Human Resources" },
  { id: uid(502), code: "CLM", name: "Claims Operations" },
  { id: uid(503), code: "MIS", name: "Management Information" },
  { id: uid(504), code: "CMP", name: "Compliance" },
  { id: uid(505), code: "SLS", name: "Sales & Agency" },
  { id: uid(506), code: "OPS", name: "Operations" },
  { id: uid(507), code: "TEC", name: "Technology" },
] as const;

const POSITIONS = [
  { id: uid(510), code: "MGR", name: "Manager", level: "MANAGER" },
  { id: uid(511), code: "OFC", name: "Officer", level: "STAFF" },
  { id: uid(512), code: "ANL", name: "Analyst", level: "STAFF" },
  { id: uid(513), code: "SPC", name: "Specialist", level: "STAFF" },
  { id: uid(514), code: "DIR", name: "Director", level: "DIRECTOR" },
  { id: uid(515), code: "SPV", name: "Supervisor", level: "SUPERVISOR" },
] as const;

const NEW_PEOPLE: NewPerson[] = [
  {
    id: uid(600),
    code: "EMP-JKT-FIN-001",
    name: "Arif Nugroho",
    branchCode: "JKT-HQ",
    deptCode: "FIN",
    posCode: "MGR",
    userEmail: "finance.vp@aletheia.id",
    base: "22000000.00",
    allowance: "5000000.00",
    join: "2021-11-01",
    ptkp: "K/2",
    risk: "III",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002201",
    nikSeed: "0201",
    supervisorCode: null,
  },
  {
    id: uid(601),
    code: "EMP-JKT-FIN-002",
    name: "Bambang Sutrisno",
    branchCode: "JKT-HQ",
    deptCode: "FIN",
    posCode: "DIR",
    userEmail: null,
    base: "32000000.00",
    allowance: "8000000.00",
    join: "2020-02-03",
    ptkp: "K/3",
    risk: "IV",
    employment: "PERMANENT",
    bankCode: "Mandiri",
    bankName: "Bank Mandiri",
    account: "1110002202",
    nikSeed: "0202",
    supervisorCode: null,
  },
  {
    id: uid(602),
    code: "EMP-JKT-FIN-003",
    name: "Maya Kusuma",
    branchCode: "JKT-HQ",
    deptCode: "FIN",
    posCode: "OFC",
    userEmail: null,
    base: "8500000.00",
    allowance: "1500000.00",
    join: "2023-04-10",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "1110002203",
    nikSeed: "0203",
    supervisorCode: "EMP-JKT-FIN-001",
  },
  {
    id: uid(603),
    code: "EMP-JKT-MIS-001",
    name: "Nadia Putri",
    branchCode: "JKT-HQ",
    deptCode: "MIS",
    posCode: "ANL",
    userEmail: "mis.analyst@aletheia.id",
    base: "12000000.00",
    allowance: "2500000.00",
    join: "2024-06-03",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002204",
    nikSeed: "0204",
    supervisorCode: null,
  },
  {
    id: uid(604),
    code: "EMP-JKT-CMP-001",
    name: "Hendra Wijaya",
    branchCode: "JKT-HQ",
    deptCode: "CMP",
    posCode: "MGR",
    userEmail: "compliance@aletheia.id",
    base: "20000000.00",
    allowance: "4500000.00",
    join: "2022-01-10",
    ptkp: "K/1",
    risk: "III",
    employment: "PERMANENT",
    bankCode: "BRI",
    bankName: "Bank Rakyat Indonesia",
    account: "1110002205",
    nikSeed: "0205",
    supervisorCode: null,
  },
  {
    id: uid(605),
    code: "EMP-JKT-HR-001",
    name: "Rahmat Hidayat",
    branchCode: "JKT-HQ",
    deptCode: "HR",
    posCode: "SPC",
    userEmail: "hr.ops@aletheia.id",
    base: "14000000.00",
    allowance: "3000000.00",
    join: "2023-05-02",
    ptkp: "K/2",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002206",
    nikSeed: "0206",
    supervisorCode: null,
  },
  {
    id: uid(606),
    code: "EMP-JKT-CLM-001",
    name: "Rangga Saputra",
    branchCode: "JKT-HQ",
    deptCode: "CLM",
    posCode: "OFC",
    userEmail: "officer.jkt@aletheia.id",
    base: "8000000.00",
    allowance: "1500000.00",
    join: "2024-09-02",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "1110002207",
    nikSeed: "0207",
    supervisorCode: null,
  },
  {
    id: uid(607),
    code: "EMP-JKT-TEC-001",
    name: "Fajar Ramadhan",
    branchCode: "JKT-HQ",
    deptCode: "TEC",
    posCode: "MGR",
    userEmail: null,
    base: "24000000.00",
    allowance: "4000000.00",
    join: "2022-08-01",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002208",
    nikSeed: "0208",
    supervisorCode: null,
  },
  {
    id: uid(608),
    code: "EMP-JKT-TEC-002",
    name: "Intan Permata",
    branchCode: "JKT-HQ",
    deptCode: "TEC",
    posCode: "OFC",
    userEmail: null,
    base: "11000000.00",
    allowance: "2000000.00",
    join: "2024-03-04",
    ptkp: "TK/0",
    risk: "I",
    employment: "PERMANENT",
    bankCode: "Mandiri",
    bankName: "Bank Mandiri",
    account: "1110002209",
    nikSeed: "0209",
    supervisorCode: "EMP-JKT-TEC-001",
  },
  {
    id: uid(609),
    code: "EMP-JKT-OPS-001",
    name: "Rudi Hartono",
    branchCode: "JKT-HQ",
    deptCode: "OPS",
    posCode: "MGR",
    userEmail: null,
    base: "18000000.00",
    allowance: "3500000.00",
    join: "2021-05-17",
    ptkp: "K/2",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BRI",
    bankName: "Bank Rakyat Indonesia",
    account: "1110002210",
    nikSeed: "0210",
    supervisorCode: null,
  },
  {
    id: uid(610),
    code: "EMP-JKT-OPS-002",
    name: "Sri Wahyuni",
    branchCode: "JKT-HQ",
    deptCode: "OPS",
    posCode: "SPV",
    userEmail: null,
    base: "10000000.00",
    allowance: "2000000.00",
    join: "2023-02-06",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002211",
    nikSeed: "0211",
    supervisorCode: "EMP-JKT-OPS-001",
  },
  {
    id: uid(611),
    code: "EMP-JKT-SLS-001",
    name: "Andi Prakoso",
    branchCode: "JKT-HQ",
    deptCode: "SLS",
    posCode: "MGR",
    userEmail: null,
    base: "16000000.00",
    allowance: "3000000.00",
    join: "2022-07-11",
    ptkp: "K/2",
    risk: "III",
    employment: "PERMANENT",
    bankCode: "Mandiri",
    bankName: "Bank Mandiri",
    account: "1110002212",
    nikSeed: "0212",
    supervisorCode: null,
  },
  {
    id: uid(612),
    code: "EMP-JKT-SLS-002",
    name: "Nabila Zahra",
    branchCode: "JKT-HQ",
    deptCode: "SLS",
    posCode: "OFC",
    userEmail: null,
    base: "9000000.00",
    allowance: "1500000.00",
    join: "2024-10-07",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "1110002213",
    nikSeed: "0213",
    supervisorCode: "EMP-JKT-SLS-001",
  },
  {
    id: uid(613),
    code: "EMP-BDG-CLM-001",
    name: "Yuni Kartika",
    branchCode: "BDG-01",
    deptCode: "CLM",
    posCode: "MGR",
    userEmail: "manager.bdg@aletheia.id",
    base: "17000000.00",
    allowance: "3500000.00",
    join: "2022-03-14",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "2220003301",
    nikSeed: "0301",
    supervisorCode: null,
  },
  {
    id: uid(614),
    code: "EMP-BDG-CLM-002",
    name: "Dian Permata",
    branchCode: "BDG-01",
    deptCode: "CLM",
    posCode: "OFC",
    userEmail: "officer.bdg@aletheia.id",
    base: "8500000.00",
    allowance: "1500000.00",
    join: "2024-02-05",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "2220003302",
    nikSeed: "0302",
    supervisorCode: "EMP-BDG-CLM-001",
  },
  {
    id: uid(615),
    code: "EMP-BDG-FIN-001",
    name: "Wulan Sari",
    branchCode: "BDG-01",
    deptCode: "FIN",
    posCode: "OFC",
    userEmail: null,
    base: "8000000.00",
    allowance: "1200000.00",
    join: "2023-09-04",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BRI",
    bankName: "Bank Rakyat Indonesia",
    account: "2220003303",
    nikSeed: "0303",
    supervisorCode: null,
  },
  {
    id: uid(616),
    code: "EMP-BDG-OPS-001",
    name: "Iwan Setiawan",
    branchCode: "BDG-01",
    deptCode: "OPS",
    posCode: "OFC",
    userEmail: null,
    base: "7500000.00",
    allowance: "1200000.00",
    join: "2024-01-08",
    ptkp: "K/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "2220003304",
    nikSeed: "0304",
    supervisorCode: null,
  },
  {
    id: uid(617),
    code: "EMP-BDG-CMP-001",
    name: "Mega Puspita",
    branchCode: "BDG-01",
    deptCode: "CMP",
    posCode: "OFC",
    userEmail: null,
    base: "8500000.00",
    allowance: "1500000.00",
    join: "2023-11-06",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "2220003305",
    nikSeed: "0305",
    supervisorCode: null,
  },
  {
    id: uid(618),
    code: "EMP-BDG-SLS-001",
    name: "Taufik Hidayat",
    branchCode: "BDG-01",
    deptCode: "SLS",
    posCode: "OFC",
    userEmail: null,
    base: "8000000.00",
    allowance: "1400000.00",
    join: "2024-05-06",
    ptkp: "K/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "Mandiri",
    bankName: "Bank Mandiri",
    account: "2220003306",
    nikSeed: "0306",
    supervisorCode: null,
  },
  {
    id: uid(619),
    code: "EMP-SBY-CLM-001",
    name: "Lestari Wulandari",
    branchCode: "SBY-01",
    deptCode: "CLM",
    posCode: "OFC",
    userEmail: "officer.sby@aletheia.id",
    base: "8500000.00",
    allowance: "1500000.00",
    join: "2023-08-07",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "3330004401",
    nikSeed: "0401",
    supervisorCode: null,
  },
  {
    id: uid(620),
    code: "EMP-SBY-CLM-002",
    name: "Dimas Saputra",
    branchCode: "SBY-01",
    deptCode: "CLM",
    posCode: "SPV",
    userEmail: null,
    base: "10500000.00",
    allowance: "2000000.00",
    join: "2022-09-05",
    ptkp: "K/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "3330004402",
    nikSeed: "0402",
    supervisorCode: null,
  },
  {
    id: uid(621),
    code: "EMP-SBY-OPS-001",
    name: "Surya Wijaya",
    branchCode: "SBY-01",
    deptCode: "OPS",
    posCode: "MGR",
    userEmail: null,
    base: "17000000.00",
    allowance: "3200000.00",
    join: "2021-04-12",
    ptkp: "K/2",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BRI",
    bankName: "Bank Rakyat Indonesia",
    account: "3330004403",
    nikSeed: "0403",
    supervisorCode: null,
  },
  {
    id: uid(622),
    code: "EMP-SBY-OPS-002",
    name: "Fitri Handayani",
    branchCode: "SBY-01",
    deptCode: "OPS",
    posCode: "OFC",
    userEmail: null,
    base: "7500000.00",
    allowance: "1200000.00",
    join: "2024-04-01",
    ptkp: "TK/0",
    risk: "I",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "3330004404",
    nikSeed: "0404",
    supervisorCode: "EMP-SBY-OPS-001",
  },
  {
    id: uid(623),
    code: "EMP-SBY-FIN-001",
    name: "Ayu Lestari",
    branchCode: "SBY-01",
    deptCode: "FIN",
    posCode: "OFC",
    userEmail: null,
    base: "8000000.00",
    allowance: "1300000.00",
    join: "2024-07-08",
    ptkp: "TK/0",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "Mandiri",
    bankName: "Bank Mandiri",
    account: "3330004405",
    nikSeed: "0405",
    supervisorCode: null,
  },
  {
    id: uid(624),
    code: "EMP-SBY-TEC-001",
    name: "Reza Maulana",
    branchCode: "SBY-01",
    deptCode: "TEC",
    posCode: "OFC",
    userEmail: null,
    base: "11000000.00",
    allowance: "1800000.00",
    join: "2023-06-05",
    ptkp: "K/0",
    risk: "I",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "3330004406",
    nikSeed: "0406",
    supervisorCode: null,
  },
  {
    id: uid(625),
    code: "EMP-JKT-CLM-002",
    name: "Aditya Pranoto",
    branchCode: "JKT-HQ",
    deptCode: "CLM",
    posCode: "MGR",
    userEmail: "manager.jkt@aletheia.id",
    base: "17500000.00",
    allowance: "3500000.00",
    join: "2021-10-04",
    ptkp: "K/2",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BCA",
    bankName: "Bank Central Asia",
    account: "1110002214",
    nikSeed: "0214",
    supervisorCode: null,
  },
  {
    id: uid(626),
    code: "EMP-SBY-CLM-003",
    name: "Ratna Sari",
    branchCode: "SBY-01",
    deptCode: "CLM",
    posCode: "MGR",
    userEmail: "manager.sby@aletheia.id",
    base: "16500000.00",
    allowance: "3300000.00",
    join: "2022-02-07",
    ptkp: "K/1",
    risk: "II",
    employment: "PERMANENT",
    bankCode: "BNI",
    bankName: "Bank Negara Indonesia",
    account: "3330004407",
    nikSeed: "0407",
    supervisorCode: null,
  },
];

const CLAIMANT_NAMES = [
  "Andi Wijaya",
  "Rizky Pratama",
  "Maya Sari",
  "Dewi Anggraini",
  "Fajar Nugraha",
  "Sinta Dewi",
  "Bayu Firmansyah",
  "Nur Aisyah",
  "Eko Prasetyo",
  "Rina Marlina",
  "Teguh Santoso",
  "Putri Wulandari",
  "Agung Laksono",
  "Lina Kusumawati",
  "Hadi Susanto",
  "Mira Handayani",
  "Yoga Pratama",
  "Sari Puspita",
  "Doni Setiawan",
  "Ayu Safitri",
  "Rudi Hartono",
  "Nia Ramadhani",
  "Slamet Riyadi",
  "Vina Oktaviani",
] as const;

const CLAIM_CATEGORIES = ["HEALTH", "ACCIDENT", "PROPERTY", "GUARANTEE"] as const;
const CLAIM_STATUSES_CLOSED = [
  "DISBURSED",
  "DISBURSED",
  "DISBURSED",
  "APPROVED",
  "REJECTED",
] as const;
const CLAIM_STATUSES_CURRENT = [
  "ESCALATED",
  "COMPLIANCE_REVIEW",
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "DRAFT",
] as const;

function monthRange(start: string, end: string): string[] {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const months: string[] = [];
  let year = startYear ?? 2025;
  let month = startMonth ?? 1;
  while (year < (endYear ?? 2026) || (year === endYear && month <= (endMonth ?? 12))) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function periodStart(month: string): string {
  return `${month}-01`;
}

function periodEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, monthNumber ?? 1, 0));
  return date.toISOString().slice(0, 10);
}

function timestamp(month: string, day: number, hour = 9): string {
  return `${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

async function ensureOrganisation(client: PoolClient, tenantId: string): Promise<void> {
  for (const department of DEPARTMENTS) {
    await upsert(client, "governance.departments", {
      id: department.id,
      tenant_id: tenantId,
      code: department.code,
      name: department.name,
    });
  }
  for (const position of POSITIONS) {
    await upsert(client, "governance.positions", {
      id: position.id,
      tenant_id: tenantId,
      code: position.code,
      name: position.name,
      job_level: position.level,
    });
  }
}

async function ensureHistoricalPolicies(
  client: PoolClient,
  tenantId: string,
): Promise<{ claims: string; payroll: string }> {
  const active = await client.query<PolicyRow>(
    `select id, domain
       from governance.policy_versions
      where tenant_id = $1
        and status = 'ACTIVE'
        and domain in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY')`,
    [tenantId],
  );
  const claims = active.rows.find((row) => row.domain === "CLAIMS_POLICY");
  const payroll = active.rows.find((row) => row.domain === "PAYROLL_TAX_POLICY");
  if (claims === undefined || payroll === undefined) {
    throw new Error("Active claims/payroll policy is required before seeding history");
  }

  const historicalClaims = stableUuid(`policy:claims:${tenantId}:2025`);
  const historicalPayroll = stableUuid(`policy:payroll:${tenantId}:2025`);
  for (const [id, sourceId, tag] of [
    [historicalClaims, claims.id, "v2025.01.01"],
    [historicalPayroll, payroll.id, "v2025.01.01"],
  ] as const) {
    await client.query(
      `insert into governance.policy_versions
         (id, tenant_id, domain, version_tag, status, rules_payload, checksum_sha256,
          effective_from, published_by, approved_by)
       select $1, tenant_id, domain, $2, 'ARCHIVED', rules_payload, checksum_sha256,
              '2025-01-01T00:00:00.000Z', published_by, approved_by
         from governance.policy_versions
        where id = $3
       on conflict (tenant_id, domain, version_tag) do nothing`,
      [id, tag, sourceId],
    );
  }
  return { claims: historicalClaims, payroll: historicalPayroll };
}

async function ensureDemoUsers(
  client: PoolClient,
  tenantId: string,
  passwordHash: string,
  branches: BranchRow[],
): Promise<void> {
  const branchByCode = new Map(branches.map((branch) => [branch.code, branch]));
  const extras = [
    {
      id: uid(29),
      branchCode: "JKT-HQ",
      employeeNumber: "SAU-0009",
      fullName: "Rangga Saputra",
      email: "officer.jkt@aletheia.id",
      role: "CLAIMS_OFFICER",
    },
    {
      id: uid(30),
      branchCode: "JKT-HQ",
      employeeNumber: "SAU-0010",
      fullName: "Aditya Pranoto",
      email: "manager.jkt@aletheia.id",
      role: "BRANCH_MANAGER",
    },
    {
      id: uid(31),
      branchCode: "SBY-01",
      employeeNumber: "SAU-0011",
      fullName: "Ratna Sari",
      email: "manager.sby@aletheia.id",
      role: "BRANCH_MANAGER",
    },
  ];

  for (const extra of extras) {
    const existing = await client.query<{ id: string }>(
      `select id from governance.users where tenant_id = $1 and email = $2`,
      [tenantId, extra.email],
    );
    if (existing.rows[0] !== undefined) {
      continue;
    }
    const branch = branchByCode.get(extra.branchCode);
    if (branch === undefined) {
      throw new Error(`Cannot resolve branch ${extra.branchCode}`);
    }
    await upsert(client, "governance.users", {
      id: extra.id,
      tenant_id: tenantId,
      branch_id: branch.id,
      employee_number: extra.employeeNumber,
      full_name: extra.fullName,
      email: extra.email,
      password_hash: passwordHash,
      mfa_enabled: false,
      role: extra.role,
      is_active: true,
    });
  }
}

async function ensurePersonnel(
  client: PoolClient,
  tenantId: string,
  branches: BranchRow[],
  users: UserRow[],
): Promise<void> {
  const branchByCode = new Map<string, BranchRow>(branches.map((branch) => [branch.code, branch]));
  const departmentByCode = new Map<string, (typeof DEPARTMENTS)[number]>(
    DEPARTMENTS.map((department) => [department.code, department]),
  );
  const positionByCode = new Map<string, (typeof POSITIONS)[number]>(
    POSITIONS.map((position) => [position.code, position]),
  );
  const userByEmail = new Map<string, UserRow>(users.map((user) => [user.email, user]));

  for (const person of NEW_PEOPLE) {
    const branch = branchByCode.get(person.branchCode);
    const department = departmentByCode.get(person.deptCode);
    const position = positionByCode.get(person.posCode);
    if (branch === undefined || department === undefined || position === undefined) {
      throw new Error(`Cannot resolve organisation for ${person.code}`);
    }
    const user = person.userEmail === null ? undefined : userByEmail.get(person.userEmail);
    const nik = `31710000${person.nikSeed.padStart(8, "0")}`;
    await upsert(client, "payroll.personnel", {
      id: person.id,
      tenant_id: tenantId,
      branch_id: branch.id,
      department_id: department.id,
      position_id: position.id,
      supervisor_id: null,
      user_id: user?.id ?? null,
      personnel_code: person.code,
      personnel_type: "EMPLOYEE",
      full_name: person.name,
      nik_hash: hashNik(nik),
      nik_masked: `3171********${nik.slice(-4)}`,
      bank_account_hash: hashBank(person.account),
      bank_account_masked: `******${person.account.slice(-4)}`,
      bank_code: person.bankCode,
      bank_name: person.bankName,
      ptkp_status: person.ptkp,
      risk_class: person.risk,
      employment_status: person.employment,
      base_salary: person.base,
      fixed_allowance: person.allowance,
      join_date: person.join,
      is_active: true,
    });
  }

  const codeToId = new Map(NEW_PEOPLE.map((person) => [person.code, person.id]));
  for (const person of NEW_PEOPLE) {
    if (person.supervisorCode === null) {
      continue;
    }
    const supervisorId = codeToId.get(person.supervisorCode);
    if (supervisorId !== undefined) {
      await client.query(`update payroll.personnel set supervisor_id = $1 where id = $2`, [
        supervisorId,
        person.id,
      ]);
    }
  }
}

async function loadPersonnel(client: PoolClient, tenantId: string): Promise<PersonnelRow[]> {
  const result = await client.query<PersonnelRow>(
    `select id, personnel_code, full_name, personnel_type, branch_id,
            base_salary, fixed_allowance, join_date::text as join_date,
            termination_date::text as termination_date, is_active
       from payroll.personnel
      where tenant_id = $1
      order by personnel_code`,
    [tenantId],
  );
  return result.rows;
}

function pickClaimStatus(month: string, branchCode: string, index: number): string {
  return month === HISTORY_END
    ? pick(`claim-status:${month}:${branchCode}:${index}`, CLAIM_STATUSES_CURRENT)
    : pick(`claim-status:${month}:${branchCode}:${index}`, CLAIM_STATUSES_CLOSED);
}

function claimAmount(month: string, branchCode: string, index: number): number {
  const category = pick(`claim-category:${month}:${branchCode}:${index}`, CLAIM_CATEGORIES);
  const base = between(`claim-amount:${month}:${branchCode}:${index}`, 1_500_000, 25_000_000);
  const multiplier = category === "GUARANTEE" ? 1.8 : category === "PROPERTY" ? 1.3 : 1;
  return roundTo(base * multiplier, 100_000);
}

async function seedClaims(
  client: PoolClient,
  tenantId: string,
  branches: BranchRow[],
  users: UserRow[],
  claimsPolicyId: string,
  historicalClaimsPolicyId: string,
  financeUserId: string,
  branchManagerIds: Map<string, string>,
  claimsOfficerIds: Map<string, string>,
): Promise<void> {
  const months = monthRange(HISTORY_START, HISTORY_END);
  const bankAccounts = Array.from(
    { length: 40 },
    (_, index) => `880000${String(index).padStart(4, "0")}`,
  );

  for (const [monthIndex, month] of months.entries()) {
    for (const [branchIndex, branch] of branches.entries()) {
      const officerId = claimsOfficerIds.get(branch.code);
      const managerId = branchManagerIds.get(branch.code);
      if (officerId === undefined || managerId === undefined) {
        continue;
      }
      const perMonth = 6;
      for (let index = 0; index < perMonth; index += 1) {
        const status =
          month === HISTORY_END
            ? (CLAIM_STATUSES_CURRENT[index % CLAIM_STATUSES_CURRENT.length] ?? "SUBMITTED")
            : (pickClaimStatus(month, branch.code, index) as string);
        if (status === "DRAFT" && month !== HISTORY_END) {
          continue;
        }
        const sequence = 100 + monthIndex * 100 + branchIndex * 10 + index;
        const claimNumber = `CLM-SAU-${month.replace("-", "")}-${String(sequence).padStart(6, "0")}`;
        const requested = claimAmount(month, branch.code, index);
        const approved =
          status === "APPROVED" || status === "DISBURSED"
            ? roundTo(
                requested * between(`approved:${month}:${branch.code}:${index}`, 0.65, 1),
                100_000,
              )
            : null;
        const riskScore = Math.floor(between(`risk:${month}:${branch.code}:${index}`, 5, 92));
        const conflict =
          riskScore >= 78 && rand(`conflict:${month}:${branch.code}:${index}`) > 0.55;
        const createdDay = 3 + index * 3;
        const submittedAt = timestamp(month, createdDay, 9);
        const finalizedAt =
          status === "APPROVED" || status === "DISBURSED" || status === "REJECTED"
            ? timestamp(month, Math.min(createdDay + 2, 27), 15)
            : null;
        const category = pick(`claim-category:${month}:${branch.code}:${index}`, CLAIM_CATEGORIES);
        const bankAccount =
          bankAccounts[(index + branch.code.length) % bankAccounts.length] ?? "8800000000";
        const claimId = stableUuid(`claim:${branch.code}:${month}:${index}`);
        const claimantName = pick(`claimant:${month}:${branch.code}:${index}`, CLAIMANT_NAMES);

        await upsert(client, "claims.submissions", {
          id: claimId,
          tenant_id: tenantId,
          claim_number: claimNumber,
          branch_id: branch.id,
          policy_version_id: month === HISTORY_END ? claimsPolicyId : historicalClaimsPolicyId,
          claimant_name: claimantName,
          claimant_nik_hash: hashNik(`31710000${month.replace("-", "")}${branch.code}${index}`),
          claimant_nik_masked: "3171********00" + String(index + 1).padStart(2, "0"),
          bank_account_hash: hashBank(bankAccount),
          bank_account_masked: `******${bankAccount.slice(-4)}`,
          claim_category: category,
          requested_amount: money(requested),
          approved_amount: approved === null ? null : money(approved),
          risk_score: riskScore,
          risk_evaluated_at: timestamp(month, Math.min(createdDay + 1, 27), 8),
          has_conflict_flag: conflict,
          status,
          compliance_reviewed_by:
            status === "COMPLIANCE_REVIEW"
              ? (users.find((user) => user.role === "COMPLIANCE_ADMIN")?.id ?? null)
              : null,
          compliance_reviewed_at:
            status === "COMPLIANCE_REVIEW"
              ? timestamp(month, Math.min(createdDay + 1, 27), 14)
              : null,
          created_by: officerId,
          idempotency_key: `seed-history-claim-${branch.code}-${month}-${index}`,
          submitted_at: status === "DRAFT" ? null : submittedAt,
          finalized_at: finalizedAt,
          created_at: submittedAt,
          updated_at: finalizedAt ?? submittedAt,
        });

        if (status === "APPROVED" || status === "DISBURSED") {
          await upsert(client, "claims.approval_steps", {
            id: stableUuid(`approval:${branch.code}:${month}:${index}`),
            tenant_id: tenantId,
            claim_id: claimId,
            step_level: 1,
            approver_id: managerId,
            decision: "APPROVED",
            reason_notes: "Dokumen lengkap dan nominal sesuai kewenangan cabang.",
            decided_at: finalizedAt ?? submittedAt,
          });
        }
        if (status === "DISBURSED") {
          await upsert(client, "claims.disbursements", {
            id: stableUuid(`disbursement:${branch.code}:${month}:${index}`),
            tenant_id: tenantId,
            claim_id: claimId,
            policy_version_id: month === HISTORY_END ? claimsPolicyId : historicalClaimsPolicyId,
            provider: "MOCK",
            provider_reference: `MOCK-HIST-${claimNumber}`,
            amount: money(approved ?? requested),
            status: "PAID",
            idempotency_key: `seed-history-disbursement-${branch.code}-${month}-${index}`,
            requested_by: financeUserId,
            approved_by: financeUserId,
            requested_at: finalizedAt ?? submittedAt,
            paid_at:
              finalizedAt === null ? null : timestamp(month, Math.min(createdDay + 3, 28), 10),
          });
        }
      }
    }
  }
}

async function seedPayroll(
  client: PoolClient,
  tenantId: string,
  branches: BranchRow[],
  personnel: PersonnelRow[],
  users: UserRow[],
  payrollPolicyId: string,
  historicalPayrollPolicyId: string,
  costPolicyId: string,
): Promise<void> {
  const months = monthRange(HISTORY_START, HISTORY_END);
  const hrUserId = users.find((user) => user.role === "HR_SPECIALIST")?.id;
  const financeUserId = users.find((user) => user.role === "FINANCE_MANAGER")?.id;
  if (hrUserId === undefined || financeUserId === undefined) {
    throw new Error("HR and finance users are required for payroll history");
  }

  const oneTimeRates = new Map<string, { gross: number; tax: number }>();

  for (const month of months) {
    for (const branch of branches) {
      const start = periodStart(month);
      const end = periodEnd(month);
      const existing = await client.query<{ exists: boolean }>(
        `select exists(
           select 1 from payroll.batches
            where tenant_id = $1 and branch_id = $2 and period_month = $3::date
              and batch_type = 'REGULAR' and correction_seq = 0
         ) as exists`,
        [tenantId, branch.id, start],
      );
      if (existing.rows[0]?.exists === true) {
        continue;
      }

      const active = personnel.filter(
        (person) =>
          person.branch_id === branch.id &&
          person.is_active &&
          person.join_date <= end &&
          (person.termination_date === null || person.termination_date >= start),
      );
      if (active.length === 0) {
        continue;
      }

      const batchKey = `${branch.code}:${month}`;
      const batchId = stableUuid(`batch:${batchKey}`);
      const batchCode = `PAY-SAU-${month.replace("-", "")}-${branch.code.replace("-", "")}`;
      const items: Array<Record<string, unknown>> = [];
      let totalGross = 0;
      let totalTax = 0;
      let totalBpjsEmployee = 0;
      let totalBpjsEmployer = 0;
      let totalNet = 0;

      for (const person of active) {
        const base = num(person.base_salary);
        const allowance = num(person.fixed_allowance);
        const isAgent = person.personnel_type === "SALES_AGENT";
        const variable = isAgent
          ? 0
          : roundTo(base * between(`variable:${batchKey}:${person.id}`, 0, 0.04), 10_000);
        const overtimeHours = isAgent
          ? 0
          : roundTo(between(`overtime:${batchKey}:${person.id}`, 0, 6), 1);
        const overtimePay = isAgent ? 0 : roundTo((base / 173) * overtimeHours * 1.5, 1_000);
        let commission = 0;
        if (isAgent) {
          const sales = roundTo(
            between(`sales:${batchKey}:${person.id}`, 80_000_000, 260_000_000),
            1_000_000,
          );
          commission = roundTo(sales * 0.04, 1_000);
          await upsert(client, "payroll.sales_achievements", {
            id: stableUuid(`sales:${batchKey}:${person.id}`),
            tenant_id: tenantId,
            personnel_id: person.id,
            period_month: start,
            verified_sales: money(sales),
            verification_status: "VERIFIED",
            source: "IMPORT",
            verified_by: financeUserId,
            verified_at: timestamp(month, 20, 9),
          });
        }
        const gross = base + allowance + variable + overtimePay + commission;
        const bpjsKesehatan = isAgent ? 0 : roundTo(base * 0.01);
        const bpjsJht = isAgent ? 0 : roundTo(base * 0.02);
        const bpjsJp = isAgent ? 0 : roundTo(base * 0.01);
        const bpjsEmployee = bpjsKesehatan + bpjsJht + bpjsJp;
        const bpjsKesehatanEmployer = isAgent ? 0 : roundTo(base * 0.04);
        const bpjsJhtEmployer = isAgent ? 0 : roundTo(base * 0.037);
        const bpjsJpEmployer = isAgent ? 0 : roundTo(base * 0.02);
        const bpjsJkkEmployer = isAgent ? 0 : roundTo(base * 0.0024);
        const bpjsJkmEmployer = isAgent ? 0 : roundTo(base * 0.003);
        const bpjsEmployer =
          bpjsKesehatanEmployer +
          bpjsJhtEmployer +
          bpjsJpEmployer +
          bpjsJkkEmployer +
          bpjsJkmEmployer;
        const taxRate = isAgent ? 0.035 : gross >= 10_000_000 ? 0.02 : 0.01;
        const tax = roundTo(gross * taxRate);
        const net = gross - bpjsEmployee - tax;
        const year = month.slice(0, 4);
        const ytdKey = `${person.id}:${year}`;
        const previous = oneTimeRates.get(ytdKey) ?? { gross: 0, tax: 0 };
        oneTimeRates.set(ytdKey, { gross: previous.gross + gross, tax: previous.tax + tax });

        totalGross += gross;
        totalTax += tax;
        totalBpjsEmployee += bpjsEmployee;
        totalBpjsEmployer += bpjsEmployer;
        totalNet += net;

        items.push({
          id: stableUuid(`item:${batchKey}:${person.id}`),
          tenant_id: tenantId,
          batch_id: batchId,
          personnel_id: person.id,
          gross_income: money(gross),
          variable_allowance: money(variable),
          overtime_pay: money(overtimePay),
          agent_commission: money(commission),
          unpaid_leave_deduction: "0.00",
          absence_deduction: "0.00",
          bpjs_kesehatan_deduction: money(bpjsKesehatan),
          bpjs_ketenagakerjaan_deduction: money(bpjsJht + bpjsJp),
          bpjs_jht_deduction: money(bpjsJht),
          bpjs_jp_deduction: money(bpjsJp),
          bpjs_kesehatan_employer: money(bpjsKesehatanEmployer),
          bpjs_jht_employer: money(bpjsJhtEmployer),
          bpjs_jp_employer: money(bpjsJpEmployer),
          bpjs_jkk_employer: money(bpjsJkkEmployer),
          bpjs_jkm_employer: money(bpjsJkmEmployer),
          pph21_tax_deduction: money(tax),
          net_take_home_pay: money(net),
          taxable_income: money(gross),
          ytd_gross: money(previous.gross + gross),
          ytd_tax: money(previous.tax + tax),
          payment_status: "PAID",
          calculation_breakdown: {
            policy_version_tag: month === HISTORY_END ? "v2026.11.01" : "v2025.01.01",
            ptkp_status: "TK/0",
            ter_category: isAgent ? "CATEGORY_A" : "CATEGORY_A",
            applied_ter_rate: taxRate.toFixed(4),
            ter_base: money(gross),
            gross_components: {
              base_salary: money(base),
              fixed_allowance: money(allowance),
              variable_allowance: money(variable),
              overtime_pay: money(overtimePay),
              agent_commission: money(commission),
            },
            deduction_components: {
              bpjs_kesehatan: money(bpjsKesehatan),
              bpjs_jht: money(bpjsJht),
              bpjs_jp: money(bpjsJp),
              pph21_tax: money(tax),
            },
            employer_components: {
              bpjs_kesehatan: money(bpjsKesehatanEmployer),
              bpjs_jht: money(bpjsJhtEmployer),
              bpjs_jp: money(bpjsJpEmployer),
              bpjs_jkk: money(bpjsJkkEmployer),
              bpjs_jkm: money(bpjsJkmEmployer),
            },
            net_take_home_pay: money(net),
            rounding_adjustment: "0.00",
          },
        });
      }

      await upsert(client, "payroll.batches", {
        id: batchId,
        tenant_id: tenantId,
        batch_code: batchCode,
        branch_id: branch.id,
        period_month: start,
        batch_type: "REGULAR",
        correction_seq: 0,
        period_start: start,
        period_end: end,
        calculated_at: timestamp(month, 22, 9),
        calculation_version: "v1",
        policy_version_id: month === HISTORY_END ? payrollPolicyId : historicalPayrollPolicyId,
        status: "DISBURSED",
        total_gross_amount: money(totalGross),
        total_tax_pph21: money(totalTax),
        total_bpjs_deduction: money(totalBpjsEmployee),
        total_bpjs_employer: money(totalBpjsEmployer),
        total_net_disbursed: money(totalNet),
        headcount: active.length,
        created_by: hrUserId,
        approved_by: financeUserId,
        approved_at: timestamp(month, 23, 9),
        idempotency_key: `seed-history-batch-${branch.code}-${month}`,
        disbursed_at: timestamp(month, 24, 9),
        created_at: timestamp(month, 20, 8),
      });

      for (const item of items) {
        await upsert(client, "payroll.items", item);
      }

      for (const [index, item] of items.entries()) {
        const personnelId = String(item.personnel_id);
        const gross = num(String(item.gross_income));
        const net = num(String(item.net_take_home_pay));
        const payslipId = stableUuid(`payslip:${batchKey}:${personnelId}`);
        const branchShort = branch.code.slice(0, 3);
        const verificationCode = `SLP-${branchShort}${month.replace("-", "")}${String(index + 1).padStart(2, "0")}`;
        await upsert(client, "payroll.payslips", {
          id: payslipId,
          tenant_id: tenantId,
          batch_id: batchId,
          personnel_id: personnelId,
          period_month: start,
          version: 1,
          secure_url: `https://res.cloudinary.com/demo/image/upload/payslip-${month}-${index + 1}.pdf`,
          snapshot_hash_sha256: sha256(`snapshot:${batchKey}:${personnelId}`),
          file_checksum_sha256: DEMO_PAYSLIP_CHECKSUM,
          gross_income: money(gross),
          net_take_home_pay: money(net),
          verification_code: verificationCode,
          published_at: timestamp(month, 24, 10),
        });
        await upsert(client, "payroll.generated_files", {
          id: stableUuid(`file:payslip:${batchKey}:${personnelId}`),
          tenant_id: tenantId,
          kind: "PAYSLIP",
          entity_id: payslipId,
          file_name: `payslip-${month}-${index + 1}.pdf`,
          mime_type: "application/pdf",
          file_size: DEMO_PAYSLIP.length,
          content: DEMO_PAYSLIP,
          checksum_sha256: DEMO_PAYSLIP_CHECKSUM,
        });
      }

      const reportMonth = month.replace("-", "");
      const pphReportId = stableUuid(`report:pph21:${batchKey}`);
      const pphContent = Buffer.from(
        [
          "branch_code,branch_name,period,headcount,gross,pph21,net",
          `${branch.code},${branch.name},${month},${active.length},${money(totalGross)},${money(totalTax)},${money(totalNet)}`,
        ].join("\n"),
      );
      await upsert(client, "payroll.tax_reports", {
        id: pphReportId,
        tenant_id: tenantId,
        report_type: "PPH21_MONTHLY",
        branch_id: branch.id,
        policy_version_id: month === HISTORY_END ? payrollPolicyId : historicalPayrollPolicyId,
        period_start: start,
        period_end: end,
        version: 1,
        status: "READY",
        file_url: `https://res.cloudinary.com/demo/raw/upload/pph21-${reportMonth}-${branch.code}.csv`,
        snapshot_hash_sha256: sha256(`pph21:${batchKey}`),
        file_checksum_sha256: sha256(pphContent),
        total_gross: money(totalGross),
        total_employee_bpjs: money(totalBpjsEmployee),
        total_employer_bpjs: money(totalBpjsEmployer),
        total_pph21: money(totalTax),
        total_net: money(totalNet),
        headcount: active.length,
        reconciliation_delta: "0.00",
        totals: { branch_code: branch.code, period: month },
        generated_by: financeUserId,
        generated_at: timestamp(month, 24, 10),
      });
      await upsert(client, "payroll.generated_files", {
        id: stableUuid(`file:pph21:${batchKey}`),
        tenant_id: tenantId,
        kind: "REPORT",
        entity_id: pphReportId,
        file_name: `pph21-${reportMonth}-${branch.code}.csv`,
        mime_type: "text/csv",
        file_size: pphContent.length,
        content: pphContent,
        checksum_sha256: sha256(pphContent),
      });

      const bjo = roundTo(totalGross * 0.025, 100);
      const managementFee = roundTo((totalGross + totalBpjsEmployer) * 0.05, 100);
      const totalInvoice = roundTo(totalGross + totalBpjsEmployer + bjo + managementFee, 1_000);
      const costReportId = stableUuid(`report:cost:${batchKey}`);
      const costContent = Buffer.from(
        [
          "branch_code,branch_name,headcount,gross,employer_bpjs,bjo,management_fee,total_invoice",
          `${branch.code},${branch.name},${active.length},${money(totalGross)},${money(totalBpjsEmployer)},${money(bjo)},${money(managementFee)},${money(totalInvoice)}`,
        ].join("\n"),
      );
      await upsert(client, "payroll.tax_reports", {
        id: costReportId,
        tenant_id: tenantId,
        report_type: "PAYROLL_COST_INVOICE",
        branch_id: branch.id,
        policy_version_id: costPolicyId,
        period_start: start,
        period_end: end,
        version: 1,
        status: "READY",
        file_url: `https://res.cloudinary.com/demo/raw/upload/payroll-cost-${reportMonth}-${branch.code}.csv`,
        snapshot_hash_sha256: sha256(`cost:${batchKey}`),
        file_checksum_sha256: sha256(costContent),
        total_gross: money(totalGross),
        total_employee_bpjs: money(totalBpjsEmployee),
        total_employer_bpjs: money(totalBpjsEmployer),
        total_pph21: money(totalTax),
        total_net: money(totalNet),
        headcount: active.length,
        reconciliation_delta: "0.00",
        totals: {
          branch_code: branch.code,
          period: month,
          bjo: money(bjo),
          management_fee: money(managementFee),
          total_invoice: money(totalInvoice),
          bjo_rate: "0.0250",
          management_fee_rate: "0.0500",
          invoice_rounding: "UP_1000",
        },
        generated_by: financeUserId,
        generated_at: timestamp(month, 24, 10),
      });
      await upsert(client, "payroll.generated_files", {
        id: stableUuid(`file:cost:${batchKey}`),
        tenant_id: tenantId,
        kind: "REPORT",
        entity_id: costReportId,
        file_name: `payroll-cost-${reportMonth}-${branch.code}.csv`,
        mime_type: "text/csv",
        file_size: costContent.length,
        content: costContent,
        checksum_sha256: sha256(costContent),
      });
    }
  }
}

async function seedAttendance(
  client: PoolClient,
  tenantId: string,
  personnel: PersonnelRow[],
  users: UserRow[],
): Promise<void> {
  const months = monthRange(HISTORY_START, HISTORY_END);
  const hrUserId = users.find((user) => user.role === "HR_SPECIALIST")?.id ?? null;
  for (const month of months) {
    const start = periodStart(month);
    const end = periodEnd(month);
    for (const person of personnel) {
      if (
        person.join_date > end ||
        (person.termination_date !== null && person.termination_date < start)
      ) {
        continue;
      }
      const workDate = start;
      const existing = await client.query<{ exists: boolean }>(
        `select exists(
           select 1 from payroll.attendance_summaries
            where tenant_id = $1 and personnel_id = $2 and period_month = $3::date
         ) as exists`,
        [tenantId, person.id, workDate],
      );
      if (existing.rows[0]?.exists === true) {
        continue;
      }
      const workingDays = 20 + Math.floor(between(`attendance-days:${person.id}:${month}`, 0, 4));
      const paidLeave = Math.floor(between(`attendance-paid:${person.id}:${month}`, 0, 3));
      const unpaidLeave = rand(`attendance-unpaid:${person.id}:${month}`) > 0.86 ? 1 : 0;
      const absent = rand(`attendance-absent:${person.id}:${month}`) > 0.9 ? 1 : 0;
      const present = Math.max(0, workingDays - paidLeave - unpaidLeave - absent);
      const overtime = roundTo(between(`attendance-overtime:${person.id}:${month}`, 0, 8), 1);
      await upsert(client, "payroll.attendance_summaries", {
        id: stableUuid(`attendance:${person.id}:${month}`),
        tenant_id: tenantId,
        personnel_id: person.id,
        period_month: workDate,
        working_days: workingDays,
        present_days: present,
        paid_leave_days: paidLeave,
        unpaid_leave_days: unpaidLeave,
        absent_days: absent,
        overtime_hours: overtime.toFixed(2),
        source: "IMPORT",
        approved_by: hrUserId,
        approved_at: timestamp(month, 21, 9),
      });
    }
  }
}

async function seedWorkforce(
  client: PoolClient,
  tenantId: string,
  personnel: PersonnelRow[],
  users: UserRow[],
): Promise<void> {
  const hrUserId = users.find((user) => user.role === "HR_SPECIALIST")?.id;
  const managerId = users.find((user) => user.role === "BRANCH_MANAGER")?.id;
  const employeeId = users.find((user) => user.role === "EMPLOYEE")?.id;
  if (hrUserId === undefined || managerId === undefined || employeeId === undefined) {
    return;
  }
  const candidates = personnel.filter((person) => person.personnel_type === "EMPLOYEE");
  const months = monthRange(HISTORY_START, HISTORY_END).slice(-8);

  for (const [index, month] of months.entries()) {
    const person = candidates[(index * 3) % Math.max(candidates.length, 1)];
    if (person === undefined) {
      continue;
    }
    const status =
      index < months.length - 2 ? "APPROVED" : index === months.length - 1 ? "PENDING" : "APPROVED";
    const startDay = 4 + (index % 12);
    const startDate = `${month}-${String(startDay).padStart(2, "0")}`;
    const endDate = `${month}-${String(startDay + 1).padStart(2, "0")}`;
    await upsert(client, "payroll.leave_requests", {
      id: stableUuid(`leave:${person.id}:${month}`),
      tenant_id: tenantId,
      personnel_id: person.id,
      created_by: employeeId,
      leave_type: pick(`leave-type:${person.id}:${month}`, ["ANNUAL", "SICK", "OTHER"] as const),
      start_date: startDate,
      end_date: endDate,
      days: "2.00",
      status,
      reason: pick(`leave-reason:${person.id}:${month}`, [
        "Keperluan keluarga",
        "Pemeriksaan kesehatan",
        "Urusan administrasi pribadi",
      ]),
      decided_by: status === "PENDING" ? null : managerId,
      decided_at: status === "PENDING" ? null : timestamp(month, Math.min(startDay + 2, 27), 9),
      decision_notes: status === "PENDING" ? null : "Disetujui sesuai saldo dan kebutuhan tim.",
    });

    const overtimeStatus =
      index < months.length - 3 ? "APPROVED" : index === months.length - 1 ? "PENDING" : "APPROVED";
    await upsert(client, "payroll.overtime_requests", {
      id: stableUuid(`overtime:${person.id}:${month}`),
      tenant_id: tenantId,
      personnel_id: person.id,
      work_date: `${month}-${String(Math.min(12 + index, 26)).padStart(2, "0")}`,
      hours: "2.00",
      reason: pick(`overtime-reason:${person.id}:${month}`, [
        "Penutupan laporan bulanan",
        "Rekonsiliasi data klaim",
        "Dukungan payroll periode berjalan",
      ]),
      status: overtimeStatus,
      decided_by: overtimeStatus === "PENDING" ? null : managerId,
      decided_at: overtimeStatus === "PENDING" ? null : timestamp(month, 20, 9),
      decision_notes:
        overtimeStatus === "PENDING" ? null : "Disetujui sesuai kebutuhan operasional.",
      created_by: employeeId,
    });
  }

  for (const [index, month] of months.slice(-5).entries()) {
    const person = candidates[(index * 5 + 1) % Math.max(candidates.length, 1)];
    if (person === undefined) {
      continue;
    }
    const status =
      index === months.slice(-5).length - 1 ? "PENDING" : index % 2 === 0 ? "APPROVED" : "PAID";
    const decidedBy = status === "PENDING" ? null : hrUserId;
    const paidBy =
      status === "PAID"
        ? (users.find((user) => user.role === "FINANCE_MANAGER")?.id ?? null)
        : null;
    await upsert(client, "payroll.reimbursements", {
      id: stableUuid(`reimbursement:${person.id}:${month}`),
      tenant_id: tenantId,
      personnel_id: person.id,
      category: pick(`reimbursement-category:${person.id}:${month}`, [
        "TRANSPORT",
        "MEAL",
        "MEDICAL",
        "OTHER",
      ] as const),
      expense_date: `${month}-${String(8 + index).padStart(2, "0")}`,
      amount: money(
        roundTo(between(`reimbursement-amount:${person.id}:${month}`, 75_000, 750_000), 1_000),
      ),
      description: pick(`reimbursement-description:${person.id}:${month}`, [
        "Perjalanan dinas cabang",
        "Konsumsi rapat bulanan",
        "Pembelian perlengkapan kerja",
      ]),
      receipt_url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf",
      receipt_public_id: `demo/reimbursement-${month}-${index}`,
      status,
      decided_by: decidedBy,
      decided_at: status === "PENDING" ? null : timestamp(month, 18, 9),
      decision_notes: status === "PENDING" ? null : "Sesuai kebijakan reimburse.",
      paid_by: paidBy,
      paid_at: status === "PAID" ? timestamp(month, 19, 10) : null,
      created_by: employeeId,
    });
  }
}

export async function seedDemoHistory(
  client: PoolClient,
  options: { tenantId: string; passwordHash: string },
): Promise<void> {
  const { tenantId, passwordHash } = options;
  await ensureOrganisation(client, tenantId);

  const branchesResult = await client.query<BranchRow>(
    `select id, code, name from governance.branches where tenant_id = $1 order by code`,
    [tenantId],
  );
  const branches = branchesResult.rows;

  await ensureDemoUsers(client, tenantId, passwordHash, branches);

  const usersResult = await client.query<UserRow>(
    `select id, email, role, branch_id from governance.users where tenant_id = $1`,
    [tenantId],
  );
  const users = usersResult.rows;

  await ensurePersonnel(client, tenantId, branches, users);
  const personnel = await loadPersonnel(client, tenantId);
  const policies = await ensureHistoricalPolicies(client, tenantId);
  const activePolicies = await client.query<PolicyRow>(
    `select id, domain from governance.policy_versions
      where tenant_id = $1 and status = 'ACTIVE'
        and domain in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY','PAYROLL_COST_POLICY')`,
    [tenantId],
  );
  const activeClaims = activePolicies.rows.find((row) => row.domain === "CLAIMS_POLICY");
  const activePayroll = activePolicies.rows.find((row) => row.domain === "PAYROLL_TAX_POLICY");
  const activeCost = activePolicies.rows.find((row) => row.domain === "PAYROLL_COST_POLICY");
  if (activeClaims === undefined || activePayroll === undefined || activeCost === undefined) {
    throw new Error("Active policies are required for demo history");
  }

  const financeUserId = users.find((user) => user.role === "FINANCE_MANAGER")?.id;
  const branchCodeById = new Map(branches.map((branch) => [branch.id, branch.code]));
  const branchManagerIds = new Map<string, string>();
  for (const user of users) {
    if (user.role !== "BRANCH_MANAGER") {
      continue;
    }
    const code = branchCodeById.get(user.branch_id);
    if (code !== undefined) {
      branchManagerIds.set(code, user.id);
    }
  }
  const officerByEmail = new Map(users.map((user) => [user.email, user.id]));
  const claimsOfficerIds = new Map<string, string>([
    ["BDG-01", officerByEmail.get("officer.bdg@aletheia.id") ?? ""],
    ["SBY-01", officerByEmail.get("officer.sby@aletheia.id") ?? ""],
    ["JKT-HQ", officerByEmail.get("officer.jkt@aletheia.id") ?? ""],
  ]);
  if (financeUserId === undefined) {
    throw new Error("Finance user is required for demo history");
  }
  for (const [code, id] of claimsOfficerIds) {
    if (id.length === 0) {
      throw new Error(`Claims officer is required for ${code}`);
    }
  }

  await seedClaims(
    client,
    tenantId,
    branches,
    users,
    activeClaims.id,
    policies.claims,
    financeUserId,
    branchManagerIds,
    claimsOfficerIds,
  );
  await seedPayroll(
    client,
    tenantId,
    branches,
    personnel,
    users,
    activePayroll.id,
    policies.payroll,
    activeCost.id,
  );
  await seedAttendance(client, tenantId, personnel, users);
  await seedWorkforce(client, tenantId, personnel, users);
}
