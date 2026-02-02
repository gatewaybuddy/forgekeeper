# Consciousness System - Docker Guide

Complete guide to running the consciousness system in Docker with ChromaDB memory and conversational interface.

---

## Architecture Overview

```
Docker Services:
├── llama-core / vllm-core  → Local inference (reasoning engine)
├── chromadb                → Vector memory storage (semantic search)
└── frontend                → Node.js server (consciousness cycles + UI)

CLI Interfaces:
├── forgekeeper talk        → Conversational REPL (new!)
├── forgekeeper c [cmd]     → Direct commands (status, health, etc.)
└── Browser UI              → http://localhost:3000
```

**Key Points:**
- **Consciousness cycles** run inside the `frontend` container
- **Local inference** via vllm-core (GPU) or llama-core (CPU fallback)
- **Deep reasoning** via OpenAI/Anthropic APIs (limited budget)
- **Memory storage**:
  - Structured data (goals, state) → JSON files in `.forgekeeper/`
  - Semantic memories → ChromaDB vector database
- **UI access** via browser at `http://localhost:3000`
- **CLI access** via `forgekeeper talk` (conversational) or `forgekeeper c` (commands)

---

## Quick Start

### 1. Prerequisites

```bash
# Ensure Docker and Docker Compose are installed
docker --version
docker compose version

# Create external network (one-time setup)
docker network create forgekeeper-net
```

### 2. Configure Environment

```bash
# Copy consciousness settings to .env
cat .env.consciousness.example >> .env

# Edit the essentials:
nano .env
```

**Minimal configuration:**
```bash
# Enable consciousness
CONSCIOUSNESS_ENABLED=1
CONSCIOUSNESS_AUTO_START=1

# Choose inference backend
FK_CORE_KIND=vllm  # or 'llama' for CPU fallback

# Optional: API keys for deep reasoning (limited budget)
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Start the System

```bash
# Start all services (builds if needed)
python -m forgekeeper ensure-stack --build --profile inference --profile ui

# Or use the default command (same as above)
python -m forgekeeper
```

**What happens:**
1. Builds frontend Docker image (if new/changed)
2. Starts inference core (vllm-core or llama-core)
3. Starts ChromaDB (vector memory)
4. Starts frontend (consciousness + UI)
5. Auto-starts consciousness cycles
6. Runs until Ctrl+C (then tears down)

### 4. Access the System

**Conversational REPL (NEW!):**
```bash
# Start conversational interface
python -m forgekeeper talk

# Or using alias
python -m forgekeeper repl
```

**Direct Commands:**
```bash
# Check status
python -m forgekeeper c status

# Check health
python -m forgekeeper c health

# Ask questions
python -m forgekeeper c ask "What are you thinking about?"

# Real-time monitoring
python -m forgekeeper c watch
```

**Browser UI:**
```
http://localhost:3000          # Main UI
http://localhost:3000/graphql  # GraphQL Playground
```

---

## Conversational Interface (REPL)

The new `forgekeeper talk` command provides a Claude Code style conversational interface.

### Features

✅ **Natural conversation** - No need to type full commands
✅ **Multi-line input** - Automatically detected or press Enter twice
✅ **Shows reasoning** - See consciousness thoughts and metrics
✅ **Color-coded output** - Easy to read responses
✅ **Ctrl+C to exit** - Simple exit mechanism

### Usage Example

```bash
$ python -m forgekeeper talk

╔═══════════════════════════════════════════════════════════╗
║  🧠 Consciousness Conversational Interface              ║
╚═══════════════════════════════════════════════════════════╝

Type your message and press Enter.
For multi-line input, end with an empty line (press Enter twice).
Press Ctrl+C to exit.

Connecting to consciousness system...
✓ Connected

────────────────────────────────────────────────────────────

You: What patterns have you noticed in the codebase?

Thinking...

Consciousness:
[Cycle 42 • State: thinking]

💭 Recent Thoughts:
  1. Analyzed code review patterns, identified recurring themes
  2. Detected correlation between test coverage and bug reports
  3. Formulated hypothesis about optimal commit frequency
  4. Noticed unused dependencies in package.json
  5. Considering refactoring opportunity in auth module

📊 Metrics:
  • Success Rate: 95.2%
  • Avg Cycle: 2450ms
  • Uptime: 126.4s

────────────────────────────────────────────────────────────

You: Tell me more about the authentication refactoring

Thinking...

[Response continues...]
```

### Multi-Line Input

```bash
You: I'm thinking about a major architectural change.
(Multi-line mode - press Enter on empty line to send)
... We should migrate to microservices.
... What are your thoughts on this approach?
... What risks should we consider?
...

