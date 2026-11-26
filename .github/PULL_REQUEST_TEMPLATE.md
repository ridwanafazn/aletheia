# Pull Request

## What

<!-- One paragraph: what changed and why. -->

## Scope

- Task: `TASK-XX`
- Docs read:
- Contract changed? (Y/N) — if yes, link the schema/ADR:

## How

<!-- Key implementation decisions, transaction boundaries, tenant/idempotency/audit handling. -->

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm -r typecheck` | |
| Unit | `pnpm -r test` | |
| Integration | `pnpm test:integration` | |
| E2E | `pnpm test:e2e` | |
| Race | `go test -race ./...` | |
| Security | gitleaks/trivy/semgrep | |
| Load (if perf) | `k6 run ...` | |

## Risk

- Financial impact:
- Tenant/security impact:
- Rollback plan:

## Screenshots / evidence

<!-- UI: before/after at 1440 and 390. Backend: query plan, load result, or test log. -->

## Checklist

- [ ] No secrets/PII in diff, logs, or screenshots.
- [ ] Tenant scope, idempotency, and audit considered for every mutation.
- [ ] Tests cover boundary and failure cases.
- [ ] Docs/ADR/job matrix updated.
- [ ] No BLOCKER open from security/finance review.
