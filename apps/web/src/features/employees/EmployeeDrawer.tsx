import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, FileCheck2 } from "lucide-react";

import type { Employee } from "@aletheia/shared-contracts";

import { Drawer, EmptyState, ErrorState, Money, SkeletonTable, StatusBadge } from "../../shared/ui";
import {
  currentPeriod,
  employmentLabel,
  formatDate,
  formatMoney,
  formatNumber,
  formatPeriod,
  leaveTypeLabel,
  personnelTypeLabel,
} from "../../shared/lib/format";
import { listAttendance, listLeaveRequests } from "./api";

export function EmployeeDrawer({
  open,
  onClose,
  employee,
  branchName,
}: {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
  branchName: string;
}) {
  const [period, setPeriod] = useState(currentPeriod());

  useEffect(() => {
    if (!open) {
      return;
    }
    setPeriod(currentPeriod());
  }, [open, employee?.id]);

  const attendanceQuery = useQuery({
    queryKey: ["employee-attendance", employee?.id, period],
    queryFn: () => listAttendance({ personnelId: employee!.id, period }),
    enabled: open && employee !== null && /^\d{4}-\d{2}$/.test(period),
  });

  const leaveQuery = useQuery({
    queryKey: ["employee-leave-requests", employee?.id],
    queryFn: () => listLeaveRequests({ personnelId: employee!.id }),
    enabled: open && employee !== null,
  });

  if (employee === null) {
    return null;
  }

  const attendance = attendanceQuery.data?.data.items[0];
  const leaves = leaveQuery.data?.data.items ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={employee.full_name}
      description={`${employee.personnel_code} · ${personnelTypeLabel(employee.personnel_type)} · ${branchName}`}
    >
      <div className="stack">
        <div className="employee-hero">
          <div>
            <div className="micro">Kompensasi tetap</div>
            <div className="amount-large">
              {formatMoney(String(Number(employee.base_salary) + Number(employee.fixed_allowance)))}
            </div>
            <div className="small muted">
              Gaji pokok {formatMoney(employee.base_salary)} dan tunjangan tetap{" "}
              {formatMoney(employee.fixed_allowance)}
            </div>
          </div>
          <StatusBadge status={employee.employment_status} />
        </div>

        <div className="summary-list">
          <div>
            <div className="summary-list__label">Cabang</div>
            <div className="summary-list__value">{branchName}</div>
          </div>
          <div>
            <div className="summary-list__label">Status pajak</div>
            <div className="summary-list__value mono">{employee.ptkp_status}</div>
          </div>
          <div>
            <div className="summary-list__label">Kelas risiko JKK</div>
            <div className="summary-list__value mono">{employee.risk_class}</div>
          </div>
          <div>
            <div className="summary-list__label">Rekening masked</div>
            <div className="summary-list__value mono">
              {employee.bank_code} · {employee.bank_account_masked}
            </div>
          </div>
          <div>
            <div className="summary-list__label">NIK masked</div>
            <div className="summary-list__value mono">{employee.nik_masked}</div>
          </div>
          <div>
            <div className="summary-list__label">Bergabung</div>
            <div className="summary-list__value">{formatDate(employee.join_date)}</div>
          </div>
          <div>
            <div className="summary-list__label">Berakhir</div>
            <div className="summary-list__value">
              {employee.termination_date === null
                ? "Belum ada"
                : formatDate(employee.termination_date)}
            </div>
          </div>
          <div>
            <div className="summary-list__label">Status</div>
            <div className="summary-list__value">{employmentLabel(employee.employment_status)}</div>
          </div>
        </div>

        <section>
          <div className="section-heading">
            <h3>Ringkasan absensi</h3>
            <div className="field" style={{ minWidth: 160 }}>
              <label className="sr-only" htmlFor="attendance-period">
                Periode
              </label>
              <input
                id="attendance-period"
                className="input"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              />
            </div>
          </div>

          {attendanceQuery.isPending ? (
            <SkeletonTable rows={2} />
          ) : attendanceQuery.isError ? (
            <ErrorState
              error={attendanceQuery.error}
              onRetry={() => void attendanceQuery.refetch()}
            />
          ) : attendance === undefined ? (
            <EmptyState
              title="Absensi belum dicatat"
              body={`Tidak ada ringkasan absensi untuk ${formatPeriod(`${period}-01`)}.`}
              icon={<CalendarDays size={18} />}
            />
          ) : (
            <>
              <dl className="attendance-grid">
                <div>
                  <dt>Hari kerja</dt>
                  <dd>{attendance.working_days}</dd>
                </div>
                <div>
                  <dt>Hadir</dt>
                  <dd>{attendance.present_days}</dd>
                </div>
                <div>
                  <dt>Cuti dibayar</dt>
                  <dd>{attendance.paid_leave_days}</dd>
                </div>
                <div>
                  <dt>Cuti tidak dibayar</dt>
                  <dd>{attendance.unpaid_leave_days}</dd>
                </div>
                <div>
                  <dt>Absen</dt>
                  <dd>{attendance.absent_days}</dd>
                </div>
                <div>
                  <dt>Lembur</dt>
                  <dd>{formatNumber(attendance.overtime_hours)} jam</dd>
                </div>
              </dl>
              <div className="row small muted" style={{ marginTop: 8 }}>
                <Clock3 size={13} aria-hidden="true" />
                Sumber {attendance.source === "IMPORT" ? "impor" : attendance.source.toLowerCase()}
                {attendance.approved_at === null
                  ? ""
                  : ` · disetujui ${formatDate(attendance.approved_at)}`}
              </div>
            </>
          )}
        </section>

        <section>
          <div className="section-heading">
            <h3>Riwayat cuti</h3>
            <span className="small muted">{leaves.length} pengajuan</span>
          </div>
          {leaveQuery.isPending ? (
            <SkeletonTable rows={2} />
          ) : leaveQuery.isError ? (
            <ErrorState error={leaveQuery.error} onRetry={() => void leaveQuery.refetch()} />
          ) : leaves.length === 0 ? (
            <EmptyState
              title="Belum ada pengajuan cuti"
              body="Pengajuan cuti yang tercatat akan muncul di sini beserta keputusannya."
              icon={<FileCheck2 size={18} />}
            />
          ) : (
            <ul className="leave-list">
              {leaves.slice(0, 6).map((leave) => (
                <li className="leave-item" key={leave.id}>
                  <div>
                    <div className="leave-item__title">{leaveTypeLabel(leave.leave_type)}</div>
                    <div className="leave-item__meta">
                      {formatDate(leave.start_date)} sampai {formatDate(leave.end_date)} ·{" "}
                      {formatNumber(leave.days)} hari
                    </div>
                  </div>
                  <StatusBadge status={leave.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Kompensasi</h3>
          <dl className="ledger">
            <div className="ledger__row">
              <dt>Gaji pokok</dt>
              <dd>
                <Money value={employee.base_salary} />
              </dd>
            </div>
            <div className="ledger__row">
              <dt>Tunjangan tetap</dt>
              <dd>
                <Money value={employee.fixed_allowance} />
              </dd>
            </div>
            <div className="ledger__row ledger__row--total">
              <dt>Total tetap</dt>
              <dd>
                {formatMoney(
                  String(Number(employee.base_salary) + Number(employee.fixed_allowance)),
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
