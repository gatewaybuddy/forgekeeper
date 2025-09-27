#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [ -z "${VLLM_MODEL_CODER:-}" ]; then
  echo "VLLM_MODEL_CODER is not set; skipping launch." >&2
  exit 0
fi

LOG_DIR="${VLLM_LOG_DIR:-$ROOT_DIR/logs/vllm}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/vllm-coder.log"
echo "📝 vLLM coder logs: $LOG_FILE"

exec python -m vllm.entrypoints.openai.api_server \
  --host 0.0.0.0 \
  --port "${VLLM_PORT_CODER}" \
  --model "${VLLM_MODEL_CODER}" \
  --tensor-parallel-size "${VLLM_TP}" \
  --max-model-len "${VLLM_MAX_MODEL_LEN}" \
  --gpu-memory-utilization "${VLLM_GPU_MEMORY_UTILIZATION}" \
  > >(tee -a "$LOG_FILE") \
  2> >(tee -a "$LOG_FILE" >&2)

