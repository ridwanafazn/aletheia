import { useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, EmptyState, ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";
import { actionLabel, domainLabel, formatDateTime, roleLabel } from "../../shared/lib/format";
import { listAuditLogs, verifyAuditChain } from "../claims/api";

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

      {verified === null ? null : (
        <Banner
          tone={verified.valid ? "success" : "danger"}
          title={verified.valid ? "Rantai valid" : "Rantai terputus"}
        >
          {verified.valid
            ? `${verified.checked} baris diperiksa dan seluruh hash cocok.`
            : `Baris pertama yang tidak cocok: ${verified.broken_at ?? "tidak diketahui"}.`}
        </Banner>
      )}

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
          <div className="field" style={{ minWidth: 280 }}>
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
            <div className="table-wrap">
              <table className="table">
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
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="nowrap muted">{formatDateTime(entry.recorded_at)}</td>
                      <td>
                        <div className="table__primary">{actionLabel(entry.action)}</div>
                        {Object.keys(entry.decision_context).length === 0 ? null : (
                          <details className="table__secondary">
                            <summary>Konteks keputusan</summary>
                            <pre
                              style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: "6px 0 0" }}
                            >
                              {JSON.stringify(entry.decision_context, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                      <td>
                        <div>{entry.actor_name ?? "Sistem"}</div>
                        <div className="table__secondary">
                          {entry.actor_role === "SYSTEM" ? "Sistem" : roleLabel(entry.actor_role)}
                        </div>
                      </td>
                      <td>{domainLabel(entry.domain)}</td>
                      <td className="mono table__secondary">{entry.entity_id.slice(0, 8)}</td>
                      <td className="hash" title={entry.record_hash}>
                        {entry.record_hash.slice(0, 12)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
