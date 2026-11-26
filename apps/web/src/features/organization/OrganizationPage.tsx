import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, EmptyState, ErrorState, PageHeader, SkeletonTable, Stat } from "../../shared/ui";
import {
  employmentLabel,
  formatNumber,
  initials,
  personnelTypeLabel,
} from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { hasFeature, useTenantProfile } from "../tenant/api";
import { getOrganization } from "./api";

export default function OrganizationPage() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState("");
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

  const tree = query.data?.data;
  const personNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const department of tree?.departments ?? []) {
      for (const position of department.positions) {
        for (const person of position.personnel) {
          map.set(person.personnel_id, person.full_name);
        }
      }
    }
    for (const person of tree?.unassigned ?? []) {
      map.set(person.personnel_id, person.full_name);
    }
    return map;
  }, [tree]);

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

  if (tenantQuery.isPending || query.isPending) {
    return <SkeletonTable rows={6} />;
  }
  if (tenantQuery.isError) {
    return <ErrorState error={tenantQuery.error} onRetry={() => void tenantQuery.refetch()} />;
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
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const organization = query.data.data;
  const headcount = organization.departments.reduce(
    (total, department) => total + department.headcount,
    0,
  );
  const positionCount = organization.departments.reduce(
    (total, department) => total + department.positions.length,
    0,
  );
  const needle = search.trim().toLowerCase();
  const matches = (values: string[]) =>
    needle.length === 0 || values.some((value) => value.toLowerCase().includes(needle));

  const filledDepartments = organization.departments.filter((department) => {
    if (department.headcount === 0) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    return (
      matches([department.name, department.code]) ||
      department.positions.some(
        (position) =>
          matches([position.name]) ||
          position.personnel.some((person) => matches([person.full_name, person.personnel_code])),
      )
    );
  });
  const emptyDepartments = organization.departments.filter(
    (department) => department.headcount === 0,
  );
  const filteredUnassigned = organization.unassigned.filter((person) =>
    matches([person.full_name, person.personnel_code]),
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
        <Stat label="Departemen" value={organization.departments.length} meta="Struktur aktif" />
        <Stat label="Posisi terisi" value={positionCount} meta="Lintas departemen" />
        <Stat label="Personel" value={headcount} meta="Aktif dan terhubung" />
        <Stat
          label="Belum ditempatkan"
          value={organization.unassigned.length}
          meta="Perlu penugasan"
        />
      </div>

      <div className="organization-toolbar panel">
        <label className="organization-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Cari personel atau departemen</span>
          <input
            className="input"
            type="search"
            placeholder="Cari nama, kode, atau departemen"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="organization-toolbar__count">
          {formatNumber(
            filledDepartments.reduce((total, department) => total + department.headcount, 0),
          )}{" "}
          personel terlihat
        </span>
      </div>

      {filledDepartments.length === 0 ? (
        <EmptyState
          title={needle.length === 0 ? "Belum ada departemen terisi" : "Tidak ada hasil"}
          body={
            needle.length === 0
              ? "Departemen dan posisi akan muncul setelah data organisasi diisi."
              : "Coba kata kunci lain atau kosongkan pencarian."
          }
          icon={<Building2 size={18} />}
        />
      ) : (
        <div className="org-grid">
          {filledDepartments.map((department) => (
            <section className="panel org-card" key={department.id}>
              <div className="panel__header">
                <div>
                  <div className="panel__title">{department.name}</div>
                  <div className="panel__description mono">{department.code}</div>
                </div>
                <span className="org-headcount">
                  <Users size={14} aria-hidden="true" />
                  {formatNumber(department.headcount)}
                </span>
              </div>
              <div className="panel__body org-card__body">
                {department.positions.map((position) => (
                  <div className="org-position" key={position.id}>
                    <div className="org-position__header">
                      <strong>{position.name}</strong>
                      <span>
                        {position.job_level} · {position.headcount}
                      </span>
                    </div>
                    <ul className="org-people">
                      {position.personnel.map((person) => {
                        const supervisor =
                          person.supervisor_id === null
                            ? null
                            : personNames.get(person.supervisor_id);
                        return (
                          <li className="org-person" key={person.personnel_id}>
                            <span className="org-person__avatar" aria-hidden="true">
                              {initials(person.full_name)}
                            </span>
                            <div className="org-person__copy">
                              <div className="org-person__name">{person.full_name}</div>
                              <div className="org-person__meta">
                                {person.personnel_code} ·{" "}
                                {personnelTypeLabel(person.personnel_type)} ·{" "}
                                {employmentLabel(person.employment_status)}
                              </div>
                              {supervisor === null ? null : (
                                <div className="org-person__supervisor">
                                  Supervisor: {supervisor}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {emptyDepartments.length > 0 ? (
        <section className="panel org-empty">
          <div className="panel__header">
            <div>
              <div className="panel__title">Departemen tanpa personel</div>
              <div className="panel__description">
                Struktur sudah ada, tetapi belum ada penugasan aktif.
              </div>
            </div>
          </div>
          <div className="panel__body">
            <div className="org-empty__chips">
              {emptyDepartments.map((department) => (
                <span className="org-empty__chip" key={department.id}>
                  <strong>{department.name}</strong>
                  <span>{department.code}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {filteredUnassigned.length > 0 ? (
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Belum ditempatkan</div>
              <div className="panel__description">Personel aktif tanpa departemen atau posisi.</div>
            </div>
          </div>
          <div className="panel__body">
            <ul className="org-people org-people--unassigned">
              {filteredUnassigned.map((person) => (
                <li className="org-person" key={person.personnel_id}>
                  <span className="org-person__avatar" aria-hidden="true">
                    {initials(person.full_name)}
                  </span>
                  <div className="org-person__copy">
                    <div className="org-person__name">{person.full_name}</div>
                    <div className="org-person__meta">{person.personnel_code}</div>
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