[Press Enter on empty line to send]
```

---

## Memory Architecture (Hybrid)

### Structured Data → JSON

Stored in `.forgekeeper/`:
```
.forgekeeper/
├── consciousness/
│   ├── state.json           # Current state, cycle count, tokens
│   ├── goals.json           # Active goals
│   ├── learning.json        # Outcome tracking
│   └── stm.jsonl            # Short-term memory snapshots
├── values.jsonl             # Value/belief tracking
└── context_log/             # Event logs
```

**Use for:** Fast queries, structured data, version control

### Semantic Memories → ChromaDB

Stored in ChromaDB vector database:
- Episodic memories (experiences, observations)
- Thought summaries
- Code patterns discovered
- User interaction history
- Decision outcomes

**Use for:** Semantic search, similarity matching, reasoning context

### Why Hybrid?

| Data Type | Storage | Reason |
|-----------|---------|--------|
| Current state | JSON | Fast, simple, inspectable |
| Active goals | JSON | Structured queries |
| Episodic memories | ChromaDB | Semantic search |
| Thoughts | ChromaDB | Similarity retrieval |
| Values | JSONL | Append-only log |

---

## Docker Services Reference

### ChromaDB

```yaml
chromadb:
  image: chromadb/chroma:latest
  ports:
    - "8000:8000"
  volumes:
    - ./.forgekeeper/chromadb:/chroma/chroma
```

**Access:**
- REST API: `http://localhost:8000`
- From container: `http://chromadb:8000`

**Health check:**
```bash
curl http://localhost:8000/api/v1/heartbeat
```

### Frontend (Consciousness + UI)

```yaml
frontend:
  image: forgekeeper-frontend
  ports:
    - "3000:3000"
  environment:
    CONSCIOUSNESS_ENABLED: 1
    CONSCIOUSNESS_AUTO_START: 1
    CHROMADB_URL: http://chromadb:8000
  depends_on:
    - chromadb
  volumes:
    - ./.forgekeeper:/app/.forgekeeper:rw
```

**What runs:**
- Node.js Express server
- Consciousness orchestrator & cycles
- GraphQL API
- REST API endpoints
- React UI (Vite build)

### Inference Core

**vLLM (GPU):**
```bash
# Default for FK_CORE_KIND=vllm
docker compose --profile inference-vllm up
```

**llama.cpp (GPU/CPU):**
```bash
# Default for FK_CORE_KIND=llama
docker compose --profile inference up
```

---

## Environment Variables Reference

### Consciousness Core

```bash
# Enable system
CONSCIOUSNESS_ENABLED=1                    # 1=on, 0=off
CONSCIOUSNESS_AUTO_START=1                 # Auto-start cycles

# Cycle configuration
CONSCIOUSNESS_CYCLE_INTERVAL=30000         # 30 seconds
CONSCIOUSNESS_DAILY_API_BUDGET=1000000     # 1M tokens/day

# Deep reasoning provider
CONSCIOUSNESS_DEEP_PROVIDER=anthropic      # or 'openai'
CONSCIOUSNESS_DEEP_API_KEY=sk-ant-...      # API key
CONSCIOUSNESS_DEEP_MODEL=claude-sonnet-4-5

# ChromaDB connection
CHROMADB_URL=http://chromadb:8000          # Default in Docker
CHROMADB_COLLECTION=consciousness-memories
```

### Memory Settings

```bash
# Short-term memory
CONSCIOUSNESS_STM_SLOTS=5                  # Memory buffer size

# Dreams & consolidation
CONSCIOUSNESS_DREAM_ENABLED=1
CONSCIOUSNESS_DREAM_INTERVAL=24            # Hours

# Values & bias protection
CONSCIOUSNESS_MIN_INCIDENTS_FOR_VALUE=5
CONSCIOUSNESS_VALUE_CHALLENGE_INTERVAL=7   # Days
```

### Inference Backend

```bash
# Core selection
FK_CORE_KIND=vllm                          # or 'llama'

# vLLM settings
VLLM_MODEL_CORE=meta-llama/Llama-3.1-8B-Instruct
VLLM_TP=1                                  # Tensor parallel size
VLLM_GPU_MEMORY_UTILIZATION=0.9

# llama.cpp settings
LLAMA_MODEL_CORE=/models/llama-3.1-8b-instruct.gguf
LLAMA_N_GPU_LAYERS=-1                      # All layers on GPU
```

---

## Common Workflows

### Development Workflow

**Morning startup:**
```bash
# Start everything
python -m forgekeeper ensure-stack --build

# In another terminal: Start conversation
python -m forgekeeper talk
```

**During development:**
```bash
# Quick status checks
python -m forgekeeper c status
python -m forgekeeper c health

# Ask for insights
python -m forgekeeper c ask "Any concerns about recent changes?"

# Real-time monitoring
python -m forgekeeper c watch
```

**End of day:**
```bash
# Trigger consolidation
python -m forgekeeper c dream

# Stop system
# Press Ctrl+C in the terminal running ensure-stack
```

