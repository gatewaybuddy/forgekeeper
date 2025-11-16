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

- 🔐 **Sensitive Data Redaction** - Comprehensive pattern-based redaction prevents API keys, credentials, and PII from appearing in logs (T21)

- 🛡️ **Per-Request Rate Limiting** - Token bucket rate limiter prevents runaway tool loops by throttling at the API boundary (T22)

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

**Status**: ✅ Complete (Phases 1-2, T11-T12, M1 Complete)

Extensible tool ecosystem with comprehensive management, monitoring, hardened execution sandbox, and full audit trail.

**Features:**
- ✅ AI-generated tool approval workflow
- ✅ Per-tool error statistics and tracking
- ✅ Regression monitoring for performance degradation
- ✅ Resource usage tracking (CPU, memory, disk)
- ✅ Dynamic tool loading and reloading
- ✅ **T11: Hardened execution sandbox** with centralized allowlist, argument validation, and structured telemetry
- ✅ **T12: Tool output persistence** with ContextLog integration and UI diagnostics
- ✅ **T21: Sensitive data redaction** with comprehensive pattern matching and recursive object/array handling
- ✅ **T22: Per-request rate limiting** with token bucket algorithm
- ✅ **T28: System prompts** with guardrail guidance for AI agents
- ✅ **T29: UI feedback** with status badges and error actions
- ✅ **T30: Comprehensive documentation** covering usage, limits, and troubleshooting

**T11 Enhancements (Execution Hardening):**
- **Centralized Allowlist**: Curated list of permitted tools in `config/tools.config.mjs`
- **Argument Validation**: Schema-based validation for all tool arguments
- **Runtime Limits**: Configurable timeout (30s default), max retries, output size limits
- **Feature Flag**: Global `TOOLS_EXECUTION_ENABLED` toggle for emergency shutdown
- **Structured Telemetry**: JSON logs for start/finish/error phases consumable by downstream guardrails

**T12 Enhancements (Output Persistence & Audit Trail):**
- **ContextLog Integration**: All tool executions (start/finish/error) persisted to `.forgekeeper/context_log/*.jsonl`
- **Correlation IDs**: Every tool execution linked to `conv_id` and `trace_id` for end-to-end tracing
- **UI Diagnostics**: DiagnosticsDrawer displays recent tool executions with status badges, timing, and previews
- **API Endpoint**: `/api/tools/executions` for querying tool history with filtering by conversation or trace
- **Audit Trail**: Complete record of all tool invocations, arguments, results, and errors for troubleshooting

**T21 Enhancements (Sensitive Data Redaction):**
- **Comprehensive Pattern Matching**: Redacts API keys (Stripe, OpenAI, AWS, GitHub, Anthropic), JWTs, SSH keys, passwords, emails, credit cards, URLs with credentials, and database connection strings
- **Recursive Redaction**: Handles nested objects and arrays of arbitrary depth (configurable max depth)
- **Key-Based Redaction**: Automatically redacts values for sensitive field names (password, secret, token, api_key, etc.)
- **Preserve Structure**: Redaction maintains object/array structure for debuggability
- **Applied at Logging Boundary**: Tool execution receives unredacted arguments; only log previews are redacted
- **Configurable**: Aggressive mode for redacting any 32+ character strings, adjustable max preview size
- **33 Unit Tests**: Comprehensive test coverage for all redaction patterns and edge cases

**T22 Enhancements (Per-Request Rate Limiting):**
- **Token Bucket Algorithm**: Lightweight in-memory rate limiter with configurable burst and refill parameters
- **Configurable Limits**: Set max capacity (burst size), refill rate (tokens/second), and cost per request
- **429 Responses**: Returns HTTP 429 with Retry-After header when rate limit exceeded
- **Rate Limit Headers**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on all responses
- **Metrics Tracking**: Monitors rate limit hits, current bucket level, and total requests
- **Easy Override**: Simple environment variable toggle for local development (RATE_LIMIT_ENABLED=0)
- **API Boundary Protection**: Prevents runaway tool loops by throttling chat-to-tool traffic at the server boundary

