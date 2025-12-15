# Changelog

## [v1.2.0] - 2025-11-29

### 2025-11-29 - Major Feature Release: MCP Integration, Skills System, Two-Phase Mode

This release merges 6 completed sprints adding major extensibility and safety features.

#### 🔌 MCP (Model Context Protocol) Integration (Sprint 2, PR #466)
- **NEW**: Full MCP client implementation for external tool integration
- **NEW**: MCP server registry with health checking and auto-reload
- **NEW**: Support for pre-built MCP servers:
  - GitHub API integration (`@modelcontextprotocol/server-github`)
  - PostgreSQL database access (`@modelcontextprotocol/server-postgres`)
  - Filesystem operations (`@modelcontextprotocol/server-filesystem`)
  - Git operations (`@modelcontextprotocol/server-git`)
  - Slack integration (`@modelcontextprotocol/server-slack`)
  - Browser automation (`@modelcontextprotocol/server-puppeteer`)
- **NEW**: JSON-based MCP server configuration (`.forgekeeper/mcp-servers.json`)
- **NEW**: MCP tool adapter for seamless integration with existing orchestrator
- **NEW**: Comprehensive MCP documentation (50+ pages)
- **NEW**: MCP integration tests (3 test files)

**Configuration**:
```bash
MCP_ENABLED=1  # Enable MCP integration
MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json
MCP_AUTO_RELOAD=1  # Auto-reload on config changes
MCP_HEALTH_CHECK_INTERVAL=60000  # Health check interval (ms)
```

**Impact**: Unlimited extensibility via standard protocol, access to thousands of community MCP servers

---

#### 🤖 Skills System (Sprint 3, PR #466)
- **NEW**: Claude Skills framework for reusable, modular capabilities
- **NEW**: Skills auto-invocation based on task matching
- **NEW**: Project skills (`.claude/skills/`) shared with team
- **NEW**: Personal skills (`~/.claude/skills/`) for individual use
- **NEW**: Skill discovery and injection system
- **NEW**: Example skills included:
  - `forgekeeper/task-card` - Task card generation
  - `test-generation` - Unit test generation
- **NEW**: Skill template for creating new skills
- **NEW**: Complete skills documentation and guide
- **NEW**: Skills registry and loader

**Features**:
- Auto-invoked by Claude when task matches
- Version-controlled (project skills in git)
- Reusable team expertise
- Skill usage logged to ContextLog

**Impact**: Reusable expertise across team, auto-invoked capabilities, version control for AI knowledge

---

#### 🛡️ Two-Phase Harmony Mode (Sprint 6, PR #466)
- **NEW**: Two-phase orchestration (plan → review → execute)
- **NEW**: High-stakes operation detection with auto-trigger
- **NEW**: Plan approval UI component with edit capabilities
- **NEW**: Reflection pass for post-generation self-critique
- **NEW**: Configurable auto-detection heuristics
- **NEW**: Plan editing before execution

**How It Works**:
1. **Phase 1**: Generate detailed plan WITHOUT executing tools
2. User reviews and optionally edits plan
3. **Phase 2**: Execute approved plan with full tool access

**Auto-Detection**:
- High-stakes keywords: `production`, `deploy`, `critical`, `refactor`
- Destructive operations: `delete database`, `drop table`
- Explicit requests: `show me a plan`, `step-by-step`

**Configuration**:
```bash
FRONTEND_ENABLE_TWO_PHASE=1  # Enable two-phase mode
FRONTEND_AUTO_TWO_PHASE=1  # Auto-detect high-stakes ops
FRONTEND_AUTO_TWO_PHASE_THRESHOLD=0.6  # Detection threshold
FRONTEND_TWO_PHASE_ALLOW_EDIT=1  # Allow plan editing
```

**Impact**: Safety controls for production changes, user review before execution, learning mode

---

#### 📊 Enhanced Collaborative Intelligence (Sprint 4, PR #466)
- **NEW**: Adaptive recommendation system learning from user patterns
- **NEW**: Enhanced preference analysis with deeper pattern detection
- **NEW**: Collaboration event tracking and analytics
- **NEW**: Approval/rejection pattern learning
- **NEW**: Confidence adjustment based on history
- **NEW**: Preference-driven recommendation filtering

