# Capability Expansion Plan: Maximum Autonomy Architecture

**Date**: 2025-11-21
**Status**: Draft
**Philosophy**: **Capability First, Guardrails Optional**

---

## 🎯 Core Philosophy

Forgekeeper is designed to be a **maximally capable** autonomous development assistant. The system should have:

1. **Broad Sandbox**: Full filesystem access, network access, shell execution
2. **Rich Tooling**: Comprehensive tool ecosystem with easy extensibility
3. **Optional Guardrails**: All safety features are OPT-IN, not mandatory
4. **Extensible Architecture**: Easy integration of MCP servers and Skills

**Guiding Principle**: The system's goal is to **complete tasks**. Restrictions should exist only to prevent user-requested limitations, not as defaults.

---

## 📊 Current State Analysis

### ✅ What's Working Well

**Already Capability-Focused**:
- ✅ Tools execution enabled by default (`TOOLS_EXECUTION_ENABLED=1`)
- ✅ Bash and PowerShell enabled by default
- ✅ Repo write access available (`FRONTEND_ENABLE_REPO_WRITE=1`)
- ✅ Comprehensive tool set (20+ tools)
- ✅ Git operations fully supported
- ✅ HTTP fetch for network access

**Good Defaults**:
- ✅ No tool allowlist by default (all tools available)
- ✅ Reasonable timeouts (30s)
- ✅ Adequate output limits (1MB)

### ⚠️ Current Restrictions (To Make Optional)

#### 1. **Sandbox Restrictions**
**Current**: `TOOLS_FS_ROOT=.forgekeeper/sandbox`
- Limits file operations to sandbox directory
- Prevents full filesystem access
- Restricts tool utility

**Proposed**:
```bash
# Default: No sandbox (full filesystem access)
TOOLS_FS_ROOT=/workspace  # or root of mounted volume
ENABLE_FS_SANDBOX=0       # NEW: Explicit opt-in for sandbox
```

#### 2. **Redaction Patterns** (T21)
**Current**: Aggressive auto-redaction of:
- API keys, tokens, secrets
- Passwords, SSH keys
- Credit cards, SSNs, emails, phones
- Database connection strings

**Problem**: May redact legitimate data needed for debugging/development

**Proposed**:
```bash
# Default: Minimal redaction (only in production logs)
ENABLE_LOG_REDACTION=0           # Disable by default
REDACTION_MODE=off               # Options: off, minimal, standard, aggressive
REDACTION_CONTEXT=production     # Only redact in production context
```

#### 3. **Rate Limiting** (T22)
**Current**: Token bucket (100 burst, 10/sec refill)

**Proposed**:
```bash
# Default: No rate limiting (unlimited local execution)
RATE_LIMIT_ENABLED=0             # Disable by default
RATE_LIMIT_CAPACITY=unlimited    # No cap on local dev
```

#### 4. **Resource Quotas**
**Current**: Disk quotas (10MB/tool), memory limits (512MB/tool)

**Proposed**:
```bash
# Default: No resource quotas
RESOURCE_QUOTAS_ENABLED=0        # Disable by default
TOOL_DISK_QUOTA_BYTES=unlimited  # No disk limits
TOOL_MEMORY_LIMIT_MB=unlimited   # No memory limits
```

#### 5. **Tool Signature Validation**
**Current**: Optional signature checking

**Proposed**:
```bash
# Default: No signature validation (trust local tools)
TOOL_SIGNATURE_CHECK=0           # Already disabled by default ✅
```

#### 6. **Regression Detection**
**Current**: Performance regression tracking

**Proposed**:
```bash
# Default: No regression checks (let it run fast)
REGRESSION_CHECK_ENABLED=0       # Already disabled by default ✅
```

---

## 🏗️ Architecture Redesign: Capability Layers

### Layer 1: Maximum Capability (Default)
**Goal**: Unrestricted local development environment

```bash
# DEFAULT .env for maximum capability
TOOLS_EXECUTION_ENABLED=1
ENABLE_FS_SANDBOX=0                    # NEW: Full filesystem access
TOOLS_FS_ROOT=/workspace               # Root of project
FRONTEND_ENABLE_BASH=1
FRONTEND_ENABLE_POWERSHELL=1
FRONTEND_ENABLE_REPO_WRITE=1
REPO_WRITE_ALLOW=**/*                  # Allow all files
ENABLE_LOG_REDACTION=0                 # NEW: No redaction
RATE_LIMIT_ENABLED=0                   # NEW: No rate limits
RESOURCE_QUOTAS_ENABLED=0              # NEW: No quotas
TOOL_SIGNATURE_CHECK=0
REGRESSION_CHECK_ENABLED=0
```

