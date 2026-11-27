import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  FileWarning,
  FlaskConical,
  Gauge,
  Inbox,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ClaimSummary, PayrollBatch } from "@aletheia/shared-contracts";

import {
  actionLabel,
  currentPeriod,
  formatCompactMoney,
  formatCompactNumber,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPeriod,
  statusClass,
  statusLabel,
} from "../../shared/lib/format";
import { EmptyState, ErrorState, SkeletonTable } from "../../shared/ui";
import { useAuth } from "../auth/AuthProvider";
import { listAuditLogs, listClaims, verifyAuditChain, type AuditLogRow } from "../claims/api";
import { fetchMisDashboard, type BranchKpi } from "../mis/api";
import { listPayrollBatches } from "../payroll/api";
import { listReports } from "../reports/api";
import {
  listWorkforceLeave,
  listWorkforceOvertime,
  listWorkforceReimbursements,
} from "../workforce/api";
import { ClaimsStatusChart, MonthlyBreakdown, PayrollTrendChart, type TrendPoint } from "./charts";

type OverviewTarget =
  | "/claims"
  | "/claims/new"
  | "/approvals"
  | "/payroll"
  | "/payslips"
  | "/reports"
  | "/workforce"
  | "/me"
  | "/mis"
  | "/mis/what-if"
  | "/audit";

type Tone = "blue" | "teal" | "violet" | "amber" | "red";

interface QuickAction {
  label: string;
  to: OverviewTarget;
  icon: ReactNode;
}

interface PriorityAction {
  label: string;
  hint: string;
  count: number;
  to: OverviewTarget;
  icon: ReactNode;
  tone: Tone;
}

interface SecondaryMetric {
  label: string;
  value: string;
  meta: string;
}

interface FocusMetric {
  label: string;
  value: string | number;
  title: string;
  description: string;
  to: OverviewTarget;
  action: string;
  icon: ReactNode;
  tone: Tone;
}

interface RoleHome {
  lens: string;
  description: string;
  quickActions: QuickAction[];
  focus: FocusMetric;
  secondary: SecondaryMetric[];
  actions: PriorityAction[];
  priorityTitle: string;
  priorityDescription: string;
  chart: "claims" | "payroll";
  chartTitle: string;
  chartDescription: string;
  insight: string;
  insightTo: OverviewTarget;
  insightAction: string;
  insightIcon: ReactNode;
  detail: "claims" | "batches" | "branches" | "audit";
  detailTitle: string;
  detailDescription: string;
}

const PENDING_CLAIM_STATUSES = new Set([
  "SUBMITTED",
  "RISK_PENDING",
  "UNDER_REVIEW",
  "ESCALATED",
  "COMPLIANCE_REVIEW",
]);

