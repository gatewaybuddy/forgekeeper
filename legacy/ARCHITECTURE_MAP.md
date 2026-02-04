# Forgekeeper Architecture Map
**Updated**: 2025-12-15
**Status**: Complete architectural overview

---

## 🏗️ System Architecture Overview

Forgekeeper uses a **3-tier architecture** with optional Python CLI:

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (localhost:5173 dev / localhost:3000 prod)            │
│  React + Vite Frontend UI                                       │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP/SSE
┌────────────────────▼────────────────────────────────────────────┐
│  Frontend Server (Node.js Express, Port 3000)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ server.mjs (Main Express app)                            │  │
│  │ server/ (48 modules organized into 7 categories)         │  │
│  │  ├── orchestration/  (Chat flow, tool loops)             │  │
│  │  ├── agents/         (Multi-agent system)                │  │
│  │  ├── conversations/  (Message bus/store)                 │  │
│  │  ├── collaborative/  (Human-in-loop, preferences)        │  │
│  │  ├── telemetry/      (Logging, metrics)                  │  │
│  │  ├── automation/     (Tasks, PR automation)              │  │
│  │  └── core/           (Tools, guardrails, thought-world)  │  │
│  │ core/agent/ (Autonomous agent - 8 phases)                │  │
│  │ tools/ (50+ tool definitions)                            │  │
│  │ mcp/ (Model Context Protocol integration)                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │ OpenAI-compatible API
┌────────────────────▼────────────────────────────────────────────┐
│  Inference Core (Port 8001)                                     │
│  llama.cpp (GPU) OR LocalAI (CPU) OR vLLM (optional)           │
│  Serves: Local LLM inference via OpenAI-compatible API          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ChromaDB (Port 8000) - Optional Vector Store                   │
│  Used by: Consciousness system for memory/reflection            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Python CLI (Optional - Runs on Host)                           │
│  `python -m forgekeeper [command]`                              │
│  Commands: chat, ensure-stack, up-core, switch-core, talk       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Docker Containers (4 Services)

### 1. **llama-core** (Primary Inference)
**Image**: `ghcr.io/ggml-org/llama.cpp:server-cuda`
**Profile**: `inference` (default)
**Port**: `8001:8080`

**What It Does**:
- Runs llama.cpp C++ inference server with GPU acceleration (cuBLAS)
- Provides OpenAI-compatible `/v1/chat/completions` API
- Loads quantized GGUF models from `./models/` directory

**What's Inside**:
- llama.cpp server binary
- CUDA libraries for GPU acceleration
- Model files (mounted from host)

**Configuration**:
```bash
LLAMA_MODEL_CORE=/models/your-model.gguf
LLAMA_N_CTX=4096           # Context window
LLAMA_N_GPU_LAYERS=-1      # All layers on GPU
```

---

### 2. **llama-core-cpu** (CPU Fallback)
**Image**: `localai/localai:latest`
**Profile**: `inference-cpu` (when no GPU)
**Port**: `8001:8080`

**What It Does**:
- Same as llama-core but uses CPU-only inference (LocalAI)
- Slower but works without NVIDIA GPU

**What's Inside**:
- LocalAI inference engine
- CPU-optimized model loading
- Model files (mounted from host)

**When Used**: Activated via `FK_CORE_KIND=llama` with `inference-cpu` profile

---

### 3. **vllm-core** (Optional High-Performance)
**Image**: `vllm/vllm-openai:latest`
**Profile**: `inference-vllm` (opt-in)
**Port**: `8001:8000`

**What It Does**:
- High-performance inference with vLLM (PagedAttention, continuous batching)
- Faster for concurrent requests
- Requires more VRAM

**What's Inside**:
- vLLM inference engine
- HuggingFace model loading
- CUDA libraries

**When Used**: Set `FK_CORE_KIND=vllm` in `.env`

---

### 4. **frontend** (Main Application Server)
**Image**: `forgekeeper-frontend` (built locally)
**Profile**: `ui` (default)
**Port**: `3000:3000`

**What It Does**:
- Serves React production build (Vite)
- Runs Node.js Express server with all backend logic
- Executes tools (bash, powershell, file operations)
- Manages autonomous agent, memory systems, conversations

**What's Inside** (Comprehensive):

