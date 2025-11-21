# Capability Expansion: Executive Summary

**Date**: 2025-11-21
**Status**: Approved for Implementation

---

## 🎯 Core Objective

Transform Forgekeeper from a **guarded system** to a **maximally capable system** with optional guardrails.

**Philosophy**: **Capability First, Guardrails Optional**

---

## 📋 Key Changes

### 1. Guardrails Become Opt-In (Default: OFF)

| Restriction | Current | Proposed |
|------------|---------|----------|
| Filesystem Sandbox | ON (`.forgekeeper/sandbox`) | **OFF** (full `/workspace` access) |
| Log Redaction | ON (aggressive) | **OFF** (no redaction in dev) |
| Rate Limiting | ON (100 burst) | **OFF** (unlimited) |
| Resource Quotas | ON (10MB/tool) | **OFF** (unlimited) |
| Tool Signatures | OFF ✅ | OFF ✅ |

**Result**: Local development has **zero artificial restrictions** by default.

### 2. Three Capability Layers

Users choose their security posture:

```bash
# Layer 1: Maximum Capability (DEFAULT)
ENABLE_FS_SANDBOX=0
ENABLE_LOG_REDACTION=0
RATE_LIMIT_ENABLED=0
RESOURCE_QUOTAS_ENABLED=0

# Layer 2: Team Environment
ENABLE_FS_SANDBOX=0
ENABLE_LOG_REDACTION=1
REDACTION_MODE=minimal

# Layer 3: Production (Compliance)
ENABLE_FS_SANDBOX=1
ENABLE_LOG_REDACTION=1
REDACTION_MODE=aggressive
RATE_LIMIT_ENABLED=1
RESOURCE_QUOTAS_ENABLED=1
```

### 3. MCP Server Integration

**What**: Model Context Protocol - standardized way to connect Claude to external tools/data

**Benefits**:
- Unlimited extensibility without core code changes
- Pre-built servers: GitHub, Postgres, Slack, Google Drive, Puppeteer
- Community ecosystem of thousands of servers
- Easy configuration (just add JSON)

**Architecture**:
```
Forgekeeper Orchestrator
    ↓
    ├─→ Native Tools (existing)
    └─→ MCP Client (NEW)
         ├─→ GitHub Server
         ├─→ Postgres Server
         ├─→ Filesystem Server
         └─→ Custom Servers
```

**Configuration** (`.forgekeeper/mcp-servers.json`):
```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

### 4. Skills System Integration

**What**: Modular, reusable capabilities that Claude autonomously invokes

**Benefits**:
- Share expertise across team (project skills in `.claude/skills/`)
- Personal skill library (`~/.claude/skills/`)
- Auto-invoked by Claude when task matches
- Version-controlled and shareable

**Structure**:
```
.claude/skills/
  my-skill/
    SKILL.md              # Instructions + metadata
    scripts/              # Helper scripts
    templates/            # Templates