function sum(values: string[]): number {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function ClaimsTable({ claims }: { claims: ClaimSummary[] }) {
  return (
    <div className="table-wrap" role="region" aria-label="Klaim terbaru" tabIndex={0}>
      <table className="table">
        <caption className="sr-only">Klaim terbaru dengan pemohon, nominal, dan status</caption>
        <thead>
          <tr>
            <th scope="col">Klaim</th>
            <th scope="col">Pemohon</th>
            <th scope="col" className="col-hide-sm">
              Tanggal
            </th>
            <th scope="col" className="numeric">
              Nominal
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td>
                <Link
                  to="/claims/$claimId"
                  params={{ claimId: claim.id }}
                  className="table__primary mono"
                >
                  {claim.claim_number}
                </Link>
                <div className="table__secondary">{claim.claim_category}</div>
              </td>
              <td>{claim.claimant_name}</td>
              <td className="col-hide-sm">{formatDate(claim.created_at)}</td>
              <td className="numeric">{formatMoney(claim.requested_amount)}</td>
              <td>
                <span className={statusClass(claim.status)}>
                  <span className="badge__dot" aria-hidden="true" />
                  {statusLabel(claim.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchesTable({ batches }: { batches: PayrollBatch[] }) {
  return (
    <div className="table-wrap" role="region" aria-label="Batch payroll terbaru" tabIndex={0}>
      <table className="table">
        <caption className="sr-only">
          Batch payroll terbaru dengan periode, bruto, dan status
        </caption>
        <thead>
          <tr>
            <th scope="col">Batch</th>
            <th scope="col">Periode</th>
            <th scope="col" className="numeric">
              Bruto
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id}>
              <td>
                <Link
                  to="/payroll/$batchId"
                  params={{ batchId: batch.id }}
                  className="table__primary mono"
                >
                  {batch.batch_code}
                </Link>
                <div className="table__secondary">{batch.batch_type}</div>
              </td>
              <td>{formatPeriod(batch.period_month)}</td>
              <td className="numeric">{formatMoney(batch.total_gross_amount)}</td>
              <td>
                <span className={statusClass(batch.status)}>
                  <span className="badge__dot" aria-hidden="true" />
                  {statusLabel(batch.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchesTable({ rows }: { rows: BranchKpi[] }) {
  return (
    <div className="table-wrap" role="region" aria-label="Kinerja per cabang" tabIndex={0}>
      <table className="table">
        <caption className="sr-only">Kinerja payroll dan klaim per cabang</caption>
        <thead>
          <tr>
            <th scope="col">Cabang</th>
            <th scope="col" className="numeric">
              Payroll
            </th>
            <th scope="col" className="numeric col-hide-sm">
              PPh 21
            </th>
            <th scope="col" className="numeric col-hide-sm">
              Klaim
            </th>
            <th scope="col" className="numeric">
              Approval
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branchId}>
              <td>
                <div className="table__primary">{row.branchName}</div>
                <div className="table__secondary mono">{row.branchCode}</div>
              </td>
              <td className="numeric">{formatMoney(row.totalPayrollDisbursed)}</td>
              <td className="numeric col-hide-sm">{formatMoney(row.totalPph21Collected)}</td>
              <td className="numeric col-hide-sm">{formatMoney(row.totalClaimsApprovedAmount)}</td>
              <td className="numeric">{row.claimApprovalRatePct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ logs }: { logs: AuditLogRow[] }) {
  return (
    <div className="table-wrap" role="region" aria-label="Aktivitas audit terbaru" tabIndex={0}>
      <table className="table">
        <caption className="sr-only">Aktivitas audit terbaru dengan waktu, aksi, dan aktor</caption>
        <thead>
          <tr>
            <th scope="col">Waktu</th>
            <th scope="col">Aksi</th>
            <th scope="col">Aktor</th>
            <th scope="col">Domain</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="nowrap">{formatDateTime(log.recorded_at)}</td>
              <td>
                <div className="table__primary">{actionLabel(log.action)}</div>
                <div className="table__secondary">{log.entity_type}</div>
              </td>
              <td>{log.actor_name ?? log.actor_role}</td>
              <td>
                <span className={`badge badge--${log.domain.toLowerCase()}`}>{log.domain}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const role = user?.role ?? "CLAIMS_OFFICER";
  const period = currentPeriod();

  const needsClaims = [
    "CLAIMS_OFFICER",
    "BRANCH_MANAGER",
    "FINANCE_MANAGER",
    "COMPLIANCE_ADMIN",
    "MIS_ANALYST",
  ].includes(role);
  const needsPayroll = [
    "HR_SPECIALIST",
    "FINANCE_MANAGER",
    "COMPLIANCE_ADMIN",
    "MIS_ANALYST",
  ].includes(role);
  const needsWorkforce = ["HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER"].includes(role);
  const needsReports = ["HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"].includes(role);
  const needsMis = ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"].includes(role);
  const needsAudit = role === "COMPLIANCE_ADMIN";

  const claimsQuery = useQuery({
    queryKey: ["overview-claims"],
    queryFn: () => listClaims({ limit: 100 }),
    enabled: needsClaims,
    staleTime: 60_000,
  });
  const batchesQuery = useQuery({
    queryKey: ["overview-batches"],
    queryFn: () => listPayrollBatches({ limit: 100 }),
    enabled: needsPayroll,
    staleTime: 60_000,
  });
  const leaveQuery = useQuery({
    queryKey: ["overview-leave"],
    queryFn: () => listWorkforceLeave({ status: "PENDING" }),
    enabled: needsWorkforce,
    staleTime: 60_000,
  });
  const overtimeQuery = useQuery({
    queryKey: ["overview-overtime"],
    queryFn: () => listWorkforceOvertime({ status: "PENDING" }),
    enabled: needsWorkforce,
    staleTime: 60_000,
  });
  const reimbursementQuery = useQuery({
    queryKey: ["overview-reimbursements"],
    queryFn: () => listWorkforceReimbursements({ status: "PENDING" }),
    enabled: needsWorkforce,
    staleTime: 60_000,
  });
  const reportsQuery = useQuery({
    queryKey: ["overview-reports"],
    queryFn: () => listReports({ limit: 100 }),
    enabled: needsReports,
    staleTime: 60_000,
  });
  const misQuery = useQuery({
    queryKey: ["overview-mis", period],
    queryFn: () =>
      fetchMisDashboard({
        reportMonth: `${period}-01`,
        months: 6,
      }),
    enabled: needsMis,
    staleTime: 60_000,
  });
  const auditQuery = useQuery({
    queryKey: ["overview-audit"],
    queryFn: verifyAuditChain,
    enabled: needsAudit,
    staleTime: 60_000,
  });
  const auditLogsQuery = useQuery({
    queryKey: ["overview-audit-logs"],
    queryFn: () => listAuditLogs({ limit: 6 }),
    enabled: needsAudit,
    staleTime: 60_000,
  });

  if (user === null) {
    return null;
  }

  const firstName = user.full_name.split(" ")[0] ?? "tim";
  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  if (role === "EMPLOYEE") {
    return (
      <div className="stack overview-page">
        <header className="page-header overview-header">
          <div>
            <h1>Selamat datang, {firstName}.</h1>
            <p className="page-header__description">
              Ruang Saya berisi slip gaji, absensi, saldo cuti, e-cuti, e-lembur, dan reimburse.
            </p>
            <div className="overview-date">{dateLabel}</div>
          </div>
          <div className="page-header__actions">
            <Link to="/me" className="btn btn--primary btn--sm">
              <UserRound size={15} aria-hidden="true" />
              Buka Ruang Saya
            </Link>
          </div>
        </header>
        <section className="panel">
          <div className="panel__body">
            <EmptyState
              title="Halaman ini untuk peran operasional"
              body="Sebagai karyawan, gunakan Ruang Saya untuk melihat data pribadi dan mengajukan cuti, lembur, atau reimburse."
              icon={<UserRound size={18} />}
              action={
                <Link to="/me" className="btn btn--primary btn--sm">
                  Buka Ruang Saya
                </Link>
              }
            />
          </div>
        </section>
      </div>
    );
  }

  const activeQueries = [
    ...(needsClaims ? [claimsQuery] : []),
    ...(needsPayroll ? [batchesQuery] : []),
    ...(needsWorkforce ? [leaveQuery, overtimeQuery, reimbursementQuery] : []),
    ...(needsReports ? [reportsQuery] : []),
    ...(needsMis ? [misQuery] : []),
    ...(needsAudit ? [auditQuery, auditLogsQuery] : []),
  ];
  const queryError = activeQueries.find((query) => query.isError)?.error;
  const loading = activeQueries.some((query) => query.isPending);

  const claims = claimsQuery.data?.data.items ?? [];
  const batches = batchesQuery.data?.data.items ?? [];
  const leave = leaveQuery.data?.data.items ?? [];
  const overtime = overtimeQuery.data?.data.items ?? [];
  const reimbursements = reimbursementQuery.data?.data.items ?? [];
  const reports = reportsQuery.data?.data.items ?? [];
  const misSummary = misQuery.data?.summary ?? [];
  const misTrend = misQuery.data?.trend ?? [];
  const auditLogs = auditLogsQuery.data?.data ?? [];

  const hasMis = needsMis && misSummary.length > 0;
  const pendingClaims = claims.filter((claim) => PENDING_CLAIM_STATUSES.has(claim.status)).length;
  const escalatedClaims = claims.filter((claim) => claim.status === "ESCALATED").length;
  const complianceClaims = claims.filter((claim) => claim.status === "COMPLIANCE_REVIEW").length;
  const conflictClaims = claims.filter((claim) => claim.has_conflict_flag).length;
  const highRiskClaims = claims.filter((claim) => claim.risk_score >= 70).length;
  const draftClaims = claims.filter((claim) => claim.status === "DRAFT").length;
  const returnedClaims = claims.filter((claim) => claim.status === "RETURNED").length;
  const approvedClaims = claims.filter(
    (claim) => claim.status === "APPROVED" || claim.status === "DISBURSED",
  ).length;
  const disbursedClaims = claims.filter((claim) => claim.status === "DISBURSED").length;
  const rejectedClaims = claims.filter((claim) => claim.status === "REJECTED").length;

  const batchesReady = batches.filter((batch) => batch.status === "READY_FOR_APPROVAL").length;
  const batchesApproved = batches.filter((batch) => batch.status === "APPROVED").length;
  const batchesDraft = batches.filter((batch) => batch.status === "DRAFT").length;
  const batchesCalculating = batches.filter((batch) => batch.status === "CALCULATING").length;
  const failedReports = reports.filter((report) => report.status === "FAILED").length;

  const payrollTotal = hasMis
    ? sum(misSummary.map((row) => row.totalPayrollDisbursed))
    : sum(batches.map((batch) => batch.total_gross_amount));
  const pphTotal = hasMis
    ? sum(misSummary.map((row) => row.totalPph21Collected))
    : sum(batches.map((batch) => batch.total_tax_pph21));
  const claimsTotal = hasMis
    ? sum(misSummary.map((row) => row.totalClaimsApprovedAmount))
    : sum(claims.map((claim) => claim.approved_amount ?? claim.requested_amount));
  const approvalRate =
    misSummary.length === 0
      ? 0
      : misSummary.reduce((total, row) => total + row.claimApprovalRatePct, 0) / misSummary.length;
  const branchCount = misSummary.length;
  const negativeVariance = misSummary.filter((row) => row.momVariancePct < 0).length;

  const auditValid = auditQuery.data?.data.valid;
  const auditChecked = auditQuery.data?.data.checked ?? 0;
  const complianceReviewIds = new Set([
    ...claims.filter((claim) => claim.status === "COMPLIANCE_REVIEW").map((claim) => claim.id),
    ...claims.filter((claim) => claim.has_conflict_flag).map((claim) => claim.id),
  ]);

  const trendMap = new Map<string, TrendPoint>();
  for (const row of misTrend) {
    const key = monthKey(row.reportMonth);
    const current = trendMap.get(key) ?? {
      label: formatPeriod(`${key}-01`),
      payroll: 0,
      claims: 0,
      pph21: 0,
    };
    current.payroll += Number(row.totalPayrollDisbursed || 0);
    current.claims += Number(row.totalClaimsApprovedAmount || 0);
    current.pph21 += Number(row.totalPph21Collected || 0);
    trendMap.set(key, current);
  }
  const misTrendData = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, value]) => value);

  const batchTrendMap = new Map<string, number>();
  for (const batch of batches) {
    const key = monthKey(batch.period_month);
    batchTrendMap.set(key, (batchTrendMap.get(key) ?? 0) + Number(batch.total_gross_amount || 0));
  }
  const batchTrendData: TrendPoint[] = [...batchTrendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, value]) => ({
      label: formatPeriod(`${key}-01`),
      payroll: value,
      claims: 0,
      pph21: 0,
    }));
  const payrollTrend = hasMis ? misTrendData : batchTrendData;

  const claimsStatusData = [
    { label: "Menunggu", value: pendingClaims },
    { label: "Disetujui", value: approvedClaims },
    { label: "Dicairkan", value: disbursedClaims },
    { label: "Ditolak", value: rejectedClaims },
  ];

  const roleHome: RoleHome = (() => {
    switch (role) {
      case "BRANCH_MANAGER":
        return {
          lens: "Lensa Manajer Cabang",
          description: "Fokus pada keputusan cabang: klaim, cuti, lembur, dan reimburse.",
          quickActions: [
            {
              label: "Antrean persetujuan",
              to: "/approvals",
              icon: <Inbox size={15} aria-hidden="true" />,
            },
            {
              label: "Ruang klaim",
              to: "/claims",
              icon: <ReceiptText size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Keputusan menunggu",
            value: pendingClaims + leave.length + overtime.length + reimbursements.length,
            title: "Antrean cabang",
            description:
              "Klaim, cuti, lembur, dan reimburse yang menunggu keputusan Anda atau finance.",
            to: "/approvals",
            action: "Buka antrean",
            icon: <Inbox size={18} aria-hidden="true" />,
            tone: "amber",
          },
          secondary: [
            {
              label: "Eskalasi klaim",
              value: formatCompactNumber(escalatedClaims),
              meta: "Perlu keputusan finance",
            },
            {
              label: "Cuti dan lembur",
              value: formatCompactNumber(leave.length + overtime.length),
              meta: "Menunggu keputusan",
            },
            {
              label: "Reimburse",
              value: formatCompactNumber(reimbursements.length),
              meta: "Menunggu keputusan",
            },
          ],
          actions: [
            {
              label: "Klaim perlu keputusan",
              hint: "Termasuk eskalasi dan review",
              count: pendingClaims,
              to: "/claims",
              icon: <ShieldAlert size={15} aria-hidden="true" />,
              tone: "red",
            },
            {
              label: "Cuti dan lembur",
              hint: "Antrean keputusan HR",
              count: leave.length + overtime.length,
              to: "/workforce",
              icon: <CalendarDays size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Reimburse menunggu",
              hint: "Perlu persetujuan",
              count: reimbursements.length,
              to: "/workforce",
              icon: <ReceiptText size={15} aria-hidden="true" />,
              tone: "amber",
            },
          ],
          priorityTitle: "Perlu tindakan",
          priorityDescription: "Antrean yang paling relevan untuk keputusan cabang.",
          chart: "claims",
          chartTitle: "Status klaim",
          chartDescription: "Sebaran 100 klaim terbaru di ruang kerja Anda.",
          insight: `${pendingClaims} klaim menunggu keputusan; ${escalatedClaims} sudah dieskalasi ke finance.`,
          insightTo: "/claims",
          insightAction: "Buka ruang klaim",
          insightIcon: <ReceiptText size={18} aria-hidden="true" />,
          detail: "claims",
          detailTitle: "Klaim terbaru",
          detailDescription: "Klaim terakhir yang masuk ke ruang kerja Anda.",
        };
      case "FINANCE_MANAGER":
        return {
          lens: "Lensa Manajer Keuangan",
          description: "Fokus pada payroll, pencairan, eskalasi klaim, dan kesehatan biaya.",
          quickActions: [
            {
              label: "Konsol payroll",
              to: "/payroll",
              icon: <Wallet size={15} aria-hidden="true" />,
            },
            {
              label: "Antrean persetujuan",
              to: "/approvals",
              icon: <Inbox size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Payroll perlu tindakan",
            value: batchesReady + batchesApproved,
            title: "Siap disetujui atau dicairkan",
            description: "Batch yang sudah dihitung dan menunggu langkah finance.",
            to: "/payroll",
            action: "Buka konsol payroll",
            icon: <Wallet size={18} aria-hidden="true" />,
            tone: "blue",
          },
          secondary: [
            {
              label: "Eskalasi klaim",
              value: formatCompactNumber(escalatedClaims),
              meta: "Perlu keputusan",
            },
            {
              label: "Laporan gagal",
              value: formatCompactNumber(failedReports),
              meta: "Perlu dibuat ulang",
            },
            {
              label: "PPh 21 bulan ini",
              value: formatCompactMoney(pphTotal),
              meta: "Potongan karyawan",
            },
          ],
          actions: [
            {
              label: "Batch siap disetujui",
              hint: "Menunggu keputusan finance",
              count: batchesReady,
              to: "/payroll",
              icon: <Wallet size={15} aria-hidden="true" />,
              tone: "blue",
            },
            {
              label: "Batch siap dicairkan",
              hint: "Sudah disetujui",
              count: batchesApproved,
              to: "/payroll",
              icon: <CircleDollarSign size={15} aria-hidden="true" />,
              tone: "teal",
            },
            {
              label: "Klaim eskalasi",
              hint: "Perlu keputusan finance",
              count: escalatedClaims,
              to: "/claims",
              icon: <ShieldAlert size={15} aria-hidden="true" />,
              tone: "red",
            },
            {
              label: "Laporan gagal",
              hint: "Perlu dibuat ulang",
              count: failedReports,
              to: "/reports",
              icon: <FileWarning size={15} aria-hidden="true" />,
              tone: "red",
            },
          ],
          priorityTitle: "Perlu tindakan",
          priorityDescription: "Antrean finance yang paling berdampak.",
          chart: "payroll",
          chartTitle: payrollTrend.length < 2 ? "Ringkasan bulan ini" : "Tren payroll 6 bulan",
          chartDescription:
            payrollTrend.length < 2
              ? "Belum ada dua periode untuk menggambar tren."
              : "Nilai payroll yang diproses per periode.",
          insight: `Payroll bulan ini ${formatCompactMoney(payrollTotal)}; ${batchesReady} batch siap disetujui dan ${batchesApproved} siap dicairkan.`,
          insightTo: "/payroll",
          insightAction: "Buka konsol payroll",
          insightIcon: <BadgeCheck size={18} aria-hidden="true" />,
          detail: hasMis ? "branches" : "batches",
          detailTitle: hasMis ? "Kinerja per cabang" : "Batch terbaru",
          detailDescription: hasMis
            ? "Payroll, PPh 21, dan klaim pada bulan berjalan."
            : "Batch payroll terakhir yang terlihat oleh peran Anda.",
        };
      case "HR_SPECIALIST":
        return {
          lens: "Lensa Spesialis SDM",
          description: "Fokus pada payroll, kehadiran, cuti, lembur, dan reimburse.",
          quickActions: [
            {
              label: "Konsol payroll",
              to: "/payroll",
              icon: <Wallet size={15} aria-hidden="true" />,
            },
            {
              label: "Cuti dan lembur",
              to: "/workforce",
              icon: <CalendarDays size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Batch payroll perlu diselesaikan",
            value: batchesDraft + batchesCalculating + batchesReady,
            title: "Dari draf hingga siap",
            description: "Batch yang belum disetujui finance.",
            to: "/payroll",
            action: "Buka konsol payroll",
            icon: <Wallet size={18} aria-hidden="true" />,
            tone: "blue",
          },
          secondary: [
            {
              label: "Cuti menunggu",
              value: formatCompactNumber(leave.length),
              meta: "Perlu keputusan",
            },
            {
              label: "Lembur menunggu",
              value: formatCompactNumber(overtime.length),
              meta: "Perlu keputusan",
            },
            {
              label: "Reimburse menunggu",
              value: formatCompactNumber(reimbursements.length),
              meta: "Perlu keputusan",
            },
          ],
          actions: [
            {
              label: "Batch payroll",
              hint: "Draf, kalkulasi, atau siap disetujui",
              count: batchesDraft + batchesCalculating + batchesReady,
              to: "/payroll",
              icon: <Wallet size={15} aria-hidden="true" />,
              tone: "blue",
            },
            {
              label: "Cuti menunggu",
              hint: "Antrean keputusan HR",
              count: leave.length,
              to: "/workforce",
              icon: <CalendarDays size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Lembur menunggu",
              hint: "Antrean keputusan HR",
              count: overtime.length,
              to: "/workforce",
              icon: <Gauge size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Reimburse menunggu",
              hint: "Perlu persetujuan",
              count: reimbursements.length,
              to: "/workforce",
              icon: <ReceiptText size={15} aria-hidden="true" />,
              tone: "amber",
            },
          ],
          priorityTitle: "Perlu tindakan",
          priorityDescription: "Antrean HR dan payroll yang paling relevan.",
          chart: "payroll",
          chartTitle: payrollTrend.length < 2 ? "Ringkasan bulan ini" : "Tren payroll 6 bulan",
          chartDescription:
            payrollTrend.length < 2
              ? "Belum ada dua periode untuk menggambar tren."
              : "Nilai batch payroll per periode.",
          insight: `${batchesDraft + batchesCalculating + batchesReady} batch belum selesai; ${leave.length} cuti dan ${overtime.length} lembur menunggu keputusan.`,
          insightTo: "/workforce",
          insightAction: "Buka antrean HR",
          insightIcon: <CalendarDays size={18} aria-hidden="true" />,
          detail: "batches",
          detailTitle: "Batch payroll terbaru",
          detailDescription: "Batch terakhir yang terlihat oleh peran Anda.",
        };
      case "COMPLIANCE_ADMIN":
        return {
          lens: "Lensa Administrator Kepatuhan",
          description: "Fokus pada konflik, review kepatuhan, dan integritas audit.",
          quickActions: [
            {
              label: "Jejak audit",
              to: "/audit",
              icon: <ShieldCheck size={15} aria-hidden="true" />,
            },
            {
              label: "Ruang klaim",
              to: "/claims",
              icon: <ReceiptText size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Review kepatuhan",
            value: complianceReviewIds.size,
            title: "Klaim berisiko dan konflik",
            description: "Perlu review sebelum keputusan atau pencairan.",
            to: "/claims",
            action: "Buka ruang klaim",
            icon: <ShieldAlert size={18} aria-hidden="true" />,
            tone: "red",
          },
          secondary: [
            {
              label: "Status audit",
              value: auditValid === undefined ? "Memuat" : auditValid ? "Valid" : "Perlu dicek",
              meta: auditValid === undefined ? "Rantai hash" : `${auditChecked} baris`,
            },
            {
              label: "Risiko tinggi",
              value: formatCompactNumber(highRiskClaims),
              meta: "Skor 70 atau lebih",
            },
            {
              label: "Eskalasi",
              value: formatCompactNumber(escalatedClaims),
              meta: "Menunggu finance",
            },
          ],
          actions: [
            {
              label: "Review kepatuhan",
              hint: "Klaim berstatus review",
              count: complianceClaims,
              to: "/claims",
              icon: <ShieldAlert size={15} aria-hidden="true" />,
              tone: "red",
            },
            {
              label: "Flag konflik",
              hint: "Cocokkan data bank atau NIK",
              count: conflictClaims,
              to: "/claims",
              icon: <Users size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Verifikasi audit",
              hint:
                auditValid === false ? "Rantai hash perlu diperiksa" : "Periksa integritas tenant",
              count: 1,
              to: "/audit",
              icon: <ShieldCheck size={15} aria-hidden="true" />,
              tone: auditValid === false ? "red" : "teal",
            },
          ],
          priorityTitle: "Perlu tindakan",
          priorityDescription: "Sinyal kepatuhan yang perlu diperiksa.",
          chart: "claims",
          chartTitle: "Status klaim",
          chartDescription: "Sebaran 100 klaim terbaru di ruang kerja Anda.",
          insight:
            auditValid === undefined
              ? "Status rantai audit sedang dimuat."
              : auditValid
                ? `Rantai audit valid untuk ${auditChecked} baris. ${complianceReviewIds.size} klaim perlu review.`
                : "Rantai audit tidak valid. Periksa jejak audit sebelum melanjutkan.",
          insightTo: "/audit",
          insightAction: "Buka jejak audit",
          insightIcon: <ShieldCheck size={18} aria-hidden="true" />,
          detail: "audit",
          detailTitle: "Aktivitas audit terbaru",
          detailDescription: "Aksi terakhir yang tercatat di tenant ini.",
        };
      case "MIS_ANALYST":
        return {
          lens: "Lensa Analis MIS",
          description: "Fokus pada KPI lintas cabang, tren, varians, dan simulasi kebijakan.",
          quickActions: [
            {
              label: "MIS Intelligence",
              to: "/mis",
              icon: <BarChart3 size={15} aria-hidden="true" />,
            },
            {
              label: "What-If",
              to: "/mis/what-if",
              icon: <FlaskConical size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Approval rate",
            value: `${approvalRate.toFixed(1)}%`,
            title: "Rata-rata persetujuan cabang",
            description: "Bandingkan cabang dan tren sebelum mengubah kebijakan.",
            to: "/mis",
            action: "Buka MIS",
            icon: <Gauge size={18} aria-hidden="true" />,
            tone: "violet",
          },
          secondary: [
            {
              label: "Payroll dicairkan",
              value: formatCompactMoney(payrollTotal),
              meta: "Bulan berjalan",
            },
            {
              label: "PPh 21",
              value: formatCompactMoney(pphTotal),
              meta: "Bulan berjalan",
            },
            {
              label: "Klaim disetujui",
              value: formatCompactMoney(claimsTotal),
              meta: "Bulan berjalan",
            },
          ],
          actions: [
            {
              label: "Cabang varians negatif",
              hint: "Varians MoM di bawah nol",
              count: negativeVariance,
              to: "/mis",
              icon: <TrendingDown size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Klaim flag konflik",
              hint: "Perlu review",
              count: conflictClaims,
              to: "/claims",
              icon: <ShieldAlert size={15} aria-hidden="true" />,
              tone: "red",
            },
            {
              label: "What-If tersedia",
              hint: "Simulasikan perubahan kebijakan",
              count: 1,
              to: "/mis/what-if",
              icon: <FlaskConical size={15} aria-hidden="true" />,
              tone: "violet",
            },
          ],
          priorityTitle: "Sinyal analisis",
          priorityDescription: "Sinyal yang layak diperiksa sebelum mengambil keputusan.",
          chart: "payroll",
          chartTitle: payrollTrend.length < 2 ? "Ringkasan bulan ini" : "Tren payroll 6 bulan",
          chartDescription:
            payrollTrend.length < 2
              ? "Belum ada dua periode untuk menggambar tren."
              : "Nilai payroll yang diproses per periode.",
          insight: `${branchCount} cabang; ${negativeVariance} memiliki varians MoM negatif; approval rate rata-rata ${approvalRate.toFixed(1)}%.`,
          insightTo: "/mis",
          insightAction: "Buka MIS",
          insightIcon: <BarChart3 size={18} aria-hidden="true" />,
          detail: "branches",
          detailTitle: "Kinerja per cabang",
          detailDescription: "Payroll, PPh 21, klaim, dan approval pada bulan berjalan.",
        };
      case "CLAIMS_OFFICER":
      default:
        return {
          lens: "Lensa Petugas Klaim",
          description:
            "Fokus pada klaim yang perlu dilengkapi, dikirim, dan dipantau keputusannya.",
          quickActions: [
            {
              label: "Buat klaim",
              to: "/claims/new",
              icon: <FilePlus2 size={15} aria-hidden="true" />,
            },
            {
              label: "Ruang klaim",
              to: "/claims",
              icon: <ReceiptText size={15} aria-hidden="true" />,
            },
          ],
          focus: {
            label: "Klaim perlu dilengkapi",
            value: draftClaims + returnedClaims,
            title: "Lengkapi sebelum dikirim",
            description: "Draf dan klaim yang dikembalikan menunggu perbaikan.",
            to: "/claims",
            action: "Buka ruang klaim",
            icon: <FileWarning size={18} aria-hidden="true" />,
            tone: "amber",
          },
          secondary: [
            {
              label: "Menunggu keputusan",
              value: formatCompactNumber(pendingClaims),
              meta: "Termasuk eskalasi",
            },
            {
              label: "Disetujui",
              value: formatCompactNumber(approvedClaims),
              meta: "Bulan berjalan",
            },
            {
              label: "Flag konflik",
              value: formatCompactNumber(conflictClaims),
              meta: "Perlu review",
            },
          ],
          actions: [
            {
              label: "Klaim perlu dilengkapi",
              hint: "Draf dan klaim yang dikembalikan",
              count: draftClaims + returnedClaims,
              to: "/claims",
              icon: <FileWarning size={15} aria-hidden="true" />,
              tone: "amber",
            },
            {
              label: "Menunggu keputusan",
              hint: "Termasuk eskalasi",
              count: pendingClaims,
              to: "/claims",
              icon: <Inbox size={15} aria-hidden="true" />,
              tone: "blue",
            },
            {
              label: "Flag konflik",
              hint: "Cocokkan data bank atau NIK",
              count: conflictClaims,
              to: "/claims",
              icon: <ShieldAlert size={15} aria-hidden="true" />,
              tone: "red",
            },
          ],
          priorityTitle: "Perlu tindakan",
          priorityDescription: "Klaim yang paling perlu Anda selesaikan.",
          chart: "claims",
          chartTitle: "Status klaim",
          chartDescription: "Sebaran 100 klaim terbaru di ruang kerja Anda.",
          insight: `${pendingClaims} klaim menunggu keputusan; ${conflictClaims} memiliki flag konflik.`,
          insightTo: "/claims",
          insightAction: "Buka ruang klaim",
          insightIcon: <ReceiptText size={18} aria-hidden="true" />,
          detail: "claims",
          detailTitle: "Klaim terbaru",
          detailDescription: "Klaim terakhir yang masuk ke ruang kerja Anda.",
        };
    }
  })();

  const visibleActions = roleHome.actions.filter((action) => action.count > 0);
  const chart =
    roleHome.chart === "claims" ? (
      <ClaimsStatusChart data={claimsStatusData} />
    ) : payrollTrend.length < 2 ? (
      <MonthlyBreakdown
        items={[
          { label: "Payroll", value: payrollTotal },
          { label: "PPh 21", value: pphTotal, tone: "amber" },
          { label: "Klaim disetujui", value: claimsTotal },
        ]}
      />
    ) : (
      <PayrollTrendChart data={payrollTrend} />
    );

  const detail =
    roleHome.detail === "claims" ? (
      claims.length === 0 ? (
        <EmptyState
          title="Belum ada klaim"
          body="Klaim yang masuk ke ruang kerja Anda akan muncul di sini."
          icon={<ReceiptText size={18} />}
          action={
            <Link to="/claims/new" className="btn btn--primary btn--sm">
              Buat klaim
            </Link>
          }
        />
      ) : (
        <ClaimsTable claims={claims.slice(0, 6)} />
      )
    ) : roleHome.detail === "batches" ? (
      batches.length === 0 ? (
        <EmptyState
          title="Belum ada batch payroll"
          body="Batch yang dibuat untuk tenant ini akan muncul di sini."
          icon={<Wallet size={18} />}
        />
      ) : (
        <BatchesTable batches={batches.slice(0, 6)} />
      )
    ) : roleHome.detail === "branches" ? (
      misSummary.length === 0 ? (
        <EmptyState
          title="Belum ada KPI cabang"
          body="KPI muncul setelah worker menyelesaikan periode berjalan."
          icon={<BarChart3 size={18} />}
        />
      ) : (
        <BranchesTable rows={misSummary.slice(0, 6)} />
      )
    ) : auditLogs.length === 0 ? (
      <EmptyState
        title="Belum ada aktivitas audit"
        body="Aksi yang tercatat di tenant ini akan muncul di sini."
        icon={<ShieldCheck size={18} />}
      />
    ) : (
      <AuditTable logs={auditLogs} />
    );

  return (
    <div className="stack overview-page">
      <header className="page-header overview-header">
        <div>
          <h1>Selamat datang, {firstName}.</h1>
          <p className="page-header__description">
            {roleHome.lens}. {roleHome.description}
          </p>
          <div className="overview-date">{dateLabel}</div>
        </div>
        <div className="page-header__actions">
          {roleHome.quickActions.map((action, index) => (
            <Link
              key={action.label}
              to={action.to}
              className={`btn ${index === 0 ? "btn--primary" : "btn--secondary"} btn--sm`}
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      {queryError === undefined ? null : (
        <ErrorState
          error={queryError}
          onRetry={() => void Promise.all(activeQueries.map((query) => query.refetch()))}
        />
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          <div className="overview-priority-grid">
            <section className="panel overview-actions-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">{roleHome.priorityTitle}</div>
                  <div className="panel__description">{roleHome.priorityDescription}</div>
                </div>
              </div>
              <div className="panel__body panel__body--flush">
                {visibleActions.length === 0 ? (
                  <div className="overview-clear">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <div>
                      <strong>Tidak ada antrean kritis.</strong>
                      <span>Gunakan waktu untuk pekerjaan rutin atau buka menu terkait.</span>
                    </div>
                  </div>
                ) : (
                  <ul className="attention-list">
                    {visibleActions.map((action) => (
                      <li key={action.label}>
                        <Link to={action.to} className="attention-item">
                          <span
                            className={`attention-item__icon attention-item__icon--${action.tone}`}
                          >
                            {action.icon}
                          </span>
                          <span className="attention-item__label">
                            <strong>{action.label}</strong>
                            <small>{action.hint}</small>
                          </span>
                          <span className="attention-item__count">
                            {formatCompactNumber(action.count)}
                          </span>
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel__footer overview-actions-footer">
                <span className="small muted">
                  {roleHome.priorityTitle === "Sinyal analisis"
                    ? "Sinyal diurutkan berdasarkan relevansi."
                    : "Antrean diurutkan berdasarkan dampak."}
                </span>
                <Link to={roleHome.insightTo} className="btn btn--ghost btn--sm">
                  Buka semua
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </section>

            <section className={`panel overview-focus overview-focus--${roleHome.focus.tone}`}>
              <div className="overview-focus__head">
                <span className="overview-focus__label">{roleHome.focus.label}</span>
                <span className="overview-focus__icon">{roleHome.focus.icon}</span>
              </div>
              <div className="overview-focus__value">{roleHome.focus.value}</div>
              <div className="overview-focus__title">{roleHome.focus.title}</div>
              <p className="overview-focus__description">{roleHome.focus.description}</p>
              <Link to={roleHome.focus.to} className="overview-focus__action">
                {roleHome.focus.action}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          </div>

          <section className="panel overview-metrics">
            <div className="overview-metrics__grid">
              {roleHome.secondary.map((metric) => (
                <div className="overview-metric" key={metric.label}>
                  <span className="overview-metric__label">{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <span className="overview-metric__meta">{metric.meta}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="overview-insight-grid">
            <section className="panel overview-chart-panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">{roleHome.chartTitle}</div>
                  <div className="panel__description">{roleHome.chartDescription}</div>
                </div>
                <BadgeCheck size={16} aria-hidden="true" />
              </div>
              <div className="panel__body overview-chart-panel__body">{chart}</div>
            </section>
            <section className="panel overview-insight">
              <span className="overview-insight__icon">{roleHome.insightIcon}</span>
              <span className="overview-insight__label">Apa artinya</span>
              <p>{roleHome.insight}</p>
              <Link to={roleHome.insightTo} className="overview-insight__link">
                {roleHome.insightAction}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          </div>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">{roleHome.detailTitle}</div>
                <div className="panel__description">{roleHome.detailDescription}</div>
              </div>
              <Link to={roleHome.insightTo} className="btn btn--ghost btn--sm">
                Lihat semua
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {detail}
          </section>
        </>
      )}
    </div>
  );
}
