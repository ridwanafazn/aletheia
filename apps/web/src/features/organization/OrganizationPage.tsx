import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw, Users } from "lucide-react";

import { Button, EmptyState, ErrorState, PageHeader, SkeletonTable, Stat } from "../../shared/ui";
import { employmentLabel, formatNumber, personnelTypeLabel } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { hasFeature, useTenantProfile } from "../tenant/api";
import { getOrganization } from "./api";

export default function OrganizationPage() {
  const { hasRole } = useAuth();
  const tenantQuery = useTenantProfile();
  const query = useQuery({
    queryKey: ["organization"],
    queryFn: getOrganization,
    enabled: hasRole(
      "HR_SPECIALIST",
      "BRANCH_MANAGER",
      "FINANCE_MANAGER",
      "COMPLIANCE_ADMIN",
      "MIS_ANALYST",
    ),
  });

  if (
    !hasRole(
      "HR_SPECIALIST",
      "BRANCH_MANAGER",
      "FINANCE_MANAGER",
      "COMPLIANCE_ADMIN",
      "MIS_ANALYST",
    )
  ) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Akses terbatas</h1>
          <p className="muted">Struktur organisasi hanya tersedia untuk peran operasional.</p>
        </div>
      </div>
    );
  }

  if (tenantQuery.isPending) {
    return <SkeletonTable rows={6} />;
  }

  if (!hasFeature(tenantQuery.data?.data, "ORGANIZATION")) {
    return (
      <div className="panel">
        <div className="panel__body">
          <h1>Fitur belum tersedia</h1>
          <p className="muted">Struktur organisasi tersedia pada paket HRIS+ atau lebih tinggi.</p>
        </div>
      </div>
    );
  }

  if (query.isPending) {
    return <SkeletonTable rows={6} />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const tree = query.data.data;
  const headcount = tree.departments.reduce((total, department) => total + department.headcount, 0);
  const positionCount = tree.departments.reduce(
    (total, department) => total + department.positions.length,
    0,
  );

  return (
    <div className="stack">
      <PageHeader
        title="Struktur Organisasi"
        description="Departemen, posisi, dan personel aktif. Data bersifat read-only pada fase ini."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Segarkan
          </Button>
        }
      />

      <div className="stat-grid">
        <Stat label="Departemen" value={tree.departments.length} meta="Struktur aktif" />
        <Stat label="Posisi terisi" value={positionCount} meta="Lintas departemen" />
        <Stat label="Personel" value={headcount} meta="Aktif dan terhubung" />
        <Stat label="Belum ditempatkan" value={tree.unassigned.length} meta="Perlu penugasan" />
      </div>

      {tree.departments.length === 0 ? (
        <EmptyState
          title="Belum ada departemen"
          body="Departemen dan posisi akan muncul setelah data organisasi diisi."
          icon={<Building2 size={18} />}
        />
      ) : (
        <div className="grid-sidebar">
          {tree.departments.map((department) => (
            <section className="panel" key={department.id}>
              <div className="panel__header">
                <div>
                  <div className="panel__title">{department.name}</div>
                  <div className="panel__description mono">{department.code}</div>
                </div>
                <Users size={16} aria-hidden="true" />
              </div>
              <div className="panel__body">
                <div className="small muted" style={{ marginBottom: 10 }}>
                  {formatNumber(department.headcount)} personel
                </div>
                {department.positions.length === 0 ? (
                  <p className="small muted">Belum ada posisi terisi.</p>
                ) : (
                  <div className="stack stack--sm">
                    {department.positions.map((position) => (
                      <div key={position.id}>
                        <div className="row row--between">
                          <strong>{position.name}</strong>
                          <span className="small muted">
                            {position.job_level} · {position.headcount}
                          </span>
                        </div>
                        <ul className="leave-list">
                          {position.personnel.map((person) => (
                            <li className="leave-item" key={person.personnel_id}>
                              <div>
                                <div className="leave-item__title">{person.full_name}</div>
                                <div className="leave-item__meta">
                                  {person.personnel_code} ·{" "}
                                  {personnelTypeLabel(person.personnel_type)} ·{" "}
                                  {employmentLabel(person.employment_status)}
                                </div>
                              </div>
                              {person.supervisor_id === null ? (
                                <span className="small muted">Top level</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {tree.unassigned.length > 0 ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Belum ditempatkan</div>
              <div className="panel__description">Personel aktif tanpa departemen atau posisi.</div>
            </div>
          </div>
          <div className="panel__body">
            <ul className="leave-list">
              {tree.unassigned.map((person) => (
                <li className="leave-item" key={person.personnel_id}>
                  <div>
                    <div className="leave-item__title">{person.full_name}</div>
                    <div className="leave-item__meta">{person.personnel_code}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
