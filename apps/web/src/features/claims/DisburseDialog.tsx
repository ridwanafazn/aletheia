import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import type { ClaimDetail, ClaimPayment } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, Dialog } from "../../shared/ui";
import { formatMoney, statusLabel } from "../../shared/lib/format";
import { disburseClaim } from "./api";

export function DisburseDialog({
  claim,
  open,
  onClose,
  onSuccess,
}: {
  claim: ClaimDetail;
  open: boolean;
  onClose: () => void;
  onSuccess: (payment: ClaimPayment) => void;
}) {
  const [provider, setProvider] = useState<"MOCK" | "XENDIT" | "MIDTRANS">("MOCK");
  const [error, setError] = useState<unknown>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      idempotencyKey.current = crypto.randomUUID();
      setProvider("MOCK");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => disburseClaim(claim.id, { provider }, idempotencyKey.current),
    onSuccess: (result) => {
      onSuccess(result.data);
      onClose();
    },
    onError: (caught) => setError(caught),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cairkan klaim"
      description={`${claim.claim_number} · ${formatMoney(claim.approved_amount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={provider !== "MOCK"}
            icon={<Banknote size={16} />}
            onClick={() => mutation.mutate()}
          >
            Kirim pencairan
          </Button>
        </>
      }
    >
      <div className="stack">
        {error === null ? null : (
          <Banner tone="danger" title="Pencairan gagal">
            {error instanceof ApiError ? error.message : "Coba lagi"}
            {error instanceof ApiError && error.code === "ERR_PAYMENT_STATE_CONFLICT" ? (
              <div className="small">Pencairan aktif atau lunas sudah ada untuk klaim ini.</div>
            ) : null}
          </Banner>
        )}

        <div className="summary-list">
          <div>
            <div className="summary-list__label">Nominal final</div>
            <div className="summary-list__value">{formatMoney(claim.approved_amount)}</div>
          </div>
          <div>
            <div className="summary-list__label">Status klaim</div>
            <div className="summary-list__value">{statusLabel(claim.status)}</div>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="provider">
            Provider pembayaran
          </label>
          <select
            id="provider"
            className="select"
            value={provider}
            onChange={(event) => setProvider(event.target.value as typeof provider)}
          >
            <option value="MOCK">Mock provider untuk demo</option>
            <option value="XENDIT">Xendit, belum dikonfigurasi</option>
            <option value="MIDTRANS">Midtrans, belum dikonfigurasi</option>
          </select>
          <span className="field__hint">
            Hanya provider MOCK yang aktif pada lingkungan demo. Status PAID berasal dari provider
            atau webhook, bukan input manual.
          </span>
        </div>

        <Banner tone="warning" title="Tindakan finansial">
          Pastikan nominal dan rekening tujuan sudah sesuai. Pencairan kedua akan ditolak oleh
          penguncian idempotensi dan indeks unik.
        </Banner>
      </div>
    </Dialog>
  );
}
