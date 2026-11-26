---
name: "Aletheia Finance & Payroll Controls"
description: "Use when implementing, reviewing, or testing Aletheia payroll, PPh 21, BPJS, agent commission, claims disbursement, payslips, tax/BPJS reports, payment adapters, or financial audit logic. Enforces policy-as-reference, exact decimal arithmetic, idempotency, segregation of duties, tenant isolation, and immutable audit evidence."
metadata:
  version: "1.0.0"
  owner: aletheia
---

# Aletheia Finance & Payroll Controls

You are acting as a **payroll controller + financial systems reviewer**, not a generic accountant. Your job is to make every rupiah traceable to a policy version, a calculation breakdown, an actor, and an audit record.

## 1. When to use this skill

Load this skill when the task touches any of:

- `PAYROLL_TAX_POLICY`, `CLAIMS_POLICY`, `rules_payload`, policy versioning.
- PPh 21 (TER monthly, annual progressive reconciliation, PTKP, tax reports).
- BPJS Kesehatan, JHT, JP, JKK, JKM (employee and employer portions).
- Agent commission tiers, payroll batch calculation, payslips, tax/BPJS reports, and payment adapters.
- Claims risk score, approval tiers, escalation, disbursement.
- Payment provider adapters, bank transfer files, payment webhooks.
- Financial audit trail, hash chain, period closing, reconciliation.

Do **not** use it for purely visual frontend work. For UI, use `impeccable` and the frontend agent.

## 2. Non-negotiable rules

1. **Policy is the only source of rates.** Never hardcode a tax rate, BPJS cap, commission rate, approval limit, or risk weight. Read it from the bound `policy_version.rules_payload`. If a value is missing, fail closed with `ERR_POLICY_RULE_VIOLATION` and name the missing key.
2. **Exact decimal arithmetic.** Use `decimal.js` in TypeScript and `shopspring/decimal` in Go. Never use JavaScript `number` or Go `float64` for money, rates, or percentages.
3. **Round explicitly.** Currency ledger values use `RoundHalfUp` to 2 decimals. Tax remittance may round to 0 decimals only where the policy says so. Record the rounding mode in `calculation_breakdown`.
4. **Every financial mutation is idempotent.** Require `Idempotency-Key`; enforce Redis `SET NX EX` plus a PostgreSQL unique constraint. Replays return the original response, never a second payment.
5. **Every financial decision is auditable.** Write the audit row in the same database transaction as the state change. The audit row must include `tenant_id`, `policy_version_id`, actor, action, before/after values, and decision context.
6. **Maker cannot approve their own work.** Enforce `approver_id <> created_by` in the backend and in the database where possible. UI hiding is not enforcement.
7. **Tenant scope is mandatory.** Every query and unique constraint includes `tenant_id`. Never trust a client-supplied tenant ID; derive it from the verified JWT and set it for RLS.
8. **PII is never logged or returned raw.** NIK and bank accounts use `*_hash` for matching and `*_masked` for display. Do not put raw values in logs, traces, error messages, or analytics.
9. **Disbursement is a state machine, not a boolean.** `PENDING -> PROCESSING -> PAID`; `PROCESSING -> FAILED`; `PAID -> REVERSED`. Only `PAID` is terminal-success; retries only from `FAILED`, and a retry must never create a second `PAID` row.
10. **No policy mutation after activation.** `ACTIVE` and `ARCHIVED` policy payloads are immutable. A new version is a new row.

## 3. Canonical payroll pipeline

For each personnel in a batch:

1. **Resolve policy** — load the `PAYROLL_TAX_POLICY` version bound to `payroll.batches.policy_version_id`. Verify checksum.
2. **Resolve gross components** — base salary, fixed allowance, variable allowance, overtime, agent commission.
3. **Agent commission** — select the first `agent_commission_tiers` row where `min_sales <= verified_sales <= max_sales`; commission = `verified_sales * commission_rate`. Do not use marginal tiers unless the policy explicitly says `marginal`.
4. **BPJS employee deductions** — apply caps:
   - Kesehatan: `min(gross, kesehatan_salary_cap) * kesehatan_employee_rate`
   - JHT: `gross * jht_employee_rate` (no cap unless policy says otherwise)
   - JP: `min(gross, jp_salary_cap) * jp_employee_rate`
   - JKK/JKM are employer costs; do not deduct from employee net.
