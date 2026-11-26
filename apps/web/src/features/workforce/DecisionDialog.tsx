import { useEffect, useState } from "react";

import { Button, Dialog } from "../../shared/ui";

export function DecisionDialog({
  open,
  onClose,
  decision,
  title,
  description,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  decision: "APPROVED" | "REJECTED";
  title: string;
  description: string;
  onConfirm: (notes: string | undefined) => Promise<void>;
  loading?: boolean;
}) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setNotes("");
    }
  }, [open]);

  const rejection = decision === "REJECTED";
  const disabled = rejection && notes.trim().length < 3;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={rejection ? "danger" : "primary"}
            loading={loading}
            disabled={disabled}
            onClick={() => void onConfirm(notes.trim().length === 0 ? undefined : notes.trim())}
          >
            {rejection ? "Tolak" : "Setujui"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="decision-notes">
          Catatan {rejection ? "wajib" : "opsional"}
        </label>
        <textarea
          id="decision-notes"
          className="input"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={rejection ? "Jelaskan alasan penolakan" : "Catatan untuk keputusan ini"}
        />
        <span className="field__hint">
          {rejection
            ? "Penolakan memerlukan alasan minimal tiga karakter."
            : "Catatan akan tersimpan di jejak audit."}
        </span>
      </div>
    </Dialog>
  );
}
