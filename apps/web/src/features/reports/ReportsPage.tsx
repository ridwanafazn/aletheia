import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { ReportType, TaxReport } from "@aletheia/shared-contracts";

import { ApiError, absoluteApiUrl } from "../../shared/api/client";
import { listBranches } from "../../shared/api/reference";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonTable,
  Stat,
  StatusBadge,
} from "../../shared/ui";
import {
  currentPeriod,
  formatDateTime,
  formatMoney,
  formatPeriod,
  reportTypeLabel,
} from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { hasFeature, useTenantProfile } from "../tenant/api";
import { downloadReport, generateReport, listReports } from "./api";
import { REPORT_TYPE_OPTIONS, reportPeriod } from "./model";
import type { ReportSearch } from "./search";

function openSignedFile(url: string): void {
  const link = document.createElement("a");
  link.href = absoluteApiUrl(url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function reportPeriodLabel(report: TaxReport): string {
  if (report.report_type === "PPH21_ANNUAL") {
    return report.period_start.slice(0, 4);
  }
  return formatPeriod(report.period_start);
}

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const tenantQuery = useTenantProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as ReportSearch;
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const allowedOptions = REPORT_TYPE_OPTIONS.filter(
    (item) =>
      item.value !== "PAYROLL_COST_INVOICE" ||
      hasFeature(tenantQuery.data?.data, "PAYROLL_COST_INVOICE"),
  );
  const requestedType = (search.type ?? "PPH21_MONTHLY") as ReportType;
  const reportType = allowedOptions.some((item) => item.value === requestedType)
    ? requestedType
    : "PPH21_MONTHLY";
  const option = allowedOptions.find((item) => item.value === reportType);
  const month = search.period ?? currentPeriod();
  const year = search.year ?? String(new Date().getFullYear());
  const period = reportPeriod({ reportType, month, year });

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const listPeriod = option?.periodMode === "year" ? `${year}-01-01` : `${month}-01`;

  const query = useInfiniteQuery({
    queryKey: ["reports", reportType, listPeriod, search.branch_id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listReports({
        report_type: reportType,
        period_month: listPeriod,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
    refetchInterval: (queryState) => {
      const pages = queryState.state.data?.pages ?? [];
      return pages.some((page) =>
        page.data.items.some((item) => item.status === "QUEUED" || item.status === "GENERATING"),
      )
        ? 5_000
        : false;
    },
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];
  const readyCount = items.filter((item) => item.status === "READY").length;
  const pendingCount = items.filter(
    (item) => item.status === "QUEUED" || item.status === "GENERATING",
  ).length;

  const generateMutation = useMutation({
    mutationFn: (idempotencyKey: string) =>
      generateReport(
        {
          report_type: reportType,
          period_start: period.period_start,
          period_end: period.period_end,
          branch_id: search.branch_id ?? null,
        },
        idempotencyKey,
      ),
    onSuccess: (result) => {
      setActionError(null);
      setNotice(
        `${reportTypeLabel(result.data.report_type)} masuk antrean. Status akan berubah menjadi siap setelah worker selesai.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (reportId: string) => downloadReport(reportId),
    onSuccess: (result) => {
      setActionError(null);
      openSignedFile(result.data.url);
      setNotice(
        `Tautan unduhan dibuka di tab baru. Tautan berlaku sampai ${formatDateTime(result.data.expires_at)}.`,
      );
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const updateFilter = (key: keyof ReportSearch, value: string) => {
    void navigate({
      to: "/reports",
      search: { ...search, [key]: value.length === 0 ? undefined : value },
      replace: true,
    });
  };

  if (!hasRole("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">
            Laporan dan ekspor hanya tersedia untuk peran payroll dan kepatuhan.
          </p>
        </div>
      </div>
    );
  }

  const actionApiError = actionError instanceof ApiError ? actionError : null;
  const canCreate = hasRole("HR_SPECIALIST", "FINANCE_MANAGER");
  const failedItems = items.filter((item) => item.status === "FAILED");

  return (
    <div className="stack">
      <PageHeader
        title="Laporan dan Ekspor"
        description="Buat dan unduh PPh 21 bulanan dan tahunan, BPJS bulanan, berkas transfer bank, varians payroll, serta invoice biaya payroll."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            loading={query.isFetching && !query.isFetchingNextPage}
            onClick={() => void query.refetch()}
          >
            Segarkan
          </Button>
        }
      />

      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {actionApiError === null ? null : (
        <Banner tone="danger" title="Tindakan gagal">
          {actionApiError.message}
        </Banner>
      )}

      <div className="stat-grid">
        <Stat label="Laporan terlihat" value={items.length} meta="Maksimal 25 per halaman" />
        <Stat label="Siap" value={readyCount} meta="Dapat diunduh" />
        <Stat label="Dalam proses" value={pendingCount} meta="Menyegarkan tiap lima detik" />
        <Stat
          label="Jenis aktif"
          value={reportTypeLabel(reportType)}
          meta={option?.periodMode === "year" ? year : formatPeriod(`${month}-01`)}
        />
      </div>

      {failedItems.length === 0 ? null : (
        <Banner tone="danger" title="Sebagian laporan gagal dibuat">
          Laporan yang gagal tidak dapat diunduh. Periksa periode dan cabang, lalu buat ulang
          laporan. Hubungi administrator bila masalah berulang.
        </Banner>
      )}

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Buat laporan</div>
            <div className="panel__description">
              Laporan memakai policy payroll aktif pada saat permintaan dibuat.
            </div>
          </div>
        </div>
        {canCreate ? (
          <div className="panel__body">
            <div className="filter-bar" aria-label="Filter dan pembuatan laporan">
              <div className="field">
                <label className="field__label" htmlFor="report-type">
                  Jenis laporan
                </label>
                <select
                  id="report-type"
                  className="select"
                  value={reportType}
                  onChange={(event) => updateFilter("type", event.target.value)}
                >
                  {allowedOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {option?.periodMode === "year" ? (
                <div className="field">
                  <label className="field__label" htmlFor="report-year">
                    Tahun pajak
                  </label>
                  <input
                    id="report-year"
                    className="input"
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(event) => updateFilter("year", event.target.value)}
                  />
                </div>
              ) : (
                <div className="field">
                  <label className="field__label" htmlFor="report-period">
                    Periode
                  </label>
                  <input
                    id="report-period"
                    className="input"
                    type="month"
                    value={month}
                    onChange={(event) => updateFilter("period", event.target.value)}
                  />
                </div>
              )}
              <div className="field">
                <label className="field__label" htmlFor="report-branch">
                  Cabang
                </label>
                <select
                  id="report-branch"
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
              <div className="field field--action">
                <span className="field__label" aria-hidden="true">
                  &nbsp;
                </span>
                <Button
                  variant="primary"
                  icon={<FileSpreadsheet size={15} />}
                  loading={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(crypto.randomUUID())}
                >
                  Buat laporan
                </Button>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Rentang {period.period_start} sampai {period.period_end}. Laporan baru membuat versi
              baru dan tidak menimpa laporan lama.
            </p>
          </div>
        ) : (
          <div className="panel__body">
            <Banner tone="info" title="Mode baca">
              Peran kepatuhan dapat melihat dan mengunduh laporan. Pembuatan laporan dilakukan
              Spesialis SDM atau Manajer Keuangan.
            </Banner>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Riwayat laporan</div>
            <div className="panel__description">
              Versi, checksum, status, dan tautan unduhan bertanda tangan.
            </div>
          </div>
        </div>

        {query.isPending ? (
          <SkeletonTable rows={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada laporan"
            body="Buat laporan pertama untuk periode yang sudah memiliki batch payroll final."
            icon={<FileSpreadsheet size={18} />}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Riwayat laporan dengan jenis, periode, status, checksum, dan unduhan
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Jenis</th>
                    <th scope="col">Periode</th>
                    <th scope="col" className="col-hide-sm">
                      Cabang
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Versi
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="numeric col-hide-sm">
                      Headcount
                    </th>
                    <th scope="col" className="numeric col-hide-sm">
                      {reportType === "PAYROLL_COST_INVOICE" ? "Total invoice" : "PPh 21"}
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Checksum
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Dibuat
                    </th>
                    <th scope="col">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((report) => {
                    const branch = branches.find((item) => item.id === report.branch_id);
                    return (
                      <tr key={report.id} data-testid={`report-row-${report.id}`}>
                        <td>
                          <div className="table__primary">
                            {reportTypeLabel(report.report_type)}
                          </div>
                        </td>
                        <td>{reportPeriodLabel(report)}</td>
                        <td className="col-hide-sm">{branch?.code ?? "Semua"}</td>
                        <td className="col-hide-sm mono">{report.version}</td>
                        <td>
                          <StatusBadge status={report.status} />
                        </td>
                        <td className="numeric col-hide-sm">{report.headcount}</td>
                        <td className="numeric col-hide-sm">
                          {report.report_type === "PAYROLL_COST_INVOICE" &&
                          typeof report.totals.total_invoice === "string"
                            ? formatMoney(report.totals.total_invoice)
                            : formatMoney(report.total_pph21)}
                        </td>
                        <td className="col-hide-sm mono small">
                          {report.file_checksum_sha256 === null
                            ? "Belum ada"
                            : `${report.file_checksum_sha256.slice(0, 12)}…`}
                        </td>
                        <td className="col-hide-sm small">{formatDateTime(report.generated_at)}</td>
                        <td>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Download size={14} />}
                            disabled={report.status !== "READY"}
                            loading={
                              downloadMutation.isPending && downloadMutation.variables === report.id
                            }
                            onClick={() => downloadMutation.mutate(report.id)}
                            aria-label={`Unduh ${reportTypeLabel(report.report_type)} ${reportPeriodLabel(report)}`}
                          >
                            Unduh
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {query.hasNextPage ? (
              <div className="panel__body" style={{ paddingTop: 0 }}>
                <Button
                  variant="secondary"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Muat lebih banyak
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
