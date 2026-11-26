import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText, Upload } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import type { ReimbursementCreate, ReimbursementUploadSignature } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Money,
  SkeletonTable,
  StatusBadge,
} from "../../shared/ui";
import { formatDate, reimbursementCategoryLabel } from "../../shared/lib/format";
import {
  createMyReimbursement,
  listMyReimbursements,
  requestReimbursementUploadSignature,
} from "./api";

const CATEGORIES = ["TRANSPORT", "MEAL", "MEDICAL", "OTHER"] as const;

async function uploadToCloudinary(
  file: File,
  signature: ReimbursementUploadSignature,
): Promise<{ url: string; publicId: string }> {
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", signature.api_key);
  body.append("timestamp", String(signature.timestamp));
  body.append("signature", signature.signature);
  body.append("folder", signature.folder);
  body.append("public_id", signature.public_id);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloud_name}/auto/upload`,
    { method: "POST", body },
  );
  if (!response.ok) {
    throw new Error("Unggah bukti gagal");
  }
  const payload = (await response.json()) as { secure_url?: string; public_id?: string };
  if (payload.secure_url === undefined || payload.public_id === undefined) {
    throw new Error("Respons unggah tidak lengkap");
  }
  return { url: payload.secure_url, publicId: payload.public_id };
}

export function MyReimbursementsTab() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("TRANSPORT");
  const [expenseDate, setExpenseDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptPublicId, setReceiptPublicId] = useState("");

  const query = useQuery({
    queryKey: ["my-reimbursements"],
    queryFn: listMyReimbursements,
  });
  const items = query.data?.data.items ?? [];

  const createMutation = useMutation({
    mutationFn: (input: ReimbursementCreate) => createMyReimbursement(input),
    onSuccess: () => {
      setError(null);
      setNotice("Reimburse tersimpan dan menunggu keputusan.");
      setExpenseDate("");
      setAmount("");
      setDescription("");
      setReceiptUrl("");
      setReceiptPublicId("");
      void queryClient.invalidateQueries({ queryKey: ["my-reimbursements"] });
    },
    onError: (caught) => {
      setNotice(null);
      setError(caught);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({
      category,
      expense_date: expenseDate,
      amount,
      description,
      ...(receiptUrl.trim().length === 0 ? {} : { receipt_url: receiptUrl.trim() }),
      ...(receiptPublicId.trim().length === 0 ? {} : { receipt_public_id: receiptPublicId.trim() }),
    });
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const signature = await requestReimbursementUploadSignature({
        mime_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
        file_size_bytes: file.size,
      });
      const uploaded = await uploadToCloudinary(file, signature.data);
      setReceiptUrl(uploaded.url);
      setReceiptPublicId(uploaded.publicId);
      setNotice("Bukti berhasil diunggah.");
    } catch (caught) {
      setNotice(null);
      setError(caught);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="stack">
      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {error === null ? null : (
        <Banner tone="danger" title="Reimburse gagal">
          {error instanceof ApiError ? error.message : "Periksa data lalu coba lagi."}
        </Banner>
      )}

      <div className="grid-sidebar reimburse-layout">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Ajukan reimburse</div>
              <div className="panel__description">
                Unggah bukti atau tempel tautan bukti yang sudah ada.
              </div>
            </div>
            <ReceiptText size={16} aria-hidden="true" />
          </div>
          <form className="panel__body stack stack--sm" onSubmit={submit}>
            <div className="field">
              <label className="field__label" htmlFor="reimb-category">
                Kategori
              </label>
              <select
                id="reimb-category"
                className="select"
                value={category}
                onChange={(event) => setCategory(event.target.value as typeof category)}
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {reimbursementCategoryLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label className="field__label" htmlFor="reimb-date">
                  Tanggal pengeluaran
                </label>
                <input
                  id="reimb-date"
                  className="input"
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="field__label" htmlFor="reimb-amount">
                  Nominal
                </label>
                <input
                  id="reimb-amount"
                  className="input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="150000.00"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reimb-description">
                Deskripsi
              </label>
              <textarea
                id="reimb-description"
                className="input"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reimb-receipt-url">
                Tautan bukti
              </label>
              <input
                id="reimb-receipt-url"
                className="input"
                type="url"
                value={receiptUrl}
                onChange={(event) => setReceiptUrl(event.target.value)}
                placeholder="https://res.cloudinary.com/..."
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reimb-receipt-file">
                Unggah bukti
              </label>
              <input
                id="reimb-receipt-file"
                className="input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(event) => void onFileChange(event)}
              />
              <span className="field__hint">
                PDF atau gambar, maksimal 5 MB. {uploading ? "Mengunggah..." : ""}
              </span>
            </div>
            <Button
              type="submit"
              variant="primary"
              icon={<Upload size={15} />}
              loading={createMutation.isPending}
              disabled={
                expenseDate.length === 0 ||
                amount.trim().length === 0 ||
                description.trim().length < 3
              }
            >
              Kirim reimburse
            </Button>
          </form>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Riwayat reimburse</div>
              <div className="panel__description">{items.length} pengajuan</div>
            </div>
          </div>
          {query.isPending ? (
            <SkeletonTable rows={3} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="Belum ada reimburse"
              body="Pengajuan reimburse yang tersimpan akan muncul di sini."
              icon={<ReceiptText size={18} />}
            />
          ) : (
            <div
              className="table-wrap"
              role="region"
              aria-label="Riwayat reimburse saya"
              tabIndex={0}
            >
              <table className="table">
                <caption className="sr-only">Riwayat reimburse saya</caption>
                <thead>
                  <tr>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Kategori</th>
                    <th scope="col" className="numeric">
                      Nominal
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.expense_date)}</td>
                      <td>
                        <div>{reimbursementCategoryLabel(item.category)}</div>
                        <div className="table__secondary small">{item.description}</div>
                      </td>
                      <td className="numeric">
                        <Money value={item.amount} />
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
