#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
DEV_DIR="$ROOT_DIR/.dev"

kill_pid() {
  local pid="$1"
  [[ -z "$pid" ]] && return
  if kill -0 "$pid" >/dev/null 2>&1; then
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*) taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true ;;
      *) kill "$pid" >/dev/null 2>&1 || true ;;
    esac
  fi
}

if [[ -d "$DEV_DIR" ]]; then
  for pid_file in "$DEV_DIR"/*.pid; do
    [[ -e "$pid_file" ]] || continue
    kill_pid "$(cat "$pid_file")"
    rm -f "$pid_file"
  done
fi

kill_port() {
  local port="$1"
  local pids=""
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      pids="$(netstat -ano 2>/dev/null | grep LISTENING | grep ":$port " | awk '{print $5}' | sort -u || true)"
      if [[ -n "$pids" ]]; then
        while read -r pid; do
          [[ -n "$pid" ]] && taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
        done <<<"$pids"
      fi
      ;;
    *)
      pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
      if [[ -n "$pids" ]]; then
        while read -r pid; do
          [[ -n "$pid" ]] && kill_pid "$pid"
        done <<<"$pids"
      fi
      ;;
  esac
}

for port in 4101 4102 4103 4004 8787 5173; do
  kill_port "$port"
done
if [[ "$(uname -s)" =~ MINGW|MSYS|CYGWIN ]]; then
  powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'wrangler.*dev.*8787' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1 || true
fi

docker compose --profile observability stop otel-collector jaeger prometheus grafana >/dev/null 2>&1 || true
docker stop aletheia-postgres-test >/dev/null 2>&1 || true
docker compose --profile local-db stop postgres >/dev/null 2>&1 || true

echo "Aletheia local demo stopped. Data volumes are preserved."
