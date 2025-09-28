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

args=("-f" "$COMPOSE_FILE")
for p in "${PROFILES[@]}"; do args+=("--profile" "$p"); done
args+=(up -d)
if [[ "$BUILD" == "1" ]]; then args+=(--build); fi

echo "Bringing up stack: docker compose ${args[*]}"
docker compose "${args[@]}" >/dev/null

if [[ "$INCLUDE_MONGO" == "1" ]]; then
  docker compose -f "$COMPOSE_FILE" up -d mongodb >/dev/null || true
fi

echo "ok: stack ensure complete"
exit 0
