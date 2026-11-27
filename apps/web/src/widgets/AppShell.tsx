import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "../features/auth/AuthProvider";
import { hasFeature, useTenantProfile } from "../features/tenant/api";
import { roleLabel, initials } from "../shared/lib/format";
import { Button } from "../shared/ui";

interface NavItem {
  to:
    | "/overview"
    | "/claims"
    | "/approvals"
    | "/payroll"
    | "/employees"
    | "/payslips"
    | "/reports"
    | "/workforce"
    | "/organization"
    | "/me"
    | "/mis"
    | "/mis/what-if"
    | "/audit";
  label: string;
  icon: typeof LayoutList;
  roles: string[];
  feature?: "ORGANIZATION";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Ringkasan",
    items: [
      {
        to: "/overview",
        label: "Ikhtisar",
        icon: LayoutDashboard,
        roles: [
          "HR_SPECIALIST",
          "CLAIMS_OFFICER",
          "BRANCH_MANAGER",
          "FINANCE_MANAGER",
          "COMPLIANCE_ADMIN",
          "MIS_ANALYST",
        ],
      },
    ],
  },
  {
    label: "Saya",
    items: [
      {
        to: "/me",
        label: "Ruang Saya",
        icon: UserRound,
        roles: ["EMPLOYEE"],
      },
    ],
  },
  {
    label: "Operasional",
    items: [
      {
        to: "/claims",
        label: "Ruang Klaim",
        icon: LayoutList,
        roles: [
          "CLAIMS_OFFICER",
          "BRANCH_MANAGER",
          "FINANCE_MANAGER",
          "COMPLIANCE_ADMIN",
          "MIS_ANALYST",
        ],
      },
      {
        to: "/approvals",
        label: "Antrean Persetujuan",
        icon: Inbox,
        roles: ["BRANCH_MANAGER", "FINANCE_MANAGER"],
      },
    ],
  },
  {
    label: "Payroll",
    items: [
      {
        to: "/payroll",
        label: "Konsol Payroll",
        icon: Wallet,
        roles: ["HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"],
      },
      {
        to: "/employees",
        label: "Karyawan dan Agen",
        icon: Users,
        roles: ["HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN", "MIS_ANALYST"],
      },
      {
        to: "/payslips",
        label: "Slip Gaji",
        icon: FileText,
        roles: ["HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"],
      },
      {
        to: "/reports",
        label: "Laporan dan Ekspor",
        icon: FileSpreadsheet,
        roles: ["HR_SPECIALIST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"],
      },
      {
        to: "/workforce",
        label: "Cuti dan Lembur",
        icon: CalendarDays,
        roles: ["HR_SPECIALIST", "BRANCH_MANAGER", "FINANCE_MANAGER"],
      },
      {
        to: "/organization",
        label: "Struktur Organisasi",
        icon: Building2,
        roles: [
          "HR_SPECIALIST",
          "BRANCH_MANAGER",
          "FINANCE_MANAGER",
          "COMPLIANCE_ADMIN",
          "MIS_ANALYST",
        ],
        feature: "ORGANIZATION",
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        to: "/mis",
        label: "MIS Intelligence",
        icon: BarChart3,
        roles: ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"],
      },
      {
        to: "/mis/what-if",
        label: "What-If Sandbox",
        icon: FlaskConical,
        roles: ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"],
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        to: "/audit",
        label: "Jejak Audit",
        icon: ShieldCheck,
        roles: ["COMPLIANCE_ADMIN", "FINANCE_MANAGER"],
      },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/overview": "Ikhtisar",
  "/claims": "Ruang Klaim",
  "/claims/new": "Klaim Baru",
  "/approvals": "Antrean Persetujuan",
  "/payroll": "Konsol Payroll",
  "/employees": "Karyawan dan Agen",
  "/payslips": "Slip Gaji",
  "/reports": "Laporan dan Ekspor",
  "/workforce": "Cuti dan Lembur",
  "/organization": "Struktur Organisasi",
  "/me": "Ruang Saya",
  "/profile": "Profil",
  "/mis": "MIS Intelligence",
  "/mis/what-if": "What-If Sandbox",
  "/audit": "Jejak Audit",
};

function sectionFor(pathname: string): string {
  if (pathname.startsWith("/overview")) {
    return "Ringkasan";
  }
  if (pathname.startsWith("/me")) {
    return "Saya";
  }
  if (pathname.startsWith("/profile")) {
    return "Akun";
  }
  if (
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/payslips") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/workforce") ||
    pathname.startsWith("/organization")
  ) {
    return "Payroll";
  }
  if (pathname.startsWith("/mis")) {
    return "Intelligence";
  }
  if (pathname.startsWith("/audit")) {
    return "Governance";
  }
  return "Operasional";
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/claims") {
    return pathname === "/claims" || pathname.startsWith("/claims/");
  }
  if (item.to === "/payroll") {
    return pathname === "/payroll" || pathname.startsWith("/payroll/");
  }
  if (item.to === "/mis") {
    return pathname === "/mis" || pathname === "/mis/what-if";
  }
  return pathname === item.to;
}