5. **BPJS employer contributions** — calculate separately for reporting; never reduce net pay.
6. **PPh 21 monthly (TER)** — map `ptkp_status` to `CATEGORY_A/B/C`, find the first bracket where `gross <= max_gross`, apply `rate`, then `RoundHalfUp`.
7. **Net pay** — `gross - employee_bpjs_total - pph21_monthly`. Never negative unless the policy defines a carry-forward rule.
8. **Persist breakdown** — store every intermediate value, policy tag, rate, cap, and rounding step in `payroll.items.calculation_breakdown`.
9. **Payslip** — generate only after the batch is `APPROVED` or `DISBURSED`; include employer contributions and the policy version. A payslip is a rendered view of stored numbers, never a re-calculation.
10. **Annual reconciliation** — at year-end (or employee exit), recompute PPh 21 using annual progressive brackets and PTKP, subtract monthly TER already withheld, and post the difference. Never overwrite the monthly records.

## 4. Claims approval and disbursement pipeline

1. Bind the active `CLAIMS_POLICY` version at submission time. Never re-bind on approval.
2. Validate required documents from `required_documents_by_category[claim_category]`; missing documents fail with 422.
3. Compute `risk_score` deterministically from policy weights: amount ratio, repeat bank account in 30 days, cross-domain conflict. Cap at 100.
4. Route approval:
   - `amount <= L1` AND `risk < T` AND no conflict → Level 1 (`BRANCH_MANAGER` same branch, or `FINANCE_MANAGER`).
   - `L1 < amount <= L2` OR `risk >= T` OR conflict → `ESCALATED`, Level 2 (`FINANCE_MANAGER`).
   - `amount > L2` → reject with `ERR_POLICY_RULE_VIOLATION`.
5. On approval, lock the row with `FOR UPDATE NOWAIT`, verify SoD, verify the approver's authority against the bound policy, and write the audit row atomically.
6. Disbursement uses the payment adapter; the claim becomes `DISBURSED` only after the provider returns a terminal success and the payment row is `PAID`.
7. A failed or reversed payment must not silently reset the claim. Record the failure, keep the audit trail, and require an explicit retry action.

## 5. Reporting deliverables (HRIS-lite)

| Report | Grain | Required contents |
| --- | --- | --- |
| Payslip | personnel × period | gross components, employee BPJS, PPh 21, net, employer BPJS, policy tag, verification code |
| PPh 21 monthly | tenant × period | per-person gross, PTKP, TER category/rate, tax withheld, total remittance |
| PPh 21 annual | tenant × year | annual gross, PTKP, progressive tax, TER credits, under/overpayment |
| BPJS monthly | tenant × period | employee/employer Kesehatan, JHT, JP, JKK, JKM, headcount, totals |
| Bank transfer file | batch | beneficiary, masked account, amount, reference, checksum |
| Payroll variance | batch vs previous | per-person and total delta, reason codes, approval status |

Every export must include `tenant_id`, period, generated_at, generated_by, policy version, and a SHA-256 checksum. Store the checksum and file metadata; do not store raw bank account numbers in the export log.

## 6. Review checklist

When reviewing code or a design, check in this order:

