# Forgekeeper Architecture Guide

## Overview

Forgekeeper is a modular AI development platform with a **three-layer architecture**:

1. **Inference Core** (llama.cpp/vLLM, port 8001) — OpenAI-compatible LLM API
2. **Frontend Node Server** (Express, port 3000) — Chat orchestration, tools, streaming
3. **Frontend React/Vite** (port 5173) — Web UI for chat and system control
4. **Python Agent & CLI** (optional) — Legacy scripts, demonstrations

**Design Philosophy**:
- **Capability First**: Maximum capability by default, guardrails optional
- **Local development**: Minimal ops burden, config-driven
- **No database**: Required for core flow
- **Unrestricted access**: Full filesystem, unlimited execution, transparent logging (dev default)
- **Configurable security**: Three-layer model (dev/team/production)

---

## Core Stack Quick Reference

### Inference (Port 8001)
- **Default**: llama.cpp (GPU via cuBLAS), OpenAI-compatible `/v1/chat/completions`
- **Alternative**: vLLM (`FK_CORE_KIND=vllm`)
- **Config**: `FK_CORE_API_BASE`, `LLAMA_MODEL_CORE`

### Frontend Server (Port 3000)
**Location**: `forgekeeper/frontend/`

**Key Files**:
- `server.mjs` — Main Express app
- `server.orchestrator.mjs` — Tool-aware chat loop
- `server.tools.mjs` — Tool registry and execution
- `server.harmony.mjs` — Reasoning/final protocol
- `server.contextlog.mjs` — Event logging
- `server.finishers.mjs` — Continuation heuristics

**Endpoints** (92+ total): Core chat (4), autonomous agent (18), tools (15), preferences/memory (9), TGT tasks (27), SAPL auto-PR (5), metrics (6), thought-world (6), MCP (1), ContextLog (4 including cleanup & stats), repo ops (2), health/config (6), auth (1).

### Frontend UI (Port 5173 dev / 3000 prod)
**Location**: `forgekeeper/frontend/src/`

**Key Components**: `App.tsx`, `Chat.tsx`, `DiagnosticsDrawer.tsx`, `TasksDrawer.tsx`, `AutonomousPanel.tsx`, `PreferencesPanel.tsx`, `PRPreviewModal.tsx`, analytics/task components.

**Tech**: Vite + TypeScript + React

### Python Agent (Optional)
**Location**: `forgekeeper/forgekeeper/`

**Commands**: `chat [prompt]`, `ensure-stack [--build]`

**CLI Architecture** (Refactored 2025-12-15):
- `__main__.py` (136 lines) - Pure orchestration, delegates to CLI modules
- `cli/commands.py` - Command implementations (chat, ensure-stack)
- `cli/handlers.py` - Request handlers and routing
- `cli/args.py` - Argument parsing and CLI structure
- `cli/output.py` - Output formatting and display

**Core Modules**: `core/`, `pipeline/`, `memory/`, `llm/`, `tools/`, `services/context_log/`

---

## Request Lifecycle (Simplified)

1. **UI → Server**: `POST /api/chat` with messages, model, tools
2. **Mode Selection**: Auto-detection heuristics or manual selection (standard/review/chunked/combined)
3. **Orchestrator**: Calls upstream LLM with tools (mode-specific logic)
4. **Tool Loop**: Parse tool_calls → execute locally → append results → repeat
5. **Quality/Chunking**: Review evaluation or chunk assembly if enabled
6. **ContextLog**: Log to `.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl`
7. **Response**: Return final assistant message with debug info
8. **UI**: Render content, store to localStorage, show diagnostics

---

## Configuration & Environment

**File**: `.env` (copy from `.env.example`)

### Essential Variables

**Core**:
- `FK_CORE_KIND=llama|vllm` — Inference backend
- `FK_CORE_API_BASE=http://localhost:8001/v1` — API endpoint

**Ports**:
- `FRONTEND_PORT=3000`, `LLAMA_PORT_CORE=8001`

**Frontend**:
- `FRONTEND_VLLM_MODEL=core` — Model name
- `FRONTEND_MAX_TOKENS=8192`, `FRONTEND_TEMP=0.0`, `FRONTEND_TOP_P=0.4`
- `FRONTEND_CONT_ATTEMPTS=2` — Auto-continuation tries
- `FRONTEND_USE_HARMONY=1` — Reasoning protocol

