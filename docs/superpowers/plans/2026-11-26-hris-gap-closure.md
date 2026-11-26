# Aletheia HRIS Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the most visible HRIS gaps for the SAU and BPUI job targets while preserving Aletheia's payroll, audit, and governance strengths.

**Architecture:** Phase 0 corrects positioning and evidence. Phase 1 adds a visible payslip and report surface on top of the existing payroll API. Phase 2 adds employee self-service and e-cuti/e-lembur. Phase 3 adds reimbursement and organization management. Phase 4 adds the SAU-specific managed-service layer. Each phase is independently shippable.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router/Query, Express TS, Go worker, PostgreSQL 16, Zod shared contracts, Playwright, Vitest, Docker, GitHub Actions.

**Spec:** `docs/07-frontend-architecture-and-ux.md`, `docs/11-hris-lite-and-payroll-reporting.md`, `docs/13-job-targeting-matrix.md`, `PRODUCT.md`, `DESIGN.md`.

## Global Constraints

- No production deploy until M6.2 monitoring sign-off. Code may be prepared locally, but Render/Pages/Workers stay frozen.
- Synthetic data only. No real PII, no real money, no real bank or tax integration.
- Payroll and tax rates come from the bound `policy_version.rules_payload`. No hardcoded rate, cap, or limit.
- Money arithmetic stays server-side. The browser displays decimal strings from the API and never recalculates money.
- Shared Zod contracts are the only API types. Do not redefine DTOs in the web app.
- UI copy is Indonesian. Code, tests, and technical docs are English or the existing project convention.
- WCAG 2.2 AA, keyboard-first tables and forms, axe zero serious or critical findings.
- Initial bundle stays under 200 KB gzipped. Use route-level code splitting.
- Every phase ends with typecheck, lint, unit tests, relevant E2E, accessibility, and evidence.

## Review Focus

- **Employee self-scope authorization:** an employee must never read another employee's payslip, attendance, or leave request. Phase 2 adds a dedicated test for this.
- **Download token expiry and checksum:** a signed URL must expire, and the downloaded checksum must match the stored file checksum. Phase 1 tests the READY and not-ready paths.
- **Async report states:** QUEUED and GENERATING must not offer download. FAILED must show the error without exposing internal details. Phase 1 tests all four states.
- **Empty and partial periods:** a period with no payroll items must not crash the report or payslip list. Phase 1 tests an empty month.
- **Role gating and mobile:** new routes must be hidden and rejected for unauthorized roles, and the tables must remain usable at 390 px. Phase 1 tests both.
- **Overclaiming in documentation:** the job matrix must not call Aletheia a full HRIS. Phase 0 corrects the wording before any new code is claimed as evidence.

---

## 1. Assessment

### 1.1 Is Aletheia too far from the two job posts?

**No. The core stack and payroll depth are strong for both. The gap is HRIS breadth and visible HRIS surfaces, not the engineering foundation.**

| Target | Current fit | Main gap | Verdict |
| --- | --- | --- | --- |
| SAU Full Stack Developer HRIS/Payroll | Strong on payroll, PPh 21, BPJS, approval, audit, PostgreSQL, Node/Go, Docker, CI/CD | Presensi, e-lembur workflow, reimburse, employee self-service, performance, organization management, commercial package model | Not too far. Payroll is the hardest module and it is covered. Add Phase 1 and Phase 2 to make the HRIS story visible and credible. |
| BPUI Fullstack Developer | Strong on React, Express microservices, PostgreSQL, REST/GraphQL, caching, Docker, MIS, CI/CD, monitoring | Real team PR review and BPUI-specific process cannot be proven by a solo portfolio | Not far. The technical and MIS evidence is already strong. Phase 0 is enough; Phase 1 adds a useful extra artifact. |

### 1.2 Positioning

Use this sentence consistently:

> Aletheia is a payroll and disbursement governance platform with HRIS-lite. It covers employee master data, attendance summaries, leave, payroll, PPh 21, BPJS, payslips, reports, reconciliation, approval, audit, and multi-tenant isolation.

