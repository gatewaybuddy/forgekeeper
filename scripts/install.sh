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
  if [ "$choice" = "2" ]; then
    if $DEFAULTS; then
      "$SCRIPT_DIR/setup_docker_env.sh" --defaults
    else
      "$SCRIPT_DIR/setup_docker_env.sh"
    fi
  else
    "$SCRIPT_DIR/setup_dev_env.sh"
  fi
else
  echo "Skipping dependency installation and service launch."
fi
