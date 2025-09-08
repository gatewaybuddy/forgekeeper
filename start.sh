#!/usr/bin/env bash
set -euo pipefail

# Root-level wrapper to start the local stack
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/scripts/start_local_stack.sh" "$@"

