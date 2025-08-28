#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

RUN_SERVICES=false
while [[ ${1-} ]]; do
  case "$1" in
    --launch-services)
      RUN_SERVICES=true
      shift
      ;;
    -h|--help)
      echo "Usage: setup_dev_env.sh [--launch-services]" >&2
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: setup_dev_env.sh [--launch-services]" >&2
      exit 1
      ;;
  esac
done

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "❌ python is required but was not found." >&2
  exit 1
fi

if [ ! -d ".venv" ]; then
  "$PYTHON" -m venv .venv
fi

source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

if command -v npm >/dev/null 2>&1; then
  npm install --prefix backend
  (cd backend && npx prisma generate)
  npm install --prefix frontend
else
  echo "⚠️ npm not found; skipping Node dependency installation." >&2
fi

echo "✅ Development environment setup complete."

if $RUN_SERVICES; then
  echo "🚀 Launching development services..."
  npm run dev --prefix backend &
  BACKEND_PID=$!
  "$PYTHON" -m forgekeeper &
  PYTHON_PID=$!
  npm run dev --prefix frontend &
  FRONTEND_PID=$!
  trap "kill $BACKEND_PID $PYTHON_PID $FRONTEND_PID" EXIT
  wait
fi
