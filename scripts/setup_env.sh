#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- installation mode ---
read -r -p "Select install type ([s]imple/[c]ustom): " INSTALL_TYPE
INSTALL_TYPE=${INSTALL_TYPE:-s}

# --- model directory ---
read -r -p "Where should models be stored? [./models]: " MODEL_DIR
MODEL_DIR=${MODEL_DIR:-./models}
mkdir -p "$MODEL_DIR"

# --- copy environment file ---
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Copied .env.example to .env"
else
  echo "ℹ️ .env already exists; skipping copy"
fi

if grep -q '^MODEL_DIR=' .env 2>/dev/null; then
  sed -i.bak "s|^MODEL_DIR=.*|MODEL_DIR=$MODEL_DIR|" .env
  rm -f .env.bak
else
  echo "MODEL_DIR=$MODEL_DIR" >> .env
fi

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

INSTALL_BACKEND=Y
INSTALL_FRONTEND=Y

if [[ "$INSTALL_TYPE" =~ ^[cC]$ ]]; then
  read -r -p "Install backend dependencies? [Y/n]: " INSTALL_BACKEND
  INSTALL_BACKEND=${INSTALL_BACKEND:-Y}
  read -r -p "Install frontend dependencies? [Y/n]: " INSTALL_FRONTEND
  INSTALL_FRONTEND=${INSTALL_FRONTEND:-Y}
fi

if [[ ! "$INSTALL_BACKEND" =~ ^[nN]$ ]]; then
  npm install --prefix backend
  (cd backend && npx prisma generate)
fi

if [[ ! "$INSTALL_FRONTEND" =~ ^[nN]$ ]]; then
  npm install --prefix frontend
fi

echo "✅ Environment setup complete. Models stored at $MODEL_DIR"
