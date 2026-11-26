# Contributing to Aletheia

Aletheia is past the design phase. M1 through M5.3 are implemented. Read `HANDOVER.md` before changing code.

## Before you start

1. Read `HANDOVER.md`, `docs/06-execution-roadmap.md`, and the relevant specification.
2. Check `docs/14-architecture-decision-records.md` for constraints.
3. Confirm `packages/shared-contracts` and the SQL migration agree. Update the contract first if needed.
4. Start the local stack with `bash scripts/dev-up.sh`.
5. Create a branch from `main`.

## Branch naming

```text
feat/<area>-<short-description>
fix/<area>-<short-description>
docs/<short-description>
chore/<short-description>
```

Examples: `feat/claims-decision-lock`, `fix/payroll-pph21-boundary`, `docs/adr-payment-adapter`.

## Commit messages

Use Conventional Commits:

```text
feat(claims): enforce maker-checker on decision endpoint
fix(payroll): apply JP cap before rounding
docs(adr): record tenant RLS decision
test(payroll): add annual reconciliation boundary cases
```

## Pull request

- Keep PRs small and focused; one logical change.
- Fill `.github/PULL_REQUEST_TEMPLATE.md`.
- Include test evidence: commands and results, screenshots for UI, risk and rollback notes.
- Do not merge with failing CI, an open BLOCKER, or unresolved review comments.
- Squash merge; linear history.

## Code standards

- TypeScript strict; no `any` for API payloads; parse with Zod.
- Go: `gofmt`, `golangci-lint`, `go test -race`.
- No floats for money; use `decimal.js` or `shopspring/decimal`.
- No hardcoded tax, BPJS, commission, or approval values; read from policy.
- Every financial mutation: tenant scope, idempotency, and audit in the same transaction.
- Every public function: TSDoc/GoDoc explaining the business rule and policy reference.
- No secrets, PII, or stack traces in logs, errors, tests, or screenshots.

## Testing

Run the relevant gates before opening a PR:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm test:coverage
pnpm test:e2e
pnpm test:a11y
cd services/analytics-worker-go && go test -race -v ./...
```

Coverage targets: domain 90% lines and overall 90% for included domain. M5.3 result: 96,26% lines. Every bug fix needs a regression test.

E2E full payroll:

```bash
cd apps/web
RUN_FULL_E2E=1 WORKER_URL=http://127.0.0.1:4004 \
  node node_modules/@playwright/test/cli.js test
```

If `pnpm exec playwright` fails because the Windows PATH contains spaces, use `pnpm test:e2e` or the direct Node command above.

## Documentation

- Contract change → update `docs/02`, `docs/03`, `docs/04`, `docs/11` as applicable.
- Architecture decision → new ADR in `docs/14`; do not rewrite history.
- Task completion → update `docs/06`, `docs/16`, and `docs/13-job-targeting-matrix.md` with evidence.
- Screenshots and diagrams → `docs/assets/`.
- Benchmarks, query plans, load results → `docs/evidence/`.
- Update `HANDOVER.md` when ports, commands, accounts, or open risks change.

## Security

- Never commit credentials, tokens, real NIK, or bank accounts.
- Report vulnerabilities privately to the maintainer; do not open a public issue with exploit details.
- Follow `docs/08-security-and-compliance.md`.
- Before production, services must use a non-owner database role and bind tenant per transaction.

## Definition of Done

- [ ] Code, tests, docs, and ADR updated.
- [ ] CI green; verification gate passed with output.
- [ ] No BLOCKER from security or finance review.
- [ ] Evidence stored.
- [ ] Job-targeting matrix updated if capability changed.
- [ ] `HANDOVER.md` updated if operational behavior changed.

## License

By contributing, you agree that your contribution is licensed under GPL-3.0.
