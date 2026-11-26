import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, Wallet } from "lucide-react";
import { useState } from "react";

import { ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";
import { employmentLabel, formatDate, personnelTypeLabel } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { getMyProfile } from "./api";
import { MyAttendanceTab } from "./MyAttendanceTab";
import { MyLeaveTab } from "./MyLeaveTab";
import { MyPayslipsTab } from "./MyPayslipsTab";

type Tab = "payslips" | "attendance" | "leave";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "payslips", label: "Slip Gaji", icon: FileText },
  { id: "attendance", label: "Absensi", icon: CalendarDays },
  { id: "leave", label: "Cuti dan Lembur", icon: Wallet },
];

export default function MePage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<Tab>("payslips");
  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
    enabled: hasRole("EMPLOYEE"),
  });

  if (!hasRole("EMPLOYEE")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Ruang Saya hanya tersedia untuk akun karyawan.</p>
        </div>
      </div>
    );
  }

  if (profileQuery.isPending) {
    return <SkeletonTable rows={6} />;
  }
  if (profileQuery.isError) {
    return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;
  }

  const profile = profileQuery.data.data;

  return (
    <div className="stack">
      <PageHeader
        title="Ruang Saya"
        description={`${profile.full_name} · ${profile.personnel_code} · ${profile.branch_name}`}
      />

      <section className="panel">
        <div className="panel__body">
          <div className="summary-list">
            <div>
              <div className="summary-list__label">Tipe personel</div>
              <div className="summary-list__value">
                {personnelTypeLabel(profile.personnel_type)}
              </div>
            </div>
            <div>
              <div className="summary-list__label">Status kepegawaian</div>
              <div className="summary-list__value">
                {employmentLabel(profile.employment_status)}
              </div>
            </div>
            <div>
              <div className="summary-list__label">Status pajak</div>
              <div className="summary-list__value mono">{profile.ptkp_status}</div>
            </div>
            <div>
              <div className="summary-list__label">Bergabung</div>
              <div className="summary-list__value">{formatDate(profile.join_date)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Bagian Ruang Saya">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`me-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`me-panel-${item.id}`}
              className="tabs__item"
              onClick={() => setTab(item.id)}
            >
              <span className="row" style={{ gap: 6 }}>
                <Icon size={14} aria-hidden="true" />
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`me-panel-${tab}`} aria-labelledby={`me-tab-${tab}`}>
        {tab === "payslips" ? <MyPayslipsTab /> : null}
        {tab === "attendance" ? <MyAttendanceTab /> : null}
        {tab === "leave" ? <MyLeaveTab /> : null}
      </div>
    </div>
  );
}
