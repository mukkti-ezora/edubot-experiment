#!/usr/bin/env bash
# Runs the EduBot MVP stack locally: 5 domain services + gateway + web.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
cd "$ROOT"

# Load .env if present (exports are additive; existing env wins).
if [ -f .env ]; then set -a; . ./.env; set +a; fi

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' INT TERM EXIT

$PY -m uvicorn services.identity.main:app --port 8001 &
pids+=($!)
$PY -m uvicorn services.tenancy.main:app --port 8002 &
pids+=($!)
$PY -m uvicorn services.users.main:app --port 8003 &
pids+=($!)
$PY -m uvicorn services.rbac.main:app --port 8004 &
pids+=($!)
$PY -m uvicorn services.audit.main:app --port 8005 &
pids+=($!)
$PY -m uvicorn services.gateway.main:app --port 8080 &
pids+=($!)
(cd apps/web && npm run dev) &
pids+=($!)

echo "EduBot dev stack:"
echo "  web      http://localhost:5173"
echo "  gateway  http://localhost:8080/api/v1"
wait
