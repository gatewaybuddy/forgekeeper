#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
NET_NAME="forgekeeper-net"

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
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
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

# --- gather env vars (editable on rerun) ---
prompt_var FRONTEND_PORT 3000
prompt_var BACKEND_PORT 8000
prompt_var PYTHON_PORT 5000
prompt_var MONGO_URI mongodb://localhost:27017/forgekeeper
prompt_secret OPENAI_API_KEY ""

cat >"$ENV_FILE" <<EOF2
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
PYTHON_PORT=$PYTHON_PORT
MONGO_URI=$MONGO_URI
OPENAI_API_KEY=$OPENAI_API_KEY
EOF2

# --- ensure shared network ---
docker network inspect "$NET_NAME" >/dev/null 2>&1 || docker network create "$NET_NAME"

# --- build images ---
docker build -t forgekeeper-backend "$SCRIPT_DIR/../backend"
docker build -t forgekeeper-frontend "$SCRIPT_DIR/../frontend"
docker build -t forgekeeper-python "$SCRIPT_DIR/.."

# --- launch via compose ---
(cd "$SCRIPT_DIR/.." && "${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" up -d)
echo "✅ Forgekeeper services are up and running."
