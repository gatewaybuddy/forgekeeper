# Autonomous Error Recovery - Quick Summary

## The Problem

Your autonomous agent gets **stuck in loops** trying the same failed approaches:

```
❌ Iteration 1: Try repo_browser → "Tool not found"
❌ Iteration 2: Try shell with git → "Command failed"
❌ Iteration 3: Try shell with git → SKIPPED (repetitive)
❌ Iteration 4: Try shell with git → STOPPED (no progress)

Result: 0% progress, FAILED
```

**Why?** Agent lacks:
- ❌ "WHY did this fail?" analysis
- ❌ Full error context (just error message)
- ❌ Recovery strategies (just skips on repeat)
- ❌ Memory of root causes
- ❌ Learning from failures

---

## The Solution: "5 Whys" Reflection + Recovery System

### Core Enhancements

#### 1. **"5 Whys" Diagnostic Reflection** (NEW)
When tools fail, immediately ask:
```
Why 1: Tool 'repo_browser' not found
Why 2: Agent assumed it existed
Why 3: No pre-flight capability check
Why 4: No fallback strategy prepared
Why 5: Missing tool introspection
→ Root Cause: Assumed availability without verification
→ Alternatives: [curl + tar, manual download, ask user]
```

#### 2. **Enhanced Error Capture** (UPGRADE)
From:
```javascript
{ tool: "shell", error: "Command failed" }
```

To:
```javascript
{
  tool: "shell",
  error: {
    message: "Command failed: exit code 127",
    code: 127,
    stdout: "",
    stderr: "bash: git: command not found"
  },
  context: {
    availableTools: ["run_bash", "read_dir", ...],
    workspaceState: { files: [], directories: [] }
  },
  diagnosis: {
    why1: "git not in PATH",
    why2: "Container lacks git binary",
    why3: "Agent assumed git availability",
    why4: "No fallback to curl download",
    why5: "Missing environment introspection",
    rootCause: "No pre-flight capability check",
    alternatives: ["curl + tar", "manual HTTP download", "ask user"]
  }
}
```

#### 3. **Systematic Recovery** (NEW)
```
Failure → Diagnose → Classify → Recover

Recovery Chains:
- git not found → curl + tar → manual download → ask user
- Permission denied → check sandbox → try allowed path → ask user
- Timeout → reduce scope → stream results → break into chunks
- Tool not found → check available tools → suggest alternatives → fallback
```

#### 4. **Enhanced Memory** (UPGRADE)
Store:
- ✅ Root causes (not just "failed")
- ✅ Recovery strategies attempted
- ✅ Successful recoveries
- ✅ Learned patterns ("if X error, try Y strategy")

#### 5. **Metacognitive Loop** (NEW)
```
OLD: Reflect → Execute → Update
NEW: Reflect → Execute → [ON ERROR: Diagnose + Recover] → Learn
```

---

## Example: Before vs After

### BEFORE (Current)
```
User: Clone https://github.com/gatewaybuddy/forgekeeper

Iteration 1: repo_browser → Error: "Tool not found"
Iteration 2: shell git clone → Error: "Command failed"
Iteration 3: shell git clone → SKIPPED (repetitive)
Iteration 4: shell git clone → STOPPED (no progress)

❌ Result: FAILED, 0% progress, 4 iterations wasted
```

### AFTER (Enhanced)
```
User: Clone https://github.com/gatewaybuddy/forgekeeper

Iteration 1: repo_browser → Error: "Tool not found"
  [DIAGNOSTIC REFLECTION]
  Root Cause: Tool assumed without verification
  Alternatives: [curl + tar, manual download, ask user]
  Recovery Plan: Try curl fallback

Iteration 2: run_bash curl download → Success (repo.tar.gz downloaded)
Iteration 3: run_bash tar extract → Success (repo extracted)
Iteration 4: read_dir verify → Success (repo ready)

✅ Result: SUCCESS, 100% progress, recovered in 3 iterations
✅ Pattern Learned: "repo_browser fails → use curl + tar"
```

**Improvement**: 0% → 100% success rate, learns for next time