**M2 Orchestration Modes**:
- `FRONTEND_ENABLE_REVIEW=1` — Self-review mode
- `FRONTEND_REVIEW_THRESHOLD=0.7` — Quality threshold (0.0-1.0)
- `FRONTEND_AUTO_REVIEW=1` — Auto-detection for review
- `FRONTEND_ENABLE_CHUNKED=1` — Chunked reasoning mode
- `FRONTEND_CHUNKED_MAX_CHUNKS=5` — Max chunks per response
- `FRONTEND_AUTO_CHUNKED=1` — Auto-detection for chunked

**Tools**:
- `TOOL_ALLOW=...` — Comma-separated allowlist (default: all)
- `TOOLS_FS_ROOT=/workspace` — Filesystem root (default: full access)
- `FRONTEND_ENABLE_POWERSHELL=1`, `FRONTEND_ENABLE_BASH=1`

**Capability-First Configuration (T301-T306)**:
- `ENABLE_FS_SANDBOX=0` — Filesystem sandbox (0=disabled [default], 1=enabled)
- `ENABLE_LOG_REDACTION=0` — Log redaction (0=disabled [default], 1=enabled)
- `REDACTION_MODE=off` — Redaction level (off/minimal/standard/aggressive)
- `REDACTION_CONTEXT=dev` — Context-aware redaction (dev/staging/production)
- `RATE_LIMIT_ENABLED=0` — Rate limiting (0=disabled [default], 1=enabled)
- `RESOURCE_QUOTAS_ENABLED=0` — Resource quotas (0=disabled [default], 1=enabled)

**ContextLog**:
- `FGK_CONTEXTLOG_DIR=.forgekeeper/context_log`
- `FGK_CONTEXTLOG_MAX_BYTES=10485760` — 10MB rotation

**MCP Integration (T401-T409)**:
- `MCP_ENABLED=1` — Enable Model Context Protocol integration (1=enabled [default])
- `MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json` — Path to MCP servers config
- `MCP_AUTO_RELOAD=1` — Hot-reload on config changes (1=enabled [default])
- `MCP_HEALTH_CHECK_INTERVAL=60000` — Health check interval in ms (default: 60s)

**Collaborative Intelligence (T308-T312, M3 - Phase 8)**:
- `AUTONOMOUS_ENABLE_COLLABORATION=0` — Enable human-in-the-loop (0=disabled [default])
- `AUTONOMOUS_APPROVAL_TIMEOUT_MS=300000` — Approval timeout (5 minutes)
- `AUTONOMOUS_APPROVAL_REQUIRED=high` — Min risk for approval (low/medium/high/critical)
- `AUTONOMOUS_CHECKPOINT_THRESHOLD=0.7` — Confidence threshold for checkpoints
- `PREFERENCE_MIN_SAMPLES=5` — Min samples to detect patterns
- `PREFERENCE_CONFIDENCE_THRESHOLD=0.6` — Min confidence to use patterns
- `RECOMMENDATION_USE_PREFERENCES=1` — Use preferences in recommendations
- `RECOMMENDATION_CONFIDENCE_BOOST=0.15` — Boost for preferred options (+15%)
- `RECOMMENDATION_HISTORY_WEIGHT=0.3` — Weight of historical choices (30%)

### Docker Compose

**Services**: `llama-core`, `llama-core-cpu`, `vllm-core`, `frontend`
**Profiles**: Determined by `FK_CORE_KIND` (inference/inference-cpu/inference-vllm + ui)
**Network**: `forgekeeper-net` (external)

---

## Key Architectural Patterns

### 1. ContextLog (JSONL Event Store)
- **Storage**: `.forgekeeper/context_log/ctx-YYYYMMDD-HH.jsonl`
- **Rotation**: 10MB per file, hourly, 7-day retention
- **Schema**: `{id, ts, actor, act, conv_id, trace_id, iter, name, status, elapsed_ms, args_preview, result_preview, bytes}`
- **Readers**: Python `jsonl.tail()`, Node `tailEvents()`

### 2. Harmony Protocol
- **Purpose**: Reasoning + final split for models like o1
- **Fields**: `reasoning_content` (hidden), `content` (displayed)
- **Functions**: `extractHarmonyFinalStrict()`, `extractHarmonyAnalysisStrict()`