Do not use this sentence:

> Aletheia is a full HRIS.

The first sentence is defensible. The second invites a comparison with SAU's BASIC, HRIS+, and HRIS+ PRO packages, where Aletheia is missing presensi, e-lembur, reimburse, ESS, performance, and productivity tools.

### 1.3 What to build first

1. **Payslip Center and Reports UI.** The API is complete, but the most visible HRIS artifact is missing. This is the highest return per day.
2. **Employee self-service.** SAU sells ESS in BASIC and HRIS+. An employee who can see a payslip, attendance summary, and leave status is a credible HRIS demo.
3. **E-cuti and e-lembur.** These are core SAU modules and the natural next step after ESS.
4. **Reimburse and organization management.** These close the HRIS+ and BASIC gaps.
5. **SAU managed-service layer.** Tenant plan, payroll cost invoice, BJO, and management fee. Only after the core HRIS surfaces exist.

---

## 2. Roadmap

| Phase | Outcome | Effort | Gate |
| --- | --- | --- | --- |
| 0 | Honest positioning, domain brief, demo script, corrected job matrix | 1 day | Docs consistent, no overclaim |
| 1 | Payslip Center, Reports and Exports, batch payslip generation, seeded downloadable files | 4–6 days | E2E, axe, screenshots, evidence |
| 2 | Employee self-service, e-cuti, e-lembur, leave balance, overtime approval | 6–8 days | Self-scope tests, SoD, E2E |
| 3 | Reimburse and organization management | 5–7 days | Domain tests, RLS, E2E |
| 4 | Tenant plan/package, payroll cost invoice, BJO and management fee report | 3–5 days | Policy-driven totals, report checksum |
| 5 | Bank/DJP/BPJS/attendance adapters, RUM, CI E2E full-stack | Ongoing | Not required for job fit |

**Not doing in this program:** recruitment, onboarding, performance review, SAU Drive, corporate email, full clock-in/out and shift scheduling, real DJP/BPJS/bank integrations, multi-country payroll. These are future development and would dilute the payroll depth.

---

## 3. Phase 0 — Positioning and Evidence

### Task 0.1: Add the HRIS domain brief

**Files:**
- Create: `docs/17-hris-domain-brief.md`
- Modify: `docs/README.md` to link the new document

**Interfaces:**
- Consumes: the research in this conversation and `docs/11-hris-lite-and-payroll-reporting.md`.
- Produces: one document a reviewer can read in five minutes to understand HRIS, SAU's packages, and Aletheia's position.

- [ ] **Step 1: Write the document**

Sections:
1. What HRIS is: system of record plus workflow automation.
2. Core modules: employee data, organization, attendance, leave, payroll, benefits, talent, ESS, analytics, integrations.
3. HRIS vs HRMS vs HCM: overlapping terms; explain the nuance, not a hard boundary.
4. Indonesian payroll context: PPh 21 TER, December progressive reconciliation, BPJS employee and employer, THR, e-Bupot, UU PDP.
5. SAU product map: BASIC HRIS, HRIS+, HRIS+ PRO, Enterprise, with the modules from `https://sauwork.co.id/our-business`.
6. Aletheia map: which modules exist, which are partial, which are absent.
7. Positioning statement and interview talking points.
8. Sources with links.

- [ ] **Step 2: Verify links and terminology**

Run: `pnpm format:check`
Expected: PASS. No broken internal links, no "full HRIS" claim.

- [ ] **Step 3: Commit**

```bash
git add docs/17-hris-domain-brief.md docs/README.md
git commit -m "docs(hris): add domain brief and positioning"
```

### Task 0.2: Correct the job-targeting matrix

**Files:**
- Modify: `docs/13-job-targeting-matrix.md`

**Interfaces:**
- Consumes: Task 0.1.
- Produces: a matrix that distinguishes requirement coverage from product parity.

