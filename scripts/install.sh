#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

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
export MODEL_DIR="$model_dir"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
fi
if grep -q '^MODEL_DIR=' "$ENV_FILE"; then
  sed -i "s|^MODEL_DIR=.*|MODEL_DIR=$model_dir|" "$ENV_FILE"
else
  echo "MODEL_DIR=$model_dir" >> "$ENV_FILE"
fi

echo
read -rp "Install Node dependencies and launch services? [y/N]: " install_node
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
