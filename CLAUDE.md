# Forgekeeper Architecture Guide

## Overview

Forgekeeper is a modular AI development platform with a **three-layer architecture**:

1. **Inference Core** (llama.cpp/vLLM, port 8001) — OpenAI-compatible LLM API
2. **Frontend Node Server** (Express, port 3000) — Chat orchestration, tools, streaming
3. **Frontend React/Vite** (port 5173) — Web UI for chat and system control
4. **Python Agent & CLI** (optional) — Legacy scripts, demonstrations

**Design Philosophy**: Local development, minimal ops burden, config-driven, no database required for core flow.

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

**Endpoints** (92 total): Core chat (4), autonomous agent (18), tools (15), preferences/memory (9), TGT tasks (27), SAPL auto-PR (5), metrics (6), thought-world (6), ContextLog (4 including cleanup & stats), repo ops (2), health/config (6), auth (1).

### Frontend UI (Port 5173 dev / 3000 prod)
**Location**: `forgekeeper/frontend/src/`

**Key Components**: `App.tsx`, `Chat.tsx`, `DiagnosticsDrawer.tsx`, `TasksDrawer.tsx`, `AutonomousPanel.tsx`, `PreferencesPanel.tsx`, `PRPreviewModal.tsx`, analytics/task components.

**Tech**: Vite + TypeScript + React

### Python Agent (Optional)
**Location**: `forgekeeper/forgekeeper/`

**Commands**: `chat [prompt]`, `ensure-stack [--build]`

**Modules**: `core/`, `pipeline/`, `memory/`, `llm/`, `tools/`, `services/context_log/`

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
- `TOOLS_FS_ROOT=.forgekeeper/sandbox` — Sandbox root
- `FRONTEND_ENABLE_POWERSHELL=0`, `FRONTEND_ENABLE_BASH=0`

**ContextLog**:
- `FGK_CONTEXTLOG_DIR=.forgekeeper/context_log`
- `FGK_CONTEXTLOG_MAX_BYTES=10485760` — 10MB rotation

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
│   ├── core/agent/             # Autonomous agent
│   ├── server.mjs              # Main server
│   ├── server.*.mjs            # Modules
│   └── package.json
├── forgekeeper/                # Python package
│   ├── __main__.py
│   ├── services/context_log/
│   ├── core/, pipeline/, memory/, llm/, tools/
├── scripts/                    # Setup/test scripts
├── docs/                       # Documentation
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

**Key Files**: `autonomous.mjs`, `self-evaluator.mjs`, `episodic-memory.mjs`, `diagnostic-reflection.mjs`, `alternative-generator.mjs`, `effort-estimator.mjs`, `task-graph-builder.mjs`, `outcome-tracker.mjs`, `weight-learner.mjs`

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

**ContextLog**: `forgekeeper/services/context_log/jsonl.py`, `frontend/server.contextlog.mjs`, `docs/adr/adr-0001-contextlog.md`

**Add task**: Edit `forgekeeper/tasks.md` → create PR with `Task ID: T#` → CI validates

---

## References

- **ADRs**: `docs/adr/` (Architecture Decision Records)
- **API Docs**: `docs/api/`
- **Task Cards**: `tasks.md`
- **Contributing**: `CONTRIBUTING.md`
- **Autonomous Phases**: `docs/autonomous/phases/`
- **TGT**: `docs/autonomous/tgt/`
- **SAPL**: `docs/sapl/`

---

**Last updated**: 2025-11-14
**Branch**: feat/contextlog-guardrails-telemetry
**Size**: Condensed from 1308 to ~450 lines (65% reduction)
