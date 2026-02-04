#!/usr/bin/env bash
# Switch between vLLM configurations
# Usage: bash scripts/switch-config.sh [safe_fallback|safe_extended|balanced_creative|aggressive_max]

set -euo pipefail

CONFIG="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [[ -z "$CONFIG" ]]; then
  echo "Usage: bash scripts/switch-config.sh [CONFIG]"
  echo ""
  echo "Available configurations:"
  echo "  safe_fallback       - ⚠️  LOW risk - Current production config (8K context, temp=0.0)"
  echo "  safe_extended       - ⚠️  LOW risk - +25% context, temp=0.5"
  echo "  balanced_creative   - ⚠️⚠️  MEDIUM risk - +50% context, temp=0.7 (RECOMMENDED)"
  echo "  aggressive_max      - ⚠️⚠️⚠️ HIGH risk - 2x context, temp=0.8 (May OOM)"
  echo ""
  echo "Current config:"
  grep -E "^(VLLM_MAX_MODEL_LEN|FRONTEND_TEMP|FRONTEND_TOP_P)=" .env 2>/dev/null || echo "  (no .env file)"
  exit 1
fi

CONFIG_FILE=".env.${CONFIG}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Error: Config file not found: $CONFIG_FILE"
  echo ""
  echo "Available: safe_fallback, safe_extended, balanced_creative, aggressive_max"
  exit 1
fi

echo "📋 Switching to: $CONFIG"
echo ""

# Show what's changing
echo "Current config:"
grep -E "^(VLLM_MAX_MODEL_LEN|FRONTEND_MAX_TOKENS|FRONTEND_TEMP|FRONTEND_TOP_P)=" .env 2>/dev/null | sed 's/^/  /'
echo ""
echo "New config:"
grep -E "^(VLLM_MAX_MODEL_LEN|FRONTEND_MAX_TOKENS|FRONTEND_TEMP|FRONTEND_TOP_P)=" "$CONFIG_FILE" | sed 's/^/  /'
echo ""

read -p "Proceed with switch? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Cancelled"
  exit 0
fi

# Backup current .env
if [[ -f .env ]]; then
  BACKUP=".env.backup.$(date +%Y%m%d_%H%M%S)"
  cp .env "$BACKUP"
  echo "✅ Backed up current .env to: $BACKUP"
fi

# Copy new config
cp "$CONFIG_FILE" .env
echo "✅ Copied $CONFIG_FILE to .env"

# Check if restart is needed
if grep -q "VLLM_MAX_MODEL_LEN\|VLLM_GPU_MEMORY_UTILIZATION\|VLLM_MAX_NUM_BATCHED_TOKENS" <<< "$(diff "$BACKUP" .env 2>/dev/null || echo 'changed')"; then
  echo ""
  echo "⚠️  Server-side settings changed. Restart required:"
  echo "   docker compose restart vllm-core"
  echo ""
  read -p "Restart vllm-core now? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "⏸️  Skipped restart. Run manually: docker compose restart vllm-core"
  else
    echo "🔄 Restarting vllm-core..."
    docker compose restart vllm-core
    echo "✅ vllm-core restarted"
    echo ""
    echo "⏳ Waiting 10s for model to load..."
    sleep 10
    echo ""
    echo "Testing health..."
    if curl -s http://localhost:8001/v1/models >/dev/null 2>&1; then
      echo "✅ vLLM is healthy"
    else
      echo "⚠️  Health check failed. Check logs: docker logs vllm-core"
    fi
  fi
else
  echo ""
  echo "✅ Runtime-only settings changed. No restart needed."
  echo "   Changes take effect on next request."
fi

echo ""
echo "🎉 Config switched to: $CONFIG"
echo ""
echo "Next steps:"
echo "  1. Test with simple task: 'What time is it?'"
echo "  2. Test with git task: 'Check git status'"
echo "  3. Monitor GPU memory: nvidia-smi"
echo "  4. Check vLLM logs: docker logs -f vllm-core"
