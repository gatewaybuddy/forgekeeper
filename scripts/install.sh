#!/usr/bin/env bash
# Usage: install.sh [--defaults|--yes] [--help]
#   --defaults, --yes   Use default answers for all prompts
#   --help              Show this help message
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--defaults|--yes] [--help]

Options:
  --defaults, --yes   Use default answers for all prompts
  --help              Show this help message and exit
EOF
}

USE_DEFAULTS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help)
      usage
      exit 0
      ;;
    --defaults|--yes)
      USE_DEFAULTS=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if (( USE_DEFAULTS )); then
  choice="1"
  echo "Using default setup type: Local single-user"
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
fi

if (( USE_DEFAULTS )); then
  model_dir="./models"
  echo "Using default model storage directory: $model_dir"
else
  read -rp "Model storage directory [./models]: " model_dir
  model_dir=${model_dir:-./models}
fi
export MODEL_DIR="$model_dir"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
fi
if grep -q '^MODEL_DIR=' "$ENV_FILE"; then
  sed -i "s|^MODEL_DIR=.*|MODEL_DIR=$model_dir|" "$ENV_FILE"
else
  echo "MODEL_DIR=$model_dir" >> "$ENV_FILE"
fi

if (( USE_DEFAULTS )); then
  install_node="n"
else
  echo
  read -rp "Install Node dependencies and launch services? [y/N]: " install_node
fi

if [[ "$install_node" =~ ^[Yy]$ ]]; then
  if [ "$choice" = "2" ]; then
    "$SCRIPT_DIR/setup_docker_env.sh" --defaults
    if grep -q '^MODEL_DIR=' "$ENV_FILE"; then
      sed -i "s|^MODEL_DIR=.*|MODEL_DIR=$model_dir|" "$ENV_FILE"
    else
      echo "MODEL_DIR=$model_dir" >> "$ENV_FILE"
    fi
  else
    "$SCRIPT_DIR/setup_dev_env.sh"
  fi
else
  echo "Skipping dependency installation and service launch."
fi
