import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Inbox } from "lucide-react";

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
import { ageLabel, categoryLabel, formatMoney, statusLabel } from "../../shared/lib/format";
import { listClaims } from "../claims/api";

const QUEUE_STATUSES = ["ESCALATED", "COMPLIANCE_REVIEW", "UNDER_REVIEW"] as const;

const PRIORITY: Record<string, number> = {
  ESCALATED: 0,
  COMPLIANCE_REVIEW: 1,
  UNDER_REVIEW: 2,
};

export default function ApprovalsPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const queries = useQueries({
    queries: QUEUE_STATUSES.map((status) => ({
      queryKey: ["approvals", status],
      queryFn: () => listClaims({ status, limit: 50 }),
    })),
  });

  if (!hasRole("BRANCH_MANAGER", "FINANCE_MANAGER")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">
            Antrean persetujuan hanya tersedia untuk Manajer Cabang dan Manajer Keuangan.
          </p>
        </div>
      </div>
    );
  }

  const loading = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);
  const items = queries
    .flatMap((query) => query.data?.data.items ?? [])
    .sort((left, right) => {
      const priority = (PRIORITY[left.status] ?? 9) - (PRIORITY[right.status] ?? 9);
      if (priority !== 0) {
        return priority;
      }
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });

  const escalated = items.filter((item) => item.status === "ESCALATED").length;
  const conflicts = items.filter((item) => item.has_conflict_flag).length;
  const amount = items.reduce((sum, item) => sum + Number(item.requested_amount), 0);

  return (
    <div className="stack">
      <PageHeader
        title="Antrean Persetujuan"
        description="Antrean diurutkan berdasarkan urgensi. Periksa versi kebijakan, risiko, konflik, dan audit sebelum memutuskan."
        actions={
          <Button variant="secondary" onClick={() => navigate({ to: "/claims" })}>
            Lihat semua klaim
          </Button>
        }
      />

      <div className="stat-grid">
        <Stat label="Dalam antrean" value={items.length} meta="Maksimal 50 per status" />
        <Stat label="Eskalasi" value={escalated} meta="Memerlukan Manajer Keuangan" />
        <Stat label="Flag konflik" value={conflicts} meta="Review kepatuhan wajib" />
        <Stat
          label="Nilai antrean"
          value={formatMoney(String(amount))}
          meta="Total nominal diajukan"
        />
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Klaim menunggu keputusan</div>
            <div className="panel__description">
              Status eskalasi dan review kepatuhan ditampilkan lebih dahulu
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} />
        ) : failed !== undefined ? (
          <div className="panel__body">
            <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Antrean bersih"
            body="Tidak ada klaim yang menunggu keputusan saat ini."
            icon={<Inbox size={18} />}
          />
        ) : (
          <div className="table-wrap approvals-table">
            <table className="table">
              <caption className="sr-only">
                Antrean klaim yang menunggu keputusan dengan prioritas, risiko, dan usia
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="col-hide-sm">
                    Prioritas
                  </th>
                  <th scope="col">Klaim</th>
                  <th scope="col" className="col-hide-sm">
                    Kategori
                  </th>
                  <th scope="col" className="numeric">
                    Nominal
                  </th>
                  <th scope="col">Risiko</th>
                  <th scope="col">Status</th>
                  <th scope="col">Menunggu</th>
                  <th scope="col">
                    <span className="sr-only">Buka</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((claim) => (
                  <tr key={claim.id}>
                    <td className="col-hide-sm">
                      {claim.status === "ESCALATED" ? (
                        <span className="badge badge--escalated">Mendesak</span>
                      ) : claim.status === "COMPLIANCE_REVIEW" ? (
                        <span className="badge badge--compliance_review">Kepatuhan</span>
                      ) : (
                        <span className="badge badge--under_review">Normal</span>
                      )}
                    </td>
                    <td>
                      <Link
                        to="/claims/$claimId"
                        params={{ claimId: claim.id }}
                        className="table__primary mono"
                      >
                        {claim.claim_number}
                      </Link>
                      <div className="table__secondary">{claim.claimant_name}</div>
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
                            aria-label="Flag konflik"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={claim.status} />
                    </td>
                    <td className="nowrap muted">{ageLabel(claim.created_at)}</td>
                    <td>
                      <Link
                        to="/claims/$claimId"
                        params={{ claimId: claim.id }}
                        className="btn btn--secondary btn--sm"
                        aria-label={`Tinjau ${claim.claim_number}`}
                      >
                        Tinjau
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && failed === undefined && items.length > 0 ? (
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
                  <span className="claim-card__amount">{formatMoney(claim.requested_amount)}</span>
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
        ) : null}

        <div className="panel__footer">
          <span className="small muted">
            {statusLabel("ESCALATED")} dan {statusLabel("COMPLIANCE_REVIEW")} diprioritaskan
          </span>
        </div>
      </section>
    </div>
  );
}
