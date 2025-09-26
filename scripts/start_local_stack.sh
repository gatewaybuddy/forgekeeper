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
REQUIRE_LLM=false
LLM_WAIT_SECONDS=90
REQUIRE_BACKEND=false
BACKEND_WAIT_SECONDS=60
LLM_BACKEND=${FGK_LLM_BACKEND:-vllm}
CONVERSATION=false
USE_INFERENCE=${FGK_USE_INFERENCE:-1}

usage() {
  cat <<'EOF'
Usage: scripts/start_local_stack.sh [options]

Starts the Forgekeeper local stack (GraphQL backend, Python agent, Vite frontend).
Ensures MongoDB is running and launches the selected LLM backend if needed.

Options:
  --debug                 Set DEBUG_MODE=true and print extra diagnostics.
  --cli-only              Start only the Python agent (no backend/frontend).
  --backend BACKEND       LLM backend to launch [vllm|triton] (default vllm).
  --require-llm           Wait for LLM health; abort if not healthy in time.
  --llm-wait-seconds N    Seconds to wait for LLM when required (default 90).
  --require-backend       Wait for backend health; abort if not healthy.
  --backend-wait-seconds N  Seconds to wait for backend when required (default 60).
  --no-inference          Disable inference gateway integration for this run.
  --reset-prefs           Delete saved start preferences and re-prompt.
  --conversation          Run agent in duet conversation mode (passes --conversation).
  -h, --help              Show this help and exit.
EOF
}

ORIG_ARGS=$#
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      DEBUG=true; shift ;;
    --backend)
      LLM_BACKEND="${2:-vllm}"; shift 2 ;;
    --require-llm|--require-vllm)
      REQUIRE_LLM=true; shift ;;
    --llm-wait-seconds|--vllm-wait-seconds)
      LLM_WAIT_SECONDS="${2:-90}"; shift 2 ;;
    --require-backend)
      REQUIRE_BACKEND=true; shift ;;
    --backend-wait-seconds)
      BACKEND_WAIT_SECONDS="${2:-60}"; shift 2 ;;
    --cli-only)
      CLI_ONLY=true; shift ;;
    --conversation)
      CONVERSATION=true; shift ;;
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

: "${DATABASE_URL:=mongodb://localhost:27017/forgekeeper?directConnection=true&retryWrites=false}"
export DATABASE_URL

: "${VLLM_PORT_CORE:=8001}"
: "${OPENAI_BASE_URL:=http://localhost:${VLLM_PORT_CORE}/v1}"
: "${OPENAI_API_KEY:=dev-key}"
export OPENAI_BASE_URL OPENAI_API_KEY

: "${FK_CORE_API_BASE:=http://localhost:${VLLM_PORT_CORE}}"
: "${FK_CODER_API_BASE:=${FK_CORE_API_BASE}}"
debug_log "FK_CORE_API_BASE=$FK_CORE_API_BASE"
debug_log "FK_CODER_API_BASE=$FK_CODER_API_BASE"
export FGK_LLM_BACKEND="$LLM_BACKEND"

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
    read -r -p "Select LLM backend [vllm/triton] (default vllm): " ans
    case "${ans:-vllm}" in
      [Tt]riton|triton) LLM_BACKEND=triton ;;
      *) LLM_BACKEND=vllm ;;
    esac
    read -r -p "Require LLM health before continuing? [y/N] " ans
    case "$ans" in [Yy]*) REQUIRE_LLM=true ;; *) REQUIRE_LLM=false ;; esac
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
      echo "REQUIRE_LLM=$REQUIRE_LLM"
      echo "LLM_WAIT_SECONDS=${LLM_WAIT_SECONDS}"
      echo "LLM_BACKEND=$LLM_BACKEND"
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

  if [ "$LLM_BACKEND" = "vllm" ]; then
    # Model selection prompt if not set in env
    select_model() {
      local var_name="$1"; local current_val="${!var_name:-}"
      if [ -n "$current_val" ]; then return 0; fi
      echo "Select model for $var_name:"
      echo "  [1] oss-gpt-20b (default)"
      echo "  [2] mistralai/Mistral-7B-Instruct"
      echo "  [3] WizardLM/WizardCoder-15B-V1.0"
      echo "  [4] Custom (enter HF id/name)"
      read -r -p "Enter choice [1-4]: " choice
      case "$choice" in
        1|"" ) export "$var_name"="oss-gpt-20b" ;;
        2) export "$var_name"="mistralai/Mistral-7B-Instruct" ;;
        3) export "$var_name"="WizardLM/WizardCoder-15B-V1.0" ;;
        4) read -r -p "Enter model id: " mid; export "$var_name"="$mid" ;;
        *) export "$var_name"="oss-gpt-20b" ;;
      esac
    }

    select_model VLLM_MODEL_CORE
    if [ -n "${VLLM_MODEL_CORE:-}" ]; then
      echo "Using core model: $VLLM_MODEL_CORE"
    fi
    # Prefer WizardCoder for coder if unset
    if [ -z "${VLLM_MODEL_CODER:-}" ]; then
      read -r -p "Use WizardCoder for coder model? [Y/n] " reply
      reply=${reply:-Y}
      if [[ $reply =~ ^[Yy]$ ]]; then
        export VLLM_MODEL_CODER="WizardLM/WizardCoder-15B-V1.0"
        echo "Using coder model: $VLLM_MODEL_CODER"
      else
        if [ -n "${VLLM_MODEL_CORE:-}" ]; then
          export VLLM_MODEL_CODER="$VLLM_MODEL_CORE"
        else
          export VLLM_MODEL_CODER="oss-gpt-20b"
        fi
        echo "WizardCoder disabled; using coder model: $VLLM_MODEL_CODER"
      fi
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

