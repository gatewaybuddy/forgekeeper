#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run vLLM in a container." >&2
  exit 1
fi

IMAGE="${DOCKER_VLLM_IMAGE:-vllm/vllm-openai:latest}"
PORT="${VLLM_PORT_CORE:-8001}"

if [ "${PULL_IMAGE:-}" = "1" ]; then
  docker pull "$IMAGE"
fi

CONTAINER=forgekeeper-vllm-core
MODEL="${VLLM_MODEL_CORE:-}"
if [ -z "$MODEL" ]; then
  echo "VLLM_MODEL_CORE must be set in .env" >&2
  exit 1
fi

VOLUME_ARGS=()
MODEL_ARG="$MODEL"
if [ -d "$ROOT_DIR/models" ] && echo "$MODEL" | grep -Eq '^(\.?/)?models'; then
  REL=${MODEL#models/}
  REL=${REL#./models/}
  MODEL_ARG="/models/$REL"
  VOLUME_ARGS=(-v "$ROOT_DIR/models:/models")
fi

if docker ps -q -f name="^$CONTAINER$" >/dev/null; then
  echo "vLLM container '$CONTAINER' already running."
  exit 0
fi

if docker ps -aq -f name="^$CONTAINER$" >/dev/null; then
  docker start "$CONTAINER" >/dev/null
  echo "✅ Started existing vLLM container '$CONTAINER'."
  exit 0
fi

docker run -d --name "$CONTAINER" --gpus all -p "$PORT:8000" "${VOLUME_ARGS[@]}" \
  "$IMAGE" --model "$MODEL_ARG" \
  --max-model-len "${VLLM_MAX_MODEL_LEN:-4096}" \
  --tensor-parallel-size "${VLLM_TP:-1}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION:-0.9}" >/dev/null

echo "✅ Launched vLLM container '$CONTAINER' on http://localhost:$PORT"

