import { useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { ChevronDown, FilterX, Link2, ShieldCheck } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, EmptyState, ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";
import {
  actionLabel,
  contextLabel,
  domainLabel,
  formatDateTime,
  initials,
  roleLabel,
} from "../../shared/lib/format";
import { listAuditLogs, verifyAuditChain, type AuditLogRow } from "../claims/api";

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Tidak ada";
  }
  if (typeof value === "string") {
    return value.replaceAll("_", " ");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function timeParts(value: string): { date: string; time: string } {
  const [date, time] = formatDateTime(value).split(", ");
  return { date: date ?? formatDateTime(value), time: (time ?? "").replace(" WIB", "") };
}

function AuditContext({ context }: { context: Record<string, unknown> }) {
  const entries = Object.entries(context);
  if (entries.length === 0) {
    return null;
  }
  return (
    <details className="audit-context">
      <summary>
        <ChevronDown size={12} className="audit-context__chevron" aria-hidden="true" />
        <span>Konteks keputusan</span>
        <span className="audit-context__count">{entries.length}</span>
      </summary>
      <dl className="audit-context__grid">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{contextLabel(key)}</dt>
            <dd>{formatContextValue(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span className={`audit-domain audit-domain--${domain.toLowerCase()}`}>
      {domainLabel(domain)}
    </span>
  );
}

function ActorCell({ entry }: { entry: AuditLogRow }) {
  const name = entry.actor_name ?? "Sistem";
  return (
    <div className="entity-cell">
      <span className="entity-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <span className="entity-copy">
        <span className="entity-name">{name}</span>
        <span className="entity-meta">
          {entry.actor_role === "SYSTEM" ? "Sistem" : roleLabel(entry.actor_role)}
        </span>
      </span>
    </div>
  );
}

function AuditEntityId({ entry }: { entry: AuditLogRow }) {
  return (
    <span className="audit-id mono" title={entry.entity_id}>
      <span className="audit-id__label">Entitas</span>
      {entry.entity_id.slice(0, 8)}
    </span>
  );
}

function AuditHash({ entry }: { entry: AuditLogRow }) {
  return (
    <span className="audit-hash mono" title={`Hash lengkap: ${entry.record_hash}`}>
      <Link2 size={11} aria-hidden="true" />
      {entry.record_hash.slice(0, 12)}
    </span>
  );
}

function AuditIds({ entry }: { entry: AuditLogRow }) {
  return (
    <div className="audit-ids">
      <AuditEntityId entry={entry} />
      <AuditHash entry={entry} />
    </div>
  );
}

export default function AuditPage() {
  const { hasRole } = useAuth();
  const [domain, setDomain] = useState("");
  const [entityId, setEntityId] = useState("");
  const [appliedEntity, setAppliedEntity] = useState("");
  const [verified, setVerified] = useState<{
    valid: boolean;
    checked: number;
    broken_at: string | null;
  } | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["audit", domain, appliedEntity],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listAuditLogs({
        domain: domain.length === 0 ? undefined : domain,
        entity_id: appliedEntity.length === 0 ? undefined : appliedEntity,
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
  });

  const verify = useMutation({
    mutationFn: verifyAuditChain,
    onSuccess: (result) => setVerified(result.data),
  });

  if (!hasRole("COMPLIANCE_ADMIN", "FINANCE_MANAGER")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">
            Jejak audit hanya tersedia untuk Administrator Kepatuhan dan Manajer Keuangan.
          </p>
        </div>
      </div>
    );
  }

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const domainCount = new Set(items.map((entry) => entry.domain)).size;
  const latest = items[0];
  const hasFilters = domain.length > 0 || appliedEntity.length > 0;
  const verification =
    verified === null
      ? {
          tone: "idle",
          title: "Belum diverifikasi",
          detail: "Verifikasi menghitung ulang hash setiap baris pada tenant aktif.",
        }
      : verified.valid
        ? {
            tone: "valid",
            title: "Rantai valid",
            detail: `${verified.checked} baris diperiksa dan seluruh hash cocok.`,
          }
        : {
            tone: "broken",
            title: "Rantai terputus",
            detail: `Baris pertama yang tidak cocok: ${verified.broken_at ?? "tidak diketahui"}.`,
          };

  const clearFilters = () => {
    setDomain("");
    setEntityId("");
    setAppliedEntity("");
  };

  return (
    <div className="stack">
      <PageHeader
        title="Jejak Audit"
        description="Catatan tidak dapat diubah. Verifikasi menghitung ulang hash setiap baris pada tenant aktif."
        actions={
          <Button
            variant="primary"
            icon={<ShieldCheck size={16} />}
            loading={verify.isPending}
            onClick={() => verify.mutate()}
          >
            Verifikasi rantai
          </Button>
        }
      />

      <section
        className={`audit-integrity audit-integrity--${verification.tone}`}
        aria-label="Status rantai audit"
      >
        <div className="audit-integrity__lead">
          <span className="audit-integrity__icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="audit-integrity__title">Rantai hash tenant</div>
            <p className="audit-integrity__detail">{verification.detail}</p>
          </div>
        </div>
        <div className="audit-integrity__facts">
          <div>
            <span>Catatan dimuat</span>
            <strong>{items.length}</strong>
          </div>
          <div>
            <span>Domain</span>
            <strong>{domainCount}</strong>
          </div>
          <div>
            <span>Peristiwa terakhir</span>
            <strong className="audit-integrity__stamp">
              {latest === undefined ? "Belum ada" : formatDateTime(latest.recorded_at)}
            </strong>
          </div>
        </div>
        <span className={`audit-status audit-status--${verification.tone}`}>
          <span className="audit-status__dot" aria-hidden="true" />
          {verification.title}
        </span>
      </section>

      {verify.isError ? (
        <Banner tone="danger" title="Verifikasi gagal">
          {verify.error instanceof Error ? verify.error.message : "Periksa koneksi lalu coba lagi."}
        </Banner>
      ) : null}

      <section className="panel">
        <div className="filter-bar">
          <div className="field">
            <label className="field__label" htmlFor="audit-domain">
              Domain
            </label>
            <select
              id="audit-domain"
              className="select"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              <option value="">Semua domain</option>
              <option value="CLAIMS">Klaim</option>
              <option value="GOVERNANCE">Governance</option>
              <option value="PAYROLL">Payroll</option>
              <option value="ANALYTICS">Analitik</option>
            </select>
          </div>
          <div className="field audit-entity-field">
            <label className="field__label" htmlFor="audit-entity">
              ID entitas
            </label>
            <input
              id="audit-entity"
              className="input mono"
              placeholder="UUID klaim atau kebijakan"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value.trim())}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setAppliedEntity(entityId)}
            disabled={entityId.length > 0 && entityId.length < 36}
          >
            Terapkan
          </Button>
          {hasFilters ? (
            <Button variant="ghost" size="sm" icon={<FilterX size={14} />} onClick={clearFilters}>
              Bersihkan
            </Button>
          ) : null}
        </div>

        {query.isPending ? (
          <SkeletonTable rows={7} />
        ) : query.isError ? (
          <div className="panel__body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada catatan"
            body="Ubah domain atau kosongkan filter entitas untuk melihat peristiwa lain."
          />
        ) : (
          <>
            <div className="table-wrap audit-table-wrap">
              <table className="table audit-table">
                <caption className="sr-only">
                  Catatan audit dengan waktu, aktor, aksi, dan hash
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Waktu</th>
                    <th scope="col">Aksi</th>
                    <th scope="col">Aktor</th>
                    <th scope="col">Domain</th>
                    <th scope="col">Entitas</th>
                    <th scope="col">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => {
                    const time = timeParts(entry.recorded_at);
                    return (
                      <tr key={entry.id}>
                        <td>
                          <span className="audit-time">
                            <span>{time.date}</span>
                            <strong>{time.time}</strong>
                          </span>
                        </td>
                        <td>
                          <div className="table__primary">{actionLabel(entry.action)}</div>
                          <AuditContext context={entry.decision_context} />
                        </td>
                        <td>
                          <ActorCell entry={entry} />
                        </td>
                        <td>
                          <DomainBadge domain={entry.domain} />
                        </td>
                        <td>
                          <AuditEntityId entry={entry} />
                        </td>
                        <td>
                          <AuditHash entry={entry} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-audit-list">
              {items.map((entry) => {
                const time = timeParts(entry.recorded_at);
                return (
                  <article className="audit-card" key={entry.id}>
                    <div className="audit-card__top">
                      <div>
                        <div className="audit-card__action">{actionLabel(entry.action)}</div>
                        <div className="audit-card__time">
                          {time.date} · {time.time}
                        </div>
                      </div>
                      <DomainBadge domain={entry.domain} />
                    </div>
                    <ActorCell entry={entry} />
                    <AuditIds entry={entry} />
                    <AuditContext context={entry.decision_context} />
                  </article>
                );
              })}
            </div>

            <div className="panel__footer">
              <span className="small muted">
                {query.hasNextPage ? "Masih ada catatan lain" : "Semua catatan dimuat"}
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
