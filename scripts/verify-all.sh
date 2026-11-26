#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "==> Typecheck"
pnpm -r typecheck

echo "==> Lint"
pnpm -r lint

echo "==> Test"
pnpm -r test

echo "==> PII source scan"
node scripts/pii-scan.mjs

echo "==> Format check"
pnpm format:check

echo "==> Docker Compose config"
docker compose config >/dev/null

echo "==> Go vet, test and build"
if command -v go >/dev/null 2>&1; then
  (cd services/analytics-worker-go && go vet ./... && go test ./... && go build ./...)
else
  echo "Go is not installed, skipping Go checks"
fi

echo "All checks passed."
