#!/usr/bin/env bash
set -euo pipefail

# Defaults
PROJECT_DIR="${PROJECT_DIR:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
CONTAINER="${CONTAINER:-forgekeeper-vllm-core-1}"
IMAGE_REF="${IMAGE:-}"
AUTO_BUILD="${AUTO_BUILD:-1}"

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
      val="${val%\r}"; val="${val%\n}"
      if [[ ${val:0:1} == '"' && ${val: -1} == '"' ]] || [[ ${val:0:1} == "'" && ${val: -1} == "'" ]]; then
        val="${val:1:${#val}-2}"
      fi
      export "$key=$val"
    fi
  done < "$envfile"
}

load_env

if [[ -z "$IMAGE_REF" ]]; then
  if [[ -n "$VLLM_DOCKER_IMAGE" ]]; then IMAGE_REF="$VLLM_DOCKER_IMAGE"; else IMAGE_REF="vllm/vllm-openai:latest"; fi
fi

VPORT="${VLLM_CONTAINER_PORT:-8000}"
VMODEL="${VLLM_MODEL_CORE:-/models/gpt-oss-20b}"
VTP="${VLLM_TP:-1}"
VMAXLEN="${VLLM_MAX_MODEL_LEN:-32768}"
VUTIL="${VLLM_GPU_MEMORY_UTILIZATION:-0.9}"
VDTYPE="${VLLM_DTYPE:-float16}"
VMAXBTOK="${VLLM_MAX_NUM_BATCHED_TOKENS:-4096}"

expected_cmd=("--host" "0.0.0.0" "--port" "$VPORT" "--dtype" "$VDTYPE" "--model" "$VMODEL" "--served-model-name" "core" "--tensor-parallel-size" "$VTP" "--max-model-len" "$VMAXLEN" "--gpu-memory-utilization" "$VUTIL" "--max-num-batched-tokens" "$VMAXBTOK")

container_exists() { docker inspect "$CONTAINER" >/dev/null 2>&1; }
container_running() { [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" == "true" ]]; }

image_id() { docker image inspect "$1" -f '{{.Id}}' 2>/dev/null || true; }

if ! container_exists; then
  echo "info: vLLM Core container not found. Starting via compose..."
  docker compose -f "$COMPOSE_FILE" up -d --build vllm-core >/dev/null
  exit 0
fi

current_cmd_json="$(docker inspect -f '{{json .Config.Cmd}}' "$CONTAINER" 2>/dev/null || echo '[]')"
# Flatten JSON array like ["--host","0.0.0.0",...] into space-separated string for simple compare
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

if (( need_recreate )); then
  echo "info: vLLM Core config changed. Recreating via compose..."
  if [[ "${AUTO_BUILD}" == "1" ]]; then
    docker compose -f "$COMPOSE_FILE" up -d --build vllm-core >/dev/null
  else
    docker compose -f "$COMPOSE_FILE" up -d vllm-core >/dev/null
  fi
  exit 0
fi

if ! container_running; then
  echo "info: Starting existing vLLM Core container..."
  docker start "$CONTAINER" >/dev/null
  exit 0
fi

echo "ok: vLLM Core already running with matching config."
exit 0

