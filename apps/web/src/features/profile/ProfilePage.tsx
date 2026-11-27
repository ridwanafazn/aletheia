import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

import { initials, roleLabel } from "../../shared/lib/format";
import { Button, PageHeader } from "../../shared/ui";
import { useAuth } from "../auth/AuthProvider";
import { useTenantProfile } from "../tenant/api";

type SidebarPreference = "expanded" | "collapsed";

function readSidebarPreference(): SidebarPreference {
  try {
    return localStorage.getItem("aletheia.sidebar") === "collapsed" ? "collapsed" : "expanded";
  } catch {
    return "expanded";
  }
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const tenantQuery = useTenantProfile();
  const tenant = tenantQuery.data?.data;
  const navigate = useNavigate();
  const [sidebarPreference, setSidebarPreference] =
    useState<SidebarPreference>(readSidebarPreference);

  if (user === null) {
    return null;
  }

  const chooseSidebar = (value: SidebarPreference) => {
    setSidebarPreference(value);
    try {
      localStorage.setItem("aletheia.sidebar", value);
    } catch {
      // Storage can be unavailable in private or embedded browsing contexts.
    }
    window.dispatchEvent(new CustomEvent("aletheia:sidebar", { detail: value }));
  };

  return (
    <div className="stack profile-page">
      <PageHeader
        title="Profil"
        description="Identitas akun, peran, dan konteks tenant yang sedang aktif."
      />

      <section className="panel profile-hero">
        <div className="profile-hero__identity">
          <span className="profile-hero__avatar" aria-hidden="true">
            {initials(user.full_name)}
          </span>
          <div>
            <div className="profile-hero__name">{user.full_name}</div>
            <div className="profile-hero__meta">
              {roleLabel(user.role)} · {user.email}
            </div>
          </div>
        </div>
        <div className="profile-hero__badges">
          <span className="chip">
            <ShieldCheck size={13} aria-hidden="true" />
            {roleLabel(user.role)}
          </span>
          {tenant === undefined ? null : (
            <span className="chip">
              <Building2 size={13} aria-hidden="true" />
              {tenant.name}
            </span>
          )}
        </div>
      </section>

      <div className="grid-2 profile-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Identitas</div>
              <div className="panel__description">Data akun yang dipakai untuk masuk.</div>
            </div>
            <UserRound size={16} aria-hidden="true" />
          </div>
          <div className="panel__body">
            <dl className="profile-list">
              <div>
                <dt>Nama</dt>
                <dd>{user.full_name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Peran</dt>
                <dd>{roleLabel(user.role)}</dd>
              </div>
              <div>
                <dt>ID cabang</dt>
                <dd className="mono">{user.branch_id}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <div className="panel__title">Akses dan tenant</div>
              <div className="panel__description">Konteks yang membatasi fitur dan data.</div>
            </div>
            <Building2 size={16} aria-hidden="true" />
          </div>
          <div className="panel__body">
            <dl className="profile-list">
              <div>
                <dt>Tenant</dt>
                <dd>{tenant === undefined ? "Memuat..." : `${tenant.name} (${tenant.code})`}</dd>
              </div>
              <div>
                <dt>Fitur aktif</dt>
                <dd>{tenant === undefined ? "Memuat..." : `${tenant.features.length} fitur`}</dd>
              </div>
              <div>
                <dt>Status sesi</dt>
                <dd>
                  <span className="badge badge--approved">
                    <span className="badge__dot" aria-hidden="true" />
                    Aktif
                  </span>
                </dd>
              </div>
            </dl>
            <div className="profile-actions">
              <Button
                variant="secondary"
                icon={<LogOut size={15} />}
                onClick={() => {
                  void logout().then(() => navigate({ to: "/login" }));
                }}
              >
                Keluar dari sesi
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <div className="panel__title">Preferensi tampilan</div>
            <div className="panel__description">
              Pengaturan ringan yang tersimpan di perangkat ini.
            </div>
          </div>
        </div>
        <div className="panel__body">
          <div className="profile-preference">
            <Button
              variant="secondary"
              aria-pressed={sidebarPreference === "expanded"}
              onClick={() => chooseSidebar("expanded")}
            >
              Sidebar lengkap
            </Button>
            <Button
              variant="secondary"
              aria-pressed={sidebarPreference === "collapsed"}
              onClick={() => chooseSidebar("collapsed")}
            >
              Sidebar ringkas
            </Button>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Sidebar juga dapat diubah dari tombol di topbar. Preferensi tidak memengaruhi data
            payroll atau hak akses.
          </p>
          <div className="profile-note">
            <Mail size={15} aria-hidden="true" />
            <span>
              Akun demo memakai data sintetis. Tidak ada uang nyata atau data pribadi nyata di
              lingkungan ini.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
