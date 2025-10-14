#!/usr/bin/env bash
set -euo pipefail

# Defaults
PROJECT_DIR="${PROJECT_DIR:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
CONTAINER="${CONTAINER:-forgekeeper-llama-core-1}"
IMAGE_REF="${IMAGE:-}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$(cd "$script_dir/.." && pwd)"
fi
cd "$PROJECT_DIR"

# Ensure docker network exists
if ! docker network inspect forgekeeper-net >/dev/null 2>&1; then
  docker network create forgekeeper-net >/dev/null
fi

load_env() {
  local envfile="$PROJECT_DIR/.env"
  [[ -f "$envfile" ]] || return 0
  while IFS= read -r line; do
    [[ -z "$line" || ${line:0:1} == "#" ]] && continue
    if [[ "$line" == *"="* ]]; then
      local key="${line%%=*}" val="${line#*=}"
      key="${key## }"; key="${key%% }"
      val="${val%$'\r'}"; val="${val%$'\n'}"
      if [[ ${val:0:1} == '"' && ${val: -1} == '"' ]] || [[ ${val:0:1} == "'" && ${val: -1} == "'" ]]; then
        val="${val:1:${#val}-2}"
      fi
      export "$key=$val"
    fi
  done < "$envfile"
}

load_env

if [[ -z "$IMAGE_REF" ]]; then
  if [[ -n "$LLAMA_DOCKER_IMAGE" ]]; then IMAGE_REF="$LLAMA_DOCKER_IMAGE"; else IMAGE_REF="ghcr.io/ggerganov/llama.cpp:server"; fi
fi

LPORT="${LLAMA_CONTAINER_PORT:-8000}"
LMODEL="${LLAMA_MODEL_CORE:-/models/model.gguf}"
LCTX="${LLAMA_N_CTX:-4096}"
LNGL="${LLAMA_N_GPU_LAYERS:-0}"

expected_cmd=()

container_exists() { docker inspect "$CONTAINER" >/dev/null 2>&1; }
container_running() { [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" == "true" ]]; }

image_id() { docker image inspect "$1" -f '{{.Id}}' 2>/dev/null || true; }

if ! container_exists; then
  echo "info: llama.cpp Core container not found. Starting via compose..."
  if ! docker compose -f "$COMPOSE_FILE" up -d llama-core; then
    exit 1
  fi
  if ! container_exists; then
    echo "error: llama-core container not created; verify LLAMA_DOCKER_IMAGE and model path." >&2
    exit 2
  fi
  exit 0
fi

current_cmd_json="$(docker inspect -f '{{json .Config.Cmd}}' "$CONTAINER" 2>/dev/null || echo '[]')"
flatten_json_array() {
  local j="$1"
  echo "$j" | sed -e 's/\[\|\]//g' -e 's/","/ /g' -e 's/^"\|"$//g' -e 's/\\"/"/g'
}
current_cmd_str="$(flatten_json_array "$current_cmd_json")"
expected_cmd_str="${expected_cmd[*]}"

need_recreate=0
desired_img_id="$(image_id "$IMAGE_REF")"
container_img_ref="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
if [[ -n "$desired_img_id" && -n "$container_img_ref" ]]; then
  container_img_id="$(image_id "$container_img_ref")"
  if [[ -n "$container_img_id" && "$desired_img_id" != "$container_img_id" ]]; then
    need_recreate=1
  fi
fi

if [[ "$current_cmd_str" != "$expected_cmd_str" ]]; then
  need_recreate=1
fi

if (( need_recreate )) || [[ -n "$container_img_ref" && "$container_img_ref" != *localai* ]]; then
  echo "info: llama.cpp Core config changed. Recreating via compose..."
  # Remove old container to clear stale runtime/device flags
  docker compose -f "$COMPOSE_FILE" rm -sf llama-core >/dev/null || true
  if ! docker compose -f "$COMPOSE_FILE" up -d llama-core; then
    exit 1
  fi
  if ! container_exists; then
    echo "error: llama-core container not created after recreate; check image tag and logs." >&2
    exit 2
  fi
  exit 0
fi

if ! container_running; then
  echo "info: Starting existing llama.cpp Core container..."
  if ! docker start "$CONTAINER" >/dev/null; then
    exit 1
  fi
  exit 0
fi

echo "ok: llama.cpp Core already running with matching config."
exit 0
