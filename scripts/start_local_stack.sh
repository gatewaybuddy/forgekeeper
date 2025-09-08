#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but was not found." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "❌ python is required but was not found." >&2
  exit 1
fi

# Ensure MongoDB is available before starting services
if pgrep mongod >/dev/null 2>&1; then
  echo "✅ MongoDB is running."
elif command -v docker >/dev/null 2>&1 && \
     docker ps --format '{{.Names}}' | grep -q '^forgekeeper-mongo$'; then
  echo "ℹ️ forgekeeper-mongo container is already running."
else
  echo "⚠️ MongoDB not detected."
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker is not available. Cannot start MongoDB." >&2
    exit 1
  fi
  if docker ps -a --format '{{.Names}}' | grep -q '^forgekeeper-mongo$'; then
    read -r -p "Start existing forgekeeper-mongo container? [Y/n] " reply
    reply=${reply:-Y}
    if [[ $reply =~ ^[Yy]$ ]]; then
      if ! docker start forgekeeper-mongo >/dev/null 2>&1; then
        echo "❌ Failed to start forgekeeper-mongo container." >&2
        exit 1
      fi
    else
      echo "⚠️ MongoDB is required. Exiting." >&2
      exit 1
    fi
  else
    read -r -p "Run new forgekeeper-mongo container? [Y/n] " reply
    reply=${reply:-Y}
    if [[ $reply =~ ^[Yy]$ ]]; then
      if ! docker run -d --name forgekeeper-mongo -p 27017:27017 mongo:latest >/dev/null 2>&1; then
        echo "❌ Failed to launch MongoDB Docker container." >&2
        exit 1
      fi
    else
      echo "⚠️ MongoDB is required. Exiting." >&2
      exit 1
    fi
  fi
fi

npm run dev --prefix backend &
BACKEND_PID=$!
"$PYTHON" -m forgekeeper &
PYTHON_PID=$!
npm run dev --prefix frontend &
FRONTEND_PID=$!

trap 'kill "$BACKEND_PID" "$PYTHON_PID" "$FRONTEND_PID"' EXIT
wait
