#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------
# Args
# ------------------------------------------------------------
DEBUG=false
REQUIRE_VLLM=false
VLLM_WAIT_SECONDS=90
REQUIRE_BACKEND=false
BACKEND_WAIT_SECONDS=60

usage() {
  cat <<'EOF'
Usage: scripts/start_local_stack.sh [options]

Starts the Forgekeeper local stack (GraphQL backend, Python agent, Vite frontend).
Ensures MongoDB is running and launches vLLM if needed.

Options:
  --debug                 Set DEBUG_MODE=true and print extra diagnostics.
  --require-vllm          Wait for vLLM health; abort if not healthy in time.
  --vllm-wait-seconds N   Seconds to wait for vLLM when required (default 90).
  --require-backend       Wait for backend health; abort if not healthy.
  --backend-wait-seconds N  Seconds to wait for backend when required (default 60).
  -h, --help              Show this help and exit.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      DEBUG=true; shift ;;
    --require-vllm)
      REQUIRE_VLLM=true; shift ;;
    --vllm-wait-seconds)
      VLLM_WAIT_SECONDS="${2:-90}"; shift 2 ;;
    --require-backend)
      REQUIRE_BACKEND=true; shift ;;
    --backend-wait-seconds)
      BACKEND_WAIT_SECONDS="${2:-60}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage; exit 1 ;;
  esac
done

debug_log() { $DEBUG && printf '[DEBUG] %s\n' "$*" || true; }

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but was not found." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "❌ python is required but was not found." >&2
  exit 1
fi

# Load .env
if [ -f "$ROOT_DIR/.env" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    if printf '%s' "$line" | grep -q '='; then
      key=${line%%=*}
      val=${line#*=}
      export "$key=$val"
    fi
  done < "$ROOT_DIR/.env"
fi

# Enable DEBUG_MODE
$DEBUG && export DEBUG_MODE=true || true
debug_log "DEBUG_MODE=$DEBUG_MODE"

: "${VLLM_PORT_CORE:=8001}"
: "${FK_CORE_API_BASE:=http://localhost:${VLLM_PORT_CORE}}"
: "${FK_CODER_API_BASE:=${FK_CORE_API_BASE}}"
debug_log "FK_CORE_API_BASE=$FK_CORE_API_BASE"
debug_log "FK_CODER_API_BASE=$FK_CODER_API_BASE"

# Ensure MongoDB is available before starting services
if pgrep mongod >/dev/null 2>&1; then
  echo "✅ MongoDB is running."
elif command -v docker >/dev/null 2>&1 && \
     docker ps --format '{{.Names}}' | grep -q '^forgekeeper-mongo$'; then
  echo "ℹ️ forgekeeper-mongo container is already running."
else
  echo "⚠️ MongoDB not detected."
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker is not available. Cannot start MongoDB." >&2
    exit 1
  fi
  if docker ps -a --format '{{.Names}}' | grep -q '^forgekeeper-mongo$'; then
    read -r -p "Start existing forgekeeper-mongo container? [Y/n] " reply
    reply=${reply:-Y}
    if [[ $reply =~ ^[Yy]$ ]]; then
      if ! docker start forgekeeper-mongo >/dev/null 2>&1; then
        echo "❌ Failed to start forgekeeper-mongo container." >&2
        exit 1
      fi
    else
      echo "⚠️ MongoDB is required. Exiting." >&2
      exit 1
    fi
  else
    read -r -p "Run new forgekeeper-mongo container? [Y/n] " reply
    reply=${reply:-Y}
    if [[ $reply =~ ^[Yy]$ ]]; then
      if ! docker run -d --name forgekeeper-mongo -p 27017:27017 mongo:latest >/dev/null 2>&1; then
        echo "❌ Failed to launch MongoDB Docker container." >&2
        exit 1
      fi
    else
      echo "⚠️ MongoDB is required. Exiting." >&2
      exit 1
    fi
  fi
fi

# Ensure vLLM is running; launch if health check fails
VLLM_HEALTH="${FK_CORE_API_BASE%/}/healthz"
if ! curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1; then
  echo "⚙️  Launching vLLM core server..."
  mkdir -p logs
  nohup bash scripts/run_vllm_core.sh > logs/vllm_core.out 2> logs/vllm_core.err &
  VLLM_PID=$!
  # Wait for health (strict or non-strict)
  local_wait=$VLLM_WAIT_SECONDS
  $REQUIRE_VLLM || local_wait=$(( local_wait < 10 ? local_wait : 10 ))
  deadline=$((SECONDS+local_wait))
  until curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1 || [ $SECONDS -ge $deadline ]; do
    sleep 2
  done
  if curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1; then
    echo "✅ vLLM is healthy at $VLLM_HEALTH"
  else
    if $REQUIRE_VLLM; then
      echo "❌ vLLM health check did not pass at $VLLM_HEALTH; aborting due to --require-vllm" >&2
      exit 1
    else
      echo "⚠️ vLLM not healthy yet at $VLLM_HEALTH; continuing to launch other services" >&2
    fi
  fi
fi

# Start backend first
npm run dev --prefix backend &
BACKEND_PID=$!

# Wait for backend health before starting frontend (strict or non-strict)
BACKEND_PORT=${PORT:-4000}
BACKEND_HEALTH="http://localhost:${BACKEND_PORT}/health"
local_b_wait=$BACKEND_WAIT_SECONDS
$REQUIRE_BACKEND || local_b_wait=$(( local_b_wait < 10 ? local_b_wait : 10 ))
deadline=$((SECONDS+local_b_wait))
until curl -sSf "$BACKEND_HEALTH" >/dev/null 2>&1 || [ $SECONDS -ge $deadline ]; do
  sleep 1
done
if curl -sSf "$BACKEND_HEALTH" >/dev/null 2>&1; then
  echo "✅ Backend is healthy at $BACKEND_HEALTH"
else
  if $REQUIRE_BACKEND; then
    echo "❌ Backend did not become healthy at $BACKEND_HEALTH; aborting due to --require-backend" >&2
    exit 1
  else
    echo "⚠️ Backend not healthy yet at $BACKEND_HEALTH; continuing to start other services" >&2
  fi
fi

"$PYTHON" -m forgekeeper &
PYTHON_PID=$!

npm run dev --prefix frontend &
FRONTEND_PID=$!

trap 'kill "$BACKEND_PID" "$PYTHON_PID" "$FRONTEND_PID" ${VLLM_PID:-} 2>/dev/null || true' EXIT
wait
