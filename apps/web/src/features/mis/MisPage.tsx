import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  FileText,
  FlaskConical,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import type { BranchKpi } from "../mis/api";
import { fetchMisDashboard } from "../mis/api";
import {
  currentPeriod,
  formatCompactMoney,
  formatMoney,
  formatNumber,
  formatPeriod,
  periodEndDate,
} from "../../shared/lib/format";
import { listBranches } from "../../shared/api/reference";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonTable,
  Sparkline,
} from "../../shared/ui";
import type { MisSearch } from "./search";

interface TrendMonth {
  month: string;
  payroll: number;
  claims: number;
  pph21: number;
  submitted: number;
}

interface HealthMetric {
  label: string;
  value: string;
  meta: string;
  tone?: "jade" | "amber" | "danger";
  meter?: number;
}

function sum(rows: BranchKpi[], field: keyof BranchKpi): number {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function aggregateTrend(rows: BranchKpi[]): TrendMonth[] {
  const months = new Map<string, TrendMonth>();
  for (const row of rows) {
    const entry = months.get(row.reportMonth) ?? {
      month: row.reportMonth,
      payroll: 0,
      claims: 0,
      pph21: 0,
      submitted: 0,
    };
    entry.payroll += Number(row.totalPayrollDisbursed);
    entry.claims += Number(row.totalClaimsApprovedAmount);
    entry.pph21 += Number(row.totalPph21Collected);
    entry.submitted += Number(row.totalClaimsSubmitted);
    months.set(row.reportMonth, entry);
  }
  return [...months.values()].sort((left, right) => left.month.localeCompare(right.month));
}

function TrendTable({ months }: { months: TrendMonth[] }) {
  return (
    <details className="trend-chart__data">
      <summary>Lihat data tren</summary>
      <div className="table-wrap" tabIndex={0} aria-label="Data tren klaim dan payroll per bulan">
        <table className="table">
          <caption className="sr-only">Data tren klaim dan payroll per bulan</caption>
          <thead>
            <tr>
              <th scope="col">Bulan</th>
              <th scope="col" className="numeric">
                Diajukan
              </th>
              <th scope="col" className="numeric">
                Klaim disetujui
              </th>
              <th scope="col" className="numeric">
                Payroll dicairkan
              </th>
              <th scope="col" className="numeric">
                PPh 21
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month}>
                <td>{formatPeriod(month.month)}</td>
                <td className="numeric">{formatMoney(String(month.submitted))}</td>
                <td className="numeric">{formatMoney(String(month.claims))}</td>
                <td className="numeric">{formatMoney(String(month.payroll))}</td>
                <td className="numeric">{formatMoney(String(month.pph21))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TrendChart({ months }: { months: TrendMonth[] }) {
  const latest = months[months.length - 1];
  const maximum = Math.max(1, ...months.flatMap((month) => [month.payroll, month.claims]));

  if (months.length < 2 && latest !== undefined) {
    return (
      <div className="mis-trend">
        <div
          className="mis-snapshot"
          role="img"
          aria-label={`Tren ${months.length} bulan. ${formatPeriod(latest.month)}: klaim disetujui ${formatMoney(
            String(latest.claims),
          )}, payroll dicairkan ${formatMoney(String(latest.payroll))}.`}
        >
          <div className="mis-snapshot__intro">
            <span className="mis-snapshot__period">{formatPeriod(latest.month)}</span>
            <p>
              Data baru tersedia untuk satu periode. Grafik tren muncul otomatis setelah dua bulan
              atau lebih.
            </p>
          </div>
          <div className="mis-snapshot__grid">
            <div>
              <span>Klaim disetujui</span>
              <strong>{formatMoney(String(latest.claims))}</strong>
              <small>{latest.submitted} pengajuan</small>
            </div>
            <div>
              <span>Payroll dicairkan</span>
              <strong>{formatMoney(String(latest.payroll))}</strong>
              <small>Batch disbursed dan partial</small>
            </div>
            <div>
              <span>PPh 21 terkumpul</span>
              <strong>{formatMoney(String(latest.pph21))}</strong>
              <small>Potongan karyawan</small>
            </div>
          </div>
        </div>
        <TrendTable months={months} />
      </div>
    );
  }

  return (
    <div className="mis-trend">
      <div className="trend-chart">
        <div className="trend-chart__legend">
          <span className="trend-chart__legend-item">Klaim disetujui</span>
          <span className="trend-chart__legend-item trend-chart__legend-item--payroll">
            Payroll dicairkan
          </span>
          <span className="trend-chart__legend-note">Puncak {formatCompactMoney(maximum)}</span>
        </div>
        <div
          className="trend-chart__plot"
          role="img"
          aria-label={`Tren ${months.length} bulan. Nilai tertinggi ${formatMoney(String(maximum))}.`}
        >
          {months.map((month) => (
            <div className="trend-chart__month" key={month.month}>
              <div className="trend-chart__bars" aria-hidden="true">
                <span
                  className="trend-chart__bar trend-chart__bar--claims"
                  style={{ height: `${Math.max(2, (month.claims / maximum) * 100)}%` }}
                  title={`Klaim ${formatMoney(String(month.claims))}`}
                />
                <span
                  className="trend-chart__bar trend-chart__bar--payroll"
                  style={{ height: `${Math.max(2, (month.payroll / maximum) * 100)}%` }}
                  title={`Payroll ${formatMoney(String(month.payroll))}`}
                />
              </div>
              <div className="trend-chart__label">{formatPeriod(month.month).split(" ")[0]}</div>
            </div>
          ))}
        </div>
        <TrendTable months={months} />
      </div>
    </div>
  );
}

export default function MisPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as MisSearch;
  const period = search.period ?? currentPeriod();
  const months = search.months ?? 6;

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const query = useQuery({
    queryKey: ["mis-dashboard", period, search.branch_id, months],
    queryFn: () =>
      fetchMisDashboard({
        reportMonth: `${period}-01`,
        branchId: search.branch_id,
        months,
      }),
  });

  const summary = query.data?.summary ?? [];
  const trend = aggregateTrend(query.data?.trend ?? []);
  const totalSubmitted = sum(summary, "totalClaimsSubmitted");
  const totalApprovedAmount = sum(summary, "totalClaimsApprovedAmount");
  const totalPayroll = sum(summary, "totalPayrollDisbursed");
  const totalTax = sum(summary, "totalPph21Collected");
  const approvalRate =
    summary.length === 0
      ? 0
      : summary.reduce((total, row) => total + row.claimApprovalRatePct, 0) / summary.length;
  const turnaround =
    summary.length === 0
      ? 0
      : summary.reduce((total, row) => total + row.avgTurnaroundHours, 0) / summary.length;
  const budget =
    summary.length === 0
      ? 0
      : summary.reduce((total, row) => total + row.budgetUtilizationPct, 0) / summary.length;
  const variance =
    summary.length === 0
      ? 0
      : summary.reduce((total, row) => total + row.momVariancePct, 0) / summary.length;

  const kpis: Array<{
    label: string;
    value: string;
    meta: string;
    trend: number[];
    tone: "jade" | "amber";
    icon: ReactNode;
  }> = [
    {
      label: "Klaim diajukan",
      value: formatNumber(totalSubmitted),
      meta: `${summary.length} cabang`,
      trend: trend.map((month) => month.submitted),
      tone: "jade",
      icon: <FileText size={15} />,
    },
    {
      label: "Klaim disetujui",
      value: formatMoney(String(totalApprovedAmount)),
      meta: `${formatNumber(approvalRate)}% approval rate`,
      trend: trend.map((month) => month.claims),
      tone: "jade",
      icon: <BadgeCheck size={15} />,
    },
    {
      label: "Payroll dicairkan",
      value: formatMoney(String(totalPayroll)),
      meta: "Batch disbursed",
      trend: trend.map((month) => month.payroll),
      tone: "jade",
      icon: <Wallet size={15} />,
    },
    {
      label: "PPh 21 terkumpul",
      value: formatMoney(String(totalTax)),
      meta: "Potongan karyawan",
      trend: trend.map((month) => month.pph21),
      tone: "amber",
      icon: <ReceiptText size={15} />,
    },
  ];

  const health: HealthMetric[] = [
    {
      label: "Approval rate",
      value: `${formatNumber(approvalRate)}%`,
      meta: "Rata-rata cabang",
      meter: Math.max(0, Math.min(100, approvalRate)),
    },
    {
      label: "Turnaround",
      value: `${formatNumber(turnaround)} jam`,
      meta: "Rata-rata keputusan",
      tone: "jade",
    },
    {
      label: "Utilisasi anggaran",
      value: `${formatNumber(budget)}%`,
      meta: "Dari plafon periode",
      meter: Math.max(0, Math.min(100, budget)),
    },
    {
      label: "Varians MoM",
      value: `${variance > 0 ? "+" : ""}${formatNumber(variance)}%`,
      meta: "Dibanding bulan sebelumnya",
      tone: variance < 0 ? "amber" : "jade",
    },
  ];

  const updateFilter = (key: keyof MisSearch, value: string) => {
    void navigate({
      to: "/mis",
      search: {
        ...search,
        [key]: value.length === 0 ? undefined : key === "months" ? Number(value) : value,
      },
      replace: true,
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="MIS Intelligence"
        description="KPI lintas cabang untuk klaim dan payroll. Angka berasal dari materialized view yang diperbarui worker dan dibatasi oleh security barrier tenant."
        actions={
          <Button
            variant="primary"
            icon={<FlaskConical size={15} />}
            onClick={() => navigate({ to: "/mis/what-if" })}
          >
            Buka What-If
          </Button>
        }
      />

      <section className="panel">
        <div className="filter-bar" aria-label="Filter MIS">
          <div className="field">
            <label className="field__label" htmlFor="mis-period">
              Periode
            </label>
            <input
              id="mis-period"
              className="input"
              type="month"
              value={period}
              onChange={(event) => updateFilter("period", event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="mis-branch">
              Cabang
            </label>
            <select
              id="mis-branch"
              className="select"
              value={search.branch_id ?? ""}
              onChange={(event) => updateFilter("branch_id", event.target.value)}
            >
              <option value="">Semua cabang</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="mis-months">
              Rentang tren
            </label>
            <select
              id="mis-months"
              className="select"
              value={String(months)}
              onChange={(event) => updateFilter("months", event.target.value)}
            >
              <option value="3">3 bulan</option>
              <option value="6">6 bulan</option>
              <option value="12">12 bulan</option>
            </select>
          </div>
          <div className="filter-bar__spacer" />
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Segarkan
          </Button>
        </div>
      </section>

      {query.isPending ? (
        <SkeletonTable rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : summary.length === 0 ? (
        <EmptyState
          title="Belum ada KPI pada periode ini"
          body="Pilih periode lain, hapus filter cabang, atau tunggu worker menyegarkan materialized view."
          icon={<TrendingUp size={18} />}
        />
      ) : (
        <>
          <div className="kpi-grid">
            {kpis.map((kpi) => (
              <article className="kpi-card" key={kpi.label}>
                <div className="kpi-card__top">
                  <span className="kpi-card__label">{kpi.label}</span>
                  <span className={`kpi-card__icon kpi-card__icon--${kpi.tone}`}>{kpi.icon}</span>
                </div>
                <div className="kpi-card__value">{kpi.value}</div>
                <div className="kpi-card__footer">
                  <span>{kpi.meta}</span>
                  {kpi.trend.length > 1 ? (
                    <Sparkline
                      values={kpi.trend}
                      tone={kpi.tone}
                      label={`Tren ${kpi.label.toLowerCase()}`}
                    />
                  ) : (
                    <span className="kpi-card__period">1 periode</span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <section className="mis-health" aria-label="Kesehatan operasional">
            {health.map((metric) => (
              <div className="mis-health__item" key={metric.label}>
                <div className="mis-health__head">
                  <span className="mis-health__label">{metric.label}</span>
                  {metric.label === "Turnaround" ? (
                    <Clock3 size={14} aria-hidden="true" />
                  ) : metric.label === "Varians MoM" ? (
                    variance < 0 ? (
                      <ArrowDownRight size={14} aria-hidden="true" />
                    ) : (
                      <ArrowUpRight size={14} aria-hidden="true" />
                    )
                  ) : null}
                </div>
                <strong
                  className={metric.tone === "amber" ? "mis-health__value--amber" : undefined}
                >
                  {metric.value}
                </strong>
                {metric.meter === undefined ? (
                  <span className="mis-health__meta">{metric.meta}</span>
                ) : (
                  <>
                    <span className="mis-health__meter" aria-hidden="true">
                      <span
                        className="mis-health__meter-fill"
                        style={{ width: `${Math.max(2, metric.meter)}%` }}
                      />
                    </span>
                    <span className="mis-health__meta">{metric.meta}</span>
                  </>
                )}
              </div>
            ))}
          </section>

          <div className="stack">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">KPI per cabang</div>
                  <div className="panel__description">
                    {formatPeriod(`${period}-01`)} · {summary.length} cabang
                  </div>
                </div>
                <span className="badge badge--approved">Terbaru</span>
              </div>
              <div className="table-wrap mis-table" tabIndex={0} aria-label="Tabel KPI per cabang">
                <table className="table">
                  <caption className="sr-only">
                    KPI klaim dan payroll per cabang dengan tautan drill-down
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Cabang</th>
                      <th scope="col" className="numeric">
                        Klaim
                      </th>
                      <th scope="col" className="numeric col-hide-sm">
                        Disetujui
                      </th>
                      <th scope="col" className="numeric">
                        Approval
                      </th>
                      <th scope="col" className="numeric col-hide-sm">
                        Turnaround
                      </th>
                      <th scope="col" className="numeric">
                        Payroll
                      </th>
                      <th scope="col" className="numeric col-hide-sm">
                        PPh 21
                      </th>
                      <th scope="col" className="numeric col-hide-sm">
                        Varians
                      </th>
                      <th scope="col">
                        <span className="sr-only">Drill-down</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.branchId}>
                        <td>
                          <div className="branch-cell">
                            <span className="branch-mark" aria-hidden="true">
                              <Building2 size={14} />
                            </span>
                            <span className="branch-copy">
                              <span className="branch-name">{row.branchName}</span>
                              <span className="branch-code mono">{row.branchCode}</span>
                            </span>
                          </div>
                        </td>
                        <td className="numeric">{row.totalClaimsSubmitted}</td>
                        <td className="numeric col-hide-sm">
                          {formatMoney(row.totalClaimsApprovedAmount)}
                        </td>
                        <td className="approval-cell">
                          <span>{formatNumber(row.claimApprovalRatePct)}%</span>
                          <span className="approval-meter" aria-hidden="true">
                            <span
                              className="approval-meter__fill"
                              style={{
                                width: `${Math.max(2, Math.min(100, row.claimApprovalRatePct))}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td className="numeric col-hide-sm">
                          {formatNumber(row.avgTurnaroundHours)} jam
                        </td>
                        <td className="numeric">{formatMoney(row.totalPayrollDisbursed)}</td>
                        <td className="numeric col-hide-sm">
                          {formatMoney(row.totalPph21Collected)}
                        </td>
                        <td
                          className={`numeric col-hide-sm ${row.momVariancePct < 0 ? "variance__down" : ""}`}
                        >
                          <span className="variance-cell">
                            {row.momVariancePct < 0 ? (
                              <TrendingDown size={12} aria-hidden="true" />
                            ) : row.momVariancePct > 0 ? (
                              <TrendingUp size={12} aria-hidden="true" />
                            ) : null}
                            {row.momVariancePct > 0 ? "+" : ""}
                            {formatNumber(row.momVariancePct)}%
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end" }}>
                            <Link
                              to="/claims"
                              search={{
                                branch_id: row.branchId,
                                from: `${period}-01`,
                                to: periodEndDate(period),
                              }}
                              className="btn btn--ghost btn--sm"
                              aria-label={`Lihat klaim ${row.branchCode}`}
                            >
                              Klaim
                            </Link>
                            <Link
                              to="/payroll"
                              search={{ branch_id: row.branchId, period }}
                              className="btn btn--ghost btn--sm"
                              aria-label={`Lihat payroll ${row.branchCode}`}
                            >
                              Payroll
                              <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-mis-list">
                {summary.map((row) => (
                  <div className="mis-card" key={row.branchId}>
                    <div className="mis-card__top">
                      <div className="branch-cell">
                        <span className="branch-mark" aria-hidden="true">
                          <Building2 size={14} />
                        </span>
                        <span className="branch-copy">
                          <span className="branch-name">{row.branchName}</span>
                          <span className="branch-code mono">{row.branchCode}</span>
                        </span>
                      </div>
                      <span className="small muted">
                        {formatNumber(row.claimApprovalRatePct)}% approval
                      </span>
                    </div>
                    <div className="mis-card__grid">
                      <div>
                        <span className="micro">Payroll</span>
                        <strong>{formatMoney(row.totalPayrollDisbursed)}</strong>
                      </div>
                      <div>
                        <span className="micro">Klaim</span>
                        <strong>{formatMoney(row.totalClaimsApprovedAmount)}</strong>
                      </div>
                      <div>
                        <span className="micro">Approval</span>
                        <strong>{formatNumber(row.claimApprovalRatePct)}%</strong>
                      </div>
                    </div>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Link
                        to="/payroll"
                        search={{ branch_id: row.branchId, period }}
                        className="btn btn--ghost btn--sm"
                      >
                        Payroll
                      </Link>
                      <Link
                        to="/claims"
                        search={{
                          branch_id: row.branchId,
                          from: `${period}-01`,
                          to: periodEndDate(period),
                        }}
                        className="btn btn--ghost btn--sm"
                      >
                        Klaim
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <div className="panel__title">Tren bulanan</div>
                  <div className="panel__description">Klaim disetujui dan payroll dicairkan</div>
                </div>
              </div>
              <div className="panel__body">
                {trend.length === 0 ? (
                  <EmptyState
                    title="Belum ada data tren"
                    body="Materialized view belum memiliki data untuk rentang ini."
                  />
                ) : (
                  <TrendChart months={trend} />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
