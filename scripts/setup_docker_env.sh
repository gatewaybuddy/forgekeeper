#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Path to the repository's root-level .env file
ENV_FILE="$ROOT_DIR/.env"
MODELS_DIR="${MODEL_DIR:-$ROOT_DIR/forgekeeper/models}"
mkdir -p "$MODELS_DIR"
mapfile -t MODELS < <(find "$MODELS_DIR" -maxdepth 1 -type f -printf "%f\n")
NET_NAME="forgekeeper-net"

USE_DEFAULTS=false
if [[ "${1:-}" == "--defaults" ]]; then
  USE_DEFAULTS=true
fi

# --- dependency checks ---
command -v docker >/dev/null 2>&1 || {
  echo "❌ docker not found. Install Docker Desktop first." >&2
  exit 1
}

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "❌ docker compose not found. Install Docker Desktop / docker-compose." >&2
  exit 1
fi

# --- load existing env if present ---
if ! $USE_DEFAULTS; then
  set -a
  [ -f "$ENV_FILE" ] && . "$ENV_FILE"
  set +a
else
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  if [[ -n "${MODEL_DIR:-}" ]]; then
    if grep -q '^MODEL_DIR=' "$ENV_FILE"; then
      sed -i "s|^MODEL_DIR=.*|MODEL_DIR=$MODEL_DIR|" "$ENV_FILE"
    else
      echo "MODEL_DIR=$MODEL_DIR" >> "$ENV_FILE"
    fi
  fi
  set -a
  . "$ENV_FILE"
  set +a
fi

prompt_var () {
  local var="$1" default="$2"
  read -p "$var [${!var:-$default}]: " input
  export "$var"="${input:-${!var:-$default}}"
}

prompt_secret () {
  local var="$1" default="$2"
  read -s -p "$var [${!var:-$default}]: " input
  echo
  export "$var"="${input:-${!var:-$default}}"
}

choose_model () {
  local var="$1"
  if [ ${#MODELS[@]} -eq 0 ]; then
    prompt_var "$var" "${!var}"
    return
  fi
  echo
  echo "Available models:"
  local i=1
  for m in "${MODELS[@]}"; do
    echo "[$i] $m"
    i=$((i+1))
  done
  local current="${!var}"
  local base="$(basename "${current:-}")"
  local default_index=1
  for j in "${!MODELS[@]}"; do
    if [ "${MODELS[$j]}" = "$base" ]; then
      default_index=$((j+1))
      break
    fi
  done
  read -p "$var selection [$default_index]: " sel
  sel=${sel:-$default_index}
  if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le ${#MODELS[@]} ]; then
    export "$var"="$MODELS_DIR/${MODELS[$((sel-1))]}"
  else
    export "$var"="$sel"
  fi
}

if ! $USE_DEFAULTS; then
  # --- gather env vars (editable on rerun) ---
  prompt_var FRONTEND_PORT 3000
  prompt_var BACKEND_PORT 8000
  prompt_var PYTHON_PORT 5000
  prompt_var MONGO_URI mongodb://localhost:27017/forgekeeper
  prompt_secret OPENAI_API_KEY ""
  prompt_var LLM_BACKEND vllm
  prompt_var VLLM_PORT_CORE 8001
  prompt_var VLLM_PORT_CODER 8002
  choose_model VLLM_MODEL_CORE
  choose_model VLLM_MODEL_CODER
  prompt_var VLLM_TP 1
  prompt_var VLLM_MAX_MODEL_LEN 4096
  prompt_var VLLM_GPU_MEMORY_UTILIZATION 0.9

  cat >"$ENV_FILE" <<EOF2
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
PYTHON_PORT=$PYTHON_PORT
MONGO_URI=$MONGO_URI
OPENAI_API_KEY=$OPENAI_API_KEY
LLM_BACKEND=$LLM_BACKEND
VLLM_PORT_CORE=$VLLM_PORT_CORE
VLLM_PORT_CODER=$VLLM_PORT_CODER
VLLM_MODEL_CORE=$VLLM_MODEL_CORE
VLLM_MODEL_CODER=$VLLM_MODEL_CODER
VLLM_TP=$VLLM_TP
VLLM_MAX_MODEL_LEN=$VLLM_MAX_MODEL_LEN
VLLM_GPU_MEMORY_UTILIZATION=$VLLM_GPU_MEMORY_UTILIZATION
EOF2
  if [[ -n "${MODEL_DIR:-}" ]]; then
    echo "MODEL_DIR=$MODEL_DIR" >> "$ENV_FILE"
  fi
fi

# --- ensure shared network ---
docker network inspect "$NET_NAME" >/dev/null 2>&1 || docker network create "$NET_NAME"

# --- build images ---
docker build -t forgekeeper-backend "$SCRIPT_DIR/../backend"
docker build -t forgekeeper-frontend "$SCRIPT_DIR/../frontend"
docker build -t forgekeeper-python "$SCRIPT_DIR/.."

# --- launch via compose ---
(cd "$SCRIPT_DIR/.." && "${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" up -d)
echo "✅ Forgekeeper services are up and running."