### Layer 2: Team Environment (Moderate Restrictions)
**Use Case**: Shared development with team visibility

```bash
ENABLE_FS_SANDBOX=0                    # Still no sandbox
ENABLE_LOG_REDACTION=1                 # Redact in shared logs
REDACTION_MODE=minimal                 # Only critical secrets
RATE_LIMIT_ENABLED=0                   # No limits (trust team)
RESOURCE_QUOTAS_ENABLED=0              # No quotas
```

### Layer 3: Production Environment (Opt-In Guardrails)
**Use Case**: Production deployment, compliance required

```bash
ENABLE_FS_SANDBOX=1                    # Sandbox for safety
TOOLS_FS_ROOT=/workspace/sandbox
ENABLE_LOG_REDACTION=1
REDACTION_MODE=aggressive
RATE_LIMIT_ENABLED=1
RATE_LIMIT_CAPACITY=100
RESOURCE_QUOTAS_ENABLED=1
TOOL_SIGNATURE_CHECK=1
REGRESSION_CHECK_ENABLED=1
REPO_WRITE_ALLOW=docs/**/*.md,*.example  # Restricted paths
```

---

## 🔌 MCP Server Integration Plan

### Overview
**Model Context Protocol (MCP)** provides standardized way to connect Claude to external tools and data sources.

### Architecture

```
┌─────────────────────────────────────────────────┐
│           Forgekeeper Orchestrator              │
│  (frontend/server.orchestrator.mjs)             │
└─────────────────┬───────────────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────────┐    ┌───────▼────────────┐
│  Native Tools │    │   MCP Client       │
│  (tools/*.mjs)│    │  (NEW)             │
└───────────────┘    └───────┬────────────┘
                             │
                 ┌───────────┼───────────┐
                 │           │           │
          ┌──────▼────┐ ┌───▼─────┐ ┌──▼─────────┐
          │ GitHub    │ │ Postgres│ │ Filesystem │
          │ MCP Server│ │ MCP Srv │ │ MCP Server │
          └───────────┘ └─────────┘ └────────────┘
```

### Implementation Plan

#### Phase 1: MCP Client Core (Week 1)
**Tasks**:
- [ ] **T401**: Install MCP TypeScript SDK
- [ ] **T402**: Create MCP client wrapper (`frontend/mcp/client.mjs`)
- [ ] **T403**: MCP server discovery and connection management
- [ ] **T404**: Convert MCP tools to Forgekeeper tool format
- [ ] **T405**: Integration with existing orchestrator

**Files to Create**:
```
frontend/
  mcp/
    client.mjs           # MCP client wrapper
    server-registry.mjs  # Manage connected servers
    tool-adapter.mjs     # Convert MCP tools → Forgekeeper tools
    config.mjs           # MCP configuration
```

**Configuration**:
```bash
# .env additions
MCP_ENABLED=1
MCP_SERVERS_CONFIG=.forgekeeper/mcp-servers.json
MCP_AUTO_DISCOVER=1
MCP_SERVER_TIMEOUT_MS=30000
```

**Server Configuration** (`.forgekeeper/mcp-servers.json`):
```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "${DATABASE_URL}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/workspace"
      }
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_TOKEN}"
      }
    }
  }
}
```

#### Phase 2: Pre-built MCP Servers (Week 2)
**Servers to Integrate**:
- ✅ GitHub (issues, PRs, repos, search)
- ✅ Git (enhanced git operations)
- ✅ Postgres (database queries)
- ✅ Filesystem (enhanced file operations)
- ✅ Puppeteer (browser automation)
- ✅ Slack (team communication)
- ✅ Google Drive (document access)

**Tasks**:
- [ ] **T406**: Test and validate each MCP server
- [ ] **T407**: Create configuration templates
- [ ] **T408**: Write integration tests
- [ ] **T409**: Document MCP server setup

#### Phase 3: Custom MCP Servers (Week 3)
**Custom Servers to Build**:
- [ ] **Forgekeeper-specific server**: Expose Forgekeeper internals (tasks, metrics, autonomous agent state)
- [ ] **Code analysis server**: AST parsing, code search, refactoring
- [ ] **Docker server**: Container management, image operations
- [ ] **AWS/Cloud server**: Cloud resource management

