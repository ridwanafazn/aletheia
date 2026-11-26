import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  FileWarning,
  Gauge,
  ReceiptText,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ClaimSummary } from "@aletheia/shared-contracts";

import {
  currentPeriod,
  formatCompactMoney,
  formatCompactNumber,
  formatDate,
  formatMoney,
  formatPeriod,
  statusClass,
  statusLabel,
} from "../../shared/lib/format";
import { ErrorState, SkeletonTable, Sparkline } from "../../shared/ui";
import { useAuth } from "../auth/AuthProvider";
import { listClaims } from "../claims/api";
import { fetchMisDashboard } from "../mis/api";
import { listPayrollBatches } from "../payroll/api";
import { listReports } from "../reports/api";
import {
  listWorkforceLeave,
  listWorkforceOvertime,
  listWorkforceReimbursements,
} from "../workforce/api";
import { ClaimsStatusChart, MonthlyBreakdown, PayrollTrendChart, type TrendPoint } from "./charts";

interface Kpi {
  label: string;
  value: string;
  meta: string;
  trend: number[];
  tone?: "jade" | "amber" | "danger";
  icon: ReactNode;
}

interface AttentionItem {
  label: string;
  count: number;
  to: "/workforce" | "/claims" | "/reports" | "/payroll";
  icon: ReactNode;
  tone: "jade" | "amber" | "danger";
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

export default function OverviewPage() {
  const { user, hasRole } = useAuth();
  const canMis = hasRole("MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN");
  const canPayroll = hasRole("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST");
  const canClaims = hasRole(
    "CLAIMS_OFFICER",
    "BRANCH_MANAGER",
    "FINANCE_MANAGER",
    "COMPLIANCE_ADMIN",
    "MIS_ANALYST",
  );
  const canWorkforce = hasRole("HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER");
  const period = currentPeriod();

  const misQuery = useQuery({
    queryKey: ["overview-mis", period],
    queryFn: () =>
      fetchMisDashboard({
        reportMonth: `${period}-01`,
        months: 6,
      }),
    enabled: canMis,
    staleTime: 60_000,
  });
  const batchesQuery = useQuery({
    queryKey: ["overview-batches"],
    queryFn: () => listPayrollBatches({ limit: 100 }),
    enabled: canPayroll,
    staleTime: 60_000,
  });
  const claimsQuery = useQuery({
    queryKey: ["overview-claims"],
    queryFn: () => listClaims({ limit: 100 }),
    enabled: canClaims,
    staleTime: 60_000,
  });
  const leaveQuery = useQuery({
    queryKey: ["overview-leave"],
    queryFn: () => listWorkforceLeave({ status: "PENDING" }),
    enabled: canWorkforce,
    staleTime: 60_000,
  });
  const overtimeQuery = useQuery({
    queryKey: ["overview-overtime"],
    queryFn: () => listWorkforceOvertime({ status: "PENDING" }),
    enabled: canWorkforce,
    staleTime: 60_000,
  });
  const reimbursementQuery = useQuery({
    queryKey: ["overview-reimbursements"],
    queryFn: () => listWorkforceReimbursements({ status: "PENDING" }),
    enabled: canWorkforce,
    staleTime: 60_000,
  });
  const reportsQuery = useQuery({
    queryKey: ["overview-reports"],
    queryFn: () => listReports({ limit: 100 }),
    enabled: canPayroll,
    staleTime: 60_000,
  });

  const queryError = [
    misQuery,
    batchesQuery,
    claimsQuery,
    leaveQuery,
    overtimeQuery,
    reimbursementQuery,
    reportsQuery,
  ].find((query) => query.isError)?.error;

  const batches = batchesQuery.data?.data.items ?? [];
  const claims = claimsQuery.data?.data.items ?? [];
  const leave = leaveQuery.data?.data.items ?? [];
  const overtime = overtimeQuery.data?.data.items ?? [];
  const reimbursements = reimbursementQuery.data?.data.items ?? [];
  const reports = reportsQuery.data?.data.items ?? [];
  const misSummary = misQuery.data?.summary ?? [];
  const misTrend = misQuery.data?.trend ?? [];

  const hasMis = canMis && misSummary.length > 0;
  const hasPayroll = canPayroll && batches.length > 0;

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

  const payrollTotal = hasMis
    ? sum(misSummary.map((row) => row.totalPayrollDisbursed))
    : sum(batches.map((batch) => batch.total_gross_amount));
  const pphTotal = hasMis
    ? sum(misSummary.map((row) => row.totalPph21Collected))
    : sum(batches.map((batch) => batch.total_tax_pph21));
  const claimsTotal = hasMis
    ? sum(misSummary.map((row) => row.totalClaimsApprovedAmount))
    : sum(claims.map((claim) => claim.approved_amount ?? claim.requested_amount));
  const pendingClaims = claims.filter((claim) => PENDING_CLAIM_STATUSES.has(claim.status)).length;
  const conflictClaims = claims.filter((claim) => claim.has_conflict_flag).length;
  const approvalRate =
    misSummary.length === 0
      ? 0
      : misSummary.reduce((total, row) => total + row.claimApprovalRatePct, 0) / misSummary.length;

  const payrollSpark = (hasMis ? misTrendData : batchTrendData).map((point) => point.payroll);
  const claimSpark = (hasMis ? misTrendData : batchTrendData).map((point) => point.claims);

  const kpis: Kpi[] = hasMis
    ? [
        {
          label: "Payroll dicairkan",
          value: formatCompactMoney(payrollTotal),
          meta: "Bulan berjalan",
          trend: payrollSpark,
          icon: <Wallet size={15} />,
        },
        {
          label: "PPh 21 terkumpul",
          value: formatCompactMoney(pphTotal),
          meta: "Bulan berjalan",
          trend: misTrendData.map((point) => point.pph21),
          icon: <CircleDollarSign size={15} />,
        },
        {
          label: "Klaim disetujui",
          value: formatCompactMoney(claimsTotal),
          meta: "Bulan berjalan",
          trend: claimSpark,
          icon: <ReceiptText size={15} />,
        },
        {
          label: "Approval rate",
          value: `${approvalRate.toFixed(1)}%`,
          meta: "Rata-rata cabang",
          trend: misTrendData.map((point) => point.claims),
          icon: <Gauge size={15} />,
        },
      ]
    : hasPayroll
      ? [
          {
            label: "Batch payroll",
            value: formatCompactNumber(batches.length),
            meta: "Terlihat di tenant",
            trend: batchTrendData.map((point) => point.payroll),
            icon: <Wallet size={15} />,
          },
          {
            label: "Bruto batch",
            value: formatCompactMoney(payrollTotal),
            meta: "Akumulasi batch",
            trend: batchTrendData.map((point) => point.payroll),
            icon: <CircleDollarSign size={15} />,
          },
          {
            label: "Cuti menunggu",
            value: formatCompactNumber(leave.length),
            meta: "Perlu keputusan",
            trend: [leave.length, leave.length],
            tone: "amber",
            icon: <CalendarDays size={15} />,
          },
          {
            label: "Reimburse menunggu",
            value: formatCompactNumber(reimbursements.length),
            meta: "Perlu keputusan",
            trend: [reimbursements.length, reimbursements.length],
            tone: "amber",
            icon: <ReceiptText size={15} />,
          },
        ]
      : [
          {
            label: "Klaim terlihat",
            value: formatCompactNumber(claims.length),
            meta: "100 klaim terbaru",
            trend: [claims.length, claims.length],
            icon: <ReceiptText size={15} />,
          },
          {
            label: "Menunggu keputusan",
            value: formatCompactNumber(pendingClaims),
            meta: "Termasuk eskalasi",
            trend: [pendingClaims, pendingClaims],
            tone: "amber",
            icon: <ShieldAlert size={15} />,
          },
          {
            label: "Nilai disetujui",
            value: formatCompactMoney(claimsTotal),
            meta: "Dari klaim terlihat",
            trend: claimSpark,
            icon: <CircleDollarSign size={15} />,
          },
          {
            label: "Flag konflik",
            value: formatCompactNumber(conflictClaims),
            meta: "Perlu review",
            trend: [conflictClaims, conflictClaims],
            tone: "danger",
            icon: <ShieldAlert size={15} />,
          },
        ];

  const attention: AttentionItem[] = [];
  if (canWorkforce) {
    attention.push(
      {
        label: "Cuti menunggu",
        count: leave.length,
        to: "/workforce",
        icon: <CalendarDays size={15} />,
        tone: "amber",
      },
      {
        label: "Lembur menunggu",
        count: overtime.length,
        to: "/workforce",
        icon: <Gauge size={15} />,
        tone: "amber",
      },
      {
        label: "Reimburse menunggu",
        count: reimbursements.length,
        to: "/workforce",
        icon: <ReceiptText size={15} />,
        tone: "amber",
      },
    );
  }
  if (canClaims) {
    attention.push({
      label: "Klaim perlu keputusan",
      count: pendingClaims,
      to: "/claims",
      icon: <ShieldAlert size={15} />,
      tone: "danger",
    });
  }
  if (canPayroll) {
    attention.push({
      label: "Laporan gagal",
      count: reports.filter((report) => report.status === "FAILED").length,
      to: "/reports",
      icon: <FileWarning size={15} />,
      tone: "danger",
    });
  }
  const visibleAttention = attention.filter((item) => item.count > 0);

  const firstName = user?.full_name.split(" ")[0] ?? "tim";
  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  return (
    <div className="stack overview-page">
      <section className="overview-hero">
        <div className="overview-hero__copy">
          <h1>Selamat datang, {firstName}.</h1>
          <p>
            Satu tempat untuk melihat arus payroll, klaim, dan antrean keputusan sebelum mengambil
            langkah berikutnya.
          </p>
          <div className="overview-hero__actions">
            {canPayroll ? (
              <Link to="/payroll" className="overview-action">
                <Wallet size={14} aria-hidden="true" />
                Konsol payroll
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            ) : null}
            {canClaims ? (
              <Link to="/claims" className="overview-action">
                <ReceiptText size={14} aria-hidden="true" />
                Ruang klaim
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            ) : null}
            {canWorkforce ? (
              <Link to="/workforce" className="overview-action">
                <CalendarDays size={14} aria-hidden="true" />
                Antrean keputusan
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="overview-hero__meta">
          <span className="overview-hero__date">{dateLabel}</span>
          <span className="overview-hero__role">{user?.role.replaceAll("_", " ")}</span>
        </div>
      </section>

      {queryError !== undefined ? (
        <ErrorState
          error={queryError}
          onRetry={() =>
            void Promise.all([
              misQuery.refetch(),
              batchesQuery.refetch(),
              claimsQuery.refetch(),
              reportsQuery.refetch(),
            ])
          }
        />
      ) : null}

      {misQuery.isPending && canMis ? (
        <SkeletonTable rows={4} />
      ) : (
        <div className="kpi-grid">
          {kpis.map((kpi) => (
            <article className="kpi-card" key={kpi.label}>
              <div className="kpi-card__top">
                <span className="kpi-card__label">{kpi.label}</span>
                <span className={`kpi-card__icon kpi-card__icon--${kpi.tone ?? "jade"}`}>
                  {kpi.icon}
                </span>
              </div>
              <div className="kpi-card__value">{kpi.value}</div>
              <div className="kpi-card__footer">
                <span>{kpi.meta}</span>
                <Sparkline values={kpi.trend} tone={kpi.tone ?? "jade"} />
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="overview-main-grid">
        <section className="panel overview-chart-panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">
                {hasMis || hasPayroll
                  ? misTrendData.length < 2
                    ? "Ringkasan bulan ini"
                    : "Tren payroll 6 bulan"
                  : "Status klaim"}
              </div>
              <div className="panel__description">
                {hasMis || hasPayroll
                  ? misTrendData.length < 2
                    ? "Belum ada dua periode untuk menggambar tren."
                    : "Nilai payroll yang diproses per periode."
                  : "Sebaran status dari 100 klaim terbaru."}
              </div>
            </div>
            <BadgeCheck size={16} aria-hidden="true" />
          </div>
          <div className="panel__body overview-chart-panel__body">
            {hasMis || hasPayroll ? (
              misTrendData.length < 2 && hasMis ? (
                <MonthlyBreakdown
                  items={[
                    { label: "Payroll", value: payrollTotal },
                    { label: "PPh 21", value: pphTotal, tone: "amber" },
                    { label: "Klaim disetujui", value: claimsTotal },
                  ]}
                />
              ) : (
                <PayrollTrendChart data={hasMis ? misTrendData : batchTrendData} />
              )
            ) : (
              <ClaimsStatusChart
                data={[
                  { label: "Menunggu", value: pendingClaims },
                  {
                    label: "Disetujui",
                    value: claims.filter((claim) => claim.status === "APPROVED").length,
                  },
                  {
                    label: "Dicairkan",
                    value: claims.filter((claim) => claim.status === "DISBURSED").length,
                  },
                  {
                    label: "Ditolak",
                    value: claims.filter((claim) => claim.status === "REJECTED").length,
                  },
                ]}
              />
            )}
          </div>
        </section>

        <section className="panel overview-attention">
          <div className="panel__header">
            <div>
              <div className="panel__title">Perlu perhatian</div>
              <div className="panel__description">
                Antrean dan sinyal yang bisa menunggu keputusan.
              </div>
            </div>
            <ShieldAlert size={16} aria-hidden="true" />
          </div>
          <div className="panel__body panel__body--flush">
            {visibleAttention.length === 0 ? (
              <div className="overview-empty">Tidak ada antrean kritis saat ini.</div>
            ) : (
              <ul className="attention-list">
                {visibleAttention.map((item) => (
                  <li key={item.label}>
                    <Link to={item.to} className="attention-item">
                      <span className={`attention-item__icon attention-item__icon--${item.tone}`}>
                        {item.icon}
                      </span>
                      <span className="attention-item__label">{item.label}</span>
                      <strong>{formatCompactNumber(item.count)}</strong>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">
              {hasMis ? "Kinerja per cabang" : hasPayroll ? "Batch terbaru" : "Klaim terbaru"}
            </div>
            <div className="panel__description">
              {hasMis
                ? "Payroll, PPh 21, dan klaim pada bulan berjalan."
                : hasPayroll
                  ? "Batch payroll terakhir yang terlihat oleh peran Anda."
                  : "Klaim terakhir yang masuk ke ruang kerja Anda."}
            </div>
          </div>
          {hasMis ? <Users size={16} aria-hidden="true" /> : null}
        </div>
        <div className="table-wrap" role="region" aria-label="Tabel ringkasan peran" tabIndex={0}>
          {hasMis ? (
            <table className="table">
              <caption className="sr-only">Kinerja payroll dan klaim per cabang</caption>
              <thead>
                <tr>
                  <th scope="col">Cabang</th>
                  <th scope="col" className="numeric">
                    Payroll
                  </th>
                  <th scope="col" className="numeric">
                    PPh 21
                  </th>
                  <th scope="col" className="numeric">
                    Klaim
                  </th>
                  <th scope="col" className="numeric">
                    Approval
                  </th>
                </tr>
              </thead>
              <tbody>
                {misSummary
                  .slice()
                  .sort((a, b) => Number(b.totalPayrollDisbursed) - Number(a.totalPayrollDisbursed))
                  .slice(0, 6)
                  .map((row) => (
                    <tr key={row.branchId}>
                      <td>
                        <div className="table__primary">{row.branchName}</div>
                        <div className="table__secondary mono">{row.branchCode}</div>
                      </td>
                      <td className="numeric">{formatMoney(row.totalPayrollDisbursed)}</td>
                      <td className="numeric">{formatMoney(row.totalPph21Collected)}</td>
                      <td className="numeric">{formatMoney(row.totalClaimsApprovedAmount)}</td>
                      <td className="numeric">{row.claimApprovalRatePct.toFixed(1)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : hasPayroll ? (
            <table className="table">
              <caption className="sr-only">Batch payroll terbaru</caption>
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
                {batches.slice(0, 6).map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <div className="table__primary mono">{batch.batch_code}</div>
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
          ) : (
            <table className="table">
              <caption className="sr-only">Klaim terbaru</caption>
              <thead>
                <tr>
                  <th scope="col">Klaim</th>
                  <th scope="col">Pemohon</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col" className="numeric">
                    Nominal
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {claims.slice(0, 6).map((claim: ClaimSummary) => (
                  <tr key={claim.id}>
                    <td>
                      <div className="table__primary mono">{claim.claim_number}</div>
                      <div className="table__secondary">{claim.claim_category}</div>
                    </td>
                    <td>{claim.claimant_name}</td>
                    <td>{formatDate(claim.created_at)}</td>
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
          )}
        </div>
      </section>
    </div>
  );
}
