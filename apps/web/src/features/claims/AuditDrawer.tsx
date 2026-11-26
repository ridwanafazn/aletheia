import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import type { ClaimDetail } from "@aletheia/shared-contracts";

import { Banner, Button, Drawer } from "../../shared/ui";
import {
  actionLabel,
  contextLabel,
  contextValue,
  formatDateTime,
  roleLabel,
} from "../../shared/lib/format";
import { verifyAuditChain } from "./api";

export function AuditDrawer({
  claim,
  open,
  onClose,
  canVerify,
}: {
  claim: ClaimDetail;
  open: boolean;
  onClose: () => void;
  canVerify: boolean;
}) {
  const [verified, setVerified] = useState<{
    valid: boolean;
    checked: number;
    broken_at: string | null;
  } | null>(null);

  const verify = useMutation({
    mutationFn: verifyAuditChain,
    onSuccess: (result) => setVerified(result.data),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Jejak audit klaim"
      description={`${claim.claim_number} · ${claim.audit_history.length} peristiwa`}
    >
      <div className="stack">
        {canVerify ? (
          <div className="panel">
            <div className="panel__body stack stack--sm">
              <div className="row row--between">
                <div>
                  <div className="panel__title">Verifikasi rantai audit</div>
                  <div className="small muted">Hitung ulang hash setiap baris tenant</div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={verify.isPending}
                  icon={<ShieldCheck size={15} />}
                  onClick={() => verify.mutate()}
                >
                  Verifikasi
                </Button>
              </div>
              {verified === null ? null : (
                <Banner tone={verified.valid ? "success" : "danger"}>
                  {verified.valid
                    ? `Rantai valid. ${verified.checked} baris diperiksa.`
                    : `Rantai terputus pada baris ${verified.broken_at ?? "tidak diketahui"}.`}
                </Banner>
              )}
              {verify.isError ? <Banner tone="danger">Verifikasi gagal. Coba lagi.</Banner> : null}
            </div>
          </div>
        ) : null}

        <ol className="timeline">
          {claim.audit_history.map((entry) => (
            <li className="timeline__item" key={entry.id}>
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__title">{actionLabel(entry.action)}</div>
              <div className="timeline__meta">
                {entry.actor_name} · {roleLabel(entry.actor_role)} ·{" "}
                {formatDateTime(entry.recorded_at)}
              </div>
              {entry.policy_version_tag === null ? null : (
                <div className="policy-chip" style={{ marginTop: 6 }}>
                  {entry.policy_version_tag}
                </div>
              )}
              {Object.keys(entry.decision_context).length === 0 ? null : (
                <dl className="summary-list" style={{ marginTop: 10 }}>
                  {Object.entries(entry.decision_context)
                    .filter(([, value]) => typeof value !== "object")
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className="summary-list__label audit-context__label">
                          {contextLabel(key)}
                        </dt>
                        <dd className="summary-list__value" style={{ margin: 0 }}>
                          {contextValue(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
              <div className="hash" title={entry.record_hash}>
                {entry.record_hash.slice(0, 24)}
              </div>
            </li>
          ))}
        </ol>

        {verified?.valid ? (
          <div className="row small" style={{ color: "var(--success-700)" }}>
            <CheckCircle2 size={14} aria-hidden="true" />
            Rantai audit terverifikasi
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