- [ ] **Step 1: Change J1-R3 from score 4 to 3**

Add a note: "HRIS-lite. Payroll, tax, BPJS, payslip, and reporting are implemented. Presensi, e-lembur, reimburse, ESS, performance, and organization management are not yet built."

- [ ] **Step 2: Update the executive summary**

Replace "100% requirement coverage" language with "100% of the technical requirements are mapped to artifacts; HRIS breadth is partial and explicitly listed as a gap."

- [ ] **Step 3: Update the residual gap table**

Keep P1 for "UI payslip dan laporan" until Phase 1 is done. Add P1 for "ESS and e-cuti/e-lembur" and P2 for "reimburse and organization management".

- [ ] **Step 4: Commit**

```bash
git add docs/13-job-targeting-matrix.md
git commit -m "docs(job-matrix): separate requirement coverage from HRIS parity"
```

### Task 0.3: Add the five-minute demo script

**Files:**
- Create: `docs/18-demo-script.md`
- Modify: `README.md` to link the script

**Interfaces:**
- Consumes: existing seeded accounts and data.
- Produces: a repeatable script for interviews and portfolio reviews.

- [ ] **Step 1: Write two scripts**

SAU script:
1. Login as HR.
2. Open employee directory, show PTKP, BPJS risk class, masked bank account.
3. Open attendance and leave summary.
4. Open payroll batch, show gross, BPJS employee, PPh 21, net, employer BPJS.
5. Open calculation breakdown, show policy version and rounding.
6. Login as Finance, approve and disburse.
7. Open payslip and PPh 21/BPJS report.
8. Open audit trail, verify hash chain.
9. Close with the honest scope statement.

BPUI script:
1. Login as Claims Officer, submit or open a claim.
2. Show risk score, conflict flag, and approval routing.
3. Login as Finance, approve.
4. Open MIS dashboard and What-If.
5. Show query plan, load test, and CI/CD evidence.
6. Close with the architecture story.

- [ ] **Step 2: Verify the script against seeded data**

Run the app, follow each step, and correct any label or route that does not exist.
Expected: every step works with `bash scripts/dev-up.sh` and the seeded accounts.

- [ ] **Step 3: Commit**

```bash
git add docs/18-demo-script.md README.md
git commit -m "docs(demo): add interview demo scripts for SAU and BPUI"
```

---

## 4. Phase 1 — Payslip Center and Reports UI

### Task 1.1: Add the reports API client and absolute URL helper

**Files:**
- Modify: `apps/web/src/shared/api/client.ts`
- Create: `apps/web/src/features/reports/api.ts`
- Test: `apps/web/src/features/reports/api.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `toQuery`, `ApiResult` from `shared/api/client`.
- Produces:
  - `absoluteApiUrl(path: string): string`
  - `listPayslips(filters: PayslipFilters): Promise<ApiResult<PayslipPage>>`
  - `getPayslip(id: string): Promise<ApiResult<Payslip>>`
  - `requestPayslips(batchId: string, idempotencyKey: string): Promise<ApiResult<PayslipGenerateResponse>>`
  - `downloadPayslip(id: string): Promise<ApiResult<FileDownloadResponse>>`
  - `listReports(filters: ReportFilters): Promise<ApiResult<TaxReportPage>>`
  - `generateReport(input: GenerateReportRequest, idempotencyKey: string): Promise<ApiResult<TaxReport>>`
  - `downloadReport(id: string): Promise<ApiResult<FileDownloadResponse>>`

- [ ] **Step 1: Write the failing test for `absoluteApiUrl`**

```ts
import { describe, expect, it } from "vitest";

import { absoluteApiUrl } from "../../shared/api/client";

