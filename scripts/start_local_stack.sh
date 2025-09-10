#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------
# Args
# ------------------------------------------------------------
DEBUG=false
CLI_ONLY=false
REQUIRE_VLLM=false
VLLM_WAIT_SECONDS=90
REQUIRE_BACKEND=false
BACKEND_WAIT_SECONDS=60
USE_INFERENCE=${FGK_USE_INFERENCE:-1}

usage() {
  cat <<'EOF'
Usage: scripts/start_local_stack.sh [options]

Starts the Forgekeeper local stack (GraphQL backend, Python agent, Vite frontend).
Ensures MongoDB is running and launches vLLM if needed.

Options:
  --debug                 Set DEBUG_MODE=true and print extra diagnostics.
  --cli-only              Start only the Python agent (no backend/frontend).
  --require-vllm          Wait for vLLM health; abort if not healthy in time.
  --vllm-wait-seconds N   Seconds to wait for vLLM when required (default 90).
  --require-backend       Wait for backend health; abort if not healthy.
  --backend-wait-seconds N  Seconds to wait for backend when required (default 60).
  --no-inference          Disable inference gateway integration for this run.
  --reset-prefs           Delete saved start preferences and re-prompt.
  -h, --help              Show this help and exit.
EOF
}

ORIG_ARGS=$#
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
    --cli-only)
      CLI_ONLY=true; shift ;;
    --no-inference)
      USE_INFERENCE=0; shift ;;
    --reset-prefs)
      rm -f "$ROOT_DIR/.forgekeeper/start_prefs.env" 2>/dev/null || true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage; exit 1 ;;
  esac
done

debug_log() { $DEBUG && printf '[DEBUG] %s\n' "$*" || true; }

# Load saved preferences if present and not overridden by args/env
PREFS_PATH="$ROOT_DIR/.forgekeeper/start_prefs.env"
if [ -f "$PREFS_PATH" ]; then
  # shellcheck disable=SC1090
  . "$PREFS_PATH"
fi

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

# Enable DEBUG_MODE and optional CLI_ONLY env
$DEBUG && export DEBUG_MODE=true || true
if $CLI_ONLY; then export CLI_ONLY=true; fi
debug_log "DEBUG_MODE=$DEBUG_MODE"

: "${VLLM_PORT_CORE:=8001}"
: "${FK_CORE_API_BASE:=http://localhost:${VLLM_PORT_CORE}}"
: "${FK_CODER_API_BASE:=${FK_CORE_API_BASE}}"
debug_log "FK_CORE_API_BASE=$FK_CORE_API_BASE"
debug_log "FK_CODER_API_BASE=$FK_CODER_API_BASE"

# ------------------------------------------------------------
# Interactive preference prompt (first run, no args, no prefs)
# ------------------------------------------------------------
if [ ${ORIG_ARGS:-0} -eq 0 ] && [ -z "${CLI_ONLY:-}" ] && [ ! -f "$PREFS_PATH" ]; then
  echo "First run setup: choose how to start Forgekeeper"
  read -r -p "Run in CLI-only mode (Python agent only)? [y/N] " ans
  case "$ans" in [Yy]*) CLI_ONLY=true ;; *) CLI_ONLY=false ;; esac
  if ! $CLI_ONLY; then
    read -r -p "Use inference gateway if available? [Y/n] " ans
    case "${ans:-Y}" in [Nn]*) USE_INFERENCE=0 ;; *) USE_INFERENCE=1 ;; esac
    read -r -p "Require vLLM health before continuing? [y/N] " ans
    case "$ans" in [Yy]*) REQUIRE_VLLM=true ;; *) REQUIRE_VLLM=false ;; esac
    read -r -p "Require backend health before continuing? [y/N] " ans
    case "$ans" in [Yy]*) REQUIRE_BACKEND=true ;; *) REQUIRE_BACKEND=false ;; esac
  fi
  read -r -p "Save these as defaults to .forgekeeper/start_prefs.env? [y/N] " save
  if [[ "$save" =~ ^[Yy]$ ]]; then
    mkdir -p "$ROOT_DIR/.forgekeeper"
    {
      echo "# Auto-generated preferences for start_local_stack.sh"
      echo "CLI_ONLY=$CLI_ONLY"
      echo "FGK_USE_INFERENCE=${USE_INFERENCE:-1}"
      echo "REQUIRE_VLLM=$REQUIRE_VLLM"
      echo "VLLM_WAIT_SECONDS=${VLLM_WAIT_SECONDS}"
      echo "REQUIRE_BACKEND=$REQUIRE_BACKEND"
      echo "BACKEND_WAIT_SECONDS=${BACKEND_WAIT_SECONDS}"
    } > "$PREFS_PATH"
    echo "Saved defaults to $PREFS_PATH"
  fi
