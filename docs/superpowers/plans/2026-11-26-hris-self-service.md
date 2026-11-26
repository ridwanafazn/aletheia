# Aletheia HRIS Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employee self-service, e-cuti, and e-lembur so an employee can see their own payslip and attendance, request leave and overtime, and an authorized approver can decide without violating segregation of duties.

**Architecture:** Add an `EMPLOYEE` role and self-scope endpoints under `/api/v1/me`. Add `payroll.leave_balances` and `payroll.overtime_requests`. Leave approval moves days from pending to used; overtime approval recomputes the monthly attendance summary. The web app gets `/me` for employees and `/workforce` for HR, branch manager, and finance.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router/Query, Express TS, PostgreSQL 16, Zod shared contracts, Playwright, Vitest, Drizzle.

**Spec:** `docs/11-hris-lite-and-payroll-reporting.md` sections 3.3, 3.4, 5F; `docs/07-frontend-architecture-and-ux.md` sections 3, 6.4, 7, 10; `docs/13-job-targeting-matrix.md`.

## Global Constraints

- No production deploy until M6.2 sign-off.
- Synthetic data only. No real PII or money.
- Self endpoints derive personnel from the authenticated user. Never trust a client-supplied `personnel_id`.
- Maker cannot approve their own leave or overtime. Enforce in the service and test it.
- Leave balance cannot go negative. Overtime cannot exceed 24 hours per request and must be unique per person per day.
- All mutations write an audit row in the same transaction.
- UI Indonesian, WCAG 2.2 AA, 390 px usable.
- `pnpm verify`, full E2E, and axe must pass before evidence is written.

## Review Focus

- **Cross-employee read:** employee A must never read employee B's payslip, attendance, leave, overtime, or balance. The self router must not accept an override.
- **Self-approval:** an employee must not approve their own leave or overtime, even if they somehow hold an approver role.
- **Balance race:** two pending leave requests must not both consume the same remaining balance. Lock the balance row with `FOR UPDATE`.
- **Overtime recalculation:** approving, rejecting, or retrying must not double-count hours. Recompute from approved requests for the month.
- **Role gating:** employee nav and routes must not expose payroll, claims, audit, or workforce queue. Backend role checks remain authoritative.

---

## Task 1: Contracts and schema

