import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { z } from "zod";

import { AppShell } from "../widgets/AppShell";
import { claimsSearchSchema } from "../features/claims/search";
import { employeeSearchSchema } from "../features/employees/search";
import { misSearchSchema } from "../features/mis/search";
import { payrollSearchSchema } from "../features/payroll/search";
import { payslipSearchSchema, reportSearchSchema } from "../features/reports/search";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="content">
      <div className="panel">
        <div className="panel__body">
          <h1>Halaman tidak ditemukan</h1>
          <p className="muted">Periksa alamat atau kembali ke ruang klaim.</p>
          <a className="btn btn--primary" href="/claims" style={{ marginTop: 16 }}>
            Ke ruang klaim
          </a>
        </div>
      </div>
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("../features/auth/LoginPage")),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: () => <Navigate to="/claims" replace />,
});

const claimsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/claims",
  validateSearch: (search) => claimsSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/claims/ClaimsPage")),
});

const newClaimRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/claims/new",
  component: lazyRouteComponent(() => import("../features/claims/NewClaimPage")),
});

const claimDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/claims/$claimId",
  validateSearch: (search) => z.object({ created: z.string().optional() }).parse(search),
  component: lazyRouteComponent(() => import("../features/claims/ClaimDetailPage")),
});

const approvalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/approvals",
  component: lazyRouteComponent(() => import("../features/approvals/ApprovalsPage")),
});

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/audit",
  component: lazyRouteComponent(() => import("../features/audit/AuditPage")),
});

const payrollRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/payroll",
  validateSearch: (search) => payrollSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/payroll/PayrollPage")),
});

const payrollBatchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/payroll/$batchId",
  validateSearch: (search) => z.object({ created: z.string().optional() }).parse(search),
  component: lazyRouteComponent(() => import("../features/payroll/PayrollBatchPage")),
});

const employeesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/employees",
  validateSearch: (search) => employeeSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/employees/EmployeesPage")),
});

const payslipsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/payslips",
  validateSearch: (search) => payslipSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/reports/PayslipCenterPage")),
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/reports",
  validateSearch: (search) => reportSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/reports/ReportsPage")),
});

const misRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mis",
  validateSearch: (search) => misSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("../features/mis/MisPage")),
});

const whatIfRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mis/what-if",
  component: lazyRouteComponent(() => import("../features/mis/WhatIfPage")),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    indexRoute,
    claimsRoute,
    newClaimRoute,
    claimDetailRoute,
    approvalsRoute,
    auditRoute,
    payrollRoute,
    payrollBatchRoute,
    employeesRoute,
    payslipsRoute,
    reportsRoute,
    misRoute,
    whatIfRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => (
    <div className="content" role="status" aria-label="Memuat halaman">
      <div className="skeleton skeleton--text" style={{ width: 200, marginBottom: 16 }} />
      <div className="skeleton skeleton--row" style={{ height: 280 }} />
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
