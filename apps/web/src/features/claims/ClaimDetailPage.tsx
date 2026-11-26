import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  FileText,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import type { ClaimPayment } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import {
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  RiskBadge,
  SkeletonTable,
  StatusBadge,
} from "../../shared/ui";
import {
  actionLabel,
  categoryLabel,
  conflictLabel,
  documentLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  statusLabel,
} from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { getClaim, submitClaim } from "./api";
import { AuditDrawer } from "./AuditDrawer";
import { ComplianceReviewDialog } from "./ComplianceReviewDialog";
import { DecisionDialog } from "./DecisionDialog";
import { DisburseDialog } from "./DisburseDialog";

type Tab = "summary" | "documents" | "anomalies" | "history";

function routeLevel(claim: {
  requested_amount: string;
  risk_score: number;
  has_conflict_flag: boolean;
  bound_policy_rules: Record<string, unknown>;
}): { level: 1 | 2; reason: string } {
  const tiers = claim.bound_policy_rules.approval_tiers as
    | {
        level_1_branch_manager_max: string;
        auto_escalate_risk_threshold: number;
      }
    | undefined;
  if (tiers === undefined) {
    return { level: 2, reason: "Kebijakan tidak lengkap" };
  }
  if (Number(claim.requested_amount) > Number(tiers.level_1_branch_manager_max)) {
    return { level: 2, reason: "Nominal melebihi batas level 1" };
  }
  if (claim.risk_score >= tiers.auto_escalate_risk_threshold) {
    return { level: 2, reason: "Risiko di atas ambang" };
  }
  if (claim.has_conflict_flag) {
    return { level: 2, reason: "Ada flag konflik" };
  }
  return { level: 1, reason: "Dalam batas level 1" };
}