---

## Implementation: 6 Phases, 17 Tasks

### **Phase 1: Foundation** (3 tasks, ~9 hours)
- T300: Design ADR for diagnostic reflection
- T301: Implement diagnostic reflection module
- T302: Integrate into autonomous loop

### **Phase 2: Data Quality** (2 tasks, ~6 hours)
- T303: Enhanced error capture (full context)
- T304: Error classification system

### **Phase 3: Intelligence** (3 tasks, ~10 hours)
- T305: Recovery strategy design
- T306: Recovery planner implementation
- T307: Recovery execution integration

### **Phase 4: Wisdom** (3 tasks, ~9 hours)
- T308: Extended session memory
- T309: Episodic memory for error patterns
- T310: Pattern learning system

### **Phase 5: Visibility** (3 tasks, ~7 hours)
- T311: ContextLog diagnostic events
- T312: UI diagnostic display
- T313: Recovery stats dashboard

### **Phase 6: Quality** (3 tasks, ~10 hours)
- T314: Test suite for diagnostics
- T315: Recovery scenario tests
- T316: Documentation

**Total: 17 tasks, ~51 hours (~2 weeks for 1 developer)**

---

## Success Metrics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| **Stuck in loops** | Common | Rare (<15%) |
| **Recovery success** | 0% | >60% |
| **Root cause identified** | 0% | >80% |
| **Iterations before stuck** | 3-4 | 8-10 |
| **Learning from failures** | Minimal | High |
| **Pattern reuse** | 0% | >40% |

---

## Key Features

✅ **Automatic "5 Whys" analysis** after every tool failure
✅ **Full error context** (stdout, stderr, exit codes, workspace state)
✅ **Smart recovery chains** (3+ alternatives per error type)
✅ **Pattern learning** (reuse successful recoveries)
✅ **Fast path recovery** (instant fix for known patterns)
✅ **Rich diagnostics UI** (see why-chain, recovery attempts)
✅ **Memory persistence** (session & episodic memory)

---

## Configuration Flags (New)

```bash
# Enable diagnostic reflection (default: on)
AUTONOMOUS_DIAGNOSTIC_REFLECTION_ENABLED=1

# Max "why" depth (default: 5)
AUTONOMOUS_DIAGNOSTIC_WHY_DEPTH=5

# Max recovery attempts per tool (default: 2)
AUTONOMOUS_MAX_RECOVERY_ATTEMPTS=2

# Enable pattern learning (default: on)
AUTONOMOUS_PATTERN_LEARNING_ENABLED=1

# Fast path recovery using learned patterns (default: on)
AUTONOMOUS_FAST_RECOVERY_ENABLED=1
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Adds latency** (extra LLM call) | Async diagnostic; cache common patterns |
| **Shallow diagnoses** (not enough context) | Inject full error context; validate against patterns |
| **Infinite recovery loops** | Max 2 attempts per tool; track outcomes |
| **Storage growth** | Compress old diagnoses; rotate after 7 days |
| **Complex failures** (no clear fix) | Fall back to user clarification |

---

## Next Steps

1. ✅ **Review this plan** - Does it solve your problem?
2. **Approve priority** - All 6 phases or start with Phase 1-2?
3. **Create Task Cards** - Add T300-T316 to `tasks.md`
4. **Start implementation** - Begin with T300 (Design ADR)

---

## Questions for You

1. **Priority**: Do you want all 6 phases or should we start with Phase 1-3 (foundation + intelligence)?
2. **Timeline**: 2-week full implementation OK? Or need faster MVP?
3. **Scope**: Any specific error types to prioritize (git ops, file ops, permissions)?
4. **Integration**: Should this work with existing memory systems or replace them?

---

## Full Plan

📄 **Detailed Plan**: `/mnt/d/projects/codex/forgekeeper/docs/autonomous_error_recovery_plan.md`

This summary covers the high-level approach. The full plan includes:
- Detailed architecture diagrams
- JSON schemas for all data structures
- Complete task breakdown with estimates
- Code examples and before/after comparisons
- Test scenarios and acceptance criteria
