#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
FLAG="$ROOT_DIR/.forgekeeper/restart.flag"

echo "Watching $FLAG for restart requests (Ctrl+C to stop)"
while true; do
  if [ -f "$FLAG" ]; then
    echo "Restart flag detected. Restarting services..."
    rm -f "$FLAG" || true
    "$ROOT_DIR/start.sh"
  fi
  sleep 5
done