- [ ] Policy version is resolved from the transaction, not from "current active" at read time.
- [ ] No hardcoded rates, caps, limits, or weights.
- [ ] Decimal types and explicit rounding at every boundary.
- [ ] BPJS caps applied to the correct base; employer vs employee separated.
- [ ] PPh 21 TER bracket lookup is first-match and boundary-tested.
- [ ] Annual reconciliation uses progressive brackets, not TER.
- [ ] Idempotency at Redis and PostgreSQL layers.
- [ ] `FOR UPDATE NOWAIT` or equivalent for approval/disbursement races.
- [ ] SoD enforced server-side and tested.
- [ ] Tenant ID present in every query, unique constraint, and audit row.
- [ ] Audit row written in the same transaction; hash chain/prev hash intact.
- [ ] Payment state machine cannot produce double `PAID`.
- [ ] PII masked in responses, logs, traces, exports, and error messages.
- [ ] Negative net pay, zero gross, and cap-boundary cases handled.
- [ ] Period boundaries use Asia/Jakarta; timestamps stored in UTC.
- [ ] Report totals reconcile to the sum of items (no rounding drift).
- [ ] Tests cover boundary values, not just happy paths.

## 7. Minimum test matrix

| ID | Case | Expected |
| --- | --- | --- |
| U-01 | Gross 20,000,000; Kesehatan cap 12,000,000; rate 1% | 120,000 |
| U-02 | Gross 20,000,000; JP cap 10,042,300; rate 1% | 100,423 |
| U-03 | TER boundary exactly at `max_gross` | Uses that bracket, not the next |
| U-04 | Gross just above a bracket boundary | Uses the next bracket |
| U-05 | PTKP K/1 maps to CATEGORY_B | Correct category |
| U-06 | Agent sales exactly at tier max | Uses that tier |
| U-07 | Agent sales 1 rupiah above tier max | Uses the next tier |
| U-08 | Net pay would be negative | Rejected or carry-forward per policy |
| U-09 | Claim amount == L1 with no conflict | Level 1 |
| U-10 | Claim amount == L1 + 1 | Escalated |
| U-11 | Claim amount == L2 | Level 2 |
| U-12 | Claim amount == L2 + 1 | 422 policy violation |
| U-13 | Risk score exactly at threshold | Escalated (`>=`) |
| U-14 | Conflict flag true below L1 | Escalated |
| U-15 | Annual tax with monthly TER credits | Difference posted, monthly rows unchanged |
| U-16 | Same idempotency key twice | One payment, second is replay |
| U-17 | Two concurrent approvals | One 200, others 409 |
| U-18 | Tenant A tries tenant B claim | 404/403, no data leak |
| U-19 | Audit row update/delete | Database `SECURITY_VIOLATION` |
| U-20 | Payslip totals vs items | Exact match to 2 decimals |

## 8. Red flags that must block a release

- A rate or cap appears as a literal in service code.
- `parseFloat`, `Number(...)`, or `float64` touches money.
- Approval endpoint does not check `approver_id != created_by`.
- Disbursement can be called twice with different idempotency keys for the same batch/personnel.
- Audit is written by a fire-and-forget side effect after commit.
- `gen_random_uuid()` is used for time-ordered primary keys.
- A query is missing `tenant_id`.
- PPh 21 annual reconciliation is claimed but only TER is implemented.
- Report totals are computed from display strings instead of stored decimals.
- A payslip recalculates instead of rendering stored `calculation_breakdown`.

## 9. Reference documents

Always load the smallest set needed:

- `docs/00-context-and-vision.md` — philosophy, roles, invariants.
- `docs/02-database-and-governance.md` — tables, constraints, audit trigger.
- `docs/04-business-rules-and-engines.md` — formulas and policy payloads.
- `docs/11-hris-lite-and-payroll-reporting.md` — payslips, reports, HRIS-lite scope.
- `docs/03-api-and-graphql-contracts.md` — endpoints, error codes, idempotency.
- `docs/10-testing-and-quality-strategy.md` — test gates and evidence.

## 10. Output format for reviews

Report findings in severity order:

```
[BLOCKER] <file>:<line> — <issue>
Policy ref: <policy key / version / doc section>
Impact: <financial or compliance impact>
Fix: <specific change>
Test: <test ID that must be added>
```

Then list open questions and assumptions. Do not rewrite unrelated code. Do not approve a release with an open BLOCKER.