fi

# ------------------------------------------------------------
# Inference Gateway integration (skipped in CLI-only mode)
# ------------------------------------------------------------
if [ "$USE_INFERENCE" != "0" ] && ! $CLI_ONLY; then
  : "${FGK_INFER_URL:=http://localhost:8080}"
  : "${FGK_INFER_KEY:=dev-key}"
  export FK_CORE_API_BASE="$FGK_INFER_URL"
  export FK_CODER_API_BASE="$FGK_INFER_URL"
  export FK_API_KEY="$FGK_INFER_KEY"
  debug_log "Using inference gateway at $FGK_INFER_URL"

  # Health check and optional auto-start via Makefile if compose is available
  if ! curl -sSf "${FGK_INFER_URL%/}/healthz" >/dev/null 2>&1; then
    echo "ℹ️ Inference gateway not responding at ${FGK_INFER_URL%/}/healthz"
    if command -v make >/dev/null 2>&1; then
      read -r -p "Start local inference stack now? [Y/n] " reply
      reply=${reply:-Y}
      if [[ $reply =~ ^[Yy]$ ]]; then
        make inference-up || true
        # wait briefly for health
        deadline=$((SECONDS+60))
        until curl -sSf "${FGK_INFER_URL%/}/healthz" >/dev/null 2>&1 || [ $SECONDS -ge $deadline ]; do
          sleep 2
        done
      fi
    else
      echo "⚠️ 'make' not found; start inference stack manually (see DOCS_INFERENCE.md)." >&2
    fi
  fi

  # Model selection prompt if not set in env
  select_model() {
    local var_name="$1"; local current_val="${!var_name:-}"
    if [ -n "$current_val" ]; then return 0; fi
    echo "Select model for $var_name:"
    echo "  [1] mistralai/Mistral-7B-Instruct"
    echo "  [2] WizardLM/WizardCoder-15B-V1.0"
    echo "  [3] gpt-oss-20b-harmony"
    echo "  [4] Custom (enter HF id/name)"
    read -r -p "Enter choice [1-4]: " choice
    case "$choice" in
      1|"" ) export "$var_name"="mistralai/Mistral-7B-Instruct" ;;
      2) export "$var_name"="WizardLM/WizardCoder-15B-V1.0" ;;
      3) export "$var_name"="gpt-oss-20b-harmony" ;;
      4) read -r -p "Enter model id: " mid; export "$var_name"="$mid" ;;
      *) export "$var_name"="mistralai/Mistral-7B-Instruct" ;;
    esac
  }

  select_model VLLM_MODEL_CORE
  # Prefer WizardCoder for coder if unset
  if [ -z "${VLLM_MODEL_CODER:-}" ]; then
    read -r -p "Use WizardCoder for coder model? [Y/n] " reply
    reply=${reply:-Y}
    if [[ $reply =~ ^[Yy]$ ]]; then
      export VLLM_MODEL_CODER="WizardLM/WizardCoder-15B-V1.0"
    else
      export VLLM_MODEL_CODER="$VLLM_MODEL_CORE"
    fi
  fi
fi

# Ensure MongoDB is available before starting services (skip in CLI-only)
if $CLI_ONLY; then
  debug_log "CLI-only mode: skipping MongoDB checks"
elif pgrep mongod >/dev/null 2>&1; then
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

# Ensure vLLM is running; launch if health check fails (skip in CLI-only)
if ! $CLI_ONLY; then
VLLM_HEALTH="${FK_CORE_API_BASE%/}/healthz"
if ! curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1; then
  echo "⚙️  Launching vLLM core server..."
  mkdir -p logs
  if python - <<'PY' >/dev/null 2>&1; then
import vllm
PY
  then
    nohup bash scripts/run_vllm_core.sh > logs/vllm_core.out 2> logs/vllm_core.err &
    VLLM_PID=$!
    echo "📝 vLLM logs: logs/vllm_core.out, logs/vllm_core.err"
  elif command -v docker >/dev/null 2>&1; then
    echo "🐳 Starting dockerized vLLM (forgekeeper-vllm-core)..."
    bash scripts/start_vllm_core_docker.sh > logs/vllm_core.out 2> logs/vllm_core.err || true
    echo "👉 View logs: docker logs -f forgekeeper-vllm-core"
  else
    echo "⚠️ vLLM not available in Python and docker not found; continuing without LLM." >&2
  fi
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

if $CLI_ONLY; then
  echo "🚀 CLI-only mode: starting Python agent only"
  "$PYTHON" -m forgekeeper
else
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
fi