function titleFor(pathname: string): string {
  if (pathname.startsWith("/claims/") && pathname !== "/claims/new") {
    return "Detail Klaim";
  }
  if (pathname.startsWith("/payroll/")) {
    return "Detail Batch Payroll";
  }
  if (pathname === "/mis/what-if") {
    return "What-If Sandbox";
  }
  return PAGE_TITLES[pathname] ?? "Aletheia";
}

export function AppShell() {
  const { status, user, logout, hasRole } = useAuth();
  const tenantQuery = useTenantProfile(status === "authenticated");
  const tenant = tenantQuery.data?.data;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("aletheia.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("aletheia.sidebar", sidebarCollapsed ? "collapsed" : "expanded");
    } catch {
      // Storage can be unavailable in private or embedded browsing contexts.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "collapsed" || detail === "expanded") {
        setSidebarCollapsed(detail === "collapsed");
      }
    };
    window.addEventListener("aletheia:sidebar", handler);
    return () => window.removeEventListener("aletheia:sidebar", handler);
  }, []);

  if (status === "loading") {
    return (
      <div className="content" role="status" aria-label="Memuat sesi">
        <div className="skeleton skeleton--text" style={{ width: 180, marginBottom: 16 }} />
        <div className="skeleton skeleton--row" style={{ height: 320 }} />
      </div>
    );
  }

  if (status === "anonymous" || user === null) {
    return <Navigate to="/login" replace />;
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.roles.includes(user.role) &&
        (item.feature === undefined || hasFeature(tenant, item.feature)),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>

      <aside
        className={`sidebar${sidebarOpen ? " sidebar--open" : ""}${
          sidebarCollapsed ? " sidebar--collapsed" : ""
        }`}
        aria-label="Navigasi utama"
      >
        <div className="brand">
          <img src="/brand/aletheia-mark.svg" alt="" className="brand__mark" />
          <div>
            <span className="brand__name">Aletheia</span>
            <span className="brand__sub">People operations</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mobile-only"
            aria-label="Tutup navigasi"
            onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: "auto", color: "var(--ink-500)" }}
          >
            <X size={16} />
          </Button>
        </div>

        {tenant === undefined ? null : (
          <button
            type="button"
            className="workspace-switcher"
            onClick={() => {
              setSidebarOpen(false);
              void navigate({ to: "/profile" });
            }}
            aria-label="Buka profil dan konteks tenant"
          >
            <span className="workspace-switcher__icon" aria-hidden="true">
              <Building2 size={16} />
            </span>
            <span className="workspace-switcher__copy">
              <strong>{tenant.name}</strong>
              <small>{tenant.code} · Ruang kerja</small>
            </span>
          </button>
        )}

        <nav className="nav">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="nav__label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.to}
                    className="nav__item"
                    href={item.to}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-current={isActive(item, pathname) ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setSidebarOpen(false);
                      void navigate({ to: item.to });
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="nav__item-label">{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button
            type="button"
            className="user-block user-block--button"
            onClick={() => {
              setSidebarOpen(false);
              void navigate({ to: "/profile" });
            }}
            aria-label="Buka profil dari navigasi"
          >
            <span className="user-block__avatar" aria-hidden="true">
              {initials(user.full_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="user-block__name truncate">{user.full_name}</div>
              <div className="user-block__role truncate">{roleLabel(user.role)}</div>
            </div>
          </button>
          <button
            type="button"
            className="nav__item nav__item--logout"
            onClick={() => {
              void logout().then(() => navigate({ to: "/login" }));
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="nav__item-label">Keluar</span>
          </button>
          <div className="sidebar__demo" style={{ padding: "12px 10px 0", lineHeight: "16px" }}>
            Lingkungan demo. Data sintetis.
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Button
            variant="ghost"
            size="sm"
            className="sidebar-toggle"
            aria-label="Buka navigasi"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="sidebar-collapse"
            aria-label={sidebarCollapsed ? "Buka sidebar" : "Tutup sidebar"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
          <div className="topbar__crumb">
            <ClipboardList size={14} aria-hidden="true" />
            <span>{sectionFor(pathname)}</span>
            <span aria-hidden="true">/</span>
            <span className="topbar__title">{titleFor(pathname)}</span>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__action">
            {hasRole("COMPLIANCE_ADMIN") ? (
              <span className="chip chip--compliance">
                <ShieldCheck size={12} aria-hidden="true" />
                Kepatuhan aktif
              </span>
            ) : null}
            <span className="chip">{roleLabel(user.role)}</span>
            <button
              type="button"
              className="topbar__avatar"
              title={`${user.full_name} · ${roleLabel(user.role)}`}
              aria-label="Buka halaman profil"
              onClick={() => void navigate({ to: "/profile" })}
            >
              {initials(user.full_name)}
            </button>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          <div className="route-enter" key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
