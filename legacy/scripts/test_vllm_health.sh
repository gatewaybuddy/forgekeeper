#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${FK_CORE_API_BASE:-http://localhost:8001}
HEALTH1="$BASE_URL/healthz"
HEALTH2="$BASE_URL/health"

echo "Checking vLLM health at $HEALTH1 ..."
if curl -sfS "$HEALTH1" >/dev/null 2>&1; then
  echo "OK: $HEALTH1"
  exit 0
fi

echo "Checking vLLM health at $HEALTH2 ..."
if curl -sfS "$HEALTH2" >/dev/null 2>&1; then
  echo "OK: $HEALTH2"
  exit 0
fi

echo "vLLM not healthy yet at $BASE_URL" >&2
exit 1

