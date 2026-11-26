import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Download, FileText, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { Payslip } from "@aletheia/shared-contracts";

import { ApiError, absoluteApiUrl } from "../../shared/api/client";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SkeletonTable,
  Stat,
} from "../../shared/ui";
import { currentPeriod, formatDateTime, formatPeriod } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { listAllEmployees } from "../employees/api";
import { listPayslips, downloadPayslip } from "./api";
import { PayslipDetailDrawer } from "./PayslipDetailDrawer";
import type { PayslipSearch } from "./search";

function openSignedFile(url: string): void {
  const link = document.createElement("a");
  link.href = absoluteApiUrl(url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function PayslipCenterPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as PayslipSearch;
  const period = search.period ?? currentPeriod();
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<unknown>(null);

  const employeesQuery = useQuery({
    queryKey: ["employees-for-payslips"],
    queryFn: () => listAllEmployees(),
    staleTime: 300_000,
  });
  const employees = employeesQuery.data ?? [];

  const query = useInfiniteQuery({
    queryKey: ["payslips", period, search.personnel_id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listPayslips({
        period_month: `${period}-01`,
        personnel_id: search.personnel_id,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];
  const personelCount = new Set(items.map((item) => item.personnel_id)).size;

  const downloadMutation = useMutation({
    mutationFn: (payslipId: string) => downloadPayslip(payslipId),
    onSuccess: (result) => {
      setDownloadError(null);
      openSignedFile(result.data.url);
      setNotice(
        `Tautan unduhan dibuka di tab baru. Tautan berlaku sampai ${formatDateTime(result.data.expires_at)}.`,
      );
    },
    onError: (error) => {
      setNotice(null);
      setDownloadError(error);
    },
  });

  const updateFilter = (key: keyof PayslipSearch, value: string) => {
    void navigate({
      to: "/payslips",
      search: { ...search, [key]: value.length === 0 ? undefined : value },
      replace: true,
    });
  };

  if (!hasRole("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Pusat slip gaji hanya tersedia untuk peran payroll dan kepatuhan.</p>
        </div>
      </div>
    );
  }

  const notReady =
    downloadError instanceof ApiError && downloadError.code === "ERR_REPORT_NOT_READY"
      ? downloadError
      : null;

  return (
    <div className="stack">
      <PageHeader
        title="Slip Gaji"
        description="Slip gaji per periode dengan checksum, kode verifikasi, dan tautan unduhan bertanda tangan."
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
      {notReady === null ? null : (
        <Banner tone="warning" title="Berkas belum tersedia">
          {notReady.message}
        </Banner>
      )}
      {downloadError !== null && notReady === null ? (
        <Banner tone="danger" title="Unduhan gagal">
          {downloadError instanceof ApiError
            ? downloadError.message
            : "Periksa koneksi lalu coba lagi."}
        </Banner>
      ) : null}

      <div className="stat-grid">
        <Stat label="Slip terlihat" value={items.length} meta="Maksimal 25 per halaman" />
        <Stat label="Personel" value={personelCount} meta="Pada filter saat ini" />
        <Stat label="Periode" value={formatPeriod(`${period}-01`)} meta="Asia/Jakarta" />
        <Stat
          label="Status berkas"
          value={items.length === 0 ? "Belum ada" : "Tersimpan"}
          meta="Checksum tersimpan"
        />
      </div>

      <section className="panel">
        <div className="filter-bar" aria-label="Filter slip gaji">
          <div className="field">
            <label className="field__label" htmlFor="payslip-period">
              Periode
            </label>
            <input
              id="payslip-period"
              className="input"
              type="month"
              value={period}
              onChange={(event) => updateFilter("period", event.target.value)}
            />
          </div>
          <div className="field employee-search">
            <label className="field__label" htmlFor="payslip-personnel">
              Personel
            </label>
            <select
              id="payslip-personnel"
              className="select"
              value={search.personnel_id ?? ""}
              onChange={(event) => updateFilter("personnel_id", event.target.value)}
            >
              <option value="">Semua personel</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} · {employee.personnel_code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {query.isPending ? (
          <SkeletonTable rows={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada slip gaji"
            body="Slip gaji dibuat dari batch payroll yang sudah disetujui atau dicairkan."
            icon={<FileText size={18} />}
            action={
              <Button variant="primary" onClick={() => void navigate({ to: "/payroll" })}>
                Buka Konsol Payroll
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Daftar slip gaji dengan periode, bruto, net, kode verifikasi, dan unduhan
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col">Periode</th>
                    <th scope="col" className="numeric col-hide-sm">
                      Bruto
                    </th>
                    <th scope="col" className="numeric">
                      Net
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Kode verifikasi
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Terbit
                    </th>
                    <th scope="col">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((payslip) => {
                    const employee = employees.find((person) => person.id === payslip.personnel_id);
                    const name =
                      employee?.full_name ?? `Personel ${payslip.personnel_id.slice(-6)}`;
                    const code = employee?.personnel_code ?? payslip.personnel_id.slice(-8);
                    return (
                      <tr key={payslip.id} data-testid={`payslip-row-${payslip.verification_code}`}>
                        <td>
                          <button
                            type="button"
                            className="table__primary link-button"
                            onClick={() => setSelected(payslip)}
                          >
                            {name}
                          </button>
                          <div className="table__secondary mono">{code}</div>
                        </td>
                        <td>
                          {formatPeriod(payslip.period_month)}
                          <div className="table__secondary">Versi {payslip.version}</div>
                        </td>
                        <td className="numeric col-hide-sm">
                          <Money value={payslip.gross_income} />
                        </td>
                        <td className="numeric">
                          <Money value={payslip.net_take_home_pay} />
                        </td>
                        <td className="col-hide-sm mono small">{payslip.verification_code}</td>
                        <td className="col-hide-sm small">
                          {formatDateTime(payslip.published_at)}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelected(payslip)}
                              aria-label={`Lihat rincian slip ${name}`}
                            >
                              Rincian
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Download size={14} />}
                              loading={
                                downloadMutation.isPending &&
                                downloadMutation.variables === payslip.id
                              }
                              onClick={() => downloadMutation.mutate(payslip.id)}
                              aria-label={`Unduh slip ${name}`}
                            >
                              Unduh
                            </Button>
                          </div>
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

      <PayslipDetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        payslip={selected}
        employeeName={
          employees.find((person) => person.id === selected?.personnel_id)?.full_name ??
          `Personel ${selected?.personnel_id.slice(-6) ?? ""}`
        }
        employeeCode={
          employees.find((person) => person.id === selected?.personnel_id)?.personnel_code ??
          selected?.personnel_id.slice(-8) ??
          ""
        }
      />
    </div>
  );
}