export default function ClaimDetailPage() {
  const { claimId } = useParams({ strict: false }) as { claimId: string };
  const search = useSearch({ strict: false }) as { created?: string };
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("summary");
  const [auditOpen, setAuditOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [payment, setPayment] = useState<ClaimPayment | null>(null);

  const query = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => getClaim(claimId),
  });

  const submit = useMutation({
    mutationFn: () => submitClaim(claimId),
    onSuccess: (result) => {
      setSubmitOpen(false);
      setNotice(`Klaim berstatus ${statusLabel(result.data.status)}`);
      void queryClient.invalidateQueries({ queryKey: ["claim", claimId] });
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (caught) => setError(caught),
  });

  const claim = query.data?.data;

  if (query.isPending) {
    return <SkeletonTable rows={6} />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (claim === undefined) {
    return <EmptyState title="Klaim tidak ditemukan" body="Klaim mungkin berada di tenant lain." />;
  }

  const level = routeLevel(claim);
  const maker = claim.created_by === user?.id;
  const branchMatches = claim.branch_id === user?.branch_id;
  const canSubmit =
    hasRole("CLAIMS_OFFICER") && maker && ["DRAFT", "RETURNED"].includes(claim.status);
  const canDecide =
    hasRole("BRANCH_MANAGER", "FINANCE_MANAGER") &&
    ["UNDER_REVIEW", "ESCALATED"].includes(claim.status) &&
    !(claim.has_conflict_flag && claim.compliance_reviewed_at === null) &&
    !maker &&
    (hasRole("FINANCE_MANAGER") || branchMatches);
  const canReview =
    hasRole("COMPLIANCE_ADMIN") &&
    (claim.status === "COMPLIANCE_REVIEW" ||
      (claim.has_conflict_flag && claim.compliance_reviewed_at === null));
  const canDisburse = hasRole("FINANCE_MANAGER") && claim.status === "APPROVED";
  const decideDisabledReason = maker
    ? "Pembuat klaim tidak boleh menyetujui klaim sendiri."
    : claim.has_conflict_flag && claim.compliance_reviewed_at === null
      ? "Klaim menunggu review kepatuhan."
      : !hasRole("FINANCE_MANAGER") && !branchMatches
        ? "Klaim berada di cabang lain."
        : level.level === 2 && !hasRole("FINANCE_MANAGER")
          ? "Klaim ini memerlukan Manajer Keuangan."
          : null;

  const refreshClaim = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: ["claim", claimId] });
    void queryClient.invalidateQueries({ queryKey: ["claims"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Detail Klaim"
        description={`${claim.claim_number} · ${categoryLabel(claim.claim_category)} · ${claim.claimant_name}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<ArrowLeft size={15} />}
              onClick={() => navigate({ to: "/claims" })}
            >
              Kembali
            </Button>
            <Button
              variant="secondary"
              icon={<ShieldCheck size={15} />}
              onClick={() => setAuditOpen(true)}
            >
              Jejak Audit
            </Button>
          </>
        }
      />

      {search.created === "1" && ["DRAFT", "RETURNED"].includes(claim.status) ? (
        <Banner tone="success" title="Draf tersimpan">
          Periksa dokumen dan kebijakan terikat sebelum submit.
        </Banner>
      ) : null}
      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {error === null ? null : (
        <Banner tone="danger" title="Tindakan gagal">
          {error instanceof ApiError ? error.message : "Coba lagi"}
        </Banner>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">Status</div>
          <div style={{ marginTop: 8 }}>
            <StatusBadge status={claim.status} />
          </div>
          <div className="stat__meta">{formatDate(claim.created_at)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Diajukan</div>
          <div className="stat__value">{formatMoney(claim.requested_amount)}</div>
          <div className="stat__meta">Nominal yang diajukan</div>
        </div>
        <div className="stat">
          <div className="stat__label">Disetujui</div>
          <div className="stat__value">{formatMoney(claim.approved_amount)}</div>
          <div className="stat__meta">Nominal final keputusan</div>
        </div>
        <div className="stat">
          <div className="stat__label">Risiko</div>
          <div className="stat__value">
            <RiskBadge score={claim.risk_score} />
          </div>
          <div className="stat__meta">{level.reason}</div>
        </div>
      </div>

      <div className="grid-sidebar">
        <section className="panel">
          <div className="panel__body" style={{ paddingBottom: 0 }}>
            <div className="tabs" role="tablist" aria-label="Bagian detail klaim">
              {[
                { id: "summary" as const, label: "Ringkasan" },
                { id: "documents" as const, label: `Dokumen ${claim.documents.length}` },
                { id: "anomalies" as const, label: `Anomali ${claim.anomaly_flags.length}` },
                { id: "history" as const, label: `Riwayat ${claim.audit_history.length}` },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className="tabs__item"
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel__body">
            {tab === "summary" ? (
              <div className="stack">
                <div className="summary-list">
                  <div>
                    <div className="summary-list__label">Nasabah</div>
                    <div className="summary-list__value">{claim.claimant_name}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">NIK masked</div>
                    <div className="summary-list__value mono">{claim.claimant_nik_masked}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Rekening masked</div>
                    <div className="summary-list__value mono">{claim.bank_account_masked}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Kategori</div>
                    <div className="summary-list__value">{categoryLabel(claim.claim_category)}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Diajukan</div>
                    <div className="summary-list__value">{formatDateTime(claim.submitted_at)}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Final</div>
                    <div className="summary-list__value">{formatDateTime(claim.finalized_at)}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Versi kebijakan</div>
                    <div className="summary-list__value mono">{claim.policy_version_tag}</div>
                  </div>
                  <div>
                    <div className="summary-list__label">Jalur persetujuan</div>
                    <div className="summary-list__value">Level {level.level}</div>
                  </div>
                </div>

                {claim.has_conflict_flag ? (
                  <Banner tone="danger" title="Flag konflik aktif">
                    Klaim memuat indikasi benturan kepentingan. Review kepatuhan wajib dicatat
                    sebelum keputusan transaksi.
                  </Banner>
                ) : null}

                {claim.compliance_reviewed_at === null ? null : (
                  <div className="row small muted">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Review kepatuhan dicatat {formatDateTime(claim.compliance_reviewed_at)}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "documents" ? (
              claim.documents.length === 0 ? (
                <EmptyState
                  title="Belum ada dokumen"
                  body="Dokumen wajib harus diunggah sebelum klaim dapat disubmit."
                  icon={<FileText size={18} />}
                />
              ) : (
                <div className="document-list">
                  {claim.documents.map((document) => (
                    <a
                      key={document.id}
                      className="document"
                      href={document.secure_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="document__icon" aria-hidden="true">
                        <FileText size={15} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="document__name">
                          {documentLabel(document.document_type)}
                        </div>
                        <div className="document__meta">
                          Diunggah {formatDateTime(document.uploaded_at)}
                        </div>
                      </div>
                      <span className="small">Buka</span>
                    </a>
                  ))}
                </div>
              )
            ) : null}

            {tab === "anomalies" ? (
              claim.anomaly_flags.length === 0 ? (
                <EmptyState
                  title="Tidak ada anomali"
                  body="Pemindaian lintas domain tidak menemukan kesamaan identitas atau rekening."
                  icon={<CheckCircle2 size={18} />}
                />
              ) : (
                <div className="stack stack--sm">
                  {claim.anomaly_flags.map((flag) => (
                    <div className="document" key={flag.id}>
                      <div className="document__icon" aria-hidden="true">
                        <ShieldAlert size={15} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="document__name">{conflictLabel(flag.conflict_type)}</div>
                        <div className="document__meta">
                          {flag.matched_personnel_name ??
                            flag.matched_claim_number ??
                            "Tidak ada padanan"}{" "}
                          · {formatDateTime(flag.detected_at)}
                        </div>
                      </div>
                      <span
                        className={`badge badge--${flag.severity === "CRITICAL" ? "rejected" : "escalated"}`}
                      >
                        {flag.severity}
                      </span>
                      <span className="badge badge--draft">{flag.resolution_status}</span>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {tab === "history" ? (
              <ol className="timeline">
                {claim.audit_history.map((entry) => (
                  <li className="timeline__item" key={entry.id}>
                    <span className="timeline__dot" aria-hidden="true" />
                    <div className="timeline__title">{actionLabel(entry.action)}</div>
                    <div className="timeline__meta">
                      {entry.actor_name} · {formatDateTime(entry.recorded_at)}
                    </div>
                    <div className="hash">{entry.record_hash}</div>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Tindakan</div>
                <div className="panel__description">Aksi mengikuti status dan peran Anda</div>
              </div>
            </div>
            <div className="panel__body stack">
              {canSubmit ? (
                <>
                  <Button
                    variant="primary"
                    icon={<Send size={16} />}
                    onClick={() => setSubmitOpen(true)}
                  >
                    Submit klaim
                  </Button>
                  <p className="small muted">
                    Submit akan memvalidasi dokumen wajib dan menjalankan evaluasi risiko.
                  </p>
                </>
              ) : null}

              {canDecide ? (
                <Button
                  variant="primary"
                  icon={<CheckCircle2 size={16} />}
                  onClick={() => setDecisionOpen(true)}
                >
                  Ambil keputusan
                </Button>
              ) : null}

              {canReview ? (
                <Button
                  variant="primary"
                  icon={<ShieldCheck size={16} />}
                  onClick={() => setComplianceOpen(true)}
                >
                  Review kepatuhan
                </Button>
              ) : null}

              {canDisburse ? (
                <Button
                  variant="primary"
                  icon={<Banknote size={16} />}
                  onClick={() => setDisburseOpen(true)}
                >
                  Cairkan klaim
                </Button>
              ) : null}

              {!canSubmit && !canDecide && !canReview && !canDisburse ? (
                <p className="small muted">
                  {claim.status === "DISBURSED"
                    ? "Klaim sudah dicairkan. Tidak ada tindakan lanjutan."
                    : claim.status === "APPROVED"
                      ? "Klaim sudah disetujui dan menunggu pencairan oleh Manajer Keuangan."
                      : claim.status === "REJECTED"
                        ? "Klaim ditolak dan sudah final."
                        : "Tidak ada tindakan yang tersedia untuk peran Anda pada status ini."}
                </p>
              ) : null}

              {decideDisabledReason !== null &&
              hasRole("BRANCH_MANAGER", "FINANCE_MANAGER") &&
              ["UNDER_REVIEW", "ESCALATED"].includes(claim.status) ? (
                <Banner tone="warning" title="Keputusan terkunci">
                  {decideDisabledReason}
                </Banner>
              ) : null}

              {payment !== null ? (
                <Banner tone={payment.status === "PAID" ? "success" : "warning"}>
                  {payment.status === "PAID" ? "Pencairan selesai" : "Pencairan diproses"} ·{" "}
                  {formatMoney(payment.amount)}
                  {payment.provider_reference === null ? "" : ` · ${payment.provider_reference}`}
                </Banner>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div className="panel__title">Kebijakan terikat</div>
            </div>
            <div className="panel__body stack stack--sm">
              <div className="policy-chip">
                <ShieldCheck size={13} />
                {claim.policy_version_tag}
              </div>
              <div className="summary-list">
                <div>
                  <div className="summary-list__label">Batas level 1</div>
                  <div className="summary-list__value">
                    {formatMoney(
                      (
                        claim.bound_policy_rules.approval_tiers as
                          { level_1_branch_manager_max?: string } | undefined
                      )?.level_1_branch_manager_max,
                    )}
                  </div>
                </div>
                <div>
                  <div className="summary-list__label">SLA</div>
                  <div className="summary-list__value">
                    {String(claim.bound_policy_rules.sla_target_hours ?? "-")} jam
                  </div>
                </div>
              </div>
              <p className="small muted">
                Keputusan memakai aturan versi ini, bukan kebijakan aktif terbaru.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <AuditDrawer
        claim={claim}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        canVerify={hasRole("COMPLIANCE_ADMIN", "FINANCE_MANAGER")}
      />

      <DecisionDialog
        claim={claim}
        open={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        onSuccess={refreshClaim}
      />

      <ComplianceReviewDialog
        claim={claim}
        open={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        onSuccess={refreshClaim}
      />

      <DisburseDialog
        claim={claim}
        open={disburseOpen}
        onClose={() => setDisburseOpen(false)}
        onSuccess={(result) => {
          setPayment(result);
          refreshClaim(`Pencairan ${statusLabel(result.status)} untuk ${claim.claim_number}`);
        }}
      />

      <Dialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit klaim"
        description={claim.claim_number}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
              Submit sekarang
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="summary-list">
            <div>
              <div className="summary-list__label">Nominal</div>
              <div className="summary-list__value">
                <Money value={claim.requested_amount} />
              </div>
            </div>
            <div>
              <div className="summary-list__label">Dokumen</div>
              <div className="summary-list__value">{claim.documents.length} berkas</div>
            </div>
            <div>
              <div className="summary-list__label">Kebijakan</div>
              <div className="summary-list__value mono">{claim.policy_version_tag}</div>
            </div>
            <div>
              <div className="summary-list__label">Jalur</div>
              <div className="summary-list__value">Level {level.level}</div>
            </div>
          </div>
          <Banner tone="warning" title="Setelah submit">
            Klaim masuk evaluasi risiko. Keputusan tidak dapat diubah setelah final.
          </Banner>
        </div>
      </Dialog>
    </div>
  );
}