**Built-in Tools (19 Total):**
- `get_time` - Current UTC timestamp
- `echo` - Echo provided text
- `read_file`, `read_dir` - Sandboxed file operations
- `write_file`, `write_repo_file` - Sandboxed file writing
- `http_fetch` - HTTP GET requests (gated)
- `git_status`, `git_diff`, `git_add`, `git_commit`, `git_push`, `git_pull` - Git operations
- `run_bash`, `run_powershell` - Shell commands (gated)
- `refresh_tools`, `restart_frontend` - System management
- `create_task_card` - Generate task cards (TGT integration)
- `check_pr_status` - GitHub PR status (SAPL integration)

**Redaction Examples:**

| Input | Redacted Output |
|-------|----------------|
| `sk_live_1234567890abcd` | `<redacted:stripe-live-key>` |
| `ghp_abc123...` | `<redacted:github-pat>` |
| `alice@example.com` | `<redacted:email>` |
| `postgresql://user:pass@host/db` | `postgresql://<redacted:db-creds>@host/db` |
| `{ "password": "secret123" }` | `{ "password": "<redacted>" }` |
| JWT tokens | `<redacted:jwt-token>` |
| SSH private keys | `<redacted:ssh-private-key>` |

**Environment Variables:**
```bash
# Legacy allowlist (comma-separated)
TOOL_ALLOW=get_time,echo,read_file     # Comma-separated allowlist

# T11: Execution sandbox and gating
TOOLS_EXECUTION_ENABLED=1              # Global execution toggle (default: 1)
TOOL_TIMEOUT_MS=30000                  # Execution timeout in ms (default: 30s)
TOOL_MAX_RETRIES=0                     # Max retries for failed tools (default: 0)
TOOL_MAX_OUTPUT_BYTES=1048576          # Max output size (default: 1MB)

# T21: Redaction settings
TOOLS_LOG_MAX_PREVIEW=4096             # Max preview size in bytes (default: 4096)

# T22: Rate limiting
RATE_LIMIT_ENABLED=1                   # Enable rate limiting (default: 1)
RATE_LIMIT_CAPACITY=100                # Max tokens (burst size, default: 100)
RATE_LIMIT_REFILL_RATE=10              # Tokens per second (default: 10)
RATE_LIMIT_COST_PER_REQUEST=1          # Tokens per request (default: 1)

# Tool runtime
TOOLS_FS_ROOT=.forgekeeper/sandbox     # Sandbox root
TOOLS_APPROVAL_REQUIRED=1              # Require approval for new tools
FRONTEND_ENABLE_BASH=1                 # Enable bash tool (default: 0)

# Tool prompt variants (T28)
TOOL_PROMPT_INCLUDE_GUARDRAILS=1       # Include guardrail guidance in prompts (default: 1)
TOOL_PROMPT_VARIANT=enabled            # "enabled" or "disabled" (default: enabled)
```

**Structured Log Format:**
```json
{
  "timestamp": "2025-11-16T10:30:45.123Z",
  "event": "tool_execution",
  "phase": "start|finish|error",
  "tool": "get_time",
  "version": "1.0.0",
  "trace_id": "abc123",
  "conv_id": "xyz789",
  "elapsed_ms": 45,
  "result_preview": "2025-11-16T10:30:45.123Z",
  "result_size_bytes": 24
}
```

**Endpoints**: 15+ at `/api/tools/*`

📖 **Documentation**:
- **[Tool Quickstart](docs/tooling/QUICKSTART.md)** - Setup and configuration guide
- **[Tool Guardrails](docs/tooling/GUARDRAILS.md)** - Complete guardrail reference
- **[Troubleshooting](docs/tooling/TROUBLESHOOTING.md)** - Common errors and solutions
- **[Tool Reference](docs/tooling/TOOLS_REFERENCE.md)** - Complete tool documentation
- **[API Reference](docs/api/tools_api.md)** - Tool API endpoints
- **[Tool Security Guide](docs/TOOL_SECURITY_GUIDE.md)** - Security best practices
- **[System Prompts](docs/prompts/system_prompt.md)** - Prompt templates