### Production Deployment

**Recommended settings:**
```bash
# .env.production
CONSCIOUSNESS_ENABLED=1
CONSCIOUSNESS_AUTO_START=1
CONSCIOUSNESS_CYCLE_INTERVAL=60000           # 1 minute (less aggressive)
CONSCIOUSNESS_DAILY_API_BUDGET=500000        # Conservative budget
CONSCIOUSNESS_DREAM_INTERVAL=12              # Dream every 12 hours
CONSCIOUSNESS_AUTO_STOP_ON_CRITICAL=1        # Safety first
NODE_ENV=production
```

**Start:**
```bash
docker compose --profile inference --profile ui up -d
```

**Monitor:**
```bash
# Check logs
docker compose logs -f frontend

# Check consciousness health
curl http://localhost:3000/api/consciousness/health

# CLI monitoring
python -m forgekeeper c watch
```

---

## Troubleshooting

### Consciousness Not Starting

**Check logs:**
```bash
docker compose logs frontend | grep -i consciousness
```

**Common issues:**
1. `CONSCIOUSNESS_ENABLED` not set → Add to .env
2. ChromaDB not healthy → Check `docker compose ps`
3. API key issues → Check OPENAI_API_KEY or ANTHROPIC_API_KEY
4. Initialization failed → Check module compatibility

### ChromaDB Connection Errors

**Verify ChromaDB is running:**
```bash
docker compose ps chromadb
curl http://localhost:8000/api/v1/heartbeat
```

**If unhealthy:**
```bash
# Restart ChromaDB
docker compose restart chromadb

# Check logs
docker compose logs chromadb
```

### Conversational REPL Not Working

**Error: "Connection failed"**
```bash
# Verify frontend is running
docker compose ps frontend
curl http://localhost:3000/api/consciousness/health

# Check environment
echo $CONSCIOUSNESS_ENABLED  # Should be 1
```

**Error: "Module not available"**
```bash
# Reinstall Python package
pip install -e .

# Or use python3 -m
python3 -m forgekeeper talk
```

### Inference Core Issues

**vLLM not starting:**
```bash
# Check GPU availability
nvidia-smi

# Try CPU fallback
echo "FK_CORE_KIND=llama" >> .env
python -m forgekeeper ensure-stack --build
```

**llama.cpp errors:**
```bash
# Check model file exists
ls -lh ./models/

# Verify model path in .env
grep LLAMA_MODEL_CORE .env
```

---

## Advanced Topics

### Switching Inference Backends

```bash
# Switch to vLLM (GPU)
python -m forgekeeper switch-core vllm

# Switch to llama.cpp
python -m forgekeeper switch-core llama
```

### Manual Docker Control

```bash
# Start specific services
docker compose up chromadb -d
docker compose up frontend -d

# Stop all
docker compose down

# Rebuild frontend
docker compose build frontend

# View all services
docker compose ps -a
```

### Backing Up State

```bash
# Backup all state
tar -czf consciousness-backup-$(date +%Y%m%d).tar.gz .forgekeeper/

# Restore
tar -xzf consciousness-backup-20250115.tar.gz
```

### Monitoring Resources

```bash
# Docker stats
docker stats

# Consciousness metrics
curl http://localhost:3000/api/consciousness/stats | jq
```

---

## Quick Reference

### Common Commands

```bash
# Start system
python -m forgekeeper                      # Full stack
python -m forgekeeper ensure-stack --build # Rebuild & start

# Conversational interface
python -m forgekeeper talk                 # REPL mode
python -m forgekeeper repl                 # Alias

# Direct commands
python -m forgekeeper c status             # Current state
python -m forgekeeper c health             # Health check
python -m forgekeeper c ask "question"     # Ask question
python -m forgekeeper c watch              # Real-time monitor
python -m forgekeeper c dream              # Trigger dream
python -m forgekeeper c goal list          # List goals
python -m forgekeeper c goal add "title"   # Add goal

# Docker control
docker compose ps                          # List services
docker compose logs -f frontend            # Follow logs
docker compose restart consciousness       # Restart
docker compose down                        # Stop all
```

### URLs

```
Main UI:              http://localhost:3000
GraphQL Playground:   http://localhost:3000/graphql
ChromaDB API:         http://localhost:8000
Inference Core:       http://localhost:8001
```

---

## Next Steps

1. **Try the conversational REPL**: `python -m forgekeeper talk`
2. **Set goals**: Use talk mode or `forgekeeper c goal add "your goal"`
3. **Monitor thoughts**: `forgekeeper c watch` while you work
4. **Review insights**: Ask questions via talk mode
5. **Trigger consolidation**: `forgekeeper c dream` at end of day

---

**System is ready!** Start with `python -m forgekeeper` to launch everything, then `python -m forgekeeper talk` to begin your conversation.
