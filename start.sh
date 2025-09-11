#!/usr/bin/env bash
set -euo pipefail

# Root-level wrapper to start the local stack
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Minimal handling for a TinyLLM quickstart flag; set env for child script
ARGS=("$@")
for arg in "${ARGS[@]}"; do
  if [[ "$arg" == "--tiny" ]]; then
    export LLM_BACKEND=transformers
    export USE_TINY_MODEL=true
    export FK_DEVICE=cpu
    break
  fi
done

exec "$SCRIPT_DIR/scripts/start_local_stack.sh" "${ARGS[@]}"

