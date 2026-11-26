import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import type { PayrollItem } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import { listBranches } from "../../shared/api/reference";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonTable,
  StatusBadge,
} from "../../shared/ui";
import {
  batchTypeLabel,
  formatDateTime,
  formatMoney,
  formatPeriod,
  statusLabel,
} from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { listAllEmployees } from "../employees/api";
import { requestPayslips } from "../reports/api";
import {
  approvePayrollBatch,
  calculatePayrollBatch,
  disbursePayrollBatch,
  getPayrollBatch,
  listPayrollBatches,
} from "./api";
import { ApproveBatchDialog, DisburseBatchDialog } from "./BatchDecisionDialogs";
import { CalculationBreakdownDrawer } from "./CalculationBreakdownDrawer";

const STEPS = [
  { label: "Draf", statuses: ["DRAFT"] },
  { label: "Kalkulasi", statuses: ["CALCULATING"] },
  { label: "Siap disetujui", statuses: ["READY_FOR_APPROVAL"] },
  { label: "Disetujui", statuses: ["APPROVED", "DISBURSING"] },
  { label: "Dicairkan", statuses: ["DISBURSED", "PARTIAL"] },
];

function sumItems(items: PayrollItem[], field: keyof PayrollItem): number {
  return items.reduce((total, item) => total + Number(item[field]), 0);
}

