import { useState } from "react";
import { Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  FileText,
  FlaskConical,
  Inbox,
  LayoutList,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "../features/auth/AuthProvider";
import { roleLabel, initials } from "../shared/lib/format";
import { Button } from "../shared/ui";

interface NavItem {
  to:
    | "/claims"
    | "/approvals"
    | "/payroll"
    | "/employees"
    | "/payslips"
    | "/mis"
    | "/mis/what-if"
    | "/audit";
  label: string;
  icon: typeof LayoutList;
  roles: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
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
  "/claims": "Ruang Klaim",
  "/claims/new": "Klaim Baru",
  "/approvals": "Antrean Persetujuan",
  "/payroll": "Konsol Payroll",
  "/employees": "Karyawan dan Agen",
  "/payslips": "Slip Gaji",
  "/mis": "MIS Intelligence",
  "/mis/what-if": "What-If Sandbox",
  "/audit": "Jejak Audit",
};

function sectionFor(pathname: string): string {
  if (
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/payslips") ||
    pathname.startsWith("/reports")
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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    items: group.items.filter((item) => item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>

      <aside
        className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}
        aria-label="Navigasi utama"
      >
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <div>
            <span className="brand__name">Aletheia</span>
            <span className="brand__sub">Control room</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mobile-only"
            aria-label="Tutup navigasi"
            onClick={() => setSidebarOpen(false)}
            style={{ marginLeft: "auto", color: "#cbd5e1" }}
          >
            <X size={16} />
          </Button>
        </div>

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
                    aria-current={isActive(item, pathname) ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setSidebarOpen(false);
                      void navigate({ to: item.to });
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="user-block">
            <span className="user-block__avatar" aria-hidden="true">
              {initials(user.full_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="user-block__name truncate">{user.full_name}</div>
              <div className="user-block__role truncate">{roleLabel(user.role)}</div>
            </div>
          </div>
          <button
            type="button"
            className="nav__item"
            style={{ width: "100%", marginTop: 4 }}
            onClick={() => {
              void logout().then(() => navigate({ to: "/login" }));
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            Keluar
          </button>
          <div style={{ padding: "12px 10px 0", lineHeight: "16px" }}>
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
          <div className="topbar__crumb">
            <ClipboardList size={14} aria-hidden="true" />
            <span>{sectionFor(pathname)}</span>
            <span aria-hidden="true">/</span>
            <span className="topbar__title">{titleFor(pathname)}</span>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__action">
            {hasRole("COMPLIANCE_ADMIN") ? (
              <span className="chip">
                <ShieldCheck size={12} aria-hidden="true" />
                Kepatuhan aktif
              </span>
            ) : null}
            <span className="chip">{roleLabel(user.role)}</span>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