### 3. Tool Orchestration
- **Loop**: Call LLM → parse tool_calls → execute → append tool results → repeat
- **Definitions**: `frontend/tools/*.mjs` (ESM modules)
- **Registry**: `frontend/tools/index.mjs`

### 4. Streaming
- **Non-streaming**: `/api/chat` (full tool loop, return final)
- **Streaming**: `/api/chat/stream` (SSE, stream final turn)
- **Format**: `data: {"content": "token"}\ndata: [DONE]`

### 5. Configuration-Driven
- **Discovery**: `/config.json` exposes all capabilities
- **UI**: Disables unavailable features dynamically

### 6. Orchestration Modes (M2)
- **Standard**: Base tool-enabled orchestration
- **Review**: Iterative quality improvement with evaluation/regeneration
- **Chunked**: Multi-chunk generation for comprehensive responses
- **Combined**: Review + Chunked together
- **Auto-Detection**: Heuristic-based mode selection

---

## Directory Structure

```
forgekeeper/
├── .env                        # Config
├── .forgekeeper/               # Local state (gitignored)
│   ├── context_log/            # Event logs
│   ├── preferences/            # User preferences
│   ├── playground/             # Episodic memory
│   └── learning/               # Outcome tracking
├── docker-compose.yml
├── frontend/
│   ├── src/                    # React app
│   ├── tools/                  # Tool definitions
│   ├── mcp/                    # Model Context Protocol integration
│   ├── core/agent/             # Autonomous agent
│   │   ├── autonomous.mjs      # Main orchestrator (3,149 lines)
│   │   └── orchestrator/       # Modular architecture (refactored 2025-12-15)
│   │       ├── llm-client.mjs      # LLM interactions, prompt building
│   │       ├── memory-manager.mjs  # Memory coordination, checkpoints
│   │       ├── tool-handler.mjs    # Tool planning, inference, execution
│   │       └── reflector.mjs       # Self-evaluation, meta-cognition
│   ├── server.mjs              # Main server
│   ├── server.*.mjs            # Modules
│   └── package.json
├── forgekeeper/                # Python package
│   ├── __main__.py             # CLI orchestrator (136 lines, refactored 2025-12-15)
│   ├── cli/                    # CLI modules (refactored 2025-12-15)
│   │   ├── commands.py         # Command implementations
│   │   ├── handlers.py         # Request handlers
│   │   ├── args.py             # Argument parsing
│   │   └── output.py           # Output formatting
│   ├── services/context_log/
│   ├── core/, pipeline/, memory/, llm/, tools/
├── scripts/                    # Setup/test scripts
├── docs/                       # Documentation
│   ├── features/               # Feature-specific docs
│   ├── releases/               # Release notes
│   └── setup/                  # Setup guides
├── archive/                    # Archived session files
│   └── sessions/2025/          # Session transcripts and working docs
└── tasks.md                    # Task cards
```

---

## Iterative Reasoning Philosophy

**Core Principle**: Local inference = **unlimited iterations at no cost**

| Traditional (API) | Local (Forgekeeper) |
|------------------|---------------------|
| Minimize calls | Unlimited iterations |
| Large responses | Small, focused steps |
| Pack into one turn | Build through many turns |
| Verbose | Concise, clear |

**Tenets**:
1. Small steps (one focused thing per iteration)
2. Unlimited turns (no total limit)
3. Build up reasoning (many small → well-reasoned)
4. Memory is key (each adds to understanding)
5. Favor clarity (short over verbose)
6. Think → plan → execute → assess → repeat

---

## Advanced Features

### Autonomous Agent (7 Phases Complete)

**Progress**: 87.5% (7/8 phases)

| Phase | Status | Key Features |
|-------|--------|--------------|
| 1: Recursive Feedback | ✅ | Self-reflection, 10-iter history |
| 2: Meta-Cognition | ✅ | Confidence calibration, bias detection |
| 3: Cross-Session Learning | ✅ | Tool effectiveness tracking |
| 4: Error Recovery | ✅ | "5 Whys" analysis, 85-90% recovery |
| 5: Advanced Learning | ✅ | Episodic memory, user preferences |
| 6: Proactive Planning | ✅ | Multi-alternative evaluation |
| 7: Multi-Step Lookahead | ✅ | 2-3 step graphs, adaptive weights |
| 8: Collaborative Intelligence | ⏰ | Human-in-loop (planned) |

