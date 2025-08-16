#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- tool checks ---
if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "❌ python is required but was not found." >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "❌ node is required but was not found." >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "❌ npm is required but was not found." >&2
  exit 1
}

# --- install dependencies ---
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r requirements.txt

npm install --prefix backend
(cd backend && npx prisma generate)
npm install --prefix frontend

# --- copy environment file ---
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Copied .env.example to .env"
else
  echo "ℹ️ .env already exists; skipping copy"
fi

echo "✅ Environment setup complete."