```

**Examples**:
- `testing/unit` - Generate unit tests
- `docs/api` - Create API documentation
- `deploy/docker` - Containerize application
- `forgekeeper/task-card` - Create task cards

---

## 📅 Implementation Timeline

### Sprint 1: Guardrails Redesign (Week 1, 8-12 hours)
- [ ] T301: Add `ENABLE_FS_SANDBOX` flag (default: 0)
- [ ] T302: Add `ENABLE_LOG_REDACTION` flag (default: 0)
- [ ] T303: Disable rate limiting by default
- [ ] T304: Disable resource quotas by default
- [ ] T305: Update `.env.example` with new defaults
- [ ] T306: Update documentation

**Result**: Zero artificial restrictions by default

### Sprint 2: MCP Integration (Week 2-3, 16-20 hours)
- [ ] T401: Install MCP TypeScript SDK
- [ ] T402: Create MCP client wrapper
- [ ] T403: Create MCP server registry
- [ ] T404: Create MCP tool adapter
- [ ] T405: Integrate with orchestrator
- [ ] T406: Test pre-built MCP servers
- [ ] T407: Create configuration templates
- [ ] T408: Write integration tests
- [ ] T409: Documentation

**Result**: GitHub, Git, Postgres, Filesystem MCP servers working

### Sprint 3: Skills System (Week 4, 12-16 hours)
- [ ] T501: Create skills directory structure
- [ ] T502: Create skill template
- [ ] T503: Implement skill discovery
- [ ] T504: Integrate with orchestrator
- [ ] T505: Documentation
- [ ] T506-510: Create core skills library (15 skills)

**Result**: 15+ core skills available for reuse

### Sprint 4: Custom MCP Servers (Week 5, 12-16 hours)
- [ ] T410: Design Forgekeeper MCP server protocol
- [ ] T411: Implement Forgekeeper MCP server
- [ ] T412: Implement code analysis MCP server
- [ ] T413: Documentation

**Result**: Forgekeeper internals accessible via MCP

---

## 🎯 Success Criteria

### Immediate (Sprint 1)
- ✅ Fresh install has no filesystem sandbox
- ✅ No log redaction in development
- ✅ No rate limits on local execution
- ✅ All restrictions are explicit opt-in

### Short-term (Sprint 2-3)
- ✅ 5+ MCP servers integrated and working
- ✅ 15+ skills in core library
- ✅ Full documentation published

### Long-term
- ✅ 50+ available tools (native + MCP)
- ✅ 100% of development tasks completable without manual intervention
- ✅ Community contributing MCP servers and skills

---

## 🔑 Key Files Created

### Configuration
- `.forgekeeper/mcp-servers.example.json` - MCP server configuration template
- `.env.example` - Updated with capability-first defaults

### Skills Infrastructure
- `.claude/skills/TEMPLATE/SKILL.md` - Skill template
- `.claude/skills/README.md` - Skills documentation

### Documentation
- `docs/planning/CAPABILITY_EXPANSION_PLAN.md` - Complete implementation plan (50+ pages)
- `docs/planning/CAPABILITY_EXPANSION_SUMMARY.md` - This summary

---

## 🚀 Next Actions

### This Week
1. ✅ Review and approve capability expansion plan
2. ⏳ Create task cards for Sprint 1 (T301-T306)
3. ⏳ Begin implementation of guardrails redesign

### Next 2 Weeks
1. Complete Sprint 1 (guardrails)
2. Start Sprint 2 (MCP integration)
3. Test with GitHub and Git MCP servers

### Next Month
1. Complete all 4 sprints
2. Launch with 5+ MCP servers working
3. Release 15+ core skills
4. Publish complete documentation

---

## 💡 Why This Matters

### Current Pain Points (Solved)
- ❌ Sandbox limits filesystem access → ✅ Full access by default
- ❌ Redaction hides debugging info → ✅ No redaction in dev
- ❌ Rate limits slow local work → ✅ Unlimited local execution
- ❌ Limited tool extensibility → ✅ Infinite via MCP
- ❌ Knowledge not reusable → ✅ Skills system for reuse

### New Capabilities (Enabled)
- ✅ Full filesystem access for file operations
- ✅ Transparent logging for debugging
- ✅ Unlimited local iteration speed
- ✅ GitHub/Postgres/Slack integration via MCP
- ✅ Shared team expertise via skills
- ✅ Community ecosystem of tools

---

## 📖 Documentation

**Read First**:
- [Full Plan](./CAPABILITY_EXPANSION_PLAN.md) - Complete implementation details

**Reference**:
- [MCP Servers Config](.forgekeeper/mcp-servers.example.json) - Server configuration
- [Skills README](.claude/skills/README.md) - Skills documentation
- [Skills Template](.claude/skills/TEMPLATE/SKILL.md) - Skill creation template

**External**:
- [Model Context Protocol Docs](https://docs.anthropic.com/en/docs/mcp)
- [Anthropic Skills Guide](https://code.claude.com/docs/en/skills)
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)

---

**Status**: ✅ Ready for Implementation
**Estimated Effort**: 48-64 hours total (6-8 weeks part-time)
**Impact**: HIGH - Foundational transformation to maximum capability
**Risk**: LOW - All changes are additive, fully backward compatible