**Impact**: Failure rate 35%→12%, iterations 12→8, recovery 40%→85%

**Architecture** (Refactored 2025-12-15):

The autonomous agent uses a modular **orchestrator pattern** for clean separation of concerns:

**Main Orchestrator**: `autonomous.mjs` (3,149 lines)
- Pure orchestration logic
- Coordinates 4 specialized modules
- Main execution loop: reflect → execute → evaluate → repeat

**Orchestrator Modules** (`frontend/core/agent/orchestrator/`):

1. **LLMClient** (`llm-client.mjs`, 744 lines)
   - All LLM interactions and prompt building
   - Reflection parsing and validation
   - Task type detection and guidance
   - Diagnostic reflection (5 Whys analysis)

2. **MemoryManager** (`memory-manager.mjs`, 232 lines)
   - Coordinates all memory systems (session, episodic, preferences, tool effectiveness)
   - Checkpoint save/load
   - Session recording for learning

3. **ToolHandler** (`tool-handler.mjs`, 686 lines)
   - Tool planning and execution
   - Heuristic tool inference (200+ lines)
   - Argument inference for tool calls
   - Recovery strategy execution

4. **Reflector** (`reflector.mjs`, 513 lines)
   - Self-evaluation and meta-cognition
   - Accuracy scoring (prediction vs reality)
   - Stopping criteria logic
   - Result building and summary generation

**Supporting Modules**: `self-evaluator.mjs`, `episodic-memory.mjs`, `diagnostic-reflection.mjs`, `alternative-generator.mjs`, `effort-estimator.mjs`, `task-graph-builder.mjs`, `outcome-tracker.mjs`, `weight-learner.mjs`

**Benefits**:
- ✅ Improved testability (modules can be unit tested in isolation)
- ✅ Enhanced reusability (modules can be used by other agents)
- ✅ Better maintainability (clear boundaries, focused responsibilities)
- ✅ Reduced complexity (3,937 → 3,149 lines main file, -20%)

**Env Vars**:
- `AUTONOMOUS_ENABLE_ALTERNATIVES=1`, `AUTONOMOUS_ENABLE_LOOKAHEAD=1`
- `AUTONOMOUS_LOOKAHEAD_DEPTH=3`, `AUTONOMOUS_MIN_ALTERNATIVES=3`
- `AUTONOMOUS_EFFORT_WEIGHT=0.4`, `AUTONOMOUS_RISK_WEIGHT=0.3`, `AUTONOMOUS_ALIGNMENT_WEIGHT=0.3`

### TGT: Telemetry-Driven Task Generation

**Status**: ✅ Complete (Weeks 1-8)

**Purpose**: Auto-generate task cards from telemetry (continuations, errors, perf, docs gaps, UX issues)

**Heuristics**: High continuation rate (>15%), error spikes, missing docs, perf degradation, UX friction

**Endpoints**: 28 total (suggest, list, approve/dismiss, batch ops, analytics, funnel, templates, dependencies, priority, scheduler, stream)

**Env Vars**:
- `TASKGEN_ENABLED=1`, `TASKGEN_WINDOW_MIN=60`, `TASKGEN_MIN_CONFIDENCE=0.7`
- `TASKGEN_CONT_MIN=5`, `TASKGEN_CONT_RATIO_THRESHOLD=0.15`
- `TASKGEN_AUTO_APPROVE=0`, `TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9`

**Docs**: `docs/autonomous/tgt/`

### SAPL: Safe Auto-PR Loop

**Status**: ✅ Complete

**Purpose**: Automated PR creation with safety controls

**Safety**: Allowlist-only (docs/tests/examples), dry-run default, kill-switch, full audit

**Workflow**: TGT suggests → user proposes PR → preview diff → validate → create PR

**Env Vars**:
- `AUTO_PR_ENABLED=0` (kill-switch), `AUTO_PR_DRYRUN=1` (safe default)
- `AUTO_PR_ALLOW=README.md,docs/**/*.md,*.example,tests/**/*.mjs`
- `AUTO_PR_AUTOMERGE=0` (safe default)

**Prerequisites**: GitHub CLI (`gh`) installed and authenticated

**Docs**: `docs/sapl/README.md`

### MIP: Metrics-Informed Prompting

**Status**: ✅ Complete, integrated

**Purpose**: Inject data-driven hints to reduce incomplete responses