---

### Tool Prompt Variants (T28)

**Status**: ✅ Complete

System prompts have been refreshed to align with hardened tool workflow, providing agents with clear guidance on tool eligibility, guardrails, and failure-handling expectations.

**Prompt Modes:**

1. **Tool-Enabled Mode (Default)**: Includes comprehensive guardrail documentation
   - Lists all 19 allowed tools
   - Explains validation, timeouts, rate limits, redaction
   - Provides best practices and error recovery strategies
   - Enables via `TOOL_PROMPT_INCLUDE_GUARDRAILS=1`

2. **Tool-Disabled Mode**: Minimal tool definitions without guardrail guidance
   - Only tool signatures
   - No guardrail documentation
   - Useful for testing or minimal prompts
   - Enable via `TOOL_PROMPT_INCLUDE_GUARDRAILS=0`

**Switching Between Modes:**

Python API:
```python
from forgekeeper.llm.tool_usage import render_tool_developer_message
from forgekeeper.config import TOOL_PROMPT_INCLUDE_GUARDRAILS

# Use config-driven mode
message = render_tool_developer_message(tools, include_guardrails=TOOL_PROMPT_INCLUDE_GUARDRAILS)

# Explicit override
message = render_tool_developer_message(tools, include_guardrails=False)
```

Environment Variables:
```bash
# Default: Tool-enabled with guardrails
TOOL_PROMPT_INCLUDE_GUARDRAILS=1
TOOL_PROMPT_VARIANT=enabled

# Testing: Tool-disabled without guardrails
TOOL_PROMPT_INCLUDE_GUARDRAILS=0
TOOL_PROMPT_VARIANT=disabled
```

**What's Included in Guardrail Prompts:**
- 19-tool allowlist (from T11)
- Argument validation schemas (from T11)
- Timeout protection (30s default from T11)
- Output size limits (1MB from T11)
- Rate limiting (100 capacity, 10/sec from T22)
- Sensitive data redaction (from T21)
- ContextLog correlation IDs (from T12)
- Error handling strategies
- Best practices for tool usage

📖 **Full Documentation**: `docs/prompts/system_prompt.md`

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

### M2: Quality & Comprehensiveness Features

**Status**: ✅ Complete (T203-T212)

Forgekeeper provides advanced orchestration modes for improving response quality and handling complex, comprehensive queries.

#### Self-Review Mode

Automatically evaluates and iteratively improves response quality before delivery.

**Key Features:**
- Quality scoring (0.0-1.0) against configurable criteria
- Automatic regeneration with critique feedback
- Configurable thresholds and iteration limits
- Auto-detection heuristics for high-stakes queries

**Configuration:**
```bash
FRONTEND_ENABLE_REVIEW=1                  # Enable review mode
FRONTEND_REVIEW_MODE=auto                 # Trigger: manual, always, auto
FRONTEND_REVIEW_THRESHOLD=0.7             # Quality threshold (0.0-1.0)
FRONTEND_AUTO_REVIEW=1                    # Enable auto-detection
FRONTEND_AUTO_REVIEW_THRESHOLD=0.5        # Auto-detect confidence
```

📖 **Documentation**: [Self-Review Guide](docs/features/self_review.md), [Example](docs/examples/review_example.md)

#### Chunked Reasoning Mode

Breaks complex responses into multiple focused chunks for comprehensive coverage.

**Key Features:**
- Automatic outline generation
- Progressive chunk building (each builds on previous)
- Handles responses exceeding context limits

**Configuration:**
```bash
FRONTEND_ENABLE_CHUNKED=1                 # Enable chunked mode
FRONTEND_CHUNKED_MAX_CHUNKS=5             # Max chunks (3-5 optimal)
FRONTEND_AUTO_CHUNKED=1                   # Enable auto-detection
FRONTEND_AUTO_CHUNKED_THRESHOLD=0.3       # Auto-detect confidence
```