describe("absoluteApiUrl", () => {
  it("keeps an absolute URL unchanged", () => {
    expect(absoluteApiUrl("https://example.test/file.pdf")).toBe("https://example.test/file.pdf");
  });

  it("prefixes a relative API path", () => {
    expect(absoluteApiUrl("/api/v1/payroll-files/token")).toMatch(
      /\/api\/v1\/payroll-files\/token$/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/web/src/features/reports/api.test.ts`
Expected: FAIL because `absoluteApiUrl` is not exported.

- [ ] **Step 3: Implement `absoluteApiUrl` and the API functions**

In `client.ts`:

```ts
export function absoluteApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
}
```

In `features/reports/api.ts`, import the schemas from `@aletheia/shared-contracts` and implement the functions with `apiRequest`. Use `PayslipPageSchema`, `PayslipSchema`, `PayslipGenerateResponseSchema`, `TaxReportPageSchema`, `TaxReportSchema`, and `FileDownloadResponseSchema`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/web/src/features/reports/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/api/client.ts apps/web/src/features/reports/api.ts apps/web/src/features/reports/api.test.ts
git commit -m "feat(web): add payslip and report API client"
```

### Task 1.2: Add report type metadata and period mapping

**Files:**
- Create: `apps/web/src/features/reports/model.ts`
- Test: `apps/web/src/features/reports/model.test.ts`
- Modify: `apps/web/src/shared/lib/format.ts`

**Interfaces:**
- Consumes: `periodEndDate` from `shared/lib/format`.
- Produces:
  - `REPORT_TYPE_OPTIONS: ReadonlyArray<{ value: ReportType; label: string; periodMode: "month" | "year" }>`
  - `reportPeriod(input: { reportType: ReportType; month: string; year: string }): { period_start: string; period_end: string }`
  - `reportTypeLabel(type: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { reportPeriod } from "./model";

describe("reportPeriod", () => {
  it("maps a monthly report to the first and last day", () => {
    expect(
      reportPeriod({ reportType: "PPH21_MONTHLY", month: "2026-11", year: "2026" }),
    ).toEqual({ period_start: "2026-11-01", period_end: "2026-11-30" });
  });

  it("maps an annual report to the full year", () => {
    expect(
      reportPeriod({ reportType: "PPH21_ANNUAL", month: "2026-11", year: "2026" }),
    ).toEqual({ period_start: "2026-01-01", period_end: "2026-12-31" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/web/src/features/reports/model.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the metadata and mapping**

Use the five report types: `PPH21_MONTHLY`, `PPH21_ANNUAL`, `BPJS_MONTHLY`, `BANK_FILE`, `PAYROLL_VARIANCE`. Monthly types use the selected month; `PPH21_ANNUAL` uses the selected year. Add `reportTypeLabel` to `format.ts` with Indonesian labels.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/web/src/features/reports/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/reports/model.ts apps/web/src/features/reports/model.test.ts apps/web/src/shared/lib/format.ts
git commit -m "feat(web): map report types to payroll periods"
```

### Task 1.3: Build the Payslip Center page

**Files:**
- Create: `apps/web/src/features/reports/PayslipCenterPage.tsx`
- Create: `apps/web/src/features/reports/PayslipDetailDrawer.tsx`
- Create: `apps/web/src/features/reports/search.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/widgets/AppShell.tsx`
- Test: covered by Task 1.7 E2E

**Interfaces:**
- Consumes: `listPayslips`, `downloadPayslip`, `absoluteApiUrl`, `listAllEmployees`.
- Produces: route `/payslips` with role guard `HR_SPECIALIST`, `FINANCE_MANAGER`, `COMPLIANCE_ADMIN`.

- [ ] **Step 1: Implement the page**

Behavior:
- Default period is `currentPeriod()`.
- Filters: period month and personnel select. Personnel options come from `listAllEmployees()`.
- Stats: number of payslips, total gross, total net.
- Table columns: Personel, Periode, Versi, Bruto, Net, Kode verifikasi, Terbit, Aksi.
- Actions: "Unduh" calls `downloadPayslip`, then opens `absoluteApiUrl(url)` in a new tab and shows a success banner. "Rincian" opens the drawer.
- Drawer shows batch ID, personnel ID, version, published date, checksum, snapshot hash, verification code, and supersedes ID.
- Empty state: "Belum ada slip gaji" with a link to `/payroll`.
- Error state: use `ErrorState`; 409 `ERR_REPORT_NOT_READY` becomes a warning banner, not a crash.
- Loading state: `SkeletonTable`.
- Role guard: same pattern as `EmployeesPage`; unauthorized roles see an access panel.

- [ ] **Step 2: Add the route and navigation**

In `router.tsx`, add a lazy route for `/payslips`. In `AppShell.tsx`, add "Slip Gaji" under the Payroll group with roles `HR_SPECIALIST`, `FINANCE_MANAGER`, `COMPLIANCE_ADMIN`. Add `PAGE_TITLES`, `sectionFor`, and `titleFor` entries.

- [ ] **Step 3: Verify types and build**

Run: `pnpm --filter @aletheia/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/reports/PayslipCenterPage.tsx apps/web/src/features/reports/PayslipDetailDrawer.tsx apps/web/src/features/reports/search.ts apps/web/src/app/router.tsx apps/web/src/widgets/AppShell.tsx
git commit -m "feat(web): add payslip center"
```

### Task 1.4: Build the Reports and Exports page

**Files:**
- Create: `apps/web/src/features/reports/ReportsPage.tsx`
- Modify: `apps/web/src/features/reports/search.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/widgets/AppShell.tsx`
- Test: covered by Task 1.7 E2E

**Interfaces:**
- Consumes: `listReports`, `generateReport`, `downloadReport`, `reportPeriod`, `REPORT_TYPE_OPTIONS`, `listBranches`.
- Produces: route `/reports` with role guard `HR_SPECIALIST`, `FINANCE_MANAGER`, `COMPLIANCE_ADMIN`.

- [ ] **Step 1: Implement the page**

Behavior:
- Report type selector with the five options.
- Month input for monthly types; year input for `PPH21_ANNUAL`.
- Optional branch filter.
- "Buat laporan" button creates a new idempotency key with `crypto.randomUUID()`, calls `generateReport`, shows a success banner, and invalidates the list.
- List table columns: Jenis, Periode, Cabang, Versi, Status, Headcount, Total PPh 21, Checksum, Dibuat, Aksi.
- Download is enabled only for `READY`; `QUEUED` and `GENERATING` show a disabled action; `FAILED` shows `error_message` in a danger banner.
- Poll every five seconds while any row is `QUEUED` or `GENERATING`.
- Empty state: "Belum ada laporan" with an explanation of the five report types.
- Use `StatusBadge` for report status.

- [ ] **Step 2: Add the route and navigation**

In `router.tsx`, add a lazy route for `/reports`. In `AppShell.tsx`, add "Laporan dan Ekspor" under Payroll with the same roles. Add title and section mapping.

- [ ] **Step 3: Verify types and build**

Run: `pnpm --filter @aletheia/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/reports/ReportsPage.tsx apps/web/src/features/reports/search.ts apps/web/src/app/router.tsx apps/web/src/widgets/AppShell.tsx
git commit -m "feat(web): add reports and exports page"
```

### Task 1.5: Add payslip generation to the batch detail

**Files:**
- Modify: `apps/web/src/features/payroll/PayrollBatchPage.tsx`
- Modify: `apps/web/src/features/reports/api.ts`
- Test: covered by Task 1.7 E2E

**Interfaces:**
- Consumes: `requestPayslips` from `features/reports/api`.
- Produces: HR action "Buat slip gaji" on `APPROVED` or `DISBURSED` batches.

- [ ] **Step 1: Add the mutation and button**

Add a `payslipMutation` using `requestPayslips(batchId, key)`. Generate the key with `crypto.randomUUID()` when the button is clicked. Show a success banner: "Slip gaji masuk antrean. Buka menu Slip Gaji untuk melihat hasilnya." Invalidate `["payslips"]` on success.

Button visibility:
- `hasRole("HR_SPECIALIST")`
- `batch.status` is `APPROVED` or `DISBURSED`
- Not already pending

Place it next to the existing approval and disbursement actions.

- [ ] **Step 2: Verify types and build**

Run: `pnpm --filter @aletheia/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/PayrollBatchPage.tsx apps/web/src/features/reports/api.ts
git commit -m "feat(web): request payslips from an approved batch"
```

### Task 1.6: Seed downloadable payslip and report files

**Files:**
- Modify: `packages/database/src/seed.ts`
- Test: covered by Task 1.7 E2E and the manual query below

**Interfaces:**
- Consumes: existing `PAYSLIP_SITI`, `REPORT_PPH21`, `sha256`.
- Produces: two `payroll.generated_files` rows with content, file size, MIME type, and matching checksums.

- [ ] **Step 1: Add deterministic demo content**

Payslip PDF:
```ts
const payslipContent = Buffer.from("%PDF-1.4\n% Aletheia demo payslip\n");
```
Report CSV:
```ts
const reportContent = Buffer.from(
  "personnel_code,name,gross,tax,net\nSAU-EMP-001,Siti Aminah,11000000.00,220000.00,10349577.00\n",
);
```
Add a `sha256Buffer(value: Buffer)` helper or widen `sha256` to accept `string | Buffer`.

Upsert `payroll.generated_files` rows:
- `kind: "PAYSLIP"`, `entity_id: PAYSLIP_SITI`, `file_name: "payslip-siti.pdf"`, `mime_type: "application/pdf"`, `file_size`, `content`, `checksum_sha256`.
- `kind: "REPORT"`, `entity_id: REPORT_PPH21`, `file_name: "pph21-2026-11.csv"`, `mime_type: "text/csv"`, `file_size`, `content`, `checksum_sha256`.

Update the seeded `payroll.payslips.file_checksum_sha256` and `payroll.tax_reports.file_checksum_sha256` to the same content hashes so the metadata and file agree.

- [ ] **Step 2: Seed and verify**

Run: `pnpm db:seed`
Expected: seed completes without error.

Run a query with the database client. Expected: two rows in `payroll.generated_files`, both with `file_size > 0` and a 64-character checksum.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/seed.ts
git commit -m "test(seed): add downloadable demo payslip and report files"
```

### Task 1.7: Add E2E, accessibility, and screenshots

**Files:**
- Create: `apps/web/e2e/reports.spec.ts`
- Create: `docs/evidence/m6.3/payslips.png`
- Create: `docs/evidence/m6.3/reports.png`
- Create: `docs/evidence/m6.3/payslips-mobile.png`

**Interfaces:**
- Consumes: seeded HR account and seeded payslip/report.
- Produces: repeatable evidence for the new screens.

- [ ] **Step 1: Write the E2E tests**

Use the existing login helper pattern from `payroll.spec.ts`.

Test 1: HR sees the payslip center and downloads a seeded payslip.
- Login as "Spesialis SDM".
- Click "Slip Gaji".
- Expect heading "Slip Gaji".
- Expect the seeded Siti Aminah row.
- Intercept `GET /api/v1/payslips/:id/download` and assert 200 after clicking "Unduh".
- Expect a success banner.
- Expect zero serious or critical axe violations.
- Screenshot to `docs/evidence/m6.3/payslips.png`.

Test 2: HR sees the reports page and downloads the seeded PPh 21 report.
- Click "Laporan dan Ekspor".
- Expect heading "Laporan dan Ekspor".
- Expect the seeded PPh 21 monthly row.
- Intercept `GET /api/v1/reports/:id/download` and assert 200 after clicking "Unduh".
- Expect zero serious or critical axe violations.
- Screenshot to `docs/evidence/m6.3/reports.png`.

Test 3: employee role cannot see the new routes.
- Login as a role without access, for example "Petugas Klaim".
- Navigate directly to `/payslips`.
- Expect the access panel or redirect, not the payslip table.

Test 4: mobile payslip list remains usable at 390 px.
- Set viewport 390 × 844.
- Login as HR, open "Slip Gaji".
- Expect the mobile list or table to be visible without horizontal page scroll.
- Screenshot to `docs/evidence/m6.3/payslips-mobile.png`.

- [ ] **Step 2: Run the E2E tests**

Run: `pnpm test:e2e -- reports.spec.ts`
Expected: all tests pass.

- [ ] **Step 3: Run accessibility only**

Run: `pnpm test:a11y`
Expected: PASS, zero serious or critical violations.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/reports.spec.ts docs/evidence/m6.3
git commit -m "test(e2e): cover payslip center and reports"
```

### Task 1.8: Update documentation and evidence

**Files:**
- Create: `docs/evidence/m6.3-verification.md`
- Modify: `docs/07-frontend-architecture-and-ux.md`
- Modify: `docs/13-job-targeting-matrix.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/evidence/README.md`

**Interfaces:**
- Consumes: Task 1.7 evidence.
- Produces: a consistent status across docs.

- [ ] **Step 1: Write the evidence document**

Include:
- Date and environment.
- Commands run.
- Results: E2E count, axe result, screenshots.
- What changed in the UI.
- Known limitations: no employee self-service yet; download uses signed links; data is synthetic.

- [ ] **Step 2: Update status lines**

In `docs/07`, change the Payslip Center and Reports status from "belum dibuat" to "M6.3 selesai" with the route names. In `docs/13`, mark the P1 UI gap as done and keep ESS/e-cuti as the next gap. In README, add the two new screens to capabilities and screenshots. In CHANGELOG, add the new UI under Unreleased.

- [ ] **Step 3: Verify formatting**

Run: `pnpm format:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/evidence/m6.3-verification.md docs/07-frontend-architecture-and-ux.md docs/13-job-targeting-matrix.md README.md CHANGELOG.md docs/evidence/README.md
git commit -m "docs(m6.3): record payslip and report UI verification"
```

### Task 1.9: Run the full verification gate

- [ ] **Step 1: Run the fast gate**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 2: Run the UI gates**

Run: `pnpm test:e2e`
Expected: all tests pass, including the new reports spec.

Run: `pnpm test:a11y`
Expected: PASS.

- [ ] **Step 3: Run the security gates if the seed or auth changed**

Run: `pnpm security:db`
Expected: 36/36 checks pass.

Run: `pnpm security:pii`
Expected: 0 findings.

- [ ] **Step 4: Confirm the bundle size**

Run: `pnpm --filter @aletheia/web build`
Expected: initial bundle under 200 KB gzipped. Record the exact size in the evidence document.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore(m6.3): pass verification gate"
```

---

## 5. Phase 2 — Employee Self-Service and E-Cuti/E-Lembur

This phase is a separate plan because it changes authentication, RLS, and self-scope authorization. Do not start it until Phase 1 is merged and the M6.2 freeze is lifted.

### Scope

- Add `EMPLOYEE` role and one demo employee account linked to `payroll.personnel.user_id`.
- Add self-scope endpoints:
  - `GET /api/v1/me/payslips`
  - `GET /api/v1/me/attendance?period=YYYY-MM`
  - `GET /api/v1/me/leave-requests`
  - `POST /api/v1/me/leave-requests`
  - `POST /api/v1/me/overtime-requests`
- Add `/me` route with three tabs: Payslip, Absensi, Cuti dan Lembur.
- Add `payroll.leave_balances` and `payroll.overtime_requests`.
- Add approval queue for HR and branch manager.
- Add SoD: an employee cannot approve their own leave or overtime.
- Add tests: employee A cannot read employee B's payslip, attendance, or leave; cross-tenant access is rejected; leave balance cannot go negative; overtime above the policy cap is flagged, not paid automatically.

### Files

- `packages/shared-contracts/src/enums.ts`
- `packages/database/src/schema/index.ts`
- `packages/database/migrations/0012_hr_self_service.sql`
- `packages/database/src/seed.ts`
- `services/payroll-service/src/routes/me.ts`
- `services/payroll-service/src/app.ts`
- `apps/web/src/features/me/`
- `apps/web/src/app/router.tsx`
- `apps/web/src/widgets/AppShell.tsx`
- `apps/web/e2e/me.spec.ts`

### Gate

- `pnpm verify`
- `pnpm test:e2e`
- `pnpm test:a11y`
- `pnpm security:db`
- Evidence: `docs/evidence/m6.4-verification.md`

---

## 6. Phase 3 — Reimburse and Organization Management

This phase closes the remaining BASIC and HRIS+ modules.

### Reimburse

- New tables: `payroll.reimbursements` and `payroll.reimbursement_items`.
- Categories: transport, meal, medical, other.
- Receipt upload via Cloudinary signed upload.
- Approval workflow with SoD.
- Payment state machine and audit.
- UI: `/reimbursements` for employees and approvers.

### Organization management

- New tables: `governance.departments`, `governance.positions`, `governance.job_levels`.
- Add `personnel.department_id`, `personnel.position_id`, `personnel.supervisor_id`.
- UI: organization tab in the employee directory and a simple org chart.
- RLS and tenant isolation for every new table.

### Gate

- `pnpm verify`
- `pnpm test:e2e`
- `pnpm security:db`
- Evidence: `docs/evidence/m6.5-verification.md`

---

## 7. Phase 4 — SAU Managed-Service Layer

This phase is optional and only for SAU-specific differentiation.

### Tenant plan and feature gating

- Add `governance.tenants.plan` with `BASIC`, `HRIS_PLUS`, `HRIS_PRO`, `ENTERPRISE`.
- Map plan to visible features in the UI and API.
- Add a plan badge in the tenant switcher or settings.
- Do not implement billing; only feature gating.

### Payroll cost invoice

- Add report type `PAYROLL_COST_INVOICE`.
- Policy keys: `bjo_rate`, `management_fee_rate`, `invoice_rounding`.
- Report contents: per client/branch, gross, employer BPJS, BJO, management fee, total invoice.
- Policy-driven rates, decimal arithmetic, checksum, and audit.
- This directly maps to SAU's managed-service business model.

### Gate

- `pnpm verify`
- `pnpm test:e2e`
- `pnpm security:db`
- Evidence: `docs/evidence/m6.6-verification.md`

---

## 8. Job Mapping After Each Phase

| Requirement | Current | After Phase 1 | After Phase 2 | After Phase 3 |
| --- | --- | --- | --- | --- |
| SAU HRIS/payroll experience | Payroll strong, HRIS breadth partial | Payroll outputs visible | ESS and e-cuti/e-lembur | Reimburse and org management |
| SAU PPh 21/BPJS | Strong | Strong and visible | Strong | Strong |
| SAU RBAC, approval, audit | Strong | Strong | Self-scope and SoD | Reimburse approval |
| SAU large data, anti-duplicate | Strong | Strong | Leave and overtime concurrency | Reimburse idempotency |
| BPUI React/Node/PostgreSQL | Strong | Add UI evidence | Add self-service API | Add domain breadth |
| BPUI MIS and GraphQL | Strong | No change | No change | No change |
| BPUI CI/CD and monitoring | Strong | Add UI tests | Add auth tests | Add domain tests |

---

## 9. Execution Handoff

Phase 0 can start immediately. Phase 1 can be implemented during the M6.2 freeze, but must not be deployed until the production monitor sign-off.

Recommended execution order:

1. Phase 0, all tasks.
2. Phase 1, Tasks 1.1–1.9.
3. M6.2 sign-off, then deploy Phase 1.
4. Phase 2 as a separate plan.
5. Phase 3 only if the SAU interview asks for reimburse or organization management.
6. Phase 4 only if the conversation moves toward SAU's commercial package model.

The smallest next step is **Task 0.1**: write `docs/17-hris-domain-brief.md`.
