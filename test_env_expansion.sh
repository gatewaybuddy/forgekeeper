#!/bin/bash
# Test that .env variable expansion works

source .env 2>/dev/null || true

echo "Testing .env variable expansion:"
echo ""
echo "Primary keys (should have actual values):"
echo "  OPENAI_API_KEY=${OPENAI_API_KEY:0:20}..."
echo "  ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:0:20}..."
echo ""
echo "Agent keys (should be expanded):"
echo "  FORGE_API_KEY=${FORGE_API_KEY:0:20}..."
echo "  SCOUT_API_KEY=${SCOUT_API_KEY:0:20}..."
echo "  LOOM_API_KEY=${LOOM_API_KEY:0:20}..."
echo "  ANVIL_API_KEY=${ANVIL_API_KEY:0:20}..."
echo ""

# Check if expansion worked
if [ "${FORGE_API_KEY}" = '${OPENAI_API_KEY}' ]; then
    echo "❌ Variable expansion NOT working - seeing literal \${OPENAI_API_KEY}"
    echo "   This is OK for bash 'source', Docker Compose will handle it"
elif [ -n "${FORGE_API_KEY}" ] && [ "${FORGE_API_KEY:0:3}" = "sk-" ]; then
    echo "✅ Variable expansion working - FORGE_API_KEY has actual key value"
else
    echo "⚠️  FORGE_API_KEY is: ${FORGE_API_KEY}"
fi

echo ""
echo "Note: Docker Compose handles variable expansion when loading env_file"
echo "      The container will receive fully expanded values"
