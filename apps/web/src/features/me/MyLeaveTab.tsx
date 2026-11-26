import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Clock3, FileCheck2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { LeaveType } from "@aletheia/shared-contracts";

import { ApiError } from "../../shared/api/client";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  SkeletonTable,
  Stat,
  StatusBadge,
} from "../../shared/ui";
import { formatDate, formatNumber, leaveTypeLabel } from "../../shared/lib/format";
import {
  createMyLeaveRequest,
  createMyOvertimeRequest,
  listMyLeaveBalances,
  listMyLeaveRequests,
  listMyOvertimeRequests,
} from "./api";

const LEAVE_TYPES: LeaveType[] = ["ANNUAL", "SICK", "MATERNITY", "UNPAID", "OTHER"];

export function MyLeaveTab() {
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const [leaveType, setLeaveType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("1");
  const [leaveReason, setLeaveReason] = useState("");

  const [workDate, setWorkDate] = useState("");
  const [hours, setHours] = useState("2");
  const [overtimeReason, setOvertimeReason] = useState("");

  const balancesQuery = useQuery({
    queryKey: ["my-leave-balances", year],
    queryFn: () => listMyLeaveBalances(year),
  });
  const leaveQuery = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: listMyLeaveRequests,
  });
  const overtimeQuery = useQuery({
    queryKey: ["my-overtime-requests"],
    queryFn: listMyOvertimeRequests,
  });

  const balances = balancesQuery.data?.data.items ?? [];
  const leaves = leaveQuery.data?.data.items ?? [];
  const overtime = overtimeQuery.data?.data.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-leave-balances"] });
    void queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["my-overtime-requests"] });
  };

  const leaveMutation = useMutation({
    mutationFn: () =>
      createMyLeaveRequest({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days: Number(days),
        reason: leaveReason,
      }),
    onSuccess: () => {
      setActionError(null);
      setNotice("Pengajuan cuti tersimpan dan menunggu keputusan.");
      setStartDate("");
      setEndDate("");
      setDays("1");
      setLeaveReason("");
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const overtimeMutation = useMutation({
    mutationFn: () =>
      createMyOvertimeRequest({
        work_date: workDate,
        hours: Number(hours),
        reason: overtimeReason,
      }),
    onSuccess: () => {
      setActionError(null);
      setNotice("Pengajuan lembur tersimpan dan menunggu keputusan.");
      setWorkDate("");
      setHours("2");
      setOvertimeReason("");
      invalidate();
    },
    onError: (error) => {
      setNotice(null);
      setActionError(error);
    },
  });

  const submitLeave = (event: FormEvent) => {
    event.preventDefault();
    leaveMutation.mutate();
  };

  const submitOvertime = (event: FormEvent) => {
    event.preventDefault();
    overtimeMutation.mutate();
  };

  return (
    <div className="stack">
      {notice === null ? null : <Banner tone="success">{notice}</Banner>}
      {actionError === null ? null : (
        <Banner tone="danger" title="Pengajuan gagal">
          {actionError instanceof ApiError ? actionError.message : "Periksa data lalu coba lagi."}
        </Banner>
      )}

      <div className="stat-grid">
        {balances.map((balance) => (
          <Stat
            key={balance.id}
            label={leaveTypeLabel(balance.leave_type)}
            value={`${formatNumber(balance.remaining_days)} hari`}
            meta={`Hak ${formatNumber(balance.entitlement_days)} · terpakai ${formatNumber(
              balance.used_days,
            )} · pending ${formatNumber(balance.pending_days)}`}
          />
        ))}
      </div>

      <div className="grid-sidebar">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Ajukan cuti</div>
              <div className="panel__description">
                Saldo cuti berkurang saat pengajuan disetujui.
              </div>
            </div>
            <CalendarPlus size={16} aria-hidden="true" />
          </div>
          <form className="panel__body stack stack--sm" onSubmit={submitLeave}>
            <div className="field">
              <label className="field__label" htmlFor="my-leave-type">
                Jenis cuti
              </label>
              <select
                id="my-leave-type"
                className="select"
                value={leaveType}
                onChange={(event) => setLeaveType(event.target.value as LeaveType)}
              >
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {leaveTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label className="field__label" htmlFor="my-leave-start">
                  Mulai
                </label>
                <input
                  id="my-leave-start"
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="field__label" htmlFor="my-leave-end">
                  Selesai
                </label>
                <input
                  id="my-leave-end"
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="my-leave-days">
                Jumlah hari
              </label>
              <input
                id="my-leave-days"
                className="input"
                type="number"
                min={0.5}
                step={0.5}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="my-leave-reason">
                Alasan
              </label>
              <textarea
                id="my-leave-reason"
                className="input"
                rows={3}
                value={leaveReason}
                onChange={(event) => setLeaveReason(event.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={leaveMutation.isPending}
              disabled={
                startDate.length === 0 || endDate.length === 0 || leaveReason.trim().length < 3
              }
            >
              Kirim pengajuan cuti
            </Button>
          </form>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Ajukan lembur</div>
              <div className="panel__description">
                Lembur yang disetujui masuk ke ringkasan absensi bulanan.
              </div>
            </div>
            <Clock3 size={16} aria-hidden="true" />
          </div>
          <form className="panel__body stack stack--sm" onSubmit={submitOvertime}>
            <div className="field">
              <label className="field__label" htmlFor="my-overtime-date">
                Tanggal kerja
              </label>
              <input
                id="my-overtime-date"
                className="input"
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="my-overtime-hours">
                Jam lembur
              </label>
              <input
                id="my-overtime-hours"
                className="input"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="my-overtime-reason">
                Alasan
              </label>
              <textarea
                id="my-overtime-reason"
                className="input"
                rows={3}
                value={overtimeReason}
                onChange={(event) => setOvertimeReason(event.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={overtimeMutation.isPending}
              disabled={workDate.length === 0 || overtimeReason.trim().length < 3}
            >
              Kirim pengajuan lembur
            </Button>
          </form>
        </section>
      </div>

      <div className="grid-sidebar">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Riwayat cuti</div>
              <div className="panel__description">{leaves.length} pengajuan</div>
            </div>
          </div>
          {leaveQuery.isPending ? (
            <SkeletonTable rows={3} />
          ) : leaveQuery.isError ? (
            <ErrorState error={leaveQuery.error} onRetry={() => void leaveQuery.refetch()} />
          ) : leaves.length === 0 ? (
            <EmptyState
              title="Belum ada pengajuan cuti"
              body="Pengajuan cuti yang tersimpan akan muncul di sini."
              icon={<FileCheck2 size={18} />}
            />
          ) : (
            <ul className="leave-list">
              {leaves.map((leave) => (
                <li className="leave-item" key={leave.id}>
                  <div>
                    <div className="leave-item__title">{leaveTypeLabel(leave.leave_type)}</div>
                    <div className="leave-item__meta">
                      {formatDate(leave.start_date)} sampai {formatDate(leave.end_date)} ·{" "}
                      {formatNumber(leave.days)} hari
                    </div>
                    {leave.reason.length === 0 ? null : (
                      <div className="leave-item__meta">{leave.reason}</div>
                    )}
                  </div>
                  <StatusBadge status={leave.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Riwayat lembur</div>
              <div className="panel__description">{overtime.length} pengajuan</div>
            </div>
          </div>
          {overtimeQuery.isPending ? (
            <SkeletonTable rows={3} />
          ) : overtimeQuery.isError ? (
            <ErrorState error={overtimeQuery.error} onRetry={() => void overtimeQuery.refetch()} />
          ) : overtime.length === 0 ? (
            <EmptyState
              title="Belum ada pengajuan lembur"
              body="Pengajuan lembur yang tersimpan akan muncul di sini."
              icon={<Clock3 size={18} />}
            />
          ) : (
            <ul className="leave-list">
              {overtime.map((item) => (
                <li className="leave-item" key={item.id}>
                  <div>
                    <div className="leave-item__title">
                      {formatDate(item.work_date)} · {formatNumber(item.hours)} jam
                    </div>
                    <div className="leave-item__meta">{item.reason}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