**Features**:
- Learns from every approval/rejection
- Adjusts recommendations over time
- Surfaces most relevant alternatives
- Comprehensive collaboration analytics

**Impact**: Smarter recommendations, personalized to user preferences, improved workflow efficiency

---

#### 📋 Performance Analysis and Optimization Roadmap (PR #465)
- **NEW**: CODE_OPTIMIZATION_REPORT.md - Comprehensive performance analysis
- Identified 10 synchronous I/O operations blocking event loop
- Identified 2 mega-files (3,900+ lines) exceeding AI context limits
- Documented path to 100-250ms latency reduction
- Recommended caching strategies for config/tools endpoints
- Documented code duplication for future refactoring

**Expected Impact** (when implemented):
- 55% reduction in P50 response time (450ms → 200ms)
- 62% reduction in P99 response time (2.1s → 800ms)
- 80% reduction in I/O operations via batching
- 50-100ms improvement via config caching

---

#### 🧪 Complete Test Suite (Sprint 5, PR #466)
- **NEW**: 15 new test files (~3,000 lines of test code)
- **NEW**: MCP integration tests (3 files)
- **NEW**: Skills system tests
- **NEW**: Review mode tests
- **NEW**: Chunked orchestration tests
- **NEW**: Combined mode tests
- **NEW**: Collaborative intelligence tests
- **NEW**: Two-phase mode tests
- **NEW**: Heuristics tests
- **NEW**: SAPL comprehensive tests (PR #465)

**Coverage**:
- MCP client, registry, tool adapter
- Skills discovery, injection, auto-invocation
- Self-review quality scoring
- Chunked outline generation
- Combined mode strategies
- Auto-detection heuristics
- SAPL allowlist validation
- Error handling scenarios

**Impact**: Comprehensive CI/CD readiness, regression prevention, feature validation

---

#### 🔧 SAPL Improvements (PR #465)
- **FIX**: Export `DEFAULT_ALLOWLIST` for testing
- **FIX**: Export `getStatus()` function for status checks
- **NEW**: Comprehensive SAPL test suite (312 lines)
- **NEW**: ContextLog schema documentation (397 lines)
- **IMPROVE**: Better async I/O patterns in ContextLog
- **IMPROVE**: Enhanced error handling

**Impact**: Better testability, improved documentation, foundation for future optimizations

---

#### 📚 Documentation (Both PRs)
- **NEW**: `docs/mcp/README.md` - MCP integration guide (516 lines)
- **NEW**: `docs/mcp/CONFIGURATION.md` - MCP configuration (402 lines)
- **NEW**: `docs/skills/README.md` - Skills system guide (601 lines)
- **NEW**: `docs/features/sprint6-two-phase-reflection.md` - Two-Phase guide (610 lines)
- **NEW**: `docs/planning/CAPABILITY_EXPANSION_PLAN.md` - Expansion plan (711 lines)
- **NEW**: `docs/planning/CAPABILITY_EXPANSION_SUMMARY.md` - Summary (256 lines)
- **NEW**: `docs/guides/CAPABILITY_LAYERS.md` - Security layers (437 lines)
- **NEW**: `docs/autonomous/collaborative-intelligence.md` - Collaborative guide (856 lines)
- **NEW**: `docs/CODE_OPTIMIZATION_REPORT.md` - Performance analysis (1,080 lines)
- **NEW**: `docs/contextlog/schema.md` - ContextLog schema (397 lines)
- **UPDATE**: `.env.example` - All new environment variables documented

**Total Documentation**: ~6,500 lines of new/updated documentation

---

#### 🏗️ Capability Expansion Plan (Sprint 1, PR #466)
- **PROPOSED**: Capability-first philosophy (guardrails as opt-in)
- **PROPOSED**: Three-layer security model:
  - Layer 1: Maximum Capability (local dev, no restrictions)
  - Layer 2: Team Environment (minimal restrictions)
  - Layer 3: Production (full compliance)
- **DOCUMENTED**: 50-page capability expansion plan
- **DOCUMENTED**: Layer-based security architecture

**Note**: Philosophy change is documented but NOT implemented by default. Current guardrails remain active. This is a roadmap for future consideration.

---

### Statistics for v1.2.0

**Code Changes**:
- PR #465: 10 files (+2,102, -151)
- PR #466: 55 files (+17,089, -72)
- **Total**: 65 files (+19,191, -223)
- **Net**: +18,968 lines of code

**Features Added**:
- 6 sprints completed
- 4 major systems (MCP, Skills, Two-Phase, Enhanced Collaborative)
- 30+ new capabilities
- 15 new test files
- 50+ pages of documentation

**Development Effort**:
- ~60 hours of development (6 sprints)
- Completed in 1 day due to zero merge conflicts

---

### Breaking Changes

**None!** All new features are opt-in via environment variables.

---

### Migration Guide

#### Enabling New Features

**MCP Integration**:
```bash
# 1. Copy example config
cp .forgekeeper/mcp-servers.example.json .forgekeeper/mcp-servers.json

# 2. Add your tokens (e.g., GITHUB_TOKEN)
# Edit mcp-servers.json

# 3. Enable MCP
echo "MCP_ENABLED=1" >> .env

# 4. Restart
docker compose restart frontend
```

**Skills System**:
```bash
# Skills are automatically discovered from .claude/skills/
# No configuration needed - just start using them!
```

**Two-Phase Mode**:
```bash
# Enable two-phase mode
echo "FRONTEND_ENABLE_TWO_PHASE=1" >> .env
echo "FRONTEND_AUTO_TWO_PHASE=1" >> .env

# Restart
docker compose restart frontend
```

---

### Contributors

- Claude Code Review System
- Forgekeeper Team

---

### Links

- **PR #465**: https://github.com/gatewaybuddy/forgekeeper/pull/465
- **PR #466**: https://github.com/gatewaybuddy/forgekeeper/pull/466
- **Branch Analysis**: BRANCH_ANALYSIS_2025-11-29.md
- **Merge Strategy**: MERGE_STRATEGY_2025-11-29.md

---

This release merges 6 completed sprints adding major extensibility and safety features.

#### 🔌 MCP (Model Context Protocol) Integration (Sprint 2, PR #466)
- **NEW**: Full MCP client implementation for external tool integration
- **NEW**: MCP server registry with health checking and auto-reload
- **NEW**: Support for pre-built MCP servers:
  - GitHub API integration (`@modelcontextprotocol/server-github`)
  - PostgreSQL database access (`@modelcontextprotocol/server-postgres`)
  - Filesystem operations (`@modelcontextprotocol/server-filesystem`)
  - Git operations (`@modelcontextprotocol/server-git`)
  - Slack integration (`@modelcontextprotocol/server-slack`)
  - Browser automation (`@modelcontextprotocol/server-puppeteer`)
- **NEW**: JSON-based MCP server configuration (`.forgekeeper/mcp-servers.json`)
- **NEW**: MCP tool adapter for seamless integration with existing orchestrator
- **NEW**: Comprehensive MCP documentation (50+ pages)
- **NEW**: MCP integration tests (3 test files)

**Configuration**:
```bash
MCP_ENABLED=1  # Enable MCP integration
MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json
MCP_AUTO_RELOAD=1  # Auto-reload on config changes
MCP_HEALTH_CHECK_INTERVAL=60000  # Health check interval (ms)
```

**Impact**: Unlimited extensibility via standard protocol, access to thousands of community MCP servers

---

#### 🤖 Skills System (Sprint 3, PR #466)
- **NEW**: Claude Skills framework for reusable, modular capabilities
- **NEW**: Skills auto-invocation based on task matching
- **NEW**: Project skills (`.claude/skills/`) shared with team
- **NEW**: Personal skills (`~/.claude/skills/`) for individual use
- **NEW**: Skill discovery and injection system
- **NEW**: Example skills included:
  - `forgekeeper/task-card` - Task card generation
  - `test-generation` - Unit test generation
- **NEW**: Skill template for creating new skills
- **NEW**: Complete skills documentation and guide
- **NEW**: Skills registry and loader

**Features**:
- Auto-invoked by Claude when task matches
- Version-controlled (project skills in git)
- Reusable team expertise
- Skill usage logged to ContextLog

**Impact**: Reusable expertise across team, auto-invoked capabilities, version control for AI knowledge

---

#### 🛡️ Two-Phase Harmony Mode (Sprint 6, PR #466)
- **NEW**: Two-phase orchestration (plan → review → execute)
- **NEW**: High-stakes operation detection with auto-trigger
- **NEW**: Plan approval UI component with edit capabilities
- **NEW**: Reflection pass for post-generation self-critique
- **NEW**: Configurable auto-detection heuristics
- **NEW**: Plan editing before execution

**How It Works**:
1. **Phase 1**: Generate detailed plan WITHOUT executing tools
2. User reviews and optionally edits plan
3. **Phase 2**: Execute approved plan with full tool access

**Auto-Detection**:
- High-stakes keywords: `production`, `deploy`, `critical`, `refactor`
- Destructive operations: `delete database`, `drop table`
- Explicit requests: `show me a plan`, `step-by-step`

**Configuration**:
```bash
FRONTEND_ENABLE_TWO_PHASE=1  # Enable two-phase mode
FRONTEND_AUTO_TWO_PHASE=1  # Auto-detect high-stakes ops
FRONTEND_AUTO_TWO_PHASE_THRESHOLD=0.6  # Detection threshold
FRONTEND_TWO_PHASE_ALLOW_EDIT=1  # Allow plan editing
```

**Impact**: Safety controls for production changes, user review before execution, learning mode

---

#### 📊 Enhanced Collaborative Intelligence (Sprint 4, PR #466)
- **NEW**: Adaptive recommendation system learning from user patterns
- **NEW**: Enhanced preference analysis with deeper pattern detection
- **NEW**: Collaboration event tracking and analytics
- **NEW**: Approval/rejection pattern learning
- **NEW**: Confidence adjustment based on history
- **NEW**: Preference-driven recommendation filtering

**Features**:
- Learns from every approval/rejection
- Adjusts recommendations over time
- Surfaces most relevant alternatives
- Comprehensive collaboration analytics

**Impact**: Smarter recommendations, personalized to user preferences, improved workflow efficiency

---

#### 📋 Performance Analysis and Optimization Roadmap (PR #465)
- **NEW**: CODE_OPTIMIZATION_REPORT.md - Comprehensive performance analysis
- Identified 10 synchronous I/O operations blocking event loop
- Identified 2 mega-files (3,900+ lines) exceeding AI context limits
- Documented path to 100-250ms latency reduction
- Recommended caching strategies for config/tools endpoints
- Documented code duplication for future refactoring

**Expected Impact** (when implemented):
- 55% reduction in P50 response time (450ms → 200ms)
- 62% reduction in P99 response time (2.1s → 800ms)
- 80% reduction in I/O operations via batching
- 50-100ms improvement via config caching

---

#### 🧪 Complete Test Suite (Sprint 5, PR #466)
- **NEW**: 15 new test files (~3,000 lines of test code)
- **NEW**: MCP integration tests (3 files)
- **NEW**: Skills system tests
- **NEW**: Review mode tests
- **NEW**: Chunked orchestration tests
- **NEW**: Combined mode tests
- **NEW**: Collaborative intelligence tests
- **NEW**: Two-phase mode tests
- **NEW**: Heuristics tests
- **NEW**: SAPL comprehensive tests (PR #465)

**Coverage**:
- MCP client, registry, tool adapter
- Skills discovery, injection, auto-invocation
- Self-review quality scoring
- Chunked outline generation
- Combined mode strategies
- Auto-detection heuristics
- SAPL allowlist validation
- Error handling scenarios

**Impact**: Comprehensive CI/CD readiness, regression prevention, feature validation

---

#### 🔧 SAPL Improvements (PR #465)
- **FIX**: Export `DEFAULT_ALLOWLIST` for testing
- **FIX**: Export `getStatus()` function for status checks
- **NEW**: Comprehensive SAPL test suite (312 lines)
- **NEW**: ContextLog schema documentation (397 lines)
- **IMPROVE**: Better async I/O patterns in ContextLog
- **IMPROVE**: Enhanced error handling

**Impact**: Better testability, improved documentation, foundation for future optimizations

---

#### 📚 Documentation (Both PRs)
- **NEW**: `docs/mcp/README.md` - MCP integration guide (516 lines)
- **NEW**: `docs/mcp/CONFIGURATION.md` - MCP configuration (402 lines)
- **NEW**: `docs/skills/README.md` - Skills system guide (601 lines)
- **NEW**: `docs/features/sprint6-two-phase-reflection.md` - Two-Phase guide (610 lines)
- **NEW**: `docs/planning/CAPABILITY_EXPANSION_PLAN.md` - Expansion plan (711 lines)
- **NEW**: `docs/planning/CAPABILITY_EXPANSION_SUMMARY.md` - Summary (256 lines)
- **NEW**: `docs/guides/CAPABILITY_LAYERS.md` - Security layers (437 lines)
- **NEW**: `docs/autonomous/collaborative-intelligence.md` - Collaborative guide (856 lines)
- **NEW**: `docs/CODE_OPTIMIZATION_REPORT.md` - Performance analysis (1,080 lines)
- **NEW**: `docs/contextlog/schema.md` - ContextLog schema (397 lines)
- **UPDATE**: `.env.example` - All new environment variables documented

**Total Documentation**: ~6,500 lines of new/updated documentation

---

#### 🏗️ Capability Expansion Plan (Sprint 1, PR #466)
- **PROPOSED**: Capability-first philosophy (guardrails as opt-in)
- **PROPOSED**: Three-layer security model:
  - Layer 1: Maximum Capability (local dev, no restrictions)
  - Layer 2: Team Environment (minimal restrictions)
  - Layer 3: Production (full compliance)
- **DOCUMENTED**: 50-page capability expansion plan
- **DOCUMENTED**: Layer-based security architecture

**Note**: Philosophy change is documented but NOT implemented by default. Current guardrails remain active. This is a roadmap for future consideration.

---

### Statistics for v1.2.0

**Code Changes**:
- PR #465: 10 files (+2,102, -151)
- PR #466: 55 files (+17,089, -72)
- **Total**: 65 files (+19,191, -223)
- **Net**: +18,968 lines of code

**Features Added**:
- 6 sprints completed
- 4 major systems (MCP, Skills, Two-Phase, Enhanced Collaborative)
- 30+ new capabilities
- 15 new test files
- 50+ pages of documentation

**Development Effort**:
- ~60 hours of development (6 sprints)
- Completed in 1 day due to zero merge conflicts

---

### Breaking Changes

**None!** All new features are opt-in via environment variables.

---

### Migration Guide

#### Enabling New Features

**MCP Integration**:
```bash
# 1. Copy example config
cp .forgekeeper/mcp-servers.example.json .forgekeeper/mcp-servers.json

# 2. Add your tokens (e.g., GITHUB_TOKEN)
# Edit mcp-servers.json

# 3. Enable MCP
echo "MCP_ENABLED=1" >> .env

# 4. Restart
docker compose restart frontend
```

**Skills System**:
```bash
# Skills are automatically discovered from .claude/skills/
# No configuration needed - just start using them!
```

**Two-Phase Mode**:
```bash
# Enable two-phase mode
echo "FRONTEND_ENABLE_TWO_PHASE=1" >> .env
echo "FRONTEND_AUTO_TWO_PHASE=1" >> .env

# Restart
docker compose restart frontend
```

---

### Contributors

- Claude Code Review System
- Forgekeeper Team

---

### Links

- **PR #465**: https://github.com/gatewaybuddy/forgekeeper/pull/465
- **PR #466**: https://github.com/gatewaybuddy/forgekeeper/pull/466
- **Branch Analysis**: BRANCH_ANALYSIS_2025-11-29.md
- **Merge Strategy**: MERGE_STRATEGY_2025-11-29.md

---

# Changelog

## 2025-10-05

- Default GPU core via llama.cpp `server-cuda` and `--jinja` enabled for OpenAI `tools`.
- Robust GPU detection and health wait in `scripts/start_gpu.ps1`.
- Fixed PowerShell streaming parser in `chat_reasoning.ps1`.
- Frontend tool orchestration: preserve `assistant.tool_calls` and sanitize orphan tool messages (prevents Jinja template 500s).
- Enabled `run_powershell` tool (gated by env) with runtime toggles at `/api/tools/config`.
- Upgraded Tools Diagnostics (args, timing, output preview) and pairing badges in transcript.
- UI cleanup: moved System Prompt and Tools Settings under a hamburger menu with modal overlays.
- Added generation controls (Max output tokens, Continue tokens, Continue attempts) and persistence.
- Increased default output token budgets and added multi-continue streaming loop.
- CLI: `--tools dir` demo and `--system` override. Added tests for basic chat and PS streaming.

