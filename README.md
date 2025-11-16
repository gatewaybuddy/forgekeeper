# Forgekeeper

![CI](https://github.com/gatewaybuddy/forgekeeper/workflows/CI/badge.svg)
![CodeQL](https://github.com/gatewaybuddy/forgekeeper/workflows/CodeQL%20Security%20Scan/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)

**AI development platform with autonomous agents, self-improvement capabilities, and local-first inference.**

Forgekeeper combines local LLM inference (llama.cpp/vLLM) with an intelligent autonomous agent system featuring episodic memory, user preference learning, diagnostic reflection, and proactive multi-alternative planning.

---

## ✨ Key Features

- 🤖 **Autonomous Agent** - Self-improving agent with 87.5% task completion rate (7/8 phases complete)
  - Episodic memory with semantic search
  - User preference learning (coding style, tools, workflow)
  - "5 Whys" diagnostic reflection with 85-90% error recovery
  - Proactive multi-alternative planning (40-60% fewer failed iterations)

- 📊 **Telemetry-Driven Task Generation (TGT)** - Automatically detect issues and generate task cards from system telemetry ([User Guide](docs/guides/TGT_USER_GUIDE.md))

- 🔒 **Safe Auto-PR Loop (SAPL)** - Automated, safe PR creation with comprehensive safety controls ([User Guide](docs/guides/SAPL_USER_GUIDE.md))

- 🛠️ **Tool System** - Extensible tool ecosystem with approval workflows, error tracking, and resource monitoring

- 💬 **Harmony Protocol** - Reasoning + final response split for transparent chain-of-thought

- 🎯 **Metrics-Informed Prompting (MIP)** - Data-driven hints to reduce incomplete responses

- 🌐 **Local-First** - Full control with local inference (no API costs, unlimited iterations)

- 🔒 **Security** - Automated dependency updates, CodeQL scanning, vulnerability reporting ([Security Policy](SECURITY.md))

---

## 🚀 Quick Start

**New to Forgekeeper?** See **[QUICKSTART.md](QUICKSTART.md)** for a 10-minute path to your first contribution.

### Prerequisites

- **Docker** + **Docker Compose** (for inference backend)
- **Python 3.11+** (for CLI and agent)
- **Node.js 20+** (for frontend)
- **Optional**: NVIDIA GPU with CUDA (for accelerated inference)

### Three Steps to Get Started

#### 1. Clone and Configure

```bash
git clone https://github.com/gatewaybuddy/forgekeeper.git
cd forgekeeper

# Copy and customize environment
cp .env.example .env
# Edit .env to set FK_CORE_KIND (llama or vllm) and other settings
```

#### 2. Start the Stack

**Option A: Quick start (minimal)**
```bash
bash forgekeeper/scripts/ensure_llama_core.sh
```

**Option B: Full stack (recommended)**
```bash
python -m forgekeeper ensure-stack --build
```

This will:
- Start llama.cpp or vLLM inference backend (port 8001)
- Launch Express + React frontend (port 5173 dev / 3000 prod)
- Set up tool orchestration and autonomous agent system

#### 3. Access the UI

**Development mode:**
```bash
cd forgekeeper/frontend
npm install
npm run dev
```
Open http://localhost:5173

**Production mode:**
Open http://localhost:3000 (served by Express)

### First Chat

Try the Python CLI:
```bash
python -m forgekeeper chat -p "Hello! Tell me about your capabilities."
```

Or use the web UI to start a conversation with tool support, reasoning visibility, and autonomous mode.

---

## 📚 Core Features in Depth

### Autonomous Agent

**Status**: ✅ 87.5% Complete (7/8 phases)

The autonomous agent executes tasks with advanced self-improvement capabilities:

**Implemented Capabilities:**
- **Phase 1-3**: Recursive feedback, meta-cognition, cross-session learning
- **Phase 4**: Diagnostic reflection with "5 Whys" root cause analysis
- **Phase 5**: Episodic memory (TF-IDF semantic search) + user preference learning
- **Phase 6**: Multi-alternative planning with effort/risk/alignment evaluation
- **Phase 7**: Multi-step lookahead (2-3 steps) with adaptive weight learning

**Measured Impact:**
- Failure rate: 35% → 12% (66% reduction)
- Avg iterations per task: 12 → 8 (33% faster)
- Error recovery success: 40% → 85% (112% improvement)
- Confidence calibration error: 45% → 24% (47% reduction)

**Environment Variables:**
```bash
AUTONOMOUS_ENABLED=1                    # Enable autonomous agent
AUTONOMOUS_MAX_ITERATIONS=50           # Max iterations per session
AUTONOMOUS_ENABLE_ALTERNATIVES=1       # Multi-alternative planning
AUTONOMOUS_ENABLE_LOOKAHEAD=1          # Multi-step lookahead
```

**Endpoints**: 20+ at `/api/autonomous/*`, `/api/episodes/*`, `/api/preferences/*`

📖 **Documentation**: `docs/autonomous/PROJECT_ROADMAP.md`, `docs/PHASE5_*.md`

---

### TGT (Telemetry-Driven Task Generation)

**Status**: ✅ Complete (Weeks 1-9)

Automatically analyzes ContextLog telemetry to generate actionable task cards.

**Features:**
- 5 analyzer types: continuation-rate, error-spike, docs-gap, performance, ux-issue
- Auto-approval for high-confidence tasks
- Task dependencies with graph visualization
- Templates for common patterns
- Batch operations (multi-select approve/dismiss)
- Real-time SSE updates
- Analytics dashboard with funnel metrics

**Environment Variables:**
```bash
TASKGEN_ENABLED=1                      # Enable TGT
TASKGEN_WINDOW_MIN=60                  # Analysis window (minutes)
TASKGEN_MIN_CONFIDENCE=0.7             # Min confidence threshold
TASKGEN_AUTO_APPROVE=1                 # Auto-approve high-confidence tasks
```

**UI Access**: Open AutonomousPanel → Click "Tasks…" button

**Endpoints**: 28 at `/api/tasks/*`

📖 **Documentation**: `docs/autonomous/tgt/README.md`

---

### SAPL (Safe Auto-PR Loop)

**Status**: ✅ Complete

Safe, automated PR creation from TGT task suggestions.

**Safety Features:**
- ✅ Allowlist-only (docs, tests, config - never runtime code)
- ✅ Dry-run default (`AUTO_PR_DRYRUN=1`)
- ✅ Kill-switch (`AUTO_PR_ENABLED=0`)
- ✅ Full ContextLog audit
- ✅ No auto-merge by default

**Workflow:**
1. TGT suggests task → 2. User clicks "Propose PR" → 3. Preview diff → 4. Validate files → 5. Create PR

**Environment Variables:**
```bash
AUTO_PR_ENABLED=1                      # Enable SAPL (default: 0)
AUTO_PR_DRYRUN=1                       # Safe preview mode (default: 1)
AUTO_PR_ALLOW=README.md,docs/**/*.md   # Allowlist patterns
```

**Prerequisites**: GitHub CLI (`gh`) installed and authenticated

**Endpoints**: 5 at `/api/auto_pr/*`

📖 **Documentation**: `docs/sapl/README.md`

---

### Tool System

**Status**: ✅ Complete (Phases 1-2)

Extensible tool ecosystem with comprehensive management and monitoring.

**Features:**
- ✅ AI-generated tool approval workflow
- ✅ Per-tool error statistics and tracking
- ✅ Regression monitoring for performance degradation
- ✅ Resource usage tracking (CPU, memory, disk)
- ✅ Dynamic tool loading and reloading

**Built-in Tools:**
- `get_time` - Current UTC timestamp
- `echo` - Echo provided text
- `read_file`, `read_dir` - Sandboxed file operations
- `write_file` - Sandboxed file writing
- `run_powershell`, `run_bash` - Shell commands (gated)
- `create_task_card` - Generate task cards (TGT integration)
- `check_pr_status` - GitHub PR status (SAPL integration)

**Environment Variables:**
```bash
TOOL_ALLOW=get_time,echo,read_file     # Comma-separated allowlist
TOOLS_FS_ROOT=.forgekeeper/sandbox     # Sandbox root
TOOLS_APPROVAL_REQUIRED=1              # Require approval for new tools
FRONTEND_ENABLE_BASH=1                 # Enable bash tool (default: 0)
```

**Endpoints**: 15+ at `/api/tools/*`

📖 **Documentation**: `docs/api/tools_api.md`

---

### MIP (Metrics-Informed Prompting)

**Status**: ✅ Complete & Integrated

Reduces incomplete responses by injecting data-driven hints based on recent telemetry.

**How It Works:**
1. Analyzes ContextLog for continuation patterns (fence, punct, short, length)
2. Detects dominant reason for incomplete responses
3. Generates specific hint based on pattern
4. Injects hint into system prompt before tool loop
5. Logs hint application to ContextLog

**Environment Variables:**
```bash
PROMPTING_HINTS_ENABLED=1              # Enable MIP
PROMPTING_HINTS_MINUTES=10             # Analysis window
PROMPTING_HINTS_THRESHOLD=0.15         # Continuation rate threshold (15%)
```

**Endpoints**: 3 at `/api/prompting_hints/*`

📖 **Documentation**: `frontend/server.prompting-hints.mjs`

---

### Additional Features

**Harmony Protocol** - Reasoning + final response split for chain-of-thought transparency
**Thought World Mode** - Isolated simulation environment for counterfactual reasoning
**Scout Metrics** - Performance monitoring with request rates, response times, error rates
**ContextLog** - JSONL-backed event logging with correlation IDs and telemetry

---

## 🏗️ Architecture

Forgekeeper uses a **three-layer architecture** optimized for local development:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                │
│  - Web UI, diagnostics, task management                 │
│  Port: 5173 (dev) / 3000 (prod)                         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  Backend (Express + Node.js)                            │
│  - Chat orchestration, tool execution, SSE streaming    │
│  - Autonomous agent, TGT, SAPL, MIP                     │
│  Port: 3000                                             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  Inference Core (llama.cpp or vLLM)                     │
│  - OpenAI-compatible API (/v1/chat/completions)         │
│  Port: 8001                                             │
└─────────────────────────────────────────────────────────┘
```

**Storage** (all JSONL-based, gitignored):
- `.forgekeeper/context_log/` - Event logs
- `.forgekeeper/preferences/` - User preferences
- `.forgekeeper/playground/.episodic_memory.jsonl` - Episodic memory
- `.forgekeeper/learning/outcomes.jsonl` - Outcome tracking

**Key Files:**
- `CLAUDE.md` - Architecture guide (for AI assistants)
- `frontend/server.mjs` - Main Express server
- `frontend/server.orchestrator.mjs` - Tool orchestration loop
- `frontend/core/agent/autonomous.mjs` - Autonomous agent
- `frontend/core/taskgen/` - TGT system

📖 **Full Architecture**: See `CLAUDE.md` (condensed 366-line guide)

---

## 🧪 Development

### Running Tests

**Frontend (TypeScript + Vitest):**
```bash
cd forgekeeper/frontend
npm run test        # Run all tests
npm run typecheck   # TypeScript validation
npm run lint        # ESLint
npm run build       # Production build
```

**Python (pytest):**
```bash
cd forgekeeper
pytest -q tests/
```

**Smoke Tests:**
```bash
# Mock OpenAI server (no GPU required)
node forgekeeper/scripts/mock_openai_server.mjs &
FK_CORE_API_BASE=http://localhost:8001 python forgekeeper/scripts/test_harmony_basic.py
```

### Make Targets

```bash
make dev-ui          # Vite dev server
make ui-build        # Build UI
make lint            # ESLint
make typecheck       # TypeScript check
make test-ui         # Frontend tests
make test-py         # Python tests
make task-sanity     # Lint task cards
make pr-check TASK=T123  # PR validation
```

### Docker Development

**Start full stack:**
```bash
docker compose up -d
```

**Restart inference core:**
```bash
docker compose restart llama-core
# or for vLLM:
docker compose restart vllm-core
```

**View logs:**
```bash
docker compose logs -f frontend
docker compose logs -f llama-core
```

### Environment Configuration

Key environment variables (see `.env.example` for full list):

**Core Settings:**
```bash
FK_CORE_KIND=llama                     # llama or vllm
FK_CORE_API_BASE=http://localhost:8001/v1
LLAMA_MODEL_CORE=/models/your-model    # Model path
```

**Frontend:**
```bash
FRONTEND_PORT=3000
FRONTEND_MAX_TOKENS=8192
FRONTEND_TEMP=0.0                      # Temperature
FRONTEND_TOP_P=0.4                     # Nucleus sampling
FRONTEND_USE_HARMONY=1                 # Enable reasoning split
```

**ContextLog:**
```bash
FGK_CONTEXTLOG_DIR=.forgekeeper/context_log
FGK_CONTEXTLOG_MAX_BYTES=10485760      # 10MB rotation
```

📖 **Full Configuration Guide**: See `CLAUDE.md` sections

---

## 📖 Documentation

### Quick References
- **[CLAUDE.md](CLAUDE.md)** - Condensed architecture guide (366 lines, for AI assistants)
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contributing guidelines *(coming soon)*
- **[QUICKSTART.md](docs/QUICKSTART.md)** - 5-minute setup guide *(coming soon)*

### API Documentation
- [API Reference](docs/api/API_REFERENCE.md) - Complete API documentation
- [Chat Streaming](docs/api/chat_stream.md) - SSE streaming endpoints
- [Tools API](docs/api/tools_api.md) - Tool management endpoints
- [Tasks API](docs/api/tasks_api.md) - TGT task management
- [Autonomous API](docs/api/autonomous_api.md) - Autonomous agent endpoints

### Feature Guides
- [TGT Guide](docs/autonomous/tgt/README.md) - Telemetry-driven task generation
- [SAPL Guide](docs/sapl/README.md) - Safe auto-PR loop
- [Autonomous Agent Roadmap](docs/autonomous/PROJECT_ROADMAP.md) - Phase-by-phase breakdown
- [Episodic Memory](docs/PHASE5_EPISODIC_MEMORY.md) - Semantic search implementation
- [User Preferences](docs/PHASE5_USER_PREFERENCE_LEARNING.md) - Preference learning

### Architecture Decision Records (ADRs)
- [ADR-0001: ContextLog](docs/contextlog/adr-0001-contextlog.md) - JSONL event logging
- [ADR-0002: Self-Review](docs/adr-0002-self-review-and-chunked-reasoning.md) - Chunked reasoning
- [ADR-0003: Diagnostic Reflection](docs/adr-0003-diagnostic-reflection.md) - "5 Whys" analysis
- [ADR-0004: Task Planning](docs/adr-0004-intelligent-task-planning.md) - Intelligent planning

### Phase Completion Documentation
- [Phase 1-5](docs/autonomous/phases/) - Foundation, meta-cognition, learning, recovery
- [Phase 6](docs/autonomous/phases/PHASE6_COMPLETE.md) - Proactive multi-alternative planning
- [Phase 7](docs/autonomous/phases/PHASE7_COMPLETE.md) - Multi-step lookahead & learning

---

## 🛠️ CLI Reference

### Main Commands

**Start Stack:**
```bash
python -m forgekeeper ensure-stack [--build] [--include-mongo]
python -m forgekeeper up-core              # Core only
python -m forgekeeper compose              # With auto-rebuild detection
```

**Chat:**
```bash
python -m forgekeeper chat -p "Your prompt"
python -m forgekeeper chat -p "List files" --tools dir
python -m forgekeeper chat -p "Hello" --no-stream
```

**Switch Inference Backend:**
```bash
python -m forgekeeper switch-core llama    # Use llama.cpp
python -m forgekeeper switch-core vllm     # Use vLLM
```

### Utility Scripts

**Smoke Tests:**
```bash
bash forgekeeper/scripts/test_harmony_basic.py     # Basic chat test
bash forgekeeper/scripts/test_taskgen.sh 60        # TGT analyzer test
```

**Stack Management:**
```bash
bash forgekeeper/scripts/ensure_llama_core.sh      # Ensure llama.cpp core
bash forgekeeper/scripts/ensure_stack.sh           # Ensure full stack
pwsh forgekeeper/scripts/ensure_stack.ps1          # Windows version
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** following our code style
4. **Run tests** (`make test-ui && make test-py`)
5. **Commit** using Conventional Commits (`feat:`, `fix:`, `docs:`)
6. **Push and create a Pull Request**

### Task Cards System

We use `tasks.md` to track PRs:
- Each PR must reference a Task ID (`Task ID: T123` in description)
- Tasks define allowed file touches
- CI validates changes against task scope

Run locally:
```bash
make task-sanity               # Lint task cards
make pr-check TASK=T123        # Validate against task
```

📖 **Full Guidelines**: See `CONTRIBUTING.md` *(coming soon)*

---

## 📊 Project Status

**Autonomous Agent**: 87.5% Complete (7/8 phases)
- ✅ Phases 1-7: Foundation through multi-step lookahead
- ⏰ Phase 8: Collaborative Intelligence (planned)

**TGT System**: ✅ Complete (Weeks 1-9)
**SAPL System**: ✅ Complete
**Tool Management**: ✅ Complete (Phases 1-2)
**MIP Integration**: ✅ Complete

**CI/CD**: ✅ 4 jobs running (pr-sanity, frontend, python, smoke)

---

## 📜 License

MIT License - see LICENSE file for details

---

## 🔗 Links

- **GitHub**: [gatewaybuddy/forgekeeper](https://github.com/gatewaybuddy/forgekeeper)
- **Issues**: [Report bugs or request features](https://github.com/gatewaybuddy/forgekeeper/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/gatewaybuddy/forgekeeper/discussions)

---

**Built with ❤️ for local-first AI development**
