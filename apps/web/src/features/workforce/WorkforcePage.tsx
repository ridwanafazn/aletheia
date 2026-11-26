import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, ReceiptText, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { LeaveRequest, OvertimeRequest, Reimbursement } from "@aletheia/shared-contracts";

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
  formatDate,
  formatMoney,
  formatNumber,
  initials,
  leaveTypeLabel,
  reimbursementCategoryLabel,
} from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { listAllEmployees } from "../employees/api";
import { hasFeature, useTenantProfile } from "../tenant/api";
import { DecisionDialog } from "./DecisionDialog";
import {
  decideLeave,
  decideOvertime,
  decideReimbursement,
  listWorkforceLeave,
  listWorkforceOvertime,
  listWorkforceReimbursements,
  payReimbursement,
} from "./api";

type Tab = "leave" | "overtime" | "reimbursements";

export default function WorkforcePage() {
  const { hasRole, user } = useAuth();
  const tenantQuery = useTenantProfile();
  const showReimbursements = hasFeature(tenantQuery.data?.data, "REIMBURSEMENT");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("leave");
  const [branchId, setBranchId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [leaveTarget, setLeaveTarget] = useState<LeaveRequest | null>(null);
  const [leaveDecision, setLeaveDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [overtimeTarget, setOvertimeTarget] = useState<OvertimeRequest | null>(null);
  const [overtimeDecision, setOvertimeDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reimbursementTarget, setReimbursementTarget] = useState<Reimbursement | null>(null);
  const [reimbursementDecision, setReimbursementDecision] = useState<"APPROVED" | "REJECTED">(
    "APPROVED",
  );

  const branchesQuery = useQuery({
    queryKey: ["payroll-branches"],
    queryFn: listBranches,
    staleTime: 300_000,
  });
  const branches = branchesQuery.data?.data.items ?? [];

  const employeesQuery = useQuery({
    queryKey: ["workforce-employees"],
    queryFn: () => listAllEmployees(),
    staleTime: 300_000,
  });
  const employees = employeesQuery.data ?? [];

  const leaveQuery = useQuery({
    queryKey: ["workforce-leave", branchId],
    queryFn: () =>
      listWorkforceLeave({
        status: "PENDING",
        ...(branchId.length === 0 ? {} : { branch_id: branchId }),
      }),
  });
  const overtimeQuery = useQuery({
    queryKey: ["workforce-overtime", branchId],
    queryFn: () =>
      listWorkforceOvertime({
        status: "PENDING",
        ...(branchId.length === 0 ? {} : { branch_id: branchId }),
      }),
  });
  const reimbursementQuery = useQuery({
    queryKey: ["workforce-reimbursements", branchId],
    queryFn: () =>
      listWorkforceReimbursements({
        ...(branchId.length === 0 ? {} : { branch_id: branchId }),
      }),
    enabled: showReimbursements,
  });

  const leaveItems = leaveQuery.data?.data.items ?? [];
  const overtimeItems = overtimeQuery.data?.data.items ?? [];
  const reimbursementItems = reimbursementQuery.data?.data.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workforce-leave"] });
    void queryClient.invalidateQueries({ queryKey: ["workforce-overtime"] });
    void queryClient.invalidateQueries({ queryKey: ["workforce-reimbursements"] });
  };

  const leaveMutation = useMutation({
    mutationFn: (input: { id: string; decision: "APPROVED" | "REJECTED"; notes?: string }) =>
      decideLeave(input.id, input.decision, input.notes),
    onSuccess: () => {
      setLeaveTarget(null);
      setNotice("Keputusan cuti tersimpan.");
      setActionError(null);
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const overtimeMutation = useMutation({
    mutationFn: (input: { id: string; decision: "APPROVED" | "REJECTED"; notes?: string }) =>
      decideOvertime(input.id, input.decision, input.notes),
    onSuccess: () => {
      setOvertimeTarget(null);
      setNotice("Keputusan lembur tersimpan.");
      setActionError(null);
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const reimbursementMutation = useMutation({
    mutationFn: (input: { id: string; decision: "APPROVED" | "REJECTED"; notes?: string }) =>
      decideReimbursement(input.id, input.decision, input.notes),
    onSuccess: () => {
      setReimbursementTarget(null);
      setNotice("Keputusan reimburse tersimpan.");
      setActionError(null);
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => payReimbursement(id),
    onSuccess: () => {
      setNotice("Reimburse ditandai dibayar.");
      setActionError(null);
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  if (!hasRole("HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">
            Antrean cuti dan lembur hanya tersedia untuk SDM, Manajer Cabang, dan Manajer Keuangan.
          </p>
        </div>
      </div>
    );
  }

  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.code ?? id.slice(-6);
  const employeeName = (id: string) =>
    employees.find((employee) => employee.id === id)?.full_name ?? `Personel ${id.slice(-6)}`;
  const isSelf = (personnelId: string) =>
    employees.find((employee) => employee.id === personnelId)?.user_id === user?.id;

  return (
    <div className="stack">
      <PageHeader
        title="Cuti dan Lembur"
        description="Antrean pengajuan yang menunggu keputusan. Maker tidak dapat menyetujui pengajuannya sendiri."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            loading={leaveQuery.isFetching || overtimeQuery.isFetching}
            onClick={() => {
              void leaveQuery.refetch();
              void overtimeQuery.refetch();
            }}
          >
            Segarkan
          </Button>
        }
      />

      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {actionError === null ? null : (
        <Banner tone="danger" title="Keputusan gagal">
          {actionError instanceof ApiError
            ? actionError.message
            : "Periksa koneksi lalu coba lagi."}
        </Banner>
      )}

      <div className="filter-bar" aria-label="Filter antrean">
        <div className="field">
          <label className="field__label" htmlFor="workforce-branch">
            Cabang
          </label>
          <select
            id="workforce-branch"
            className="select"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">Semua cabang</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} · {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Antrean cuti dan lembur">
        <button
          type="button"
          role="tab"
          id="workforce-tab-leave"
          aria-selected={tab === "leave"}
          aria-controls="workforce-panel-leave"
          className="tabs__item"
          onClick={() => setTab("leave")}
        >
          <span className="row" style={{ gap: 6 }}>
            <CalendarDays size={14} aria-hidden="true" />
            Cuti ({leaveItems.length})
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="workforce-tab-overtime"
          aria-selected={tab === "overtime"}
          aria-controls="workforce-panel-overtime"
          className="tabs__item"
          onClick={() => setTab("overtime")}
        >
          <span className="row" style={{ gap: 6 }}>
            <Clock3 size={14} aria-hidden="true" />
            Lembur ({overtimeItems.length})
          </span>
        </button>
        {showReimbursements ? (
          <button
            type="button"
            role="tab"
            id="workforce-tab-reimbursements"
            aria-selected={tab === "reimbursements"}
            aria-controls="workforce-panel-reimbursements"
            className="tabs__item"
            onClick={() => setTab("reimbursements")}
          >
            <span className="row" style={{ gap: 6 }}>
              <ReceiptText size={14} aria-hidden="true" />
              Reimburse ({reimbursementItems.length})
            </span>
          </button>
        ) : null}
      </div>

      {tab === "leave" ? (
        <section
          className="panel"
          role="tabpanel"
          id="workforce-panel-leave"
          aria-labelledby="workforce-tab-leave"
        >
          {leaveQuery.isPending ? (
            <SkeletonTable rows={4} />
          ) : leaveQuery.isError ? (
            <ErrorState error={leaveQuery.error} onRetry={() => void leaveQuery.refetch()} />
          ) : leaveItems.length === 0 ? (
            <EmptyState
              title="Tidak ada cuti menunggu"
              body="Pengajuan cuti yang menunggu keputusan akan muncul di sini."
              icon={<CalendarDays size={18} />}
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Antrean persetujuan cuti</caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col">Jenis</th>
                    <th scope="col">Periode</th>
                    <th scope="col" className="numeric col-hide-sm">
                      Hari
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Alasan
                    </th>
                    <th scope="col">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaveItems.map((leave) => (
                    <tr key={leave.id}>
                      <td>
                        <div className="entity-cell">
                          <span className="entity-avatar" aria-hidden="true">
                            {initials(employeeName(leave.personnel_id))}
                          </span>
                          <span className="entity-copy">
                            <span className="entity-name">{employeeName(leave.personnel_id)}</span>
                            <span className="entity-meta mono">
                              {branchName(
                                employees.find((e) => e.id === leave.personnel_id)?.branch_id ?? "",
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>{leaveTypeLabel(leave.leave_type)}</td>
                      <td>
                        {formatDate(leave.start_date)} sampai {formatDate(leave.end_date)}
                      </td>
                      <td className="numeric col-hide-sm">{formatNumber(leave.days)}</td>
                      <td className="col-hide-sm small">{leave.reason}</td>
                      <td>
                        {isSelf(leave.personnel_id) ? (
                          <span className="small muted">Menunggu approver lain</span>
                        ) : (
                          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setLeaveTarget(leave);
                                setLeaveDecision("APPROVED");
                              }}
                            >
                              Setujui
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setLeaveTarget(leave);
                                setLeaveDecision("REJECTED");
                              }}
                            >
                              Tolak
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : tab === "overtime" ? (
        <section
          className="panel"
          role="tabpanel"
          id="workforce-panel-overtime"
          aria-labelledby="workforce-tab-overtime"
        >
          {overtimeQuery.isPending ? (
            <SkeletonTable rows={4} />
          ) : overtimeQuery.isError ? (
            <ErrorState error={overtimeQuery.error} onRetry={() => void overtimeQuery.refetch()} />
          ) : overtimeItems.length === 0 ? (
            <EmptyState
              title="Tidak ada lembur menunggu"
              body="Pengajuan lembur yang menunggu keputusan akan muncul di sini."
              icon={<Clock3 size={18} />}
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Antrean persetujuan lembur</caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col">Tanggal</th>
                    <th scope="col" className="numeric">
                      Jam
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Alasan
                    </th>
                    <th scope="col">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overtimeItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="entity-cell">
                          <span className="entity-avatar" aria-hidden="true">
                            {initials(employeeName(item.personnel_id))}
                          </span>
                          <span className="entity-copy">
                            <span className="entity-name">{employeeName(item.personnel_id)}</span>
                            <span className="entity-meta mono">
                              {branchName(
                                employees.find((e) => e.id === item.personnel_id)?.branch_id ?? "",
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>{formatDate(item.work_date)}</td>
                      <td className="numeric">{formatNumber(item.hours)}</td>
                      <td className="col-hide-sm small">{item.reason}</td>
                      <td>
                        {isSelf(item.personnel_id) ? (
                          <span className="small muted">Menunggu approver lain</span>
                        ) : (
                          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setOvertimeTarget(item);
                                setOvertimeDecision("APPROVED");
                              }}
                            >
                              Setujui
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setOvertimeTarget(item);
                                setOvertimeDecision("REJECTED");
                              }}
                            >
                              Tolak
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : showReimbursements ? (
        <section
          className="panel"
          role="tabpanel"
          id="workforce-panel-reimbursements"
          aria-labelledby="workforce-tab-reimbursements"
        >
          {reimbursementQuery.isPending ? (
            <SkeletonTable rows={4} />
          ) : reimbursementQuery.isError ? (
            <ErrorState
              error={reimbursementQuery.error}
              onRetry={() => void reimbursementQuery.refetch()}
            />
          ) : reimbursementItems.length === 0 ? (
            <EmptyState
              title="Tidak ada reimburse"
              body="Pengajuan reimburse yang menunggu atau sudah disetujui akan muncul di sini."
              icon={<ReceiptText size={18} />}
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Antrean dan riwayat reimburse</caption>
                <thead>
                  <tr>
                    <th scope="col">Personel</th>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Kategori</th>
                    <th scope="col" className="numeric">
                      Nominal
                    </th>
                    <th scope="col" className="col-hide-sm">
                      Deskripsi
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursementItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="entity-cell">
                          <span className="entity-avatar" aria-hidden="true">
                            {initials(employeeName(item.personnel_id))}
                          </span>
                          <span className="entity-copy">
                            <span className="entity-name">{employeeName(item.personnel_id)}</span>
                            <span className="entity-meta mono">
                              {branchName(
                                employees.find((employee) => employee.id === item.personnel_id)
                                  ?.branch_id ?? "",
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>{formatDate(item.expense_date)}</td>
                      <td>{reimbursementCategoryLabel(item.category)}</td>
                      <td className="numeric">{formatMoney(item.amount)}</td>
                      <td className="col-hide-sm small">
                        <div>{item.description}</div>
                        {item.receipt_url === null ? (
                          <div className="muted">Tanpa bukti</div>
                        ) : (
                          <a href={item.receipt_url} target="_blank" rel="noopener noreferrer">
                            Lihat bukti
                          </a>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        {item.status === "PENDING" && !isSelf(item.personnel_id) ? (
                          <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setReimbursementTarget(item);
                                setReimbursementDecision("APPROVED");
                              }}
                            >
                              Setujui
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setReimbursementTarget(item);
                                setReimbursementDecision("REJECTED");
                              }}
                            >
                              Tolak
                            </Button>
                          </div>
                        ) : item.status === "APPROVED" && hasRole("FINANCE_MANAGER") ? (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={payMutation.isPending}
                            onClick={() => payMutation.mutate(item.id)}
                          >
                            Bayar
                          </Button>
                        ) : (
                          <span className="small muted">
                            {item.status === "PENDING" && isSelf(item.personnel_id)
                              ? "Menunggu approver lain"
                              : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <DecisionDialog
        open={leaveTarget !== null}
        onClose={() => setLeaveTarget(null)}
        decision={leaveDecision}
        title={leaveDecision === "APPROVED" ? "Setujui cuti" : "Tolak cuti"}
        description={
          leaveTarget === null
            ? ""
            : `${employeeName(leaveTarget.personnel_id)} · ${leaveTypeLabel(leaveTarget.leave_type)} · ${formatDate(
                leaveTarget.start_date,
              )} sampai ${formatDate(leaveTarget.end_date)}`
        }
        loading={leaveMutation.isPending}
        onConfirm={async (notes) => {
          if (leaveTarget === null) {
            return;
          }
          await leaveMutation.mutateAsync({
            id: leaveTarget.id,
            decision: leaveDecision,
            ...(notes === undefined ? {} : { notes }),
          });
        }}
      />

      <DecisionDialog
        open={overtimeTarget !== null}
        onClose={() => setOvertimeTarget(null)}
        decision={overtimeDecision}
        title={overtimeDecision === "APPROVED" ? "Setujui lembur" : "Tolak lembur"}
        description={
          overtimeTarget === null
            ? ""
            : `${employeeName(overtimeTarget.personnel_id)} · ${formatDate(
                overtimeTarget.work_date,
              )} · ${formatNumber(overtimeTarget.hours)} jam`
        }
        loading={overtimeMutation.isPending}
        onConfirm={async (notes) => {
          if (overtimeTarget === null) {
            return;
          }
          await overtimeMutation.mutateAsync({
            id: overtimeTarget.id,
            decision: overtimeDecision,
            ...(notes === undefined ? {} : { notes }),
          });
        }}
      />

      <DecisionDialog
        open={reimbursementTarget !== null}
        onClose={() => setReimbursementTarget(null)}
        decision={reimbursementDecision}
        title={reimbursementDecision === "APPROVED" ? "Setujui reimburse" : "Tolak reimburse"}
        description={
          reimbursementTarget === null
            ? ""
            : `${employeeName(reimbursementTarget.personnel_id)} · ${reimbursementCategoryLabel(
                reimbursementTarget.category,
              )} · ${formatMoney(reimbursementTarget.amount)}`
        }
        loading={reimbursementMutation.isPending}
        onConfirm={async (notes) => {
          if (reimbursementTarget === null) {
            return;
          }
          await reimbursementMutation.mutateAsync({
            id: reimbursementTarget.id,
            decision: reimbursementDecision,
            ...(notes === undefined ? {} : { notes }),
          });
        }}
      />
    </div>
  );
}
