#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
DEV_DIR="$ROOT_DIR/.dev"
LOG_DIR="$DEV_DIR/logs"
mkdir -p "$LOG_DIR"

info() { printf '\n==> %s\n' "$1"; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi
node scripts/generate-dev-keys.mjs

info "Install dependencies"
pnpm install

DATABASE_URL=""
if docker inspect aletheia-postgres-test >/dev/null 2>&1; then
  info "Start demo PostgreSQL container on port 55432"
  docker start aletheia-postgres-test >/dev/null
  DATABASE_URL="postgresql://aletheia:aletheia@localhost:55432/aletheia"
else
  info "Start PostgreSQL via Docker Compose on port 5432"
  docker compose --profile local-db up -d postgres
  DATABASE_URL="postgresql://aletheia:aletheia@localhost:5432/aletheia"
fi
export DATABASE_URL

info "Wait for PostgreSQL"
for _ in $(seq 1 30); do
  if docker exec aletheia-postgres-test pg_isready -U aletheia >/dev/null 2>&1; then
    break
  fi
  if docker compose exec -T postgres pg_isready -U aletheia >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

info "Apply migrations and seed"
pnpm db:migrate
pnpm db:seed

info "Build packages"
pnpm --filter @aletheia/shared-contracts build
pnpm --filter @aletheia/database build
pnpm --filter @aletheia/payments build
pnpm --filter @aletheia/observability build

APP_DB_PASSWORD="${APP_DB_PASSWORD:-aletheia_app}"
export APP_DB_PASSWORD
info "Provision application database role"
node scripts/provision-app-role.mjs

DATABASE_URL_APP="$(
  node -e 'const url = new URL(process.env.DATABASE_URL); url.username = "aletheia_app"; url.password = process.env.APP_DB_PASSWORD; console.log(url.toString())'
)"
export DATABASE_URL_APP

info "Build services"
pnpm --filter @aletheia/governance-service build
pnpm --filter @aletheia/claims-service build
pnpm --filter @aletheia/payroll-service build

info "Build Go worker"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) WORKER_BIN="$DEV_DIR/worker.exe" ;;
  *) WORKER_BIN="$DEV_DIR/worker" ;;
esac
(cd services/analytics-worker-go && go build -o "$WORKER_BIN" ./cmd/worker)

start_process() {
  local name="$1"
  shift
  "$@" >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$DEV_DIR/$name.pid"
  echo "started $name pid=$(cat "$DEV_DIR/$name.pid")"
}

info "Start backend services"
start_process governance env DATABASE_URL_APP="$DATABASE_URL_APP" PORT=4101 WORKER_URL=http://127.0.0.1:4004 \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_NAMESPACE=aletheia \
  node --import ./services/governance-service/dist/instrumentation.js services/governance-service/dist/index.js
start_process claims env DATABASE_URL_APP="$DATABASE_URL_APP" PORT=4102 WORKER_URL=http://127.0.0.1:4004 \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_NAMESPACE=aletheia \
  node --import ./services/claims-service/dist/instrumentation.js services/claims-service/dist/index.js
start_process payroll env DATABASE_URL_APP="$DATABASE_URL_APP" PORT=4103 WORKER_URL=http://127.0.0.1:4004 \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_NAMESPACE=aletheia \
  node --import ./services/payroll-service/dist/instrumentation.js services/payroll-service/dist/index.js
start_process worker env DATABASE_URL="$DATABASE_URL_APP" PORT=4004 ALLOW_UNSIGNED_EVENTS=true \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_NAMESPACE=aletheia "$WORKER_BIN"

info "Start edge and web"
start_process edge pnpm --filter @aletheia/edge-gateway dev
start_process web pnpm --filter @aletheia/web dev

info "Start observability stack"
pnpm obs:up

info "Wait for health endpoints"
for port in 4101 4102 4103 4004 8787 5173 3000; do
  for _ in $(seq 1 60); do
    if curl -fsS -m 2 "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 ||
      curl -fsS -m 2 "http://localhost:$port/" >/dev/null 2>&1; then
      echo "port $port ready"
      break
    fi
    sleep 1
  done
done

cat <<'EOF'

Aletheia local demo is running.

Web:        http://localhost:5173
Edge:       http://127.0.0.1:8787
Grafana:    http://localhost:3000
Jaeger:     http://localhost:16686
Prometheus: http://localhost:9090

Accounts:   officer.bdg@aletheia.id, manager.bdg@aletheia.id,
            finance.vp@aletheia.id, hr.ops@aletheia.id,
            compliance@aletheia.id, mis.analyst@aletheia.id,
            employee.siti@aletheia.id, compliance@bpui.id
Password:   AletheiaDemo!2026
Logs:       .dev/logs
Stop:       bash scripts/dev-down.sh
EOF
