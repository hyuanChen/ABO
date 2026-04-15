#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=8765
FRONTEND_PORT=1420

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti "TCP:${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "[fresh-dev] Stopping listeners on port ${port}: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti "TCP:${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      echo "[fresh-dev] Force stopping listeners on port ${port}: ${pids}"
      # shellcheck disable=SC2086
      kill -9 ${pids} 2>/dev/null || true
    fi
  fi
}

pkill -f "scripts/dev_abo.py" 2>/dev/null || true
pkill -f "python -m abo.main" 2>/dev/null || true
stop_port "${BACKEND_PORT}"
stop_port "${FRONTEND_PORT}"

cd "${ROOT_DIR}"
exec npm run tauri dev
