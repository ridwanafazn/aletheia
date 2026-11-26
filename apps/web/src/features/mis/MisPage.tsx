import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowUpRight, FlaskConical, RefreshCw, TrendingUp } from "lucide-react";

import type { BranchKpi } from "../mis/api";
import { fetchMisDashboard } from "../mis/api";
import {
  currentPeriod,
  formatMoney,
  formatNumber,
  formatPeriod,
  periodEndDate,
} from "../../shared/lib/format";
import { listBranches } from "../../shared/api/reference";
import { Button, EmptyState, ErrorState, PageHeader, SkeletonTable, Stat } from "../../shared/ui";
import type { MisSearch } from "./search";

interface TrendMonth {
  month: string;
  payroll: number;
  claims: number;
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
    };
    entry.payroll += Number(row.totalPayrollDisbursed);
    entry.claims += Number(row.totalClaimsApprovedAmount);
    months.set(row.reportMonth, entry);
  }
  return [...months.values()].sort((left, right) => left.month.localeCompare(right.month));
}

function TrendChart({ months }: { months: TrendMonth[] }) {
  const maximum = Math.max(1, ...months.flatMap((month) => [month.payroll, month.claims]));
  return (
    <div className="trend-chart">
      <div className="trend-chart__legend">
        <span className="trend-chart__legend-item trend-chart__legend-item--claims">
          Klaim disetujui
        </span>
        <span className="trend-chart__legend-item trend-chart__legend-item--payroll">
          Payroll dicairkan
        </span>
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
      <details className="trend-chart__data">
        <summary>Lihat data tren</summary>
        <div className="table-wrap" tabIndex={0} aria-label="Data tren klaim dan payroll per bulan">
          <table className="table">
            <caption className="sr-only">Data tren klaim dan payroll per bulan</caption>
            <thead>
              <tr>
                <th scope="col">Bulan</th>
                <th scope="col" className="numeric">
                  Klaim disetujui
                </th>
                <th scope="col" className="numeric">
                  Payroll dicairkan
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <td>{formatPeriod(month.month)}</td>
                  <td className="numeric">{formatMoney(String(month.claims))}</td>
                  <td className="numeric">{formatMoney(String(month.payroll))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
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
          <div className="stat-grid">
            <Stat label="Klaim diajukan" value={totalSubmitted} meta="Seluruh cabang terlihat" />
            <Stat
              label="Klaim disetujui"
              value={formatMoney(String(totalApprovedAmount))}
              meta="Nominal final"
            />
            <Stat
              label="Payroll dicairkan"
              value={formatMoney(String(totalPayroll))}
              meta="Batch disbursed dan partial"
            />
            <Stat
              label="PPh 21 terkumpul"
              value={formatMoney(String(totalTax))}
              meta="Potongan karyawan"
            />
          </div>

          <div className="metric-strip">
            <div>
              <span className="micro">Approval rate</span>
              <strong>{formatNumber(approvalRate)} persen</strong>
            </div>
            <div>
              <span className="micro">Turnaround</span>
              <strong>{formatNumber(turnaround)} jam</strong>
            </div>
            <div>
              <span className="micro">Utilisasi anggaran</span>
              <strong>{formatNumber(budget)} persen</strong>
            </div>
            <div>
              <span className="micro">Varians MoM</span>
              <strong className={variance < 0 ? "variance__down" : undefined}>
                {variance > 0 ? "+" : ""}
                {formatNumber(variance)} persen
              </strong>
            </div>
          </div>

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
                          <div className="table__primary">{row.branchCode}</div>
                          <div className="table__secondary">{row.branchName}</div>
                        </td>
                        <td className="numeric">{row.totalClaimsSubmitted}</td>
                        <td className="numeric col-hide-sm">
                          {formatMoney(row.totalClaimsApprovedAmount)}
                        </td>
                        <td className="numeric">{formatNumber(row.claimApprovalRatePct)}%</td>
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
                          {row.momVariancePct > 0 ? "+" : ""}
                          {formatNumber(row.momVariancePct)}%
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
                      <span className="mis-card__code">{row.branchCode}</span>
                      <span className="small muted">{row.branchName}</span>
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