**Files:**
- Modify: `packages/shared-contracts/src/enums.ts`
- Modify: `packages/shared-contracts/src/payroll.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create migration via `pnpm --filter @aletheia/database db:generate`
- Test: `packages/shared-contracts/src/payroll.test.ts` if needed

**Interfaces:**
- `RoleSchema` includes `EMPLOYEE`.
- `LeaveBalanceSchema`, `LeaveBalanceListResponseSchema`.
- `SelfLeaveRequestCreateSchema`.
- `OvertimeRequestCreateSchema`, `OvertimeDecisionRequestSchema`, `OvertimeRequestSchema`, `OvertimeRequestListResponseSchema`.
- `MeProfileSchema`.

- [ ] Add `EMPLOYEE` to `RoleSchema` and to `users_role_check` in the Drizzle schema.
- [ ] Add `leave_balances` and `overtime_requests` tables with unique constraints, checks, and indexes.
- [ ] Add the shared schemas and types.
- [ ] Run `pnpm --filter @aletheia/database db:generate` and inspect the SQL. It must alter the role check and add only the two tables.
- [ ] Add RLS policies and grants for both tables in the generated migration or a follow-up SQL file.
- [ ] Run `pnpm --filter @aletheia/shared-contracts build` and `pnpm --filter @aletheia/database build`.
- [ ] Commit.

## Task 2: Employee role and seed

**Files:**
- Modify: `packages/database/src/seed.ts`
- Modify: `apps/web/src/shared/lib/format.ts`
- Modify: `apps/web/src/features/auth/LoginPage.tsx`
- Modify: `scripts/dev-up.sh` demo account printout

**Interfaces:**
- `U_EMPLOYEE = uid(28)`, email `employee.siti@aletheia.id`, role `EMPLOYEE`.
- `payroll.personnel.user_id` for Siti = `U_EMPLOYEE`.
- Seed leave balances: ANNUAL entitlement 12 used 2 pending 0; SICK entitlement 12; UNPAID entitlement 0.
- Seed two approved overtime requests totaling 4 hours for Siti in November 2026.

- [ ] Add the user and link Siti.
- [ ] Seed balances and approved overtime so the demo is consistent with the existing attendance summary.
- [ ] Add `EMPLOYEE: "Karyawan"` to `ROLE_LABELS`.
- [ ] Add the employee demo account and `landingFor` returns `/me`.
- [ ] Run `pnpm db:migrate`, `pnpm db:seed`, and verify the user and balances exist.
- [ ] Commit.

## Task 3: Self-scope service routes

**Files:**
- Create: `services/payroll-service/src/routes/me.ts`
- Modify: `services/payroll-service/src/app.ts`
- Modify: `services/payroll-service/src/routes/workforce.ts`
- Test: `services/payroll-service/src/app.test.ts` or a new `me.test.ts`

**Interfaces:**
- `GET /api/v1/me/profile`
- `GET /api/v1/me/payslips`
- `GET /api/v1/me/payslips/:id/download`
- `GET /api/v1/me/attendance?period=YYYY-MM`
- `GET /api/v1/me/leave-balances?year=YYYY`
- `GET /api/v1/me/leave-requests`
- `POST /api/v1/me/leave-requests`
- `GET /api/v1/me/overtime-requests`
- `POST /api/v1/me/overtime-requests`

- [ ] Implement `resolveSelf` using `payroll.personnel.user_id = auth.userId` and `tenant_id = auth.tenantId`.
- [ ] Implement each self route with a hard-coded self personnel ID. Never accept `personnel_id` from the query or body.
- [ ] Add self payslip download with ownership check and audit.
- [ ] Add leave balance validation on create: lock the balance row, reject if remaining is insufficient, increment pending.
- [ ] Add overtime create with unique person/date and pending status.
- [ ] Add `POST /api/v1/overtime-requests/:id/decide` and extend `POST /api/v1/leave-requests/:id/decide` to allow `HR_SPECIALIST`; enforce SoD and balance transitions.
- [ ] Add `GET /api/v1/leave-balances` and `PUT /api/v1/leave-balances/:personnelId/:year/:leaveType` for HR.
- [ ] Recompute attendance overtime from approved requests after an overtime decision.
- [ ] Commit.

## Task 4: Employee self-service UI

**Files:**
- Create: `apps/web/src/features/me/api.ts`
- Create: `apps/web/src/features/me/MePage.tsx`
- Create: `apps/web/src/features/me/MyPayslipsTab.tsx`
- Create: `apps/web/src/features/me/MyAttendanceTab.tsx`
- Create: `apps/web/src/features/me/MyLeaveTab.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/widgets/AppShell.tsx`

**Interfaces:**
- Route `/me` for `EMPLOYEE`.
- Tabs: Slip Gaji, Absensi, Cuti dan Lembur.
- Leave form: type, start date, end date, days, reason.
- Overtime form: work date, hours, reason.
- Payslip download uses `absoluteApiUrl`.

- [ ] Implement the API client and tabs.
- [ ] Show profile, branch, employment status, and current balances.
- [ ] Show empty, loading, error, and permission states.
- [ ] Add route, nav, titles, and role label.
- [ ] Verify keyboard and mobile layout.
- [ ] Commit.

## Task 5: HR and manager workforce queue

**Files:**
- Create: `apps/web/src/features/workforce/api.ts`
- Create: `apps/web/src/features/workforce/WorkforcePage.tsx`
- Create: `apps/web/src/features/workforce/DecisionDialog.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/widgets/AppShell.tsx`

**Interfaces:**
- Route `/workforce` for `HR_SPECIALIST`, `BRANCH_MANAGER`, `FINANCE_MANAGER`.
- Two tabs or sections: Cuti and Lembur.
- Pending items show employee, branch, dates, days/hours, reason, and actions.
- Approve and reject require notes for rejection.

- [ ] Implement the API client and page.
- [ ] Enforce maker-checker messaging when the current user is the employee.
- [ ] Add route, nav, titles.
- [ ] Verify a11y and mobile.
- [ ] Commit.

## Task 6: E2E and security tests

**Files:**
- Create: `apps/web/e2e/me.spec.ts`
- Create: `apps/web/e2e/workforce.spec.ts`
- Create: `docs/evidence/m6.4/` screenshots

- [ ] Employee login, own payslip, attendance, balances, no other employee data.
- [ ] Employee submits leave; HR approves; balance used increases and pending decreases.
- [ ] Employee submits overtime; HR approves; attendance overtime increases by the approved hours.
- [ ] Employee cannot open `/payslips`, `/workforce`, `/payroll`, or `/audit`.
- [ ] Self endpoints ignore a forged `personnel_id` and return only the authenticated employee.
- [ ] Axe zero serious/critical.
- [ ] Mobile 390 px.
- [ ] Commit.

## Task 7: Docs and evidence

**Files:**
- Create: `docs/evidence/m6.4-verification.md`
- Modify: `README.md`, `HANDOVER.md`, `CHANGELOG.md`, `docs/07`, `docs/11`, `docs/13`, `docs/16`, `docs/evidence/README.md`

- [ ] Record commands, results, screenshots, and limitations.
- [ ] Mark ESS, e-cuti, and e-lembur as done; keep reimburse, performance, and org management as next.
- [ ] Commit.

## Task 8: Verification gate

- [ ] `pnpm verify`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:a11y`
- [ ] `pnpm security:db`
- [ ] `pnpm security:audit`
- [ ] `pnpm --filter @aletheia/web build` and record bundle size.
- [ ] Commit final fixes.

---

## Out of Scope

Reimburse, organization management, performance review, recruitment, full clock-in/out, shift scheduling, real BPJS/DJP/bank integrations, and multi-country payroll remain future work.