# Ensure LLM backend is running; launch if health check fails (skip in CLI-only)
if ! $CLI_ONLY; then
if [ "$LLM_BACKEND" = "triton" ]; then
  : "${TRITON_URL:=http://localhost:8000}"
  : "${TRITON_MODEL:=gpt-oss-20b}"
  export TRITON_URL TRITON_MODEL
  TRITON_HEALTH="${TRITON_URL%/}/v2/health/ready"
  if ! curl -sSf "$TRITON_HEALTH" >/dev/null 2>&1; then
    echo "⚙️  Launching Triton server..."
    mkdir -p logs
    if command -v tritonllm >/dev/null 2>&1; then
      nohup tritonllm --checkpoint "$TRITON_MODEL" > logs/triton.out 2> logs/triton.err &
      TRITON_PID=$!
    else
      nohup "$PYTHON" -m tritonllm.gpt_oss.responses_api.serve --checkpoint "$TRITON_MODEL" > logs/triton.out 2> logs/triton.err &
      TRITON_PID=$!
    fi
    echo "📝 Triton logs: logs/triton.out, logs/triton.err"
    local_wait=$LLM_WAIT_SECONDS
    $REQUIRE_LLM || local_wait=$(( local_wait < 10 ? local_wait : 10 ))
    deadline=$((SECONDS+local_wait))
    until curl -sSf "$TRITON_HEALTH" >/dev/null 2>&1 || [ $SECONDS -ge $deadline ]; do
      sleep 2
    done
    if curl -sSf "$TRITON_HEALTH" >/dev/null 2>&1; then
      echo "✅ Triton is healthy at $TRITON_HEALTH"
    else
      if $REQUIRE_LLM; then
        echo "❌ Triton health check did not pass at $TRITON_HEALTH; aborting due to --require-llm" >&2
        exit 1
      else
        echo "⚠️ Triton not healthy yet at $TRITON_HEALTH; continuing to launch other services" >&2
      fi
    fi
  fi
else
  VLLM_HEALTH="${FK_CORE_API_BASE%/}/healthz"
  if ! curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1; then
    echo "⚙️  Launching vLLM core server..."
    mkdir -p logs
    if python - <<'PY' >/dev/null 2>&1; then
import vllm
PY
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
    local_wait=$LLM_WAIT_SECONDS
    $REQUIRE_LLM || local_wait=$(( local_wait < 10 ? local_wait : 10 ))
    deadline=$((SECONDS+local_wait))
    until curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1 || [ $SECONDS -ge $deadline ]; do
      sleep 2
    done
    if curl -sSf "$VLLM_HEALTH" >/dev/null 2>&1; then
      echo "✅ vLLM is healthy at $VLLM_HEALTH"
    else
      if $REQUIRE_LLM; then
        echo "❌ vLLM health check did not pass at $VLLM_HEALTH; aborting due to --require-llm" >&2
        exit 1
      else
        echo "⚠️ vLLM not healthy yet at $VLLM_HEALTH; continuing to launch other services" >&2
      fi
    fi
  fi
fi
fi

if $CLI_ONLY; then
  echo "🚀 CLI-only mode: starting Python agent only"
  "$PYTHON" -m forgekeeper_v2.cli run --mode single
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

  if $CONVERSATION; then
    "$PYTHON" -m forgekeeper_v2.cli run --mode duet &
  else
    "$PYTHON" -m forgekeeper_v2.cli run --mode single &
  fi
  PYTHON_PID=$!

  npm run dev --prefix frontend &
  FRONTEND_PID=$!

  trap 'kill "$BACKEND_PID" "$PYTHON_PID" "$FRONTEND_PID" ${VLLM_PID:-} ${TRITON_PID:-} 2>/dev/null || true' EXIT
  wait
fi

# Export conversation flag for downstream launchers
if $CONVERSATION; then export FK_RUN_CONVERSATION=1; fi
