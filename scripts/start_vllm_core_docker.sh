#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run vLLM in a container." >&2
  exit 1
fi

IMAGE="${VLLM_DOCKER_IMAGE:-${DOCKER_VLLM_IMAGE:-vllm/vllm-openai:latest}}"
PORT="${VLLM_PORT_CORE:-8001}"
CONTAINER_PORT="${VLLM_CONTAINER_PORT:-8000}"

if [ "${PULL_IMAGE:-}" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "📥 Pulling vLLM image '$IMAGE'"
  docker pull "$IMAGE" >/dev/null
fi

CONTAINER=forgekeeper-vllm-core
MODEL="${VLLM_MODEL_CORE:-}"
if [ -z "$MODEL" ]; then
  echo "VLLM_MODEL_CORE must be set in .env" >&2
  exit 1
fi

VOLUME_ARGS=()
ENV_ARGS=(-e HF_HOME=/root/.cache/huggingface -e HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface -e VLLM_LOG_DIR=/var/log/vllm)

CACHE_DIR="${VLLM_HF_CACHE_HOST_DIR:-$ROOT_DIR/volumes/vllm-cache}"
mkdir -p "$CACHE_DIR"
VOLUME_ARGS+=(-v "$CACHE_DIR:/root/.cache/huggingface")

MODEL_ARG="$MODEL"
if [ -n "${VLLM_MODELS_HOST_DIR:-}" ]; then
  mkdir -p "$VLLM_MODELS_HOST_DIR"
  VOLUME_ARGS+=(-v "$VLLM_MODELS_HOST_DIR:/models")
elif [ -d "$ROOT_DIR/models" ] && echo "$MODEL" | grep -Eq '^(\.?/)?models'; then
  REL=${MODEL#models/}
  REL=${REL#./models/}
  MODEL_ARG="/models/$REL"
  VOLUME_ARGS+=(-v "$ROOT_DIR/models:/models")
fi

LOGS_DIR="${VLLM_LOGS_HOST_DIR:-$ROOT_DIR/volumes/vllm-logs}"
mkdir -p "$LOGS_DIR"
VOLUME_ARGS+=(-v "$LOGS_DIR:/var/log/vllm")

if [ -n "${HUGGING_FACE_HUB_TOKEN:-}" ]; then
  ENV_ARGS+=(-e "HUGGING_FACE_HUB_TOKEN=$HUGGING_FACE_HUB_TOKEN")
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

docker run -d --name "$CONTAINER" \
  --runtime nvidia --gpus all --ipc=host \
  -p "$PORT:$CONTAINER_PORT" \
  "${VOLUME_ARGS[@]}" "${ENV_ARGS[@]}" \
  "$IMAGE" \
  --model "$MODEL_ARG" \
  --host 0.0.0.0 \
  --port "$CONTAINER_PORT" \
  --download-dir /root/.cache/huggingface \
  --max-model-len "${VLLM_MAX_MODEL_LEN:-4096}" \
  --tensor-parallel-size "${VLLM_TP:-1}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION:-0.9}"

echo "✅ Launched vLLM container '$CONTAINER' on http://localhost:$PORT"
