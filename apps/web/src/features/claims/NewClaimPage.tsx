import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileUp, ShieldCheck, Trash2 } from "lucide-react";

import {
  CreateClaimRequestSchema,
  DocumentTypeSchema,
  type ClaimCategory,
  type ClaimDocumentInput,
} from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { Banner, Button, ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";
import { documentLabel, formatMoney } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { createClaim, getActiveClaimsPolicy, uploadDocument, type UploadedDocument } from "./api";

const CATEGORY_OPTIONS: Array<{ value: ClaimCategory; label: string }> = [
  { value: "HEALTH", label: "Kesehatan" },
  { value: "ACCIDENT", label: "Kecelakaan" },
  { value: "PROPERTY", label: "Properti" },
  { value: "GUARANTEE", label: "Penjaminan" },
];

const ALL_DOCUMENTS = DocumentTypeSchema.options;

export default function NewClaimPage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());

  const [claimantName, setClaimantName] = useState("");
  const [claimantNik, setClaimantNik] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [category, setCategory] = useState<ClaimCategory>("HEALTH");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [documents, setDocuments] = useState<Partial<Record<string, UploadedDocument>>>({});
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const policy = useQuery({
    queryKey: ["policy", "active", "CLAIMS_POLICY"],
    queryFn: getActiveClaimsPolicy,
  });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createClaim>[0]) =>
      createClaim(input, idempotencyKey.current),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      void navigate({
        to: "/claims/$claimId",
        params: { claimId: result.data.id },
        search: { created: "1" },
      });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const next: Record<string, string> = {};
        for (const detail of error.details) {
          next[detail.path] = detail.message;
        }
        setFieldErrors(next);
      }
      setFormError(error);
    },
  });

  if (!hasRole("CLAIMS_OFFICER")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">
            Hanya Petugas Klaim yang dapat membuat draf. Peran Anda saat ini adalah{" "}
            {user?.role ?? "tidak dikenal"}.
          </p>
        </div>
      </div>
    );
  }

  const rules = policy.data?.data.rules_payload;
  const required = rules?.required_documents_by_category[category] ?? [];
  const optional = rules?.optional_documents_by_category[category] ?? [];

  const handleUpload = async (type: ClaimDocumentInput["document_type"], file: File) => {
    setUploadError(null);
    setUploadingType(type);
    try {
      const uploaded = await uploadDocument(file, type);
      setDocuments((current) => ({ ...current, [type]: uploaded }));
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploadingType(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const payload = {
      claimant_name: claimantName.trim(),
      claimant_nik: claimantNik.trim(),
      claimant_bank_account: bankAccount.trim(),
      claim_category: category,
      requested_amount: requestedAmount.trim(),
      documents: Object.values(documents),
    };
    const parsed = CreateClaimRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_root";
        next[path] = issue.message;
      }
      setFieldErrors(next);
      setFormError(new Error("Periksa kembali isian yang ditandai"));
      return;
    }

    create.mutate(parsed.data);
  };

  return (
    <div className="stack">
      <PageHeader
        title="Klaim Baru"
        description="Draf akan mengikat versi kebijakan klaim yang aktif. Dokumen wajib divalidasi ulang saat submit."
        actions={
          <Button variant="secondary" onClick={() => navigate({ to: "/claims" })}>
            Kembali
          </Button>
        }
      />

      {policy.isPending ? <SkeletonTable rows={3} /> : null}
      {policy.isError ? (
        <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
      ) : null}

      {policy.isSuccess ? (
        <form className="stack" onSubmit={submit} noValidate>
          {formError === null ? null : (
            <Banner tone="danger" title="Draf belum dapat disimpan">
              {formError instanceof ApiError ? formError.message : "Periksa kembali isian klaim"}
            </Banner>
          )}

          <div className="grid-sidebar">
            <div className="stack">
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <div className="panel__title">Identitas pemohon</div>
                    <div className="panel__description">
                      NIK dan rekening di-hash di server. UI hanya menampilkan bentuk masked.
                    </div>
                  </div>
                </div>
                <div className="panel__body form-grid">
                  <div className="field form-grid__full">
                    <label className="field__label" htmlFor="claimant-name">
                      Nama pemohon <span className="field__required">wajib</span>
                    </label>
                    <input
                      id="claimant-name"
                      className="input"
                      value={claimantName}
                      onChange={(event) => setClaimantName(event.target.value)}
                      aria-invalid={fieldErrors.claimant_name !== undefined}
                      aria-describedby="claimant-name-error"
                      autoComplete="name"
                    />
                    {fieldErrors.claimant_name === undefined ? null : (
                      <span className="field__error" id="claimant-name-error">
                        {fieldErrors.claimant_name}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="claimant-nik">
                      NIK 16 digit <span className="field__required">wajib</span>
                    </label>
                    <input
                      id="claimant-nik"
                      className="input mono"
                      inputMode="numeric"
                      maxLength={16}
                      value={claimantNik}
                      onChange={(event) => setClaimantNik(event.target.value.replace(/\D/g, ""))}
                      aria-invalid={fieldErrors.claimant_nik !== undefined}
                    />
                    {fieldErrors.claimant_nik === undefined ? null : (
                      <span className="field__error">{fieldErrors.claimant_nik}</span>
                    )}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="bank-account">
                      Rekening penerima <span className="field__required">wajib</span>
                    </label>
                    <input
                      id="bank-account"
                      className="input mono"
                      inputMode="numeric"
                      value={bankAccount}
                      onChange={(event) => setBankAccount(event.target.value.replace(/\D/g, ""))}
                      aria-invalid={fieldErrors.claimant_bank_account !== undefined}
                    />
                    {fieldErrors.claimant_bank_account === undefined ? null : (
                      <span className="field__error">{fieldErrors.claimant_bank_account}</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__header">
                  <div>
                    <div className="panel__title">Nominal dan kategori</div>
                    <div className="panel__description">
                      Batas level 1 {formatMoney(rules?.approval_tiers.level_1_branch_manager_max)}.
                      Batas level 2 {formatMoney(rules?.approval_tiers.level_2_finance_manager_max)}
                      .
                    </div>
                  </div>
                </div>
                <div className="panel__body form-grid">
                  <div className="field">
                    <label className="field__label" htmlFor="category">
                      Kategori klaim
                    </label>
                    <select
                      id="category"
                      className="select"
                      value={category}
                      onChange={(event) => setCategory(event.target.value as ClaimCategory)}
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="amount">
                      Nominal diajukan <span className="field__required">wajib</span>
                    </label>
                    <div className="row">
                      <span className="muted">Rp</span>
                      <input
                        id="amount"
                        className="input input--money"
                        inputMode="decimal"
                        placeholder="5000000.00"
                        value={requestedAmount}
                        onChange={(event) => setRequestedAmount(event.target.value)}
                        aria-invalid={fieldErrors.requested_amount !== undefined}
                      />
                    </div>
                    <span className="field__hint">
                      Gunakan titik untuk desimal, tanpa pemisah ribuan.
                    </span>
                    {fieldErrors.requested_amount === undefined ? null : (
                      <span className="field__error">{fieldErrors.requested_amount}</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__header">
                  <div>
                    <div className="panel__title">Dokumen pendukung</div>
                    <div className="panel__description">
                      Format PDF, JPG, PNG, atau WEBP. Ukuran maksimal 5 MB per dokumen.
                    </div>
                  </div>
                </div>
                <div className="panel__body stack">
                  {uploadError === null ? null : (
                    <Banner tone="danger" title="Unggahan gagal">
                      {uploadError instanceof ApiError
                        ? uploadError.message
                        : "Periksa berkas lalu coba lagi"}
                    </Banner>
                  )}
                  <div className="document-list">
                    {ALL_DOCUMENTS.map((type) => {
                      const requiredType = required.includes(type);
                      const optionalType = optional.includes(type);
                      if (!requiredType && !optionalType) {
                        return null;
                      }
                      const document = documents[type];
                      return (
                        <div className="document" key={type}>
                          <div className="document__icon" aria-hidden="true">
                            <FileUp size={15} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="document__name">
                              {documentLabel(type)}{" "}
                              {requiredType ? (
                                <span className="badge badge--rejected">Wajib</span>
                              ) : (
                                <span className="badge badge--draft">Opsional</span>
                              )}
                            </div>
                            <div className="document__meta">
                              {document === undefined
                                ? uploadingType === type
                                  ? "Mengunggah dokumen"
                                  : "Belum ada berkas"
                                : document.cloudinary_public_id}
                            </div>
                          </div>
                          {document === undefined ? (
                            <label className="btn btn--secondary btn--sm">
                              {uploadingType === type ? "Mengunggah" : "Pilih berkas"}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp"
                                className="sr-only"
                                aria-label={`Unggah ${documentLabel(type)}`}
                                disabled={uploadingType !== null}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file !== undefined) {
                                    void handleUpload(type, file);
                                  }
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Hapus ${documentLabel(type)}`}
                              onClick={() =>
                                setDocuments((current) => {
                                  const next = { ...current };
                                  delete next[type];
                                  return next;
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {required.some((type) => documents[type] === undefined) ? (
                    <Banner tone="warning" title="Dokumen wajib belum lengkap">
                      Draf tetap dapat disimpan, tetapi submit akan ditolak sampai semua dokumen
                      wajib tersedia.
                    </Banner>
                  ) : null}
                </div>
              </section>
            </div>

            <aside className="stack">
              <section className="panel">
                <div className="panel__header">
                  <div className="panel__title">Kebijakan terikat</div>
                </div>
                <div className="panel__body stack stack--sm">
                  <div className="policy-chip">
                    <ShieldCheck size={13} />
                    {policy.data.data.version_tag}
                  </div>
                  <p className="small muted">
                    Versi ini dikunci saat draf dibuat. Perubahan kebijakan setelahnya tidak
                    mengubah klaim ini.
                  </p>
                  <div className="summary-list">
                    <div>
                      <div className="summary-list__label">SLA</div>
                      <div className="summary-list__value">
                        {rules?.sla_target_hours ?? "-"} jam
                      </div>
                    </div>
                    <div>
                      <div className="summary-list__label">Ambang risiko</div>
                      <div className="summary-list__value">
                        {rules?.approval_tiers.auto_escalate_risk_threshold ?? "-"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel__body stack">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={create.isPending}
                    disabled={uploadingType !== null}
                  >
                    Simpan draf
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate({ to: "/claims" })}
                  >
                    Batal
                  </Button>
                  <p className="small muted">
                    Setelah draf tersimpan, buka detail untuk memeriksa ringkasan lalu submit.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </form>
      ) : null}
    </div>
  );
}