**Tasks**:
- [ ] **T410**: Design custom MCP server protocol
- [ ] **T411**: Implement Forgekeeper MCP server
- [ ] **T412**: Implement code analysis MCP server
- [ ] **T413**: Documentation and examples

---

## 🎓 Skills System Integration Plan

### Overview
**Skills** are modular, reusable capabilities that Claude autonomously invokes based on task requirements.

### Architecture

```
┌────────────────────────────────────────────────┐
│        Claude Code / Forgekeeper               │
└────────────────┬───────────────────────────────┘
                 │
     ┌───────────┴──────────┐
     │                      │
┌────▼──────────┐    ┌─────▼────────────┐
│ Project Skills│    │ Personal Skills  │
│ .claude/      │    │ ~/.claude/       │
│ skills/       │    │ skills/          │
└───────────────┘    └──────────────────┘
     │                      │
     ├── pdf/              ├── security/
     ├── excel/            ├── performance/
     ├── testing/          ├── refactor/
     └── deployment/       └── documentation/
```

### Skill Structure

```
.claude/skills/
  my-skill/
    SKILL.md              # Skill definition
    scripts/              # Helper scripts
    templates/            # Templates
    examples/             # Examples
```

**SKILL.md Format**:
```markdown
---
name: my-skill
description: Brief description of what this skill does
tags: [tag1, tag2]
version: 1.0.0
author: team-name
---

# My Skill

## When to Use
Describe scenarios where this skill should be invoked.

## Instructions
Step-by-step instructions for Claude to follow.

## Examples
Example usage patterns.

## Resources
- script: ./scripts/helper.sh
- template: ./templates/config.yaml
```

### Implementation Plan

#### Phase 1: Skills Infrastructure (Week 1)
**Tasks**:
- [ ] **T501**: Create `.claude/skills/` directory structure
- [ ] **T502**: Create skill template and README
- [ ] **T503**: Implement skill discovery mechanism
- [ ] **T504**: Integrate with Forgekeeper orchestrator
- [ ] **T505**: Document skill creation process

#### Phase 2: Core Skills Library (Week 2)
**Skills to Create**:

1. **Testing Skills**
   - `testing/unit` - Unit test generation
   - `testing/integration` - Integration test creation
   - `testing/e2e` - E2E test workflows

2. **Documentation Skills**
   - `docs/api` - API documentation generation
   - `docs/readme` - README.md creation
   - `docs/adr` - Architecture decision records

3. **Code Quality Skills**
   - `quality/refactor` - Code refactoring patterns
   - `quality/review` - Code review checklists
   - `quality/security` - Security audit

4. **Deployment Skills**
   - `deploy/docker` - Docker containerization
   - `deploy/ci` - CI/CD pipeline setup
   - `deploy/kubernetes` - K8s deployment

5. **Forgekeeper-Specific Skills**
   - `forgekeeper/task-card` - Task card creation
   - `forgekeeper/autonomous` - Autonomous mode workflows
   - `forgekeeper/phase8` - Approval workflows

**Tasks**:
- [ ] **T506**: Create testing skills
- [ ] **T507**: Create documentation skills
- [ ] **T508**: Create code quality skills
- [ ] **T509**: Create deployment skills
- [ ] **T510**: Create Forgekeeper-specific skills

#### Phase 3: Community Skills (Week 3)
**Goals**:
- Document skill marketplace concept
- Create skill submission process
- Build skill validation tools
- Enable community contributions

**Tasks**:
- [ ] **T511**: Create skill marketplace documentation
- [ ] **T512**: Build skill validation script
- [ ] **T513**: Create skill contribution guide
- [ ] **T514**: Set up skill registry

---

## 🚀 Implementation Roadmap

### Sprint 1: Guardrails Redesign (Week 1, 8-12 hours)

**Objective**: Make all guardrails opt-in, default to maximum capability

**Tasks**:
- [ ] **T301**: Add `ENABLE_FS_SANDBOX` flag (default: 0)
  - Modify `fs_common.mjs` to respect sandbox toggle
  - Update `read_file`, `write_file`, `read_dir` tools
  - Default `TOOLS_FS_ROOT` to `/workspace` or repo root

- [ ] **T302**: Add `ENABLE_LOG_REDACTION` flag (default: 0)
  - Modify `server.guardrails.mjs` to check flag
  - Add `REDACTION_MODE` (off/minimal/standard/aggressive)
  - Add `REDACTION_CONTEXT` (dev/staging/production)