**Process**: Analyze ContextLog → detect patterns (fence, punct, short, length) → generate hints → inject into prompts

**Env Vars**:
- `PROMPTING_HINTS_ENABLED=1`, `PROMPTING_HINTS_MINUTES=10`
- `PROMPTING_HINTS_THRESHOLD=0.15`, `PROMPTING_HINTS_MIN_SAMPLES=5`

**Implementation**: `frontend/server.prompting-hints.mjs`

### Episodic Memory

**Storage**: `.forgekeeper/playground/.episodic_memory.jsonl`
**Embeddings**: Lightweight TF-IDF (fast, local)
**Search**: Top 3 similar successful sessions
**Integration**: Auto-injected into agent reflection prompts

### User Preferences

**Storage**: `.forgekeeper/preferences/*.jsonl`
**Categories**: Code style, tools, workflow, docs
**Inference**: Auto-detect from codebase
**Integration**: Injected into agent prompts

### Thought World Mode

**Purpose**: Isolated simulation for counterfactual reasoning
**Endpoints**: 6 (start, stream, tools, human-input)
**Env**: `THOUGHT_WORLD_ENABLED=1`, `THOUGHT_WORLD_MAX_DEPTH=5`

### Scout Metrics

**Purpose**: Performance monitoring
**Tracked**: Request rates, response times (p50/p95/p99), errors, tool times, continuations
**Env**: `SCOUT_ENABLED=1`, `SCOUT_RETENTION_HOURS=24`

---

## Quick Start

```bash
# 1. Ensure core
bash forgekeeper/scripts/ensure_llama_core.sh

# 2. Start stack
python -m forgekeeper ensure-stack --build
# Or: bash scripts/ensure_stack.sh (Linux/macOS)
# Or: pwsh scripts/ensure_stack.ps1 (Windows)

# 3. Access UI
http://localhost:5173 (dev) or http://localhost:3000 (prod)
```

---

## Useful Commands

```bash
# Dev server
npm --prefix forgekeeper/frontend run dev

# Build
npm --prefix forgekeeper/frontend run build

# Python CLI
python -m forgekeeper chat -p "Hello"

# Tests
pytest -q tests/
npm --prefix forgekeeper/frontend run test

# Linting
npm --prefix forgekeeper/frontend run lint

# Task validation
make -C forgekeeper task-sanity
```

---

## Guardrails & Conventions

**Commits**: Conventional (`feat:`, `fix:`, `chore:`, `docs:`), small and focused

**Code Style**:
- Python: PEP 8, 4-space, snake_case, type hints
- TypeScript: camelCase (vars), PascalCase (components), ESLint

**PRs**: Include `Task ID: T#`, screenshots for UI, run tests locally

**Testing**: Default to unit/smoke, integration only when task card requires

**Feature Gates**: Off by default, gated via env vars

---

## Key Files for Developers

**Chat flow**: `frontend/server.mjs`, `server.orchestrator.mjs`, `src/components/Chat.tsx`

**Add tool**: Create `frontend/tools/mytool.mjs` → export from `index.mjs` → test via `/config.json`

**MCP Integration**: `frontend/mcp/client.mjs`, `mcp/registry.mjs`, `mcp/tool-adapter.mjs`, `docs/mcp/README.md`

**ContextLog**: `forgekeeper/services/context_log/jsonl.py`, `frontend/server.contextlog.mjs`, `docs/adr/adr-0001-contextlog.md`

**Add task**: Edit `forgekeeper/tasks.md` → create PR with `Task ID: T#` → CI validates

---

## References

- **ADRs**: `docs/adr/` (Architecture Decision Records including ContextLog schema/design, collaborative-intelligence)
- **API Docs**: `docs/api/`
- **Task Cards**: `tasks.md`
- **Contributing**: `CONTRIBUTING.md`
- **Autonomous Phases**: `docs/autonomous/phases/`
- **TGT**: `docs/autonomous/tgt/`
- **SAPL**: `docs/sapl/`
- **MCP**: `docs/mcp/` (Model Context Protocol integration)
- **Collaborative Intelligence**: `docs/autonomous/collaborative-intelligence.md` (Human-in-the-loop, T308-T312)

---

**Last updated**: 2025-11-21
**Branch**: claude/code-review-tasks-01G9fy6vMN6zVp25RmcYRCtE
**Size**: ~430 lines with MCP and Collaborative Intelligence
