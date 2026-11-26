import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";

import type {
  PayrollBatchCreate,
  PayrollBatchDetail,
  PayrollBranch,
} from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, Dialog } from "../../shared/ui";
import { batchTypeLabel, currentPeriod, formatPeriod } from "../../shared/lib/format";
import { createPayrollBatch } from "./api";

function periodBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 1 ||
    monthIndex > 12
  ) {
    return null;
  }
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function NewBatchDialog({
  open,
  onClose,
  branches,
  defaultBranchId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  branches: PayrollBranch[];
  defaultBranchId?: string | undefined;
  onCreated: (detail: PayrollBatchDetail) => void;
}) {
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [month, setMonth] = useState(currentPeriod());
  const [batchType, setBatchType] = useState<"REGULAR" | "CORRECTION">("REGULAR");
  const [correctionSeq, setCorrectionSeq] = useState("1");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setIdempotencyKey(crypto.randomUUID());
    setError(null);
    setSubmitting(false);
    setMonth(currentPeriod());
    setBatchType("REGULAR");
    setCorrectionSeq("1");
    setBranchId((current) => {
      if (current.length > 0) {
        return current;
      }
      return defaultBranchId ?? branches[0]?.id ?? "";
    });
  }, [open, defaultBranchId, branches]);

  useEffect(() => {
    if (branchId.length === 0 && branches.length > 0) {
      setBranchId(defaultBranchId ?? branches[0]!.id);
    }
  }, [branchId, branches, defaultBranchId]);

  const bounds = periodBounds(month);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (branchId.length === 0 || bounds === null) {
      setError(new Error("Cabang dan periode wajib diisi"));
      return;
    }
    const sequence = batchType === "CORRECTION" ? Number(correctionSeq) : 0;
    if (batchType === "CORRECTION" && (!Number.isInteger(sequence) || sequence < 1)) {
      setError(new Error("Nomor koreksi minimal 1"));
      return;
    }
    const input: PayrollBatchCreate = {
      branch_id: branchId,
      period_month: bounds.start,
      batch_type: batchType,
      period_start: bounds.start,
      period_end: bounds.end,
      ...(batchType === "CORRECTION" ? { correction_seq: sequence } : {}),
    };
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPayrollBatch(input, idempotencyKey);
      onCreated(result.data);
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Batch payroll baru"
      description="Batch terikat pada kebijakan payroll aktif saat dibuat. Kalkulasi dijalankan setelah batch tersimpan."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="new-batch-form"
            icon={<CalendarPlus size={15} />}
            loading={submitting}
          >
            Buat batch
          </Button>
        </>
      }
    >
      <form id="new-batch-form" className="stack" onSubmit={submit} noValidate>
        {error === null ? null : (
          <Banner tone="danger" title="Batch tidak dapat dibuat">
            {error instanceof ApiError ? error.message : "Periksa data lalu coba lagi"}
            {error instanceof ApiError && error.correlationId !== null ? (
              <div className="error-state__code">{error.correlationId}</div>
            ) : null}
          </Banner>
        )}

        <div className="field">
          <label className="field__label" htmlFor="batch-branch">
            Cabang <span className="field__required">wajib</span>
          </label>
          <select
            id="batch-branch"
            className="select"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            required
          >
            <option value="">Pilih cabang</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} · {branch.name}
              </option>
            ))}
          </select>
          <span className="field__hint">Batch hanya mencakup personel aktif pada cabang ini.</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="batch-period">
              Periode <span className="field__required">wajib</span>
            </label>
            <input
              id="batch-period"
              className="input"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              required
            />
            <span className="field__hint">
              {bounds === null
                ? "Pilih bulan payroll"
                : `${formatPeriod(bounds.start)} · ${bounds.start} sampai ${bounds.end}`}
            </span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="batch-type">
              Tipe batch
            </label>
            <select
              id="batch-type"
              className="select"
              value={batchType}
              onChange={(event) => setBatchType(event.target.value as "REGULAR" | "CORRECTION")}
            >
              <option value="REGULAR">{batchTypeLabel("REGULAR")}</option>
              <option value="CORRECTION">{batchTypeLabel("CORRECTION")}</option>
            </select>
          </div>

          {batchType === "CORRECTION" ? (
            <div className="field">
              <label className="field__label" htmlFor="batch-correction">
                Nomor koreksi <span className="field__required">wajib</span>
              </label>
              <input
                id="batch-correction"
                className="input input--money"
                type="number"
                min={1}
                max={99}
                step={1}
                value={correctionSeq}
                onChange={(event) => setCorrectionSeq(event.target.value)}
                required
              />
              <span className="field__hint">Satu koreksi per nomor pada periode yang sama.</span>
            </div>
          ) : null}
        </div>

        <Banner tone="info" title="Kebijakan terikat otomatis">
          Versi payroll aktif akan disimpan pada batch. Perubahan kebijakan berikutnya tidak
          mengubah perhitungan batch ini.
        </Banner>
      </form>
    </Dialog>
  );
}