- [ ] **T303**: Disable rate limiting by default
  - Update `server.ratelimit.mjs`
  - Set `RATE_LIMIT_ENABLED=0` in `.env.example`

- [ ] **T304**: Disable resource quotas by default
  - Update `server.tools.mjs`
  - Set `RESOURCE_QUOTAS_ENABLED=0` in `.env.example`

- [ ] **T305**: Update `.env.example` with new defaults
  - Document capability-first approach
  - Provide Layer 2 and Layer 3 examples

- [ ] **T306**: Update documentation
  - Revise `CLAUDE.md` with new philosophy
  - Update tool security guide
  - Create "Capability Layers" guide

**Acceptance Criteria**:
- Default install has no sandbox, no redaction, no rate limits
- All restrictions are opt-in via explicit env vars
- Documentation clearly explains capability-first approach

---

### Sprint 2: MCP Integration (Week 2-3, 16-20 hours)

**Objective**: Enable MCP server connectivity for unlimited extensibility

**Week 2 Tasks**:
- [ ] **T401**: Install MCP TypeScript SDK
  ```bash
  npm install --prefix forgekeeper/frontend @modelcontextprotocol/sdk
  ```

- [ ] **T402**: Create MCP client wrapper
  - File: `frontend/mcp/client.mjs`
  - Manage MCP server lifecycle (start, stop, restart)
  - Handle stdio/HTTP/SSE transports
  - Connection pooling and health checks

- [ ] **T403**: Create MCP server registry
  - File: `frontend/mcp/server-registry.mjs`
  - Load servers from `.forgekeeper/mcp-servers.json`
  - Auto-discovery of installed MCP packages
  - Hot-reload on configuration changes

- [ ] **T404**: Create MCP tool adapter
  - File: `frontend/mcp/tool-adapter.mjs`
  - Convert MCP tool definitions to Forgekeeper format
  - Handle argument mapping and validation
  - Result transformation and error handling

- [ ] **T405**: Integrate with orchestrator
  - Modify `server.orchestrator.mjs`
  - Merge MCP tools with native tools
  - Route MCP tool calls to appropriate servers
  - Add ContextLog events for MCP operations

**Week 3 Tasks**:
- [ ] **T406**: Test pre-built MCP servers
  - GitHub server integration test
  - Postgres server integration test
  - Filesystem server integration test
  - Puppeteer server integration test

- [ ] **T407**: Create configuration templates
  - Template for each official MCP server
  - Environment variable documentation
  - Security best practices

- [ ] **T408**: Write integration tests
  - Test MCP server lifecycle
  - Test tool discovery and invocation
  - Test error handling and timeouts
  - Test concurrent MCP operations

- [ ] **T409**: Documentation
  - MCP integration guide
  - Server configuration reference
  - Troubleshooting guide
  - Example workflows

**Acceptance Criteria**:
- MCP servers can be added via JSON configuration
- MCP tools appear in tool registry alongside native tools
- GitHub, Git, Postgres, Filesystem servers working
- Full documentation and examples

---

### Sprint 3: Skills System (Week 4, 12-16 hours)

**Objective**: Enable modular skills for reusable capabilities

**Week 4 Tasks**:
- [ ] **T501**: Create skills directory structure
  ```bash
  mkdir -p .claude/skills
  mkdir -p ~/.claude/skills
  ```

- [ ] **T502**: Create skill template
  - File: `.claude/skills/TEMPLATE/SKILL.md`
  - Include YAML frontmatter spec
  - Document skill structure
  - Provide example skill

- [ ] **T503**: Implement skill discovery
  - File: `frontend/skills/discovery.mjs`
  - Scan `.claude/skills/` and `~/.claude/skills/`
  - Parse SKILL.md files
  - Extract metadata and instructions

- [ ] **T504**: Integrate with orchestrator
  - Inject skill descriptions into system prompt
  - Trigger skill invocation based on task
  - Load skill resources dynamically
  - Log skill usage to ContextLog

- [ ] **T505**: Documentation
  - Skill creation guide
  - Skill best practices
  - Example skills library
  - Skill marketplace concept

- [ ] **T506-510**: Create core skills library
  - Testing skills (3 skills)
  - Documentation skills (3 skills)
  - Code quality skills (3 skills)
  - Deployment skills (3 skills)
  - Forgekeeper skills (3 skills)

