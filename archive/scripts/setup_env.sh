#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- profile selection ---
read -r -p "Select setup profile ([d]eveloper-single-user/[m]ulti-agent-distributed): " PROFILE
PROFILE=${PROFILE:-d}

# --- model directory ---
read -r -p "Where should models be stored? [./models]: " MODEL_DIR
MODEL_DIR=${MODEL_DIR:-./models}
mkdir -p "$MODEL_DIR"

# --- install mode ---
read -r -p "Dependency install type ([s]imple/[c]ustom): " INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-s}

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

# --- delegate to profile setup ---
if [[ "$PROFILE" =~ ^[mM] ]]; then
  ARGS=()
  if [[ ! "$INSTALL_MODE" =~ ^[cC]$ ]]; then
    ARGS+=(--defaults)
  fi
  MODEL_DIR="$MODEL_DIR" "$SCRIPT_DIR/setup_docker_env.sh" "${ARGS[@]}"
else
  MODEL_DIR="$MODEL_DIR" "$SCRIPT_DIR/setup_dev_env.sh"
fi

echo "✅ Environment setup complete. Models stored at $MODEL_DIR"

