import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useState } from "react";

import { ApiError, absoluteApiUrl } from "../../shared/api/client";
import { Banner, Button, EmptyState, ErrorState, Money, SkeletonTable } from "../../shared/ui";
import { currentPeriod, formatDateTime, formatPeriod } from "../../shared/lib/format";
import { downloadMyPayslip, listMyPayslips } from "./api";

function openSignedFile(url: string): void {
  const link = document.createElement("a");
  link.href = absoluteApiUrl(url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function MyPayslipsTab() {
  const [period, setPeriod] = useState(currentPeriod());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const query = useInfiniteQuery({
    queryKey: ["my-payslips", period],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMyPayslips({
        period_month: `${period}-01`,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadMyPayslip(id),
    onSuccess: (result) => {
      setError(null);
      openSignedFile(result.data.url);
      setNotice(
        `Tautan unduhan dibuka di tab baru. Tautan berlaku sampai ${formatDateTime(result.data.expires_at)}.`,
      );
    },
    onError: (caught) => {
      setNotice(null);
      setError(caught);
    },
  });

  const notReady =
    error instanceof ApiError && error.code === "ERR_REPORT_NOT_READY" ? error : null;

  return (
    <div className="stack">
      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {notReady === null ? null : (
        <Banner tone="warning" title="Berkas belum tersedia">
          {notReady.message}
        </Banner>
      )}
      {error !== null && notReady === null ? (
        <Banner tone="danger" title="Unduhan gagal">
          {error instanceof ApiError ? error.message : "Periksa koneksi lalu coba lagi."}
        </Banner>
      ) : null}

      <div className="filter-bar" aria-label="Filter slip gaji saya">
        <div className="field">
          <label className="field__label" htmlFor="my-payslip-period">
            Periode
          </label>
          <input
            id="my-payslip-period"
            className="input"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </div>
      </div>

      {query.isPending ? (
        <SkeletonTable rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Belum ada slip gaji"
          body="Slip gaji muncul setelah batch payroll disetujui atau dicairkan."
          icon={<FileText size={18} />}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Slip gaji saya dengan periode, bruto, net, kode verifikasi, dan unduhan
              </caption>
              <thead>
                <tr>
                  <th scope="col">Periode</th>
                  <th scope="col" className="numeric">
                    Bruto
                  </th>
                  <th scope="col" className="numeric">
                    Net
                  </th>
                  <th scope="col" className="col-hide-sm">
                    Kode verifikasi
                  </th>
                  <th scope="col">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((payslip) => (
                  <tr key={payslip.id}>
                    <td>
                      {formatPeriod(payslip.period_month)}
                      <div className="table__secondary">Versi {payslip.version}</div>
                    </td>
                    <td className="numeric">
                      <Money value={payslip.gross_income} />
                    </td>
                    <td className="numeric">
                      <Money value={payslip.net_take_home_pay} />
                    </td>
                    <td className="col-hide-sm mono small">{payslip.verification_code}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download size={14} />}
                        loading={
                          downloadMutation.isPending && downloadMutation.variables === payslip.id
                        }
                        onClick={() => downloadMutation.mutate(payslip.id)}
                        aria-label={`Unduh slip ${formatPeriod(payslip.period_month)}`}
                      >
                        Unduh
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Muat lebih banyak
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
