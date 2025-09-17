#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_PATH="$ROOT_DIR/../forgekeeper-v2/docker-compose.tritonllm.yml"
if [[ ! -f "$COMPOSE_PATH" ]]; then COMPOSE_PATH="$ROOT_DIR/forgekeeper-v2/docker-compose.tritonllm.yml"; fi

MODEL_DIR="$ROOT_DIR/../forgekeeper-v2/models"
[[ -d "$MODEL_DIR" ]] || MODEL_DIR="$ROOT_DIR/forgekeeper-v2/models"
mkdir -p "$MODEL_DIR"

TARGET="$MODEL_DIR/gpt-oss-20b"
if [[ ! -f "$TARGET/config.json" ]]; then
  echo "Downloading model: openai/gpt-oss-20b -> $TARGET"
  python "$ROOT_DIR/scripts/download_hf_model.py" openai/gpt-oss-20b "$TARGET"
fi

export HOST_MODEL_DIR="$MODEL_DIR"
export CHECKPOINT="/models/gpt-oss-20b/original"

echo "Starting TritonLLM gateway compose ..."
docker compose -f "$COMPOSE_PATH" up -d --build >/dev/null

URL="http://127.0.0.1:8008/openapi.json"
deadline=$((SECONDS+600))
until curl -sSf -m 5 "$URL" >/dev/null 2>&1 || [[ $SECONDS -ge $deadline ]]; do
  sleep 5
done
curl -sSf -m 5 "$URL" >/dev/null 2>&1 || { echo "Gateway not ready at $URL" >&2; exit 1; }
echo "Gateway READY at $URL"

echo "Running smoke request ..."
curl -sS -m 60 -H 'Content-Type: application/json' \
  -d '{"model":"oss-20b","input":[{"role":"user","content":[{"type":"text","text":"Say hi"}]}],"max_output_tokens":8}' \
  http://127.0.0.1:8008/v1/responses | head -c 160; echo

export TRITONLLM_URL='http://127.0.0.1:8008'
if command -v forgekeeper >/dev/null 2>&1; then
  forgekeeper demo --llm triton --duration 8 || true
else
  python -m forgekeeper demo --llm triton --duration 8 || true
fi

echo "Smoke test complete."

