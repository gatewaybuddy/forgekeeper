#!/usr/bin/env bash

# Usage: install.sh [--defaults|--yes] [--help|-h]
#   --defaults, --yes  Run non-interactively with default choices
#   -h, --help         Display this help message and exit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

usage() {
  cat <<'EOF'
Usage: install.sh [--defaults|--yes] [--help|-h]

Options:
  --defaults, --yes  Run non-interactively with default choices
  -h, --help         Display this help message and exit
EOF
}

DEFAULTS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)

      usage
      exit 0
      ;;
    --defaults|--yes)
      DEFAULTS=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done


if ! command -v mongod >/dev/null 2>&1; then
  start_docker_mongo=""
  if $DEFAULTS; then
    start_docker_mongo="y"
  else
    read -rp "mongod not found. Start Dockerized MongoDB container? [Y/n]: " start_docker_mongo
  fi
  if [[ "$start_docker_mongo" =~ ^([Yy]|)$ ]]; then
    if ! command -v docker >/dev/null 2>&1; then
      echo "❌ docker is required to run MongoDB container." >&2
      exit 1
    fi
    if [ -n "$(docker ps -aq -f name=^forgekeeper-mongo$)" ]; then
      if [ -n "$(docker ps -q -f name=^forgekeeper-mongo$)" ]; then
        echo "MongoDB container 'forgekeeper-mongo' already running."
      else
        docker start forgekeeper-mongo >/dev/null
        echo "✅ Started existing MongoDB container 'forgekeeper-mongo'."
      fi
    else
      docker run -d --name forgekeeper-mongo -p 27017:27017 mongo:6 >/dev/null
      echo "✅ Started MongoDB container 'forgekeeper-mongo'."
    fi
  else
    echo "⚠️ mongod not found. Install MongoDB manually." >&2
  fi
fi

if $DEFAULTS; then
  choice="1"
  model_dir="./models"
  install_node="y"

else
  echo "Select setup type:"
  echo "[1] Local single-user"
  echo "[2] Multi-agent distributed (Docker)"
  choice=""
  while true; do
    read -rp "Enter choice [1-2]: " choice
    case "$choice" in
      1|2)
        break
        ;;
      *)
        echo "Invalid choice. Please enter 1 or 2."
        ;;
    esac
  done


  read -rp "Model storage directory [./models]: " model_dir
  model_dir=${model_dir:-./models}
  install_node=""
  echo
  read -rp "Install Node dependencies and launch services? [y/N]: " install_node
fi

export MODEL_DIR="$model_dir"

if [ "$choice" = "1" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  fi
  if grep -q '^MODEL_DIR=' "$ENV_FILE"; then
    sed -i "s|^MODEL_DIR=.*|MODEL_DIR=$model_dir|" "$ENV_FILE"
  else
    echo "MODEL_DIR=$model_dir" >> "$ENV_FILE"
  fi
fi

if [[ "$install_node" =~ ^[Yy]$ ]]; then
  # Ensure vLLM Python package is available (best-effort)
  if command -v python3 >/dev/null 2>&1; then PY=python3; elif command -v python >/dev/null 2>&1; then PY=python; else PY=""; fi
  HAVE_VLLM=0
  if [ -n "$PY" ]; then
    if "$PY" - <<'PY' >/dev/null 2>&1; then
import vllm
PY
      HAVE_VLLM=1
    else
      echo "📦 Installing vLLM Python package (if compatible with your environment)..."
      "$PY" -m pip install -U vllm || echo "⚠️ vLLM installation failed. Will try Dockerized vLLM if available." >&2
      if "$PY" - <<'PY' >/dev/null 2>&1; then
import vllm
PY
        HAVE_VLLM=1
      fi
    fi
  fi
  if [ $HAVE_VLLM -eq 0 ] && command -v docker >/dev/null 2>&1; then
    echo "🐳 Pulling vLLM Docker image (vllm/vllm-openai:latest)..."
    docker pull vllm/vllm-openai:latest || echo "⚠️ Failed to pull vLLM image. Install Docker Desktop with GPU support." >&2
  elif [ $HAVE_VLLM -eq 0 ]; then
    echo "⚠️ vLLM not available and Docker not found. Install Docker Desktop (with NVIDIA GPU support) or install vLLM in Python environment." >&2
  fi

  if [ "$choice" = "2" ]; then
    if $DEFAULTS; then
      "$SCRIPT_DIR/setup_docker_env.sh" --defaults
    else
      "$SCRIPT_DIR/setup_docker_env.sh"
    fi
  else
    "$SCRIPT_DIR/setup_dev_env.sh" --launch-services
  fi
else
  echo "Skipping dependency installation and service launch."
fi

echo "To start the stack later, run $SCRIPT_DIR/start_local_stack.sh"
