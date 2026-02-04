#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BUILD="${BUILD:-0}"
PROFILES=(ui inference)
INCLUDE_MONGO="${INCLUDE_MONGO:-0}"

if [[ -n "${PROFILES_OVERRIDE:-}" ]]; then
  # space-separated override
  read -r -a PROFILES <<< "$PROFILES_OVERRIDE"
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$PROJECT_DIR" ]]; then PROJECT_DIR="$(cd "$script_dir/.." && pwd)"; fi
cd "$PROJECT_DIR"

if ! docker network inspect forgekeeper-net >/dev/null 2>&1; then
  docker network create forgekeeper-net >/dev/null
fi

# Route frontend proxy based on FK_CORE_KIND (default: llama)
core_kind="${FK_CORE_KIND:-llama}"
gpu_pref="${FK_CORE_GPU:-1}"
case "${core_kind,,}" in
  vllm) export FRONTEND_VLLM_API_BASE="http://vllm-core:8000/v1" ;;
  *)    if [[ "${gpu_pref}" == "0" ]]; then export FRONTEND_VLLM_API_BASE="http://llama-core-cpu:8080/v1"; else export FRONTEND_VLLM_API_BASE="http://llama-core:8080/v1"; fi ;;
esac

args=("-f" "$COMPOSE_FILE")
for p in "${PROFILES[@]}"; do args+=("--profile" "$p"); done
args+=(up -d)
if [[ "$BUILD" == "1" ]]; then
  echo "Building selected services: frontend"
  if ! docker compose -f "$COMPOSE_FILE" build frontend; then
    echo "warn: frontend image build failed. UI will be skipped; starting core services only." >&2
    # remove 'ui' from profiles
    filtered=()
    for p in "${PROFILES[@]}"; do [[ "$p" != "ui" ]] && filtered+=("$p"); done
    PROFILES=("${filtered[@]}")
  fi
fi

# If image missing locally, build even when BUILD=0
if ! docker image inspect forgekeeper-frontend >/dev/null 2>&1; then
  echo "frontend image missing locally; building..."
  if ! docker compose -f "$COMPOSE_FILE" build frontend; then
    echo "warn: frontend image build failed. UI will be skipped; starting core services only." >&2
    filtered=()
    for p in "${PROFILES[@]}"; do [[ "$p" != "ui" ]] && filtered+=("$p"); done
    PROFILES=("${filtered[@]}")
  fi
fi

echo "Bringing up stack: docker compose ${args[*]}"
if ! docker compose "${args[@]}"; then
  echo "error: docker compose up failed. Please check the logs above and fix any build/runtime errors." >&2
  exit 1
fi

if [[ "$INCLUDE_MONGO" == "1" ]]; then
  docker compose -f "$COMPOSE_FILE" up -d mongodb >/dev/null || true
fi

echo "ok: stack ensure complete"
exit 0