**Acceptance Criteria**:
- Skills can be created by dropping folder in `.claude/skills/`
- Claude autonomously invokes skills when appropriate
- 15+ core skills created and documented
- Skill usage tracked in ContextLog

---

### Sprint 4: Custom MCP Servers (Week 5, 12-16 hours)

**Objective**: Build Forgekeeper-specific MCP servers

**Week 5 Tasks**:
- [ ] **T410**: Design Forgekeeper MCP server protocol
  - Tools: get_tasks, create_task, get_metrics, get_autonomous_state
  - Resources: task_cards, autonomous_history, context_logs
  - Prompts: task_templates, planning_templates

- [ ] **T411**: Implement Forgekeeper MCP server
  - File: `frontend/mcp-servers/forgekeeper-server.mjs`
  - Expose internal Forgekeeper data
  - Enable external tools to interact with Forgekeeper

- [ ] **T412**: Implement code analysis MCP server
  - File: `frontend/mcp-servers/code-analysis-server.mjs`
  - AST parsing and traversal
  - Code search and indexing
  - Refactoring operations

- [ ] **T413**: Documentation
  - Custom MCP server guide
  - API reference for each server
  - Integration examples

**Acceptance Criteria**:
- Forgekeeper MCP server exposes tasks and metrics
- Code analysis server provides AST and search capabilities
- Documentation enables community server creation

---

## 📈 Success Metrics

### Capability Metrics
- ✅ 100% of tasks completable without manual intervention
- ✅ Zero artificial restrictions on tool usage
- ✅ < 5 second average overhead for MCP tool calls
- ✅ 50+ available tools (native + MCP)
- ✅ 20+ skills in core library

### Adoption Metrics
- % of users using MCP servers
- % of users creating custom skills
- Number of community-contributed skills
- Number of custom MCP servers created

### Quality Metrics
- Task success rate with MCP tools vs. native tools
- Skill invocation accuracy
- MCP server uptime and reliability

---

## 🔒 Security Considerations

### Philosophy
Security through **transparency and user control**, not artificial restrictions.

### Approach
1. **Default Trust**: Trust local development environment
2. **Explicit Opt-In**: Security features are enabled when needed
3. **Layered Security**: Different modes for different contexts
4. **User Informed**: Clear logging and visibility into all operations

### Recommendations
- **Layer 1 (Dev)**: No restrictions, full logging, full visibility
- **Layer 2 (Team)**: Minimal redaction, shared visibility
- **Layer 3 (Prod)**: Full guardrails, compliance mode

---

## 📚 Documentation Updates Needed

1. **Philosophy Document** (`docs/philosophy/CAPABILITY_FIRST.md`)
   - Explain capability-first approach
   - When to use each layer
   - Customization guidelines

2. **MCP Integration Guide** (`docs/mcp/INTEGRATION_GUIDE.md`)
   - How to add MCP servers
   - Configuration reference
   - Troubleshooting

3. **Skills Guide** (`docs/skills/SKILLS_GUIDE.md`)
   - How to create skills
   - Skill best practices
   - Example skills

4. **Updated CLAUDE.md**
   - New architecture diagram
   - MCP and Skills sections
   - Updated configuration reference

5. **Security Guide** (`docs/security/LAYERED_SECURITY.md`)
   - Explain three layers
   - Configuration examples
   - Compliance guidance

---

## 🎯 Next Steps

### Immediate (This Week)
1. Review and approve this plan
2. Create task cards for Sprint 1 (T301-T306)
3. Begin guardrails redesign

### Short-term (Next 2 Weeks)
1. Complete Sprint 1 (guardrails)
2. Start Sprint 2 (MCP integration)
3. Draft MCP integration guide

### Medium-term (Next Month)
1. Complete all 4 sprints
2. Launch with 5+ MCP servers
3. Release 15+ core skills
4. Full documentation

---

## 🤝 Community Engagement

### Opportunities
1. **Open source MCP servers**: Community can contribute servers
2. **Skills marketplace**: Share and discover skills
3. **Best practices**: Community documentation
4. **Templates**: Starter kits for common use cases

### Support
1. GitHub Discussions for Q&A
2. Example repositories
3. Video tutorials (future)
4. Office hours (future)

---

**Status**: Ready for review and approval
**Estimated Total Effort**: 48-64 hours (6-8 weeks part-time)
**Priority**: HIGH - Foundational for maximum capability
**Dependencies**: None (can start immediately)
