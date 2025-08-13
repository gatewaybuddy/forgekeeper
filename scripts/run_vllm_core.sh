#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

python -m vllm.entrypoints.openai.api_server \
  --host 0.0.0.0 \
  --port "${VLLM_PORT_CORE}" \
  --model "${VLLM_MODEL_CORE}" \
  --tensor-parallel-size "${VLLM_TP}" \
  --max-model-len "${VLLM_MAX_MODEL_LEN}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION}"

