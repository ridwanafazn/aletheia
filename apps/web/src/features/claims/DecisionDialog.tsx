import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import type { ClaimDecision, ClaimDetail } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, Dialog } from "../../shared/ui";
import { formatMoney, statusLabel } from "../../shared/lib/format";
import { decideClaim } from "./api";

export function DecisionDialog({
  claim,
  open,
  onClose,
  onSuccess,
}: {
  claim: ClaimDetail;
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [decision, setDecision] = useState<ClaimDecision>("APPROVED");
  const [approvedAmount, setApprovedAmount] = useState(claim.requested_amount);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      idempotencyKey.current = crypto.randomUUID();
      setDecision("APPROVED");
      setApprovedAmount(claim.approved_amount ?? claim.requested_amount);
      setReason("");
      setError(null);
    }
  }, [open, claim.approved_amount, claim.requested_amount]);

  const mutation = useMutation({
    mutationFn: () =>
      decideClaim(
        claim.id,
        {
          decision,
          ...(decision === "APPROVED" ? { approved_amount: approvedAmount } : {}),
          ...(reason.trim().length > 0 ? { reason_notes: reason.trim() } : {}),
        },
        idempotencyKey.current,
      ),
    onSuccess: (result) => {
      onSuccess(`Klaim ${result.data.claim_number} berstatus ${statusLabel(result.data.status)}`);
      onClose();
    },
    onError: (caught) => setError(caught),
  });

  const amountInvalid =
    decision === "APPROVED" &&
    (approvedAmount.trim().length === 0 || Number(approvedAmount) > Number(claim.requested_amount));
  const reasonInvalid = decision !== "APPROVED" && reason.trim().length < 15;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Putuskan klaim"
      description={`${claim.claim_number} · ${formatMoney(claim.requested_amount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={decision === "REJECTED" ? "danger" : "primary"}
            loading={mutation.isPending}
            disabled={amountInvalid || reasonInvalid}
            onClick={() => mutation.mutate()}
          >
            {decision === "APPROVED"
              ? "Setujui klaim"
              : decision === "REJECTED"
                ? "Tolak klaim"
                : "Kembalikan klaim"}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error === null ? null : (
          <Banner tone="danger" title="Keputusan tidak dapat disimpan">
            {error instanceof ApiError ? error.message : "Coba lagi setelah memuat ulang data"}
            {error instanceof ApiError && error.code === "ERR_CONCURRENT_LOCK" ? (
              <div className="small">Data berubah. Tutup dialog lalu muat ulang detail klaim.</div>
            ) : null}
          </Banner>
        )}

        <div className="summary-list">
          <div>
            <div className="summary-list__label">Nominal diajukan</div>
            <div className="summary-list__value">{formatMoney(claim.requested_amount)}</div>
          </div>
          <div>
            <div className="summary-list__label">Risiko</div>
            <div className="summary-list__value">{claim.risk_score} dari 100</div>
          </div>
          <div>
            <div className="summary-list__label">Versi kebijakan</div>
            <div className="summary-list__value mono">{claim.policy_version_tag}</div>
          </div>
          <div>
            <div className="summary-list__label">Konflik</div>
            <div className="summary-list__value">
              {claim.has_conflict_flag ? "Ada, sudah direview" : "Tidak ada"}
            </div>
          </div>
        </div>

        <fieldset className="stack stack--sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Keputusan</legend>
          {[
            { value: "APPROVED" as const, label: "Setujui", icon: CheckCircle2 },
            { value: "RETURNED" as const, label: "Kembalikan untuk revisi", icon: RotateCcw },
            { value: "REJECTED" as const, label: "Tolak", icon: XCircle },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className="document"
                style={{
                  cursor: "pointer",
                  borderColor: decision === option.value ? "var(--primary-700)" : undefined,
                }}
              >
                <input
                  type="radio"
                  name="decision"
                  value={option.value}
                  checked={decision === option.value}
                  onChange={() => setDecision(option.value)}
                />
                <Icon size={16} aria-hidden="true" />
                <span className="document__name">{option.label}</span>
              </label>
            );
          })}
        </fieldset>

        {decision === "APPROVED" ? (
          <div className="field">
            <label className="field__label" htmlFor="approved-amount">
              Nominal disetujui
            </label>
            <div className="row">
              <span className="muted">Rp</span>
              <input
                id="approved-amount"
                className="input input--money"
                inputMode="decimal"
                value={approvedAmount}
                onChange={(event) => setApprovedAmount(event.target.value)}
                aria-invalid={amountInvalid}
              />
            </div>
            <span className="field__hint">
              Tidak boleh melebihi nominal diajukan {formatMoney(claim.requested_amount)}.
            </span>
          </div>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="decision-reason">
            Alasan {decision === "APPROVED" ? "opsional" : "wajib, minimal 15 karakter"}
          </label>
          <textarea
            id="decision-reason"
            className="textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonInvalid}
          />
          {reasonInvalid ? (
            <span className="field__error">Alasan minimal 15 karakter untuk keputusan ini.</span>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
