import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";

import type { PayrollBatch, PayrollBranch } from "@aletheia/shared-contracts";

import { useAuth } from "../auth/AuthProvider";
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
import { listBranches } from "../../shared/api/reference";
import { batchTypeLabel, formatMoney, formatPeriod, statusLabel } from "../../shared/lib/format";
import { listPayrollBatches } from "./api";
import { NewBatchDialog } from "./NewBatchDialog";
import { periodToApi, type PayrollSearch } from "./search";

const STATUS_OPTIONS = [
  "DRAFT",
  "CALCULATING",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "DISBURSING",
  "DISBURSED",
  "PARTIAL",
  "FAILED",
  "REJECTED",
  "CANCELLED",
];

const PIPELINE = [
  { label: "Draf", statuses: ["DRAFT"] },
  { label: "Kalkulasi", statuses: ["CALCULATING"] },
  { label: "Siap disetujui", statuses: ["READY_FOR_APPROVAL"] },
  { label: "Disetujui", statuses: ["APPROVED", "DISBURSING"] },
  { label: "Selesai", statuses: ["DISBURSED", "PARTIAL"] },
];

function branchLabel(branchId: string, branches: PayrollBranch[]): string {
  const branch = branches.find((item) => item.id === branchId);
  return branch === undefined ? branchId.slice(-6) : branch.code;
}

function sum(items: PayrollBatch[], field: keyof PayrollBatch): number {
  return items.reduce((total, item) => total + Number(item[field]), 0);
}