export default function PayrollBatchPage() {
  const { batchId } = useParams({ strict: false }) as { batchId: string };
  const search = useSearch({ strict: false }) as { created?: string };
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);
  const [calculateError, setCalculateError] = useState<unknown>(null);
  const [payslipError, setPayslipError] = useState<unknown>(null);
  const [payslipQueued, setPayslipQueued] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [approveKey, setApproveKey] = useState("");
  const [disburseKey, setDisburseKey] = useState("");
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null);

  const batchQuery = useQuery({
    queryKey: ["payroll-batch", batchId],
    queryFn: () => getPayrollBatch(batchId),
    refetchInterval: (queryState) => {
      const status = queryState.state.data?.data.batch.status;
      return status === "CALCULATING" || status === "DISBURSING" ? 5_000 : false;
    },
  });

  const detail = batchQuery.data?.data;
  const batch = detail?.batch;
  const items = detail?.items ?? [];

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const employeesQuery = useQuery({
    queryKey: ["employees-for-batch", batch?.branch_id],
    queryFn: () => listAllEmployees(batch?.branch_id),
    enabled: batch !== undefined,
  });
  const employees = employeesQuery.data ?? [];

  const historyQuery = useQuery({
    queryKey: ["payroll-batches", "history", batch?.branch_id],
    queryFn: () => listPayrollBatches({ branch_id: batch!.branch_id, limit: 25 }),
    enabled: batch !== undefined,
  });
  const comparison = historyQuery.data?.data.items
    .filter(
      (candidate) =>
        candidate.id !== batch?.id &&
        batch !== undefined &&
        !["DRAFT", "CALCULATING"].includes(candidate.status) &&
        (candidate.created_at < batch.created_at || candidate.period_month < batch.period_month),
    )
    .sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];

  const comparisonQuery = useQuery({
    queryKey: ["payroll-batch", comparison?.id],
    queryFn: () => getPayrollBatch(comparison!.id),
    enabled: comparison !== undefined,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["payroll-batch", batchId] });
    void queryClient.invalidateQueries({ queryKey: ["payroll-batches"] });
  };

  const calculateMutation = useMutation({
    mutationFn: () => calculatePayrollBatch(batchId),
    onSuccess: () => {
      setCalculateError(null);
      setNotice("Kalkulasi dimulai. Status batch berubah menjadi Kalkulasi berjalan.");
      invalidate();
    },
    onError: (error) => setCalculateError(error),
  });

  const approveMutation = useMutation({
    mutationFn: (notes: string | undefined) => approvePayrollBatch(batchId, notes, approveKey),
    onSuccess: () => {
      setApproveOpen(false);
      setNotice("Batch disetujui. Tahap berikutnya adalah pencairan oleh Manajer Keuangan.");
      invalidate();
    },
  });

  const disburseMutation = useMutation({
    mutationFn: () => disbursePayrollBatch(batchId, "MOCK", disburseKey),
    onSuccess: (result) => {
      setDisburseOpen(false);
      setNotice(
        result.data.batch.status === "DISBURSED"
          ? "Pencairan selesai. Seluruh item berstatus dibayar."
          : "Pencairan selesai dengan status batch " + statusLabel(result.data.batch.status),
      );
      invalidate();
    },
  });

  const payslipMutation = useMutation({
    mutationFn: (idempotencyKey: string) => requestPayslips(batchId, idempotencyKey),
    onSuccess: (result) => {
      setPayslipError(null);
      setPayslipQueued(true);
      setNotice(
        `Slip gaji masuk antrean untuk ${result.data.item_count} personel. Buka menu Slip Gaji untuk melihat hasilnya.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["payslips"] });
    },
    onError: (error) => {
      setNotice(null);
      setPayslipError(error);
    },
  });

  if (!hasRole("HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Detail batch hanya tersedia untuk peran payroll dan kepatuhan.</p>
        </div>
      </div>
    );
  }

  if (batchQuery.isPending) {
    return <SkeletonTable rows={7} />;
  }
  if (batchQuery.isError) {
    return <ErrorState error={batchQuery.error} onRetry={() => void batchQuery.refetch()} />;
  }
  if (detail === undefined) {
    return (
      <EmptyState
        title="Batch payroll tidak ditemukan"
        body="Batch mungkin berada di tenant lain atau sudah tidak tersedia."
      />
    );
  }

  const branchName =
    branches.find((branch) => branch.id === detail.batch.branch_id)?.name ??
    detail.batch.branch_id.slice(-6);
  const gross =
    items.length > 0 ? sumItems(items, "gross_income") : Number(batch!.total_gross_amount);
  const bpjs =
    items.length > 0
      ? sumItems(items, "bpjs_kesehatan_deduction") +
        sumItems(items, "bpjs_jht_deduction") +
        sumItems(items, "bpjs_jp_deduction")
      : Number(batch!.total_bpjs_deduction);
  const tax =
    items.length > 0 ? sumItems(items, "pph21_tax_deduction") : Number(batch!.total_tax_pph21);
  const net = items.length > 0 ? sumItems(items, "net_take_home_pay") : 0;
  const employerBpjs = Number(batch!.total_bpjs_employer);
  const comparisonItems = comparisonQuery.data?.data.items ?? [];
  const comparisonNet =
    comparisonItems.length > 0
      ? sumItems(comparisonItems, "net_take_home_pay")
      : Number(comparison?.total_net_disbursed ?? 0);
  const netDelta = comparison === undefined ? 0 : net - comparisonNet;
  const netDeltaPercent =
    comparison === undefined || comparisonNet === 0 ? null : (netDelta / comparisonNet) * 100;

  const maker = batch!.created_by === user?.id;
  const canCalculate = hasRole("HR_SPECIALIST") && batch!.status === "DRAFT";
  const canApprove = hasRole("FINANCE_MANAGER") && batch!.status === "READY_FOR_APPROVAL" && !maker;
  const canDisburse = hasRole("FINANCE_MANAGER") && batch!.status === "APPROVED";
  const canRequestPayslips =
    hasRole("HR_SPECIALIST") && ["APPROVED", "DISBURSED"].includes(batch!.status) && !payslipQueued;
  const currentStep = STEPS.findIndex((step) => step.statuses.includes(batch!.status));
  const failed = ["FAILED", "PARTIAL", "REJECTED", "CANCELLED"].includes(batch!.status);

  const approvalMessage = (() => {
    if (batch!.status === "DRAFT") {
      return hasRole("HR_SPECIALIST")
        ? "Jalankan kalkulasi untuk mengisi item dan total batch."
        : "Batch masih berupa draf. Spesialis SDM harus menjalankan kalkulasi.";
    }
    if (batch!.status === "CALCULATING") {
      return "Worker sedang menghitung. Halaman menyegarkan otomatis setiap lima detik.";
    }
    if (batch!.status === "READY_FOR_APPROVAL") {
      if (maker) {
        return "Anda membuat batch ini. Manajer Keuangan lain harus menyetujui.";
      }
      return hasRole("FINANCE_MANAGER")
        ? "Periksa komponen dan varians sebelum menyetujui."
        : "Menunggu persetujuan Manajer Keuangan.";
    }
    if (batch!.status === "APPROVED") {
      return hasRole("FINANCE_MANAGER")
        ? "Batch siap dicairkan. Pencairan memakai mock provider demo."
        : "Batch sudah disetujui dan menunggu pencairan.";
    }
    if (batch!.status === "DISBURSED") {
      return "Seluruh item sudah dibayar. Batch bersifat final.";
    }
    if (failed) {
      return "Batch tidak selesai penuh. Rekonsiliasi dan retry akan tersedia pada task berikutnya.";
    }
    return "Tidak ada tindakan yang tersedia pada status ini.";
  })();

  return (
    <div className="stack">
      <PageHeader
        title="Detail Batch Payroll"
        description={`${batch!.batch_code} · ${branchName} · ${formatPeriod(batch!.period_month)}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<ArrowLeft size={15} />}
              onClick={() => navigate({ to: "/payroll" })}
            >
              Kembali
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              loading={batchQuery.isFetching}
              onClick={() => void batchQuery.refetch()}
            >
              Segarkan
            </Button>
          </>
        }
      />

      {search.created === "1" ? (
        <Banner tone="success" title="Batch tersimpan">
          Jalankan kalkulasi agar worker mengisi komponen gaji, BPJS, dan PPh 21.
        </Banner>
      ) : null}
      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {calculateError === null ? null : (
        <Banner tone="danger" title="Kalkulasi gagal dimulai">
          {calculateError instanceof ApiError
            ? calculateError.message
            : "Periksa koneksi lalu coba lagi"}
        </Banner>
      )}
      {payslipError === null ? null : (
        <Banner tone="danger" title="Slip gaji gagal dibuat">
          {payslipError instanceof ApiError
            ? payslipError.message
            : "Periksa koneksi lalu coba lagi"}
        </Banner>
      )}
      {batch!.status === "CALCULATING" ? (
        <Banner tone="info" title="Kalkulasi berjalan">
          Worker memproses batch ini secara asinkron. Anda dapat meninggalkan halaman dan kembali
          nanti.
        </Banner>
      ) : null}
      {failed ? (
        <Banner tone="danger" title="Batch memerlukan perhatian">
          Status {statusLabel(batch!.status)}. Periksa rincian item dan payment sebelum tindakan
          lanjutan.
        </Banner>
      ) : null}

      <ol className="payroll-steps" aria-label="Tahap batch payroll">
        {STEPS.map((step, index) => {
          const state =
            index < currentStep || batch!.status === "DISBURSED"
              ? "complete"
              : index === currentStep
                ? "current"
                : "upcoming";
          return (
            <li key={step.label} className={`payroll-steps__item payroll-steps__item--${state}`}>
              <span className="payroll-steps__dot" aria-hidden="true" />
              <span>{step.label}</span>
              <span className="sr-only">
                {state === "complete"
                  ? "Selesai"
                  : state === "current"
                    ? "Tahap saat ini"
                    : "Belum dimulai"}
              </span>
            </li>
          );
        })}
      </ol>

      <section className="settlement" aria-label="Ringkasan perhitungan batch">
        <div className="settlement__grid">
          <div className="settlement__cell">
            <span className="micro">Bruto</span>
            <strong>{formatMoney(String(gross))}</strong>
          </div>
          <span className="settlement__operator" aria-hidden="true">
            −
          </span>
          <div className="settlement__cell">
            <span className="micro">BPJS karyawan</span>
            <strong>{formatMoney(String(bpjs))}</strong>
          </div>
          <span className="settlement__operator" aria-hidden="true">
            −
          </span>
          <div className="settlement__cell">
            <span className="micro">PPh 21</span>
            <strong>{formatMoney(String(tax))}</strong>
          </div>
          <span className="settlement__operator" aria-hidden="true">
            =
          </span>
          <div className="settlement__cell settlement__cell--net">
            <span className="micro">Net karyawan</span>
            <strong>{formatMoney(String(net))}</strong>
          </div>
        </div>
        <div className="settlement__meta">
          <span>{batch!.headcount} personel</span>
          <span>Beban pemberi kerja {formatMoney(String(employerBpjs))}</span>
          <span className="mono">Kebijakan {batch!.policy_version_id.slice(-8)}</span>
          <StatusBadge status={batch!.status} />
        </div>
      </section>

      <div className="grid-sidebar">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Item perhitungan</div>
              <div className="panel__description">
                {items.length} personel pada batch ini. Pilih nama untuk melihat breakdown.
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title={batch!.status === "DRAFT" ? "Batch belum dihitung" : "Belum ada item"}
              body={
                batch!.status === "DRAFT"
                  ? "Jalankan kalkulasi agar worker membuat item gaji, BPJS, PPh 21, dan komisi."
                  : "Item akan muncul setelah worker menyelesaikan kalkulasi."
              }
              icon={<Calculator size={18} />}
              action={
                canCalculate ? (
                  <Button
                    variant="primary"
                    loading={calculateMutation.isPending}
                    onClick={() => calculateMutation.mutate()}
                  >
                    Hitung batch
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="table-wrap payroll-items-table">
              <table className="table">
                <caption className="sr-only">
                  Item payroll per personel dengan bruto, BPJS, PPh 21, net, dan status pembayaran
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col" className="numeric">
                      Bruto
                    </th>
                    <th scope="col" className="numeric col-hide-sm">
                      BPJS
                    </th>
                    <th scope="col" className="numeric col-hide-sm">
                      PPh 21
                    </th>
                    <th scope="col" className="numeric">
                      Net
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Pembayaran
                    </th>
                    <th scope="col">
                      <span className="sr-only">Rincian</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const employee = employees.find((person) => person.id === item.personnel_id);
                    const name = employee?.full_name ?? `Personel ${item.personnel_id.slice(-6)}`;
                    const code = employee?.personnel_code ?? item.personnel_id.slice(-8);
                    return (
                      <tr key={item.id}>
                        <td>
                          <button
                            type="button"
                            className="table__primary link-button"
                            onClick={() => setSelectedItem(item)}
                          >
                            {name}
                          </button>
                          <div className="table__secondary mono">{code}</div>
                        </td>
                        <td className="numeric">{formatMoney(item.gross_income)}</td>
                        <td className="numeric col-hide-sm">
                          {formatMoney(
                            String(
                              Number(item.bpjs_kesehatan_deduction) +
                                Number(item.bpjs_jht_deduction) +
                                Number(item.bpjs_jp_deduction),
                            ),
                          )}
                        </td>
                        <td className="numeric col-hide-sm">
                          {formatMoney(item.pph21_tax_deduction)}
                        </td>
                        <td className="numeric">{formatMoney(item.net_take_home_pay)}</td>
                        <td className="col-hide-sm">
                          <StatusBadge status={item.payment_status} />
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedItem(item)}
                            aria-label={`Lihat rincian ${name}`}
                          >
                            Rincian
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="stack" aria-label="Status dan tindakan batch">
          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Alur persetujuan</div>
                <div className="panel__description">Pemisahan tugas pembuat dan penyetuju</div>
              </div>
              <ShieldCheck size={16} aria-hidden="true" />
            </div>
            <div className="panel__body stack stack--sm">
              <dl className="ledger">
                <div className="ledger__row">
                  <dt>Dibuat</dt>
                  <dd>{formatDateTime(batch!.created_at)}</dd>
                </div>
                <div className="ledger__row">
                  <dt>Disetujui</dt>
                  <dd>
                    {batch!.approved_at === null
                      ? "Belum disetujui"
                      : formatDateTime(batch!.approved_at)}
                  </dd>
                </div>
                <div className="ledger__row">
                  <dt>Dicairkan</dt>
                  <dd>
                    {batch!.disbursed_at === null
                      ? "Belum dicairkan"
                      : formatDateTime(batch!.disbursed_at)}
                  </dd>
                </div>
              </dl>
              <p className="small muted">{approvalMessage}</p>

              {canCalculate ? (
                <Button
                  variant="primary"
                  icon={<Calculator size={15} />}
                  loading={calculateMutation.isPending}
                  onClick={() => calculateMutation.mutate()}
                >
                  Hitung batch
                </Button>
              ) : null}
              {canApprove ? (
                <Button
                  variant="primary"
                  icon={<CheckCircle2 size={15} />}
                  onClick={() => {
                    setApproveKey(crypto.randomUUID());
                    setApproveOpen(true);
                  }}
                >
                  Setujui batch
                </Button>
              ) : null}
              {canDisburse ? (
                <Button
                  variant="danger"
                  icon={<Wallet size={15} />}
                  onClick={() => {
                    setDisburseKey(crypto.randomUUID());
                    setDisburseOpen(true);
                  }}
                >
                  Cairkan batch
                </Button>
              ) : null}
              {canRequestPayslips ? (
                <Button
                  variant="secondary"
                  icon={<FileText size={15} />}
                  loading={payslipMutation.isPending}
                  onClick={() => payslipMutation.mutate(crypto.randomUUID())}
                >
                  Buat slip gaji
                </Button>
              ) : null}
              {payslipQueued ? (
                <span className="small muted">
                  Slip gaji sudah diminta pada sesi ini. Buka menu Slip Gaji untuk melihat hasilnya.
                </span>
              ) : null}
              {batch!.status === "READY_FOR_APPROVAL" && maker && hasRole("FINANCE_MANAGER") ? (
                <span className="small muted">
                  Tombol persetujuan dinonaktifkan karena Anda pembuat batch.
                </span>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Varians</div>
                <div className="panel__description">Dibanding batch sebelumnya</div>
              </div>
            </div>
            <div className="panel__body">
              {comparison === undefined ? (
                <p className="small muted">Belum ada batch pembanding pada cabang ini.</p>
              ) : (
                <div className="stack stack--sm">
                  <div className="small muted">
                    {comparison.batch_code} · {formatPeriod(comparison.period_month)}
                  </div>
                  <div className="variance">
                    <span className="variance__label">Net batch ini</span>
                    <span className="numeric">{formatMoney(String(net))}</span>
                  </div>
                  <div className="variance">
                    <span className="variance__label">Net pembanding</span>
                    <span className="numeric">{formatMoney(String(comparisonNet))}</span>
                  </div>
                  <div className="variance variance--total">
                    <span className="variance__label">Selisih</span>
                    <span
                      className={`numeric ${netDelta > 0 ? "variance__up" : netDelta < 0 ? "variance__down" : ""}`}
                    >
                      {netDelta > 0 ? "+" : ""}
                      {formatMoney(String(netDelta))}
                    </span>
                  </div>
                  {netDeltaPercent === null ? null : (
                    <div className="small muted">
                      {netDeltaPercent > 0 ? "+" : ""}
                      {netDeltaPercent.toFixed(2)} persen dari batch pembanding
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <div className="panel__title">Kebijakan dan periode</div>
                <div className="panel__description">Referensi yang mengikat batch</div>
              </div>
            </div>
            <div className="panel__body">
              <div className="summary-list">
                <div>
                  <div className="summary-list__label">Tipe</div>
                  <div className="summary-list__value">{batchTypeLabel(batch!.batch_type)}</div>
                </div>
                {batch!.correction_seq > 0 ? (
                  <div>
                    <div className="summary-list__label">Koreksi</div>
                    <div className="summary-list__value mono">{batch!.correction_seq}</div>
                  </div>
                ) : null}
                <div>
                  <div className="summary-list__label">Mulai</div>
                  <div className="summary-list__value">{batch!.period_start}</div>
                </div>
                <div>
                  <div className="summary-list__label">Selesai</div>
                  <div className="summary-list__value">{batch!.period_end}</div>
                </div>
              </div>
              <div className="policy-chip" style={{ marginTop: 12 }}>
                <ShieldCheck size={12} aria-hidden="true" />
                <span className="mono">{batch!.policy_version_id}</span>
              </div>
              {Number(batch!.total_bpjs_employer) > 0 ? (
                <p className="small muted" style={{ marginTop: 10 }}>
                  Beban BPJS pemberi kerja {formatMoney(batch!.total_bpjs_employer)} tidak
                  mengurangi net karyawan.
                </p>
              ) : null}
            </div>
          </section>

          {employeesQuery.isError ? (
            <Banner tone="warning" title="Nama personel tidak lengkap">
              Sebagian item ditampilkan dengan kode personel.
            </Banner>
          ) : null}
          {failed ? (
            <Banner tone="danger" title="Status akhir tidak normal">
              <div className="row small">
                <AlertTriangle size={14} aria-hidden="true" />
                Gunakan jejak audit dan status payment untuk menelusuri penyebab.
              </div>
            </Banner>
          ) : null}
        </aside>
      </div>

      <ApproveBatchDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        batch={batch!}
        netAmount={String(net)}
        onConfirm={async (notes) => {
          await approveMutation.mutateAsync(notes);
        }}
      />
      <DisburseBatchDialog
        open={disburseOpen}
        onClose={() => setDisburseOpen(false)}
        batch={batch!}
        netAmount={String(net)}
        onConfirm={async () => {
          await disburseMutation.mutateAsync();
        }}
      />
      <CalculationBreakdownDrawer
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        employeeName={
          employees.find((person) => person.id === selectedItem?.personnel_id)?.full_name ??
          `Personel ${selectedItem?.personnel_id.slice(-6) ?? ""}`
        }
        employeeCode={
          employees.find((person) => person.id === selectedItem?.personnel_id)?.personnel_code ??
          selectedItem?.personnel_id.slice(-8) ??
          ""
        }
        periodMonth={batch!.period_month}
      />
    </div>
  );
}
