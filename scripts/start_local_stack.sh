#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but was not found." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "❌ python is required but was not found." >&2
  exit 1
fi

npm run dev --prefix backend &
BACKEND_PID=$!
"$PYTHON" -m forgekeeper &
PYTHON_PID=$!
npm run dev --prefix frontend &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $PYTHON_PID $FRONTEND_PID" EXIT
wait
