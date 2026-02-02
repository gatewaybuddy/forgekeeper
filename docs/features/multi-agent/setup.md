# Multi-Agent LLM Configuration

Thought World supports **heterogeneous LLM backends** - each agent can use a different provider:

## Agent Roles

- **Forge (Executor)**: Proposes solutions, explores possibilities
- **Loom (Verifier)**: Reviews proposals, catches errors, enforces truth constraints
- **Anvil (Integrator)**: Synthesizes both perspectives, makes final consensus decision

## Supported Providers

Each agent can independently use:
- **OpenAI** (ChatGPT, GPT-4, GPT-4o, etc.)
- **Anthropic** (Claude Sonnet, Haiku, Opus)
- **Local Inference** (vLLM, llama.cpp via OpenAI-compatible API)

## Environment Configuration

Edit `.env` to configure each agent:

```bash
# Forge (Executor) - OpenAI ChatGPT
FORGE_PROVIDER=openai
FORGE_API_KEY=sk-proj-...  # Your OpenAI API key
FORGE_MODEL=gpt-4o  # or gpt-4o-mini, gpt-4-turbo
FORGE_API_BASE=https://api.openai.com/v1

# Loom (Verifier) - Anthropic Claude
LOOM_PROVIDER=anthropic
LOOM_API_KEY=sk-ant-...  # Your Anthropic API key
LOOM_MODEL=claude-3-haiku-20240307  # Fast, cost-effective
LOOM_API_BASE=https://api.anthropic.com

# Anvil (Integrator) - Anthropic Claude
ANVIL_PROVIDER=anthropic
ANVIL_API_KEY=sk-ant-...  # Your Anthropic API key
ANVIL_MODEL=claude-sonnet-4-5-20250929  # Powerful synthesis
ANVIL_API_BASE=https://api.anthropic.com
```

## Example Configurations

### Configuration 1: All Claude (Single Provider)
```bash
FORGE_PROVIDER=anthropic
FORGE_API_KEY=sk-ant-...
FORGE_MODEL=claude-sonnet-4-5-20250929

LOOM_PROVIDER=anthropic
LOOM_API_KEY=sk-ant-...
LOOM_MODEL=claude-3-haiku-20240307

ANVIL_PROVIDER=anthropic
ANVIL_API_KEY=sk-ant-...
ANVIL_MODEL=claude-sonnet-4-5-20250929
```

### Configuration 2: Mixed Cloud (Current Setup)
```bash
FORGE_PROVIDER=openai
FORGE_API_KEY=sk-proj-...
FORGE_MODEL=gpt-4o

LOOM_PROVIDER=anthropic
LOOM_API_KEY=sk-ant-...
LOOM_MODEL=claude-3-haiku-20240307

ANVIL_PROVIDER=anthropic
ANVIL_API_KEY=sk-ant-...
ANVIL_MODEL=claude-sonnet-4-5-20250929
```

### Configuration 3: Local Inference (Cost-Free)
```bash
FORGE_PROVIDER=local
FORGE_API_KEY=dev-key
FORGE_MODEL=core  # Model name in your vLLM/llama.cpp server
FORGE_API_BASE=http://llama-core:8080/v1

LOOM_PROVIDER=local
LOOM_API_KEY=dev-key
LOOM_MODEL=core
LOOM_API_BASE=http://llama-core:8080/v1

ANVIL_PROVIDER=local
ANVIL_API_KEY=dev-key
ANVIL_MODEL=core
ANVIL_API_BASE=http://llama-core:8080/v1
```

### Configuration 4: Hybrid (Cloud + Local)
```bash
# Forge: OpenAI for creative exploration
FORGE_PROVIDER=openai
FORGE_API_KEY=sk-proj-...
FORGE_MODEL=gpt-4o

# Loom: Local inference for fast, cost-free verification
LOOM_PROVIDER=local
LOOM_API_KEY=dev-key
LOOM_MODEL=core
LOOM_API_BASE=http://llama-core:8080/v1

# Anvil: Claude for high-quality synthesis
ANVIL_PROVIDER=anthropic
ANVIL_API_KEY=sk-ant-...
ANVIL_MODEL=claude-sonnet-4-5-20250929
```

## Model Recommendations

### For Forge (Executor)
- **GPT-4o**: Creative, excellent at code generation
- **Claude Sonnet 4.5**: Strong reasoning, detailed analysis
- **Local LLM (20B+)**: Cost-free, fast iteration

### For Loom (Verifier)
- **Claude Haiku 3**: Fast, cheap, excellent at spotting errors
- **GPT-4o-mini**: Good balance of speed and quality
- **Local LLM**: Free, but may miss subtle issues

### For Anvil (Integrator)
- **Claude Sonnet 4.5**: Best synthesis and decision-making
- **GPT-4o**: Strong at weighing trade-offs
- **Local LLM (70B+)**: Requires powerful hardware

## Cost Optimization

**Cheapest Setup** (Mixed):
- Forge: GPT-4o-mini ($0.15/1M input tokens)
- Loom: Claude Haiku 3 ($0.25/1M input tokens)
- Anvil: Claude Haiku 3 ($0.25/1M input tokens)

**Best Quality** (Cloud):
- Forge: GPT-4o or Claude Sonnet 4.5
- Loom: Claude Haiku 3 (fast verification)
- Anvil: Claude Sonnet 4.5 (best synthesis)

**Zero Cost** (Local):
- All agents: Local inference via vLLM/llama.cpp
- Requires: GPU with 24GB+ VRAM for 20B+ models

## Testing

After configuring `.env`:

```bash
# Rebuild frontend container
docker compose build frontend

# Restart services
docker compose --profile ui --profile inference-vllm up -d

# Test via API
curl -X POST http://localhost:3000/api/chat/thought-world \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Create a function that validates email addresses"}], "model": "core"}'
```

Or use the test page: **http://localhost:5173/test-thought-world.html**

## Troubleshooting

### Error: "Invalid API key"
- Check that API keys are set correctly in `.env`
- Ensure no extra spaces or line breaks
- For OpenAI: key starts with `sk-proj-` or `sk-`
- For Anthropic: key starts with `sk-ant-api03-`

### Error: "Model not found"
- Check model names match provider's available models
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Anthropic: `claude-sonnet-4-5-20250929`, `claude-3-haiku-20240307`
- Local: Use exact model name from your inference server

### Agent using wrong provider
- Rebuild frontend container: `docker compose build frontend`
- Check env vars are loaded: `docker exec forgekeeper-frontend-1 env | grep FORGE`

## Port Configuration

The UI can be accessed on two ports:

- **Port 5173** (default): Maps to Express backend on container port 3000
  - Set via `FRONTEND_PORT=5173` in `.env`
  - Docker maps `host:5173 → container:3000`
  - Traditional Vite dev server port for familiarity

- **Port 3000**: Direct Express backend access
  - Used for API-only access or when port 5173 is taken

Both point to the same Express backend (which serves the thought-world API and built React app).

For local development with hot reload:
- Run Vite dev server: `npm run dev` → port 5173 (unbundled, fast refresh)
- Vite proxies API calls to Express backend on port 3000
