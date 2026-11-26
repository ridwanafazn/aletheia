import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, ReceiptText, Wallet } from "lucide-react";
import { useState } from "react";

import { ErrorState, PageHeader, SkeletonTable } from "../../shared/ui";
import { employmentLabel, formatDate, initials, personnelTypeLabel } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { hasFeature, useTenantProfile } from "../tenant/api";
import { getMyProfile } from "./api";
import { MyAttendanceTab } from "./MyAttendanceTab";
import { MyLeaveTab } from "./MyLeaveTab";
import { MyPayslipsTab } from "./MyPayslipsTab";
import { MyReimbursementsTab } from "./MyReimbursementsTab";

type Tab = "payslips" | "attendance" | "leave" | "reimbursements";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "payslips", label: "Slip Gaji", icon: FileText },
  { id: "attendance", label: "Absensi", icon: CalendarDays },
  { id: "leave", label: "Cuti dan Lembur", icon: Wallet },
  { id: "reimbursements", label: "Reimburse", icon: ReceiptText },
];

export default function MePage() {
  const { hasRole } = useAuth();
  const tenantQuery = useTenantProfile();
  const tenant = tenantQuery.data?.data;
  const [tab, setTab] = useState<Tab>("payslips");
  const visibleTabs = TABS.filter(
    (item) => item.id !== "reimbursements" || hasFeature(tenant, "REIMBURSEMENT"),
  );
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

      <section className="panel profile-card">
        <div className="profile-card__identity">
          <span className="profile-avatar" aria-hidden="true">
            {initials(profile.full_name)}
          </span>
          <div>
            <div className="profile-card__name">{profile.full_name}</div>
            <div className="profile-card__meta">
              {profile.personnel_code} · {profile.branch_name}
            </div>
          </div>
        </div>
        <div className="profile-facts">
          <div>
            <div className="profile-fact__label">Tipe personel</div>
            <div className="profile-fact__value">{personnelTypeLabel(profile.personnel_type)}</div>
          </div>
          <div>
            <div className="profile-fact__label">Status kepegawaian</div>
            <div className="profile-fact__value">{employmentLabel(profile.employment_status)}</div>
          </div>
          <div>
            <div className="profile-fact__label">Status pajak</div>
            <div className="profile-fact__value mono">{profile.ptkp_status}</div>
          </div>
          <div>
            <div className="profile-fact__label">Bergabung</div>
            <div className="profile-fact__value">{formatDate(profile.join_date)}</div>
          </div>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Bagian Ruang Saya">
        {visibleTabs.map((item) => {
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
        {tab === "reimbursements" ? <MyReimbursementsTab /> : null}
      </div>
    </div>
  );
}
