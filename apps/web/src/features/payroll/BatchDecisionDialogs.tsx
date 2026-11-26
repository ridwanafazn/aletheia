import { useEffect, useState } from "react";
import { Banknote, CheckCircle2 } from "lucide-react";

import type { PayrollBatch } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, Dialog, Money } from "../../shared/ui";
import { formatMoney, formatPeriod } from "../../shared/lib/format";

export function ApproveBatchDialog({
  open,
  onClose,
  batch,
  netAmount,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  batch: PayrollBatch;
  netAmount: string;
  onConfirm: (notes: string | undefined) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNotes("");
    setSubmitting(false);
    setError(null);
  }, [open]);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(notes.trim().length === 0 ? undefined : notes.trim());
    } catch (caught) {
      setError(caught);
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Setujui batch payroll"
      description={`${batch.batch_code} · ${formatPeriod(batch.period_month)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant="primary"
            icon={<CheckCircle2 size={15} />}
            loading={submitting}
            onClick={() => void confirm()}
          >
            Setujui batch
          </Button>
        </>
      }
    >
      <div className="stack">
        {error === null ? null : (
          <Banner tone="danger" title="Persetujuan gagal">
            {error instanceof ApiError ? error.message : "Coba lagi setelah memuat ulang data"}
            {error instanceof ApiError && error.correlationId !== null ? (
              <div className="error-state__code">{error.correlationId}</div>
            ) : null}
          </Banner>
        )}

        <div className="confirm-summary">
          <div>
            <span className="micro">Net batch</span>
            <div className="amount-large">{formatMoney(netAmount)}</div>
          </div>
          <div>
            <span className="micro">Personel</span>
            <div className="confirm-summary__value">{batch.headcount} personel</div>
          </div>
        </div>

        <Banner tone="warning" title="Periksa sebelum menyetujui">
          Persetujuan mengizinkan pencairan seluruh item pada batch ini. Pembuat batch tidak dapat
          menjadi penyetuju.
        </Banner>

        <div className="field">
          <label className="field__label" htmlFor="approve-notes">
            Catatan persetujuan
          </label>
          <textarea
            id="approve-notes"
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opsional. Jelaskan dasar persetujuan bila diperlukan."
            maxLength={2000}
          />
          <span className="field__hint">Catatan disimpan pada jejak audit batch.</span>
        </div>
      </div>
    </Dialog>
  );
}

export function DisburseBatchDialog({
  open,
  onClose,
  batch,
  netAmount,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  batch: PayrollBatch;
  netAmount: string;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSubmitting(false);
    setError(null);
  }, [open]);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught);
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cairkan batch payroll"
      description={`${batch.batch_code} · ${formatPeriod(batch.period_month)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant="danger"
            icon={<Banknote size={15} />}
            loading={submitting}
            onClick={() => void confirm()}
          >
            Kirim pencairan
          </Button>
        </>
      }
    >
      <div className="stack">
        {error === null ? null : (
          <Banner tone="danger" title="Pencairan gagal">
            {error instanceof ApiError ? error.message : "Coba lagi setelah memuat ulang data"}
            {error instanceof ApiError && error.correlationId !== null ? (
              <div className="error-state__code">{error.correlationId}</div>
            ) : null}
          </Banner>
        )}

        <div className="confirm-summary">
          <div>
            <span className="micro">Total pencairan</span>
            <div className="amount-large">{formatMoney(netAmount)}</div>
          </div>
          <div>
            <span className="micro">Penerima</span>
            <div className="confirm-summary__value">{batch.headcount} personel</div>
          </div>
        </div>

        <dl className="ledger">
          <div className="ledger__row">
            <dt>Provider</dt>
            <dd>Mock provider demo</dd>
          </div>
          <div className="ledger__row">
            <dt>Bruto batch</dt>
            <dd>
              <Money value={batch.total_gross_amount} />
            </dd>
          </div>
          <div className="ledger__row">
            <dt>PPh 21</dt>
            <dd>
              <Money value={batch.total_tax_pph21} />
            </dd>
          </div>
          <div className="ledger__row">
            <dt>BPJS karyawan</dt>
            <dd>
              <Money value={batch.total_bpjs_deduction} />
            </dd>
          </div>
        </dl>

        <Banner tone="danger" title="Tindakan tidak dapat dibatalkan">
          Setiap item akan membuat payment idempoten. Status batch berubah menjadi Dicairkan hanya
          setelah provider mengembalikan status berhasil.
        </Banner>
      </div>
    </Dialog>
  );
}
