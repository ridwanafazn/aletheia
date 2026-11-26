import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3 } from "lucide-react";
import { useState } from "react";

import { EmptyState, ErrorState, SkeletonTable } from "../../shared/ui";
import { currentPeriod, formatDate, formatNumber, formatPeriod } from "../../shared/lib/format";
import { listMyAttendance } from "./api";

export function MyAttendanceTab() {
  const [period, setPeriod] = useState(currentPeriod());
  const query = useQuery({
    queryKey: ["my-attendance", period],
    queryFn: () => listMyAttendance({ period }),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });

  const attendance = query.data?.data.items[0];

  return (
    <div className="stack">
      <div className="filter-bar" aria-label="Filter absensi saya">
        <div className="field">
          <label className="field__label" htmlFor="my-attendance-period">
            Periode
          </label>
          <input
            id="my-attendance-period"
            className="input"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </div>
      </div>

      {query.isPending ? (
        <SkeletonTable rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
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
          <div className="row small muted">
            <Clock3 size={13} aria-hidden="true" />
            Sumber {attendance.source === "IMPORT" ? "impor" : attendance.source.toLowerCase()}
            {attendance.approved_at === null
              ? ""
              : ` · disetujui ${formatDate(attendance.approved_at)}`}
          </div>
        </>
      )}
    </div>
  );
}
