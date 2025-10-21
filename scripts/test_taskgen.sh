#!/usr/bin/env bash
set -euo pipefail

# Simple smoke test for TGT suggestions endpoint.
# Usage: (from repo root)
#   TASKGEN_ENABLED=1 FRONTEND_PORT=${FRONTEND_PORT:-3000} bash forgekeeper/scripts/test_taskgen.sh [window_min]

PORT=${FRONTEND_PORT:-3000}
WIN=${1:-60}

echo "Hitting http://localhost:${PORT}/api/tasks/suggest?window_min=${WIN}"
set +e
resp=$(curl -s -w "\n%{http_code}" "http://localhost:${PORT}/api/tasks/suggest?window_min=${WIN}")
code=$(echo "$resp" | tail -n1)
body=$(echo "$resp" | sed '$d')
set -e

if [[ "$code" != "200" ]]; then
  echo "Request failed with HTTP $code" >&2
  echo "$body" | sed -e 's/\\n/\n/g'
  exit 1
fi

echo "$body" | jq -r '.items | if length>0 then "Suggested tasks:" else "No tasks suggested" end'
echo "$body" | jq '.items[] | {id, title, severity}' 2>/dev/null || true

