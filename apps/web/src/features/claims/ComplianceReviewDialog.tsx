import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import type { ClaimDetail } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, Dialog } from "../../shared/ui";
import { conflictLabel } from "../../shared/lib/format";
import { reviewClaimCompliance } from "./api";

export function ComplianceReviewDialog({
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
  const [resolution, setResolution] = useState<"FALSE_POSITIVE" | "CONFIRMED_FRAUD">(
    "FALSE_POSITIVE",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setResolution("FALSE_POSITIVE");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      reviewClaimCompliance(claim.id, {
        resolution,
        reason_notes: notes.trim(),
      }),
    onSuccess: (result) => {
      onSuccess(
        resolution === "CONFIRMED_FRAUD"
          ? "Fraud dikonfirmasi dan klaim ditutup"
          : "Review dicatat dan klaim dikembalikan ke jalur persetujuan",
      );
      onClose();
      void result;
    },
    onError: (caught) => setError(caught),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review kepatuhan"
      description={claim.claim_number}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={resolution === "CONFIRMED_FRAUD" ? "danger" : "primary"}
            loading={mutation.isPending}
            disabled={notes.trim().length < 15}
            onClick={() => mutation.mutate()}
          >
            Simpan review
          </Button>
        </>
      }
    >
      <div className="stack">
        {error === null ? null : (
          <Banner tone="danger" title="Review tidak dapat disimpan">
            {error instanceof ApiError ? error.message : "Coba lagi"}
          </Banner>
        )}

        <div className="stack stack--sm">
          <div className="micro">Flag konflik</div>
          {claim.anomaly_flags.map((flag) => (
            <div className="document" key={flag.id}>
              <div className="document__icon" aria-hidden="true">
                <ShieldAlert size={15} />
              </div>
              <div>
                <div className="document__name">{conflictLabel(flag.conflict_type)}</div>
                <div className="document__meta">
                  {flag.severity} ·{" "}
                  {flag.matched_personnel_name ?? flag.matched_claim_number ?? "Tidak ada padanan"}
                </div>
              </div>
            </div>
          ))}
        </div>

        <fieldset className="stack stack--sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Resolusi</legend>
          <label className="document" style={{ cursor: "pointer" }}>
            <input
              type="radio"
              name="resolution"
              checked={resolution === "FALSE_POSITIVE"}
              onChange={() => setResolution("FALSE_POSITIVE")}
            />
            <ShieldCheck size={16} aria-hidden="true" />
            <div>
              <div className="document__name">False positive</div>
              <div className="document__meta">Klaim dapat dilanjutkan ke persetujuan</div>
            </div>
          </label>
          <label className="document" style={{ cursor: "pointer" }}>
            <input
              type="radio"
              name="resolution"
              checked={resolution === "CONFIRMED_FRAUD"}
              onChange={() => setResolution("CONFIRMED_FRAUD")}
            />
            <ShieldAlert size={16} aria-hidden="true" />
            <div>
              <div className="document__name">Fraud terkonfirmasi</div>
              <div className="document__meta">Klaim ditolak dan ditutup</div>
            </div>
          </label>
        </fieldset>

        <div className="field">
          <label className="field__label" htmlFor="review-notes">
            Catatan review, minimal 15 karakter
          </label>
          <textarea
            id="review-notes"
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