#### **Node.js Runtime**:
- Node.js 20 (slim base image)
- Express web server
- Production npm dependencies

#### **System Tools**:
- PowerShell (`pwsh`) - for `run_powershell` tool
- Bash (`/bin/bash`) - for `run_bash` tool
- Git - for repository operations
- GitHub CLI (`gh`) - for SAPL auto-PR creation

#### **Application Code**:
```
/app/
├── server.mjs              # Main Express server (entry point)
├── server/                 # 48 server modules (NEW ORGANIZATION)
│   ├── orchestration/      # 8 files - Chat orchestration
│   ├── agents/             # 9 files - Multi-agent system
│   ├── conversations/      # 5 files - Message infrastructure
│   ├── collaborative/      # 9 files - Human-AI collaboration
│   ├── telemetry/          # 5 files - Logging & metrics
│   ├── automation/         # 3 files - Task/PR automation
│   └── core/               # 9 files - Tools, guardrails, utilities
├── core/agent/             # Autonomous agent (8 phases)
│   ├── autonomous.mjs      # Main orchestrator
│   └── orchestrator/       # Modular components (4 modules)
├── tools/                  # 50+ tool definitions
├── mcp/                    # Model Context Protocol integration
├── graphql/                # Apollo Server for consciousness
├── config/                 # Prompt configurations
└── dist/                   # React production build
```

#### **Mounted Volumes**:
- `./frontend/tools:/app/tools` - Tool definitions (read/write)
- `./:/workspace` - Full repo access for tools
- `./.forgekeeper:/app/.forgekeeper` - Persistent data

#### **Persistent Data** (.forgekeeper/):
```
.forgekeeper/
├── context_log/            # JSONL event logs (ContextLog)
├── playground/             # Episodic memory JSONL
├── preferences/            # User preferences JSONL
├── learning/               # Outcome tracking
├── chromadb/               # Vector embeddings (if consciousness enabled)
└── conversation_spaces/    # Agent context files
```

---

### 5. **chromadb** (Optional Vector Database)
**Image**: `chromadb/chroma:latest`
**Profile**: `ui` (started with frontend)
**Port**: `8000:8000`

**What It Does**:
- Vector similarity search for consciousness system
- Stores embeddings for memory retrieval

**What's Inside**:
- ChromaDB vector database
- Persistent storage in `.forgekeeper/chromadb/`

**When Used**: Only if `CONSCIOUSNESS_ENABLED=1` (currently disabled by default)

---

## 🐍 Python Backend (Optional CLI)

**Location**: `forgekeeper/` directory (81 Python files)
**Runs**: On host machine, **NOT in Docker**

**What It Is**:
- Legacy CLI wrapper for convenience
- Orchestrates Docker Compose commands
- Provides alternative chat interface

**Structure**:
```
forgekeeper/
├── __main__.py             # CLI entry point
├── cli/                    # Command handlers
│   ├── commands.py         # chat, ensure-stack, etc.
│   ├── handlers.py         # Request handling
│   ├── args.py             # Argument parsing
│   └── output.py           # Output formatting
├── core/                   # Git operations (git committer)
├── services/               # ContextLog reader
└── (other modules - mostly unused)
```

**Available Commands**:
```bash
python -m forgekeeper chat -p "Hello"       # Send chat message
python -m forgekeeper ensure-stack          # Start Docker stack
python -m forgekeeper up-core               # Start inference only
python -m forgekeeper switch-core llama     # Switch inference backend
python -m forgekeeper talk                  # REPL mode
```

**Important**:
- ⚠️ **This is mostly a convenience wrapper**
- ⚠️ **Real backend logic is in Node.js (frontend container)**
- ⚠️ **Can be completely replaced with direct Docker Compose commands**

---

## 📂 What Runs Outside Docker

### 1. **Startup Scripts** (Optional - Can use Python CLI instead)
None found - all operations via Python CLI or Docker Compose

### 2. **Python CLI** (`python -m forgekeeper`)
- **NOT dockerized** - runs on host
- Orchestrates Docker Compose
- Provides CLI convenience

### 3. **Direct Docker Compose** (Recommended)
```bash
# Start everything (inference + UI)
docker compose --profile inference --profile ui up --build

# Start just inference
docker compose --profile inference up -d

# Start UI only (assumes inference running)
docker compose --profile ui up
```

