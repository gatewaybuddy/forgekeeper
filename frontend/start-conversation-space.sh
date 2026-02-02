#!/bin/bash

# Load API keys from .env file (do not hardcode keys here!)
# Create a .env file with OPENAI_API_KEY and ANTHROPIC_API_KEY
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Ensure required keys are set
if [ -z "$OPENAI_API_KEY" ] || [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY and ANTHROPIC_API_KEY must be set in .env"
    exit 1
fi

# Configure agents
export FORGE_PROVIDER="openai"
export FORGE_MODEL="gpt-4o"
export FORGE_API_KEY="$OPENAI_API_KEY"

export SCOUT_PROVIDER="anthropic"
export SCOUT_MODEL="claude-3-5-haiku-20241022"
export SCOUT_API_KEY="$ANTHROPIC_API_KEY"

export LOOM_PROVIDER="anthropic"
export LOOM_MODEL="claude-3-haiku-20240307"
export LOOM_API_KEY="$ANTHROPIC_API_KEY"

export ANVIL_PROVIDER="anthropic"
export ANVIL_MODEL="claude-sonnet-4-5-20250929"
export ANVIL_API_KEY="$ANTHROPIC_API_KEY"

echo "Starting Conversation Space server..."
echo "Forge: OpenAI $FORGE_MODEL"
echo "Scout: Anthropic $SCOUT_MODEL"
echo "Loom: Anthropic $LOOM_MODEL"
echo "Anvil: Anthropic $ANVIL_MODEL"
echo ""

node server.mjs
