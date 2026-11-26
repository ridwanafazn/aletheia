import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronRight, RefreshCw, Search, Users } from "lucide-react";

import type { Employee, PayrollBranch } from "@aletheia/shared-contracts";

import { useAuth } from "../auth/AuthProvider";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonTable,
  Stat,
  StatusBadge,
} from "../../shared/ui";
import { listBranches } from "../../shared/api/reference";
import { employmentLabel, formatMoney, personnelTypeLabel } from "../../shared/lib/format";
import { listEmployees } from "./api";
import { EmployeeDrawer } from "./EmployeeDrawer";
import type { EmployeeSearch } from "./search";

const TYPE_OPTIONS = ["EMPLOYEE", "SALES_AGENT"];
const STATUS_OPTIONS = ["PERMANENT", "CONTRACT", "PROBATION", "INACTIVE"];

function branchLabel(branchId: string, branches: PayrollBranch[]): string {
  const branch = branches.find((item) => item.id === branchId);
  return branch === undefined ? branchId.slice(-6) : branch.code;
}

export default function EmployeesPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as EmployeeSearch;
  const [searchText, setSearchText] = useState(search.q ?? "");
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    setSearchText(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchText.trim();
      if (next !== (search.q ?? "")) {
        void navigate({
          to: "/employees",
          search: { ...search, q: next.length === 0 ? undefined : next },
          replace: true,
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText, search, navigate]);

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const query = useInfiniteQuery({
    queryKey: ["employees", search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listEmployees({
        branch_id: search.branch_id,
        personnel_type: search.type,
        status: search.status,
        search: search.q,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
  });

  const employees = query.data?.pages.flatMap((page) => page.data.items) ?? [];
  const employeeCount = employees.filter((item) => item.personnel_type === "EMPLOYEE").length;
  const agentCount = employees.filter((item) => item.personnel_type === "SALES_AGENT").length;
  const activeCount = employees.filter((item) => item.is_active).length;

  const updateFilter = (key: keyof EmployeeSearch, value: string) => {
    void navigate({
      to: "/employees",
      search: { ...search, [key]: value.length === 0 ? undefined : value },
      replace: true,
    });
  };

  if (!hasRole("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Direktori karyawan hanya tersedia untuk peran operasional.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Karyawan dan Agen"
        description="Direktori personel dengan status kontrak, profil pajak, rekening masked, ringkasan absensi, dan riwayat cuti."
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

      <div className="stat-grid">
        <Stat label="Personel terlihat" value={employees.length} meta="Maksimal 25 per halaman" />
        <Stat label="Karyawan" value={employeeCount} meta="Personel tetap dan kontrak" />
        <Stat label="Agen penjualan" value={agentCount} meta="Kompensasi berbasis capaian" />
        <Stat label="Aktif" value={activeCount} meta="Dapat masuk batch payroll" />
      </div>

      <section className="panel">
        <div className="filter-bar" aria-label="Filter direktori karyawan">
          <div className="field employee-search">
            <label className="field__label" htmlFor="employee-search">
              Cari personel
            </label>
            <div className="input-with-icon">
              <Search size={15} aria-hidden="true" />
              <input
                id="employee-search"
                className="input"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Nama atau kode"
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="employee-type">
              Tipe
            </label>
            <select
              id="employee-type"
              className="select"
              value={search.type ?? ""}
              onChange={(event) => updateFilter("type", event.target.value)}
            >
              <option value="">Semua tipe</option>
              {TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {personnelTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="employee-status">
              Status kerja
            </label>
            <select
              id="employee-status"
              className="select"
              value={search.status ?? ""}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="">Semua status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {employmentLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="employee-branch">
              Cabang
            </label>
            <select
              id="employee-branch"
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
          <div className="filter-bar__spacer" />
          <span className="small muted">Pencarian tersimpan di URL</span>
        </div>

        {query.isPending ? (
          <SkeletonTable rows={7} />
        ) : query.isError ? (
          <div className="panel__body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : employees.length === 0 ? (
          <EmptyState
            title="Tidak ada personel pada filter ini"
            body="Ubah kata kunci atau filter cabang untuk menemukan personel lain."
            icon={<Users size={18} />}
          />
        ) : (
          <>
            <div className="table-wrap employee-table">
              <table className="table">
                <caption className="sr-only">
                  Direktori karyawan dan agen dengan tipe, cabang, status pajak, dan kompensasi
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col" className="col-hide-sm">
                      Tipe
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Cabang
                    </th>
                    <th scope="col" className="col-hide-sm">
                      PTKP
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="col-hide-sm">
                      Rekening
                    </th>
                    <th scope="col" className="numeric">
                      Gaji pokok
                    </th>
                    <th scope="col">
                      <span className="sr-only">Buka</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <button
                          type="button"
                          className="table__primary link-button"
                          onClick={() => setSelected(employee)}
                        >
                          {employee.full_name}
                        </button>
                        <div className="table__secondary mono">{employee.personnel_code}</div>
                      </td>
                      <td className="col-hide-sm">{personnelTypeLabel(employee.personnel_type)}</td>
                      <td className="col-hide-sm">{branchLabel(employee.branch_id, branches)}</td>
                      <td className="col-hide-sm mono">{employee.ptkp_status}</td>
                      <td>
                        <StatusBadge status={employee.employment_status} />
                      </td>
                      <td className="col-hide-sm mono small">
                        {employee.bank_code} · {employee.bank_account_masked}
                      </td>
                      <td className="numeric">{formatMoney(employee.base_salary)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--icon"
                          aria-label={`Buka profil ${employee.full_name}`}
                          onClick={() => setSelected(employee)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-employee-list">
              {employees.map((employee) => (
                <button
                  type="button"
                  className="employee-card"
                  key={employee.id}
                  onClick={() => setSelected(employee)}
                >
                  <div className="employee-card__top">
                    <span className="employee-card__name">{employee.full_name}</span>
                    <StatusBadge status={employee.employment_status} />
                  </div>
                  <div className="employee-card__meta">
                    {employee.personnel_code} · {personnelTypeLabel(employee.personnel_type)} ·{" "}
                    {branchLabel(employee.branch_id, branches)}
                  </div>
                  <div className="employee-card__bottom">
                    <span className="employee-card__amount">
                      {formatMoney(employee.base_salary)}
                    </span>
                    <span className="small muted">{employee.ptkp_status}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="panel__footer">
              <span className="small muted">
                {query.hasNextPage
                  ? "Masih ada personel lain"
                  : "Semua personel pada filter ini sudah dimuat"}
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

      <EmployeeDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        employee={selected}
        branchName={selected === null ? "" : branchLabel(selected.branch_id, branches)}
      />
    </div>
  );
}