export default function PayrollPage() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as PayrollSearch;
  const [createOpen, setCreateOpen] = useState(false);

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const query = useInfiniteQuery({
    queryKey: ["payroll-batches", search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listPayrollBatches({
        status: search.status,
        branch_id: search.branch_id,
        period_month: periodToApi(search.period),
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
    refetchInterval: (queryState) => {
      const pages = queryState.state.data?.pages ?? [];
      return pages.some((page) => page.data.items.some((item) => item.status === "CALCULATING"))
        ? 5_000
        : false;
    },
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];
  const calculating = items.filter((item) => item.status === "CALCULATING").length;
  const totalGross = sum(items, "total_gross_amount");
  const totalTax = sum(items, "total_tax_pph21");
  const totalBpjs = sum(items, "total_bpjs_deduction");
  const totalNet = sum(items, "total_net_disbursed");

  const updateFilter = (key: keyof PayrollSearch, value: string) => {
    void navigate({
      to: "/payroll",
      search: { ...search, [key]: value.length === 0 ? undefined : value },
      replace: true,
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Konsol Payroll"
        description="Kelola batch dari draf hingga pencairan. Setiap batch terikat pada versi kebijakan payroll dan dihitung oleh worker asinkron."
        actions={
          hasRole("HR_SPECIALIST") ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              Batch Baru
            </Button>
          ) : undefined
        }
      />

      {calculating > 0 ? (
        <Banner tone="info" title="Kalkulasi berjalan">
          {calculating} batch sedang dihitung oleh worker. Halaman ini menyegarkan otomatis setiap
          lima detik. Kalkulasi selesai ketika status berubah menjadi Siap disetujui.
        </Banner>
      ) : null}

      <section
        className="payroll-pipeline"
        aria-label="Ringkasan tahap batch pada halaman ini"
        tabIndex={0}
      >
        {PIPELINE.map((stage) => {
          const count = items.filter((item) => stage.statuses.includes(item.status)).length;
          return (
            <div className="payroll-pipeline__stage" key={stage.label}>
              <span className="payroll-pipeline__label">{stage.label}</span>
              <span className="payroll-pipeline__count">{count}</span>
            </div>
          );
        })}
      </section>

      <div className="stat-grid">
        <Stat
          label="Batch terlihat"
          value={items.length}
          meta={`${calculating} sedang dikalkulasi`}
        />
        <Stat
          label="Bruto terlihat"
          value={formatMoney(String(totalGross))}
          meta="Sebelum potongan"
        />
        <Stat
          label="Potongan terlihat"
          value={formatMoney(String(totalTax + totalBpjs))}
          meta="PPh 21 dan BPJS karyawan"
        />
        <Stat
          label="Net tercairkan"
          value={formatMoney(String(totalNet))}
          meta="Batch yang sudah dibayar"
        />
      </div>

      <section className="panel">
        <div className="filter-bar" aria-label="Filter batch payroll">
          <div className="field">
            <label className="field__label" htmlFor="payroll-filter-branch">
              Cabang
            </label>
            <select
              id="payroll-filter-branch"
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
            <label className="field__label" htmlFor="payroll-filter-period">
              Periode
            </label>
            <input
              id="payroll-filter-period"
              className="input"
              type="month"
              value={search.period ?? ""}
              onChange={(event) => updateFilter("period", event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="payroll-filter-status">
              Status
            </label>
            <select
              id="payroll-filter-status"
              className="select"
              value={search.status ?? ""}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="">Semua status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-bar__spacer" />
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            loading={query.isFetching && !query.isFetchingNextPage}
            onClick={() => void query.refetch()}
          >
            Segarkan
          </Button>
        </div>

        {query.isPending ? (
          <SkeletonTable rows={6} />
        ) : query.isError ? (
          <div className="panel__body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada batch pada filter ini"
            body="Ubah filter atau buat batch payroll pertama untuk periode dan cabang yang dipilih."
            icon={<Wallet size={18} />}
            action={
              hasRole("HR_SPECIALIST") ? (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  Buat batch payroll
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap payroll-table">
              <table className="table">
                <caption className="sr-only">
                  Daftar batch payroll dengan cabang, periode, headcount, nilai bruto, dan status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col" className="col-hide-sm">
                      Cabang
                    </th>
                    <th scope="col">Periode</th>
                    <th scope="col" className="col-hide-sm">
                      Tipe
                    </th>
                    <th scope="col" className="numeric">
                      Personel
                    </th>
                    <th scope="col" className="numeric">
                      Bruto
                    </th>
                    <th scope="col" className="numeric col-hide-sm">
                      Net tercairkan
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Buka</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <button
                          type="button"
                          className="table__primary link-button mono"
                          onClick={() =>
                            void navigate({
                              to: "/payroll/$batchId",
                              params: { batchId: batch.id },
                            })
                          }
                        >
                          {batch.batch_code}
                        </button>
                        <div className="table__secondary mono">
                          {batch.policy_version_id.slice(-8)}
                        </div>
                      </td>
                      <td className="col-hide-sm">{branchLabel(batch.branch_id, branches)}</td>
                      <td className="nowrap">{formatPeriod(batch.period_month)}</td>
                      <td className="col-hide-sm">{batchTypeLabel(batch.batch_type)}</td>
                      <td className="numeric">{batch.headcount}</td>
                      <td className="numeric">{formatMoney(batch.total_gross_amount)}</td>
                      <td className="numeric col-hide-sm">
                        {Number(batch.total_net_disbursed) === 0
                          ? "Belum dicairkan"
                          : formatMoney(batch.total_net_disbursed)}
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--icon"
                          aria-label={`Buka ${batch.batch_code}`}
                          onClick={() =>
                            void navigate({
                              to: "/payroll/$batchId",
                              params: { batchId: batch.id },
                            })
                          }
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-payroll-list">
              {items.map((batch) => (
                <button
                  type="button"
                  key={batch.id}
                  className="payroll-card"
                  onClick={() =>
                    void navigate({ to: "/payroll/$batchId", params: { batchId: batch.id } })
                  }
                >
                  <div className="payroll-card__top">
                    <span className="payroll-card__code">{batch.batch_code}</span>
                    <StatusBadge status={batch.status} />
                  </div>
                  <div className="payroll-card__meta">
                    {branchLabel(batch.branch_id, branches)} · {formatPeriod(batch.period_month)} ·{" "}
                    {batch.headcount} personel
                  </div>
                  <div className="payroll-card__bottom">
                    <span className="payroll-card__amount">
                      {formatMoney(batch.total_gross_amount)}
                    </span>
                    <span className="small muted">{batchTypeLabel(batch.batch_type)}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="panel__footer">
              <span className="small muted">
                {query.hasNextPage
                  ? "Masih ada batch lain"
                  : "Semua batch pada filter ini sudah dimuat"}
              </span>
              {query.hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Muat lebih banyak
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>

      <NewBatchDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        branches={branches}
        defaultBranchId={user?.branch_id}
        onCreated={(detail) => {
          setCreateOpen(false);
          void query.refetch();
          void navigate({
            to: "/payroll/$batchId",
            params: { batchId: detail.batch.id },
            search: { created: "1" },
          });
        }}
      />
    </div>
  );
}
