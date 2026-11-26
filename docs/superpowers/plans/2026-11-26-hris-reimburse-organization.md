# Aletheia Reimburse and Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an employee reimbursement workflow and a read-only organization structure so Aletheia covers the HRIS+ reimburse module and BASIC organization management.

**Architecture:** Add `payroll.reimbursements` with SoD, approval, payment status, and Cloudinary receipt signing. Add `governance.departments` and `governance.positions`, assign them to personnel, and expose a read-only organization endpoint. Extend `/me` and `/workforce` with Reimburse tabs and add `/organization` for payroll and compliance roles.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router/Query, Express TS, PostgreSQL 16, Zod, Playwright, Vitest, Drizzle, Cloudinary.

**Spec:** `docs/11-hris-lite-and-payroll-reporting.md`, `docs/07-frontend-architecture-and-ux.md`, `docs/13-job-targeting-matrix.md`.

## Global Constraints

- No production deploy until M6.2 sign-off.
- Synthetic data only.
- Self endpoints derive personnel from the JWT; never accept a client `personnel_id`.
- Maker cannot approve their own reimbursement.
- Reimbursement amount is a decimal string; no browser arithmetic.
- Receipt upload uses a Cloudinary signed upload; the service stores only the secure URL and public ID.
- Every mutation writes an audit row in the same transaction.
- UI Indonesian, WCAG 2.2 AA, 390 px usable.
- `pnpm verify`, full E2E, axe, `security:db`, and `security:audit` must pass.

## Review Focus

- Employee A cannot read employee B's reimbursement.
- Maker cannot approve their own reimbursement.
- Double approval or double payment cannot move status twice.
- A rejected reimbursement cannot be paid.
- Receipt signature is scoped and does not expose the API secret.
- Organization data is tenant-scoped and read-only.
- E2E exercises the real seeded employee and ledger rows.

---

## Task 1: Schema, contracts, and migration

**Files:** `packages/database/src/schema/index.ts`, `packages/shared-contracts/src/payroll.ts`, `packages/shared-contracts/src/enums.ts`, migrations.

- Add `payroll.reimbursements` with category, expense_date, amount, description, receipt_url, receipt_public_id, status, decision fields, payment fields, created_by, timestamps, checks, and indexes.
- Add `governance.departments` and `governance.positions` with tenant/code uniqueness and RLS.
- Add `personnel.department_id`, `position_id`, `supervisor_id`.
- Add shared enums and schemas: `ReimbursementCategory`, `ReimbursementStatus`, create/decision/pay/list, `Department`, `Position`, `OrganizationTree`.
- Generate migration, inspect SQL, add RLS and grants.

## Task 2: Seed and payroll service

- Seed departments: Finance, HR, Claims, MIS, Compliance.
- Seed positions: Manager, Officer, Analyst, Specialist.
- Assign Siti, Budi, Rina, Agus, Dewi to departments/positions and supervisors.
- Add `POST /api/v1/me/reimbursements/upload-signature` and self create/list.
- Add `/api/v1/reimbursements` list/decide/pay with SoD and audit.
- Add `GET /api/v1/organization` read-only tree for payroll/compliance roles.
- Add Cloudinary config and signing helper to payroll service.
- Unit test pure helpers; run typecheck/lint/test.

## Task 3: Employee and HR UI

- Add Reimburse tab to `/me`: balances not required, form with category, date, amount, description, optional receipt URL, file upload, and history.
- Add Reimburse tab to `/workforce`: pending list, approve/reject, and Finance pay action.
- Add `/organization` page: department cards, positions, personnel, supervisor.
- Add route, nav, titles, role gating.

## Task 4: E2E, docs, verification

- Employee submits reimbursement; HR approves; Finance pays; employee sees PAID.
- Employee cannot read another employee's reimbursement.
- Reimburse rejection and pay guard.
- Organization page loads departments and Siti.
- Axe and mobile.
- Add `docs/evidence/m6.5-verification.md`, screenshots, and update README/HANDOVER/CHANGELOG/docs.
- Run `pnpm verify`, full E2E, axe, `security:db`, `security:audit`, build.

## Out of Scope

Full expense policy engine, multi-line receipts, accounting journal export, approval matrix by amount, and real bank payment remain future work.