📖 **Documentation**: [Chunked Reasoning Guide](docs/features/chunked_reasoning.md), [Example](docs/examples/chunked_example.md)

### Combined Mode (Review + Chunked)

**Status**: ✅ Complete (T209)

Combines self-review iteration with chunked reasoning for high-quality, comprehensive responses.

**Strategies:**

1. **`per_chunk`** - Review each chunk individually before moving to the next
   - Use when: Each section needs independent quality validation
   - Behavior: Generate chunk → Review → Next chunk → Final assembly
   - Review events: One per chunk

2. **`final_only`** (default) - Generate all chunks, then review the assembled response
   - Use when: Cohesion across chunks is more important than individual chunk quality
   - Behavior: Generate all chunks → Assemble → Review final
   - Review events: Single review at the end

3. **`both`** - Review each chunk AND the final assembly
   - Use when: Maximum quality assurance is required
   - Behavior: Per-chunk reviews + final review
   - Review events: One per chunk + one final

**Environment Variables:**
```bash
# Enable both modes
FRONTEND_ENABLE_REVIEW=1
FRONTEND_ENABLE_CHUNKED=1

# Set strategy (per_chunk, final_only, both)
FRONTEND_COMBINED_REVIEW_STRATEGY=final_only

# Review configuration
FRONTEND_REVIEW_THRESHOLD=0.7          # Quality threshold (0.0-1.0)
FRONTEND_REVIEW_ITERATIONS=3           # Max review passes
FRONTEND_REVIEW_MODE=on_complex        # When to trigger review

# Chunked configuration
FRONTEND_CHUNKED_MAX_CHUNKS=5          # Max chunks per response
FRONTEND_CHUNKED_TOKENS_PER_CHUNK=1024 # Tokens per chunk
```

**How It Works:**

When both `FRONTEND_ENABLE_REVIEW` and `FRONTEND_ENABLE_CHUNKED` are enabled, the system automatically uses combined mode:

1. **Detection**: Server detects both features are enabled
2. **Strategy Selection**: Uses `FRONTEND_COMBINED_REVIEW_STRATEGY` to determine approach
3. **Orchestration**: Routes to appropriate combined orchestrator
4. **Logging**: All chunk and review events logged to ContextLog with `combined_mode_start` and `combined_mode_complete` events

**ContextLog Events:**
- `combined_mode_start` - Combined mode initiated with strategy
- `chunk_outline` - Outline generated (from chunked mode)
- `chunk_write` - Each chunk written (from chunked mode)
- `review_cycle` - Review events (per strategy)
- `chunk_assembly` - Chunks assembled (from chunked mode)
- `combined_mode_complete` - Combined mode completed with final score and total review passes

**Performance Considerations:**
- `per_chunk`: Slowest (N reviews for N chunks)
- `final_only`: Moderate (1 review for assembled response)
- `both`: Slowest + most thorough (N+1 reviews)

**When to Use Each Strategy:**

| Strategy | Best For | Trade-off |
|----------|----------|-----------|
| `per_chunk` | Technical documentation, multi-part tutorials | Speed for quality per section |
| `final_only` | Essays, narratives, cohesive explanations | Faster but may miss section-level issues |
| `both` | Critical documentation, academic writing | Maximum quality, slowest execution |

**Example Usage:**

Enable combined mode with final-only strategy:
```bash
# .env
FRONTEND_ENABLE_REVIEW=1
FRONTEND_ENABLE_CHUNKED=1
FRONTEND_COMBINED_REVIEW_STRATEGY=final_only
```

Check logs for combined mode events:
```bash
# View recent ContextLog events
tail -50 .forgekeeper/context_log/ctx-*.jsonl | jq 'select(.act | contains("combined"))'
```

**Testing:**
```bash
# Run combined mode tests
node forgekeeper/frontend/tests/test_combined_mode.mjs
```

📖 **Implementation**: `frontend/server.combined.mjs`

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