---

## 🔍 Key Architectural Insights

### ✅ **Backend is Node.js, NOT Python**

**Common Misconception**: "Python backend with Node frontend"

**Reality**:
- **ALL backend logic is in Node.js** (frontend container)
- **Python CLI is just a thin wrapper** for Docker commands
- **No Python API server** - all HTTP endpoints are Express (Node.js)

### ✅ **Single Container for "Backend"**

The `frontend` container is actually:
- Frontend UI (React build in `/app/dist/`)
- Backend API (Express server)
- Tool execution (bash, powershell)
- Autonomous agent
- Memory systems
- Everything except LLM inference

### ✅ **Inference is Separate**

- LLM inference runs in separate container (llama-core/vllm-core)
- Frontend calls inference via OpenAI-compatible API
- Clean separation: inference is pluggable (llama.cpp, LocalAI, vLLM, or external API)

### ✅ **No Database Required**

- All persistence via JSONL files (.forgekeeper/)
- ChromaDB only for optional consciousness feature (disabled by default)
- Filesystem-based storage < 1MB total (very lightweight)

---

## 🚀 Startup Flow

### Full Stack Startup
```bash
# Via Python CLI (recommended for convenience)
python -m forgekeeper ensure-stack

# Via Docker Compose directly
docker compose --profile inference --profile ui up --build
```

**What Happens**:
1. **Network**: Creates `forgekeeper-net` external network (if needed)
2. **Inference**: Starts llama-core (GPU) or llama-core-cpu
   - Loads model from `./models/`
   - Exposes OpenAI API on port 8001
3. **ChromaDB**: Starts vector DB on port 8000
4. **Frontend**: Builds and starts Node.js server
   - Builds React app (Vite)
   - Installs PowerShell, Git, GitHub CLI
   - Starts Express server on port 3000
   - Mounts workspace and .forgekeeper volumes
5. **Browser**: Access http://localhost:3000

---

## 📊 Container Resource Usage

### Typical Setup (GPU Available):
```
Container       CPU    RAM      GPU RAM    Purpose
──────────────────────────────────────────────────────────
llama-core      10%    2 GB     4-8 GB     LLM inference
frontend        5%     512 MB   -          Backend + UI
chromadb        1%     100 MB   -          Vector store
──────────────────────────────────────────────────────────
TOTAL           ~16%   ~2.6 GB  4-8 GB
```

### CPU-Only Setup:
```
Container           CPU    RAM      Purpose
────────────────────────────────────────────
llama-core-cpu      60%    4 GB     CPU inference
frontend            5%     512 MB   Backend + UI
chromadb            1%     100 MB   Vector store
────────────────────────────────────────────
TOTAL               ~66%   ~4.6 GB
```

---

## 🔧 What's NOT in Docker

1. **Python CLI** (`forgekeeper/` directory)
   - Runs on host
   - Can be replaced with direct `docker compose` commands

2. **Model Files** (`./models/`)
   - Stored on host filesystem
   - Mounted into llama-core container

3. **Workspace** (`./` repo root)
   - Mounted into frontend container as `/workspace`
   - Tools can read/write repo files

4. **Persistent Data** (`.forgekeeper/`)
   - Mounted into frontend container
   - Survives container restarts

---

## 🎯 Summary

### Docker Containers (4-5 active):
1. ✅ **llama-core** - LLM inference (GPU)
2. ✅ **frontend** - Node.js backend + React UI (**ALL THE MAGIC**)
3. ✅ **chromadb** - Vector DB (optional)
4. ⏸️ **llama-core-cpu** - CPU fallback (profile: inference-cpu)
5. ⏸️ **vllm-core** - High-perf inference (profile: inference-vllm)

### Outside Docker:
- 🐍 Python CLI (optional convenience wrapper)
- 📁 Model files (./models/)
- 📁 Workspace (repo root)
- 📁 Persistent data (.forgekeeper/)

### Backend Reality:
**Backend = Node.js Express in `frontend` container**
- Not Python (Python CLI is just Docker orchestration)
- Single container with Express server + React build
- 48 server modules + autonomous agent + tools
- File-based persistence (no database needed)

---

**The "frontend" container is actually the entire backend!**
