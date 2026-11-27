# PRODUCT.md — Aletheia

## Product

**Aletheia** is an enterprise disbursement governance and MIS intelligence platform. It governs two money flows that most companies keep in separate silos:

1. **Customer claims** — submission, evidence, risk, tiered approval, disbursement.
2. **Payroll and agent incentives** — employee/agent master, attendance summary, tax/BPJS, batch approval, disbursement, payslips, reports.

It is designed for finance, HR, compliance, and MIS teams that need speed without losing control.

## The problem

- Approval limits, tax rates, and commission formulas are hardcoded, so every policy change becomes an engineering project.
- Historical transactions lose the rule context they were approved under.
- Double disbursement happens when retries, concurrency, and async workers meet weak idempotency.
- Claims and payroll are analyzed separately, so cross-domain conflicts (same bank account/NIK) go unnoticed.
- Audit logs are mutable, incomplete, or disconnected from the decision.
- HRIS/payroll reporting is an afterthought: no payslip, no PPh 21 recap, no BPJS report.

## Users and jobs to be done

| Persona | Job to be done | Success looks like |
| --- | --- | --- |
| **Claims Officer** (maker) | Submit a complete claim quickly, with the right evidence | Claim submitted with bound policy, no rework |
| **Branch Manager** (checker) | Decide within authority, with risk context | Decision in minutes, SoD enforced |
| **Finance Manager** (approver) | Approve escalations and payroll batches safely | No double payment, clear variance, audit ready |
| **HR & Payroll Specialist** (maker) | Run payroll accurately and produce payslips/reports | Zero calculation disputes, reports on time |
| **MIS Analyst** (read-only) | Understand performance and simulate policy changes | KPI in seconds, What-If variance |
| **Compliance Admin** (governance) | Publish policy, audit decisions, manage access | Policy versioned, audit chain valid |
| **Employee/Agent** (self-service) | Understand pay and deductions | Payslip with transparent breakdown |

## Core workflows

### A. Claim → decision → disbursement
1. Officer creates a claim; system binds the active `CLAIMS_POLICY`.
2. Async worker scores risk and scans cross-domain conflicts.
3. Manager reviews context and decides; maker cannot approve.
4. Finance disburses via payment adapter; claim becomes `DISBURSED` only on `PAID`.

### B. Payroll batch → calculation → disbursement → reports
1. HR creates a batch for a period and branch, bound to `PAYROLL_TAX_POLICY`.
2. Go worker calculates gross, BPJS, PPh 21 TER, commission, net; stores breakdown.
3. Finance reviews variance and approves.
4. System disburses idempotently; generates payslips, PPh 21/BPJS reports, bank file.
5. Year-end: annual PPh 21 reconciliation posts the difference without rewriting monthly rows.

### C. MIS → What-If
1. Analyst picks a base policy version and a historical period.
2. Analyst changes parameters in a read-only sandbox.
3. System replays history, computes actual vs simulated cost, and stores variance.
4. Production tables are untouched.

## Product principles

1. **Policy is a reference, not code.** Rates live in versioned payloads.
2. **Money is exact.** Decimal, explicit rounding, no floats.
3. **Every decision is explainable.** Policy version, risk score, actor, reason, before/after.
4. **No double disbursement.** Idempotency at two layers, state machine, race tests.
5. **Maker ≠ checker.** Enforced server-side, not by hiding buttons.
6. **Tenant-ready.** `tenant_id` from day one, RLS before production.
7. **Calm density.** Enterprise screens prioritize scanning, comparison, and decisions.
8. **Proof over claims.** Tests, load results, screenshots, ADRs.

## Scope

### In scope (milestone)
- Claims lifecycle + approval + disbursement.
- Payroll batch + PPh 21 TER/annual + BPJS employee/employer + commission.
- HRIS-lite: employee master, attendance/leave summary, payslip, reports.
- MIS KPI + What-If.
- Policy versioning, RBAC/SoD, audit chain, tenant-ready schema.
- Payment adapter + mock.
- Observability, load tests, security hardening.

### Out of scope (future)
- Full HRIS: clock-in/out, shift scheduling, overtime automation, recruitment, performance.
- THR/13th month automation (backlog).
- Direct DJP e-Bupot/SPT and BPJS API integration.
- Multi-currency/global payroll.
- Employee mobile app.

## Success metrics

| Metric | Target |
| --- | --- |
| Claim decision p95 | < 500 ms |
| Payroll 500 items | < 60 s |
| Double disbursement | 0 |
| Audit tamper success | 0 |
| Cross-tenant leak | 0 |
| PPh 21/BPJS boundary tests | 100% pass |
| Demo flow completion | < 3 minutes |
| Frontend initial bundle | < 200 KB gzip |

## Demo narrative

A reviewer should be able to log in as seven roles (six operational roles plus employee self-service) and see one coherent story: a claim with a cross-domain conflict is escalated and approved; a payroll batch with mixed PTKP statuses is calculated, approved, disbursed, and turned into a payslip and PPh 21/BPJS report; an MIS analyst simulates a commission change without touching production; compliance publishes a new policy while old transactions keep their old version; the audit chain verifies.

## Voice and tone

- Factual, calm, precise, corporate.
- Indonesian UI; English code and technical docs.
- IBM Plex Sans for UI. IBM Plex Mono for hashes and IDs.
- No hype, no exclamation marks, no emoji, no anthropomorphic error messages.
- No parentheses in UI copy. Write a second sentence instead.
- No ampersand in UI copy. Use "dan".
- No slash-heavy shorthand. Write "claims and payroll", not "claims/payroll".
- Errors explain what happened, what it means financially, and what to do next.
- Never expose PII, stack traces, or internal SQL.

## Constraints

- Free-tier infrastructure: Neon, Upstash, Cloudflare, Cloudinary, Render.
- Solo development, portfolio timeline.
- Indonesian payroll context; parameters must be policy-driven and verified.
- No real money in demos; synthetic data only.
