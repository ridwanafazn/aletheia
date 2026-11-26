import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  RiskBadge,
  SkeletonTable,
  Stat,
  StatusBadge,
} from "../../shared/ui";
import {
  ageLabel,
  categoryLabel,
  formatMoney,
  initials,
  statusLabel,
} from "../../shared/lib/format";
import { listClaims } from "./api";
import type { ClaimsSearch } from "./search";

const STATUS_OPTIONS = [
  "DRAFT",
  "UNDER_REVIEW",
  "ESCALATED",
  "COMPLIANCE_REVIEW",
  "RETURNED",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
];

const CATEGORY_OPTIONS = ["HEALTH", "ACCIDENT", "PROPERTY", "GUARANTEE"];

export default function ClaimsPage() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as ClaimsSearch;

  const query = useInfiniteQuery({
    queryKey: ["claims", search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listClaims({
        status: search.status,
        claim_category: search.claim_category,
        has_conflict_flag: search.has_conflict_flag,
        branch_id: search.branch_id,
        from: search.from,
        to: search.to,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.data.meta.next_cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.data.items) ?? [];
  const escalated = items.filter((item) =>
    ["ESCALATED", "COMPLIANCE_REVIEW"].includes(item.status),
  ).length;
  const conflicts = items.filter((item) => item.has_conflict_flag).length;
  const totalAmount = items.reduce((sum, item) => sum + Number(item.requested_amount), 0);

  const updateFilter = (key: keyof ClaimsSearch, value: string) => {
    void navigate({
      to: "/claims",
      search: { ...search, [key]: value.length === 0 ? undefined : value },
      replace: true,
    });
  };

  if (
    !hasRole(
      "CLAIMS_OFFICER",
      "BRANCH_MANAGER",
      "FINANCE_MANAGER",
      "COMPLIANCE_ADMIN",
      "MIS_ANALYST",
    )
  ) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Ruang klaim hanya tersedia untuk peran operasional klaim.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Ruang Klaim"
        description={`Pantau klaim dari draf hingga pencairan. Cabang ${user?.branch_id.slice(-6) ?? "-"} dan tenant ${user?.tenant_id.slice(-6) ?? "-"}. Setiap keputusan terikat pada versi kebijakan yang aktif saat klaim dibuat.`}
        actions={
          hasRole("CLAIMS_OFFICER") ? (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate({ to: "/claims/new" })}
            >
              Klaim Baru
            </Button>
          ) : undefined
        }
      />

      <div className="stat-grid">
        <Stat label="Klaim terlihat" value={items.length} meta="Maksimal 25 per halaman" />
        <Stat label="Perlu perhatian" value={escalated} meta="Eskalasi dan review kepatuhan" />
        <Stat label="Flag konflik" value={conflicts} meta="Cocokkan lintas domain" />
        <Stat
          label="Nilai terlihat"
          value={formatMoney(String(totalAmount))}
          meta="Nominal yang diajukan"
        />
      </div>

      <section className="panel">
        <div className="filter-bar" aria-label="Filter klaim">
          <div className="field">
            <label className="field__label" htmlFor="filter-status">
              Status
            </label>
            <select
              id="filter-status"
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
          <div className="field">
            <label className="field__label" htmlFor="filter-category">
              Kategori
            </label>
            <select
              id="filter-category"
              className="select"
              value={search.claim_category ?? ""}
              onChange={(event) => updateFilter("claim_category", event.target.value)}
            >
              <option value="">Semua kategori</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="filter-conflict">
              Konflik
            </label>
            <select
              id="filter-conflict"
              className="select"
              value={search.has_conflict_flag ?? ""}
              onChange={(event) => updateFilter("has_conflict_flag", event.target.value)}
            >
              <option value="">Semua</option>
              <option value="true">Hanya konflik</option>
              <option value="false">Tanpa konflik</option>
            </select>
          </div>
          <div className="filter-bar__spacer" />
          <div className="row small muted">
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filter tersimpan di URL
          </div>
        </div>

        {query.isPending ? (
          <SkeletonTable rows={6} />
        ) : query.isError ? (
          <div className="panel__body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada klaim pada filter ini"
            body="Ubah filter atau buat draf klaim baru untuk memulai alur persetujuan."
            action={
              hasRole("CLAIMS_OFFICER") ? (
                <Button variant="primary" onClick={() => navigate({ to: "/claims/new" })}>
                  Buat klaim baru
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap claims-table">
              <table className="table">
                <caption className="sr-only">
                  Daftar klaim dengan status, nominal, skor risiko, dan usia klaim
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Klaim</th>
                    <th scope="col">Nasabah</th>
                    <th scope="col" className="col-hide-sm">
                      Kategori
                    </th>
                    <th scope="col" className="numeric">
                      Diajukan
                    </th>
                    <th scope="col">Risiko</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="col-hide-sm">
                      Usia
                    </th>
                    <th scope="col">
                      <span className="sr-only">Buka</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((claim) => (
                    <tr key={claim.id}>
                      <td>
                        <Link
                          to="/claims/$claimId"
                          params={{ claimId: claim.id }}
                          className="table__primary mono"
                        >
                          {claim.claim_number}
                        </Link>
                        <div className="table__secondary">{claim.policy_version_tag}</div>
                      </td>
                      <td>
                        <div className="entity-cell">
                          <span className="entity-avatar" aria-hidden="true">
                            {initials(claim.claimant_name)}
                          </span>
                          <span className="entity-copy">
                            <span className="entity-name">{claim.claimant_name}</span>
                            <span className="entity-meta mono">{claim.claimant_nik_masked}</span>
                          </span>
                        </div>
                      </td>
                      <td className="col-hide-sm">{categoryLabel(claim.claim_category)}</td>
                      <td className="numeric">{formatMoney(claim.requested_amount)}</td>
                      <td>
                        <div className="row">
                          <RiskBadge score={claim.risk_score} />
                          {claim.has_conflict_flag ? (
                            <AlertTriangle
                              size={14}
                              color="var(--danger-700)"
                              aria-label="Memiliki flag konflik"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={claim.status} />
                      </td>
                      <td className="nowrap muted col-hide-sm">{ageLabel(claim.created_at)}</td>
                      <td>
                        <Link
                          to="/claims/$claimId"
                          params={{ claimId: claim.id }}
                          aria-label={`Buka ${claim.claim_number}`}
                          className="btn btn--ghost btn--sm btn--icon"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-claim-list">
              {items.map((claim) => (
                <Link
                  key={claim.id}
                  className="claim-card"
                  to="/claims/$claimId"
                  params={{ claimId: claim.id }}
                >
                  <div className="claim-card__top">
                    <span className="claim-card__number">{claim.claim_number}</span>
                    <StatusBadge status={claim.status} />
                  </div>
                  <div className="claim-card__name">
                    {claim.claimant_name} · {categoryLabel(claim.claim_category)}
                  </div>
                  <div className="claim-card__bottom">
                    <span className="claim-card__amount">
                      {formatMoney(claim.requested_amount)}
                    </span>
                    <span className="claim-card__meta">
                      <RiskBadge score={claim.risk_score} />
                      {claim.has_conflict_flag ? (
                        <AlertTriangle size={13} color="var(--danger-700)" aria-hidden="true" />
                      ) : null}
                      {ageLabel(claim.created_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="panel__footer">
              <span className="small muted">
                {query.hasNextPage
                  ? "Masih ada klaim lain"
                  : "Semua klaim pada filter ini sudah dimuat"}
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
    </div>
  );
}
