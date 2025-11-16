# Autonomous Agent Error Recovery & "5 Whys" Reflection Plan

**Status**: Planning
**Created**: 2025-10-29
**Owner**: TBD
**Priority**: HIGH

## Executive Summary

The autonomous agent currently gets stuck in failure loops because it lacks **deep error analysis** and **systematic recovery strategies**. This plan introduces a **"5 Whys" reflection system** that diagnoses root causes and learns from failures, plus enhanced error capture and recovery mechanisms.

### Problem Statement

**Current Behavior** (example from user):
```
Task: clone the repo at https://github.com/gatewaybuddy/forgekeeper
Iterations: 4 / 15
Status: no_progress
Progress: 0%

Actions:
- Iteration 1: Use repo_browser tool → (likely failed)
- Iteration 2: Use shell tool with git clone → (likely failed)
- Iteration 3: Request shell command to clone → (likely failed)
```

**Root Causes Identified**:
1. ❌ No "WHY did this fail?" analysis after tool errors
2. ❌ Limited error context (just error message, no stdout/stderr/exit code)
3. ❌ Repetitive action detection SKIPS execution but doesn't suggest alternatives
4. ❌ No systematic recovery (fallback tools, parameter adjustments)
5. ❌ Memory doesn't capture root causes or successful recoveries

---

## Solution Architecture

### 1. **"5 Whys" Reflection Layer** (NEW)

When a tool fails, immediately trigger a **diagnostic reflection** that asks:

```
Why 1: Why did this tool call fail?
  → Analysis: Shell tool not available, or permission denied

Why 2: Why was the shell tool not available?
  → Analysis: Tool not in allowlist, or sandbox restrictions

Why 3: Why didn't the agent know the tool was unavailable?
  → Analysis: No pre-flight check; attempted execution blindly

Why 4: Why wasn't an alternative approach used?
  → Analysis: Agent didn't consider available tools like read_dir, write_file

Why 5: What's the systemic gap preventing recovery?
  → Root Cause: Missing tool capability introspection + fallback logic
```

**Output**: Structured diagnosis with:
- **Immediate Cause**: What directly failed
- **Contributing Factors**: Environmental/system state issues
- **Root Cause**: Fundamental gap or misconception
- **Alternative Approaches**: 3 concrete fallback strategies
- **Prevention**: How to avoid this in future iterations

### 2. **Enhanced Error Context Capture** (ENHANCEMENT)

Expand tool failure tracking from:
```javascript
{
  tool: "shell",
  args: {command: "git clone ..."},
  error: "Command failed"
}
```

To:
```javascript
{
  tool: "shell",
  args: {command: "git clone ..."},
  error: {
    message: "Command failed: exit code 127",
    code: 127,
    stdout: "",
    stderr: "bash: git: command not found",
    signal: null
  },
  context: {
    iteration: 2,
    previousAction: "repo_browser failed with 'tool not found'",
    availableTools: ["read_dir", "read_file", "write_file", "run_bash"],
    workspaceState: {
      files: [],
      directories: []
    }
  },
  diagnosis: {
    why1: "Shell execution failed - git not in PATH",
    why2: "Container environment lacks git binary",
    why3: "Agent assumed git availability without checking",
    why4: "No fallback to manual HTTP download + extraction",
    why5: "Missing environment introspection capability",
    rootCause: "No pre-flight capability check",
    alternatives: [
      "Use run_bash with curl + tar to manually fetch repo",
      "Request user to install git in container",
      "Clarify with user if repo cloning is actually needed vs just browsing"
    ],
    confidence: 0.9
  }
}
```

### 3. **Systematic Recovery Strategy Framework** (NEW)

**Recovery Decision Tree**:

```
Tool Failure Detected
  ↓
Run "5 Whys" Reflection
  ↓
Classify Error Type:
  - Tool Not Found → Suggest available alternatives
  - Permission Denied → Check sandbox bounds, suggest clarification
  - Invalid Arguments → Adjust parameters, retry with corrections
  - Environment Missing → Suggest setup steps or workarounds
  - Timeout → Suggest smaller scope or streaming approach
  - Output Too Large → Suggest pagination or filtering
  ↓
Generate Recovery Plan:
  1. Immediate Fix (same iteration)
  2. Fallback Tools (next iteration)
  3. User Clarification (if stuck)
  ↓
Update Reflection with Recovery Plan
  ↓
Execute Recovery
  ↓
Track Outcome → Learn
```

**Example Recovery Chains**:

| **Error Type** | **Recovery Chain** |
|----------------|-------------------|
| `git clone` fails (git not found) | 1. Try `run_bash` with `curl` + `tar`<br>2. Try `write_file` to create placeholder<br>3. Ask user to mount repo or install git |
| `repo_browser` fails (tool not found) | 1. Use `read_dir` to explore<br>2. Use `run_bash` with `find`<br>3. Ask user about repo location |
| Permission denied writing file | 1. Check `TOOLS_FS_ROOT` sandbox<br>2. Try writing to allowed directory<br>3. Ask user to adjust permissions |
| Command times out | 1. Reduce scope (fewer files)<br>2. Add timeout flag<br>3. Stream results incrementally |

### 4. **Enhanced Memory for Root Causes** (ENHANCEMENT)

**Extend Session Memory** (`.session_memory.jsonl`):
```json
{
  "task_type": "repository_clone",
  "success": false,
  "iterations": 4,
  "tools_used": ["repo_browser", "shell"],
  "failure_diagnosis": {
    "immediate_cause": "git command not found",
    "root_cause": "missing_binary_in_container",
    "why_chain": ["...", "...", "...", "...", "..."],
    "recovery_attempted": [
      {
        "strategy": "try_curl_fallback",
        "outcome": "not_attempted",
        "reason": "agent stuck before attempting"
      }
    ]
  },
  "successful_recovery": null,
  "learned_pattern": {
    "when": "tool returns 'command not found'",
    "then": "run diagnostic reflection before retry",
    "and": "suggest curl/manual download as fallback"
  }
}
```

**New Episodic Memory Fields**:
```json
{
  "episode_id": "ep_12345",
  "task": "clone repo",
  "error_encountered": {
    "type": "missing_binary",
    "tool": "shell",
    "diagnosis": "git not in PATH",
    "root_cause": "container_environment"
  },
  "successful_recovery": {
    "strategy": "manual_download_via_curl",
    "tools": ["run_bash"],
    "iterations_to_success": 2,
    "confidence": 0.95
  },
  "reusable_pattern": {
    "trigger": "command_not_found_error",
    "action": "suggest_alternative_tool_chain",
    "fallback": ["curl + tar", "manual file creation"]
  }
}
```

### 5. **Metacognitive Reflection Loop** (NEW)

**Current Loop**:
```
Reflect (assess progress) → Execute tools → Update state
```

**Enhanced Loop**:
```
Reflect (assess progress)
  ↓
Execute tools
  ↓
[ON ERROR] → "5 Whys" Diagnostic Reflection
  ↓
Generate Recovery Plan
  ↓
Update Memory with Root Cause + Recovery
  ↓
Continue with Recovery Strategy
```

**Reflection Questions After Each Tool Failure**:
1. **What failed?** (immediate cause)
2. **Why did it fail?** (contributing factors)
3. **What was I assuming?** (misconceptions)
4. **What alternatives exist?** (available tools/approaches)
5. **What's the root cause?** (systemic gap)
6. **How do I recover?** (concrete next steps)
7. **What should I learn?** (pattern for future)

---

## Implementation Plan

### **Phase 1: Diagnostic Reflection System** (Foundation)

**Task T300: Design "5 Whys" Reflection ADR**
- **Goal**: Define diagnostic reflection architecture, prompt structure, and integration points
- **Scope**:
  - Document "5 Whys" reflection flow
  - Define JSON schema for diagnostic output
  - Specify when diagnostic reflection triggers
  - Define error classification taxonomy
- **Deliverable**: `docs/adr-0003-diagnostic-reflection.md`
- **Estimate**: 2 hours

**Task T301: Implement Diagnostic Reflection Module**
- **Goal**: Create module that runs "5 Whys" analysis after tool failures
- **Scope**:
  - Create `frontend/core/agent/diagnostic-reflection.mjs`
  - Implement `runDiagnosticReflection(failure, context)` function
  - Generate structured diagnosis with why-chain
  - Return alternatives and recovery strategies
- **Allowed Touches**: `frontend/core/agent/diagnostic-reflection.mjs`, `frontend/core/agent/autonomous.mjs`
- **Estimate**: 4 hours

**Task T302: Integrate Diagnostic Reflection into Autonomous Loop**
- **Goal**: Trigger diagnostic reflection on tool failures
- **Scope**:
  - Hook diagnostic reflection after tool execution errors
  - Store diagnosis in failure tracking
  - Include diagnosis in next main reflection
  - Emit diagnostic events to ContextLog
- **Allowed Touches**: `frontend/core/agent/autonomous.mjs`, `frontend/core/services/contextlog-events.mjs`
- **Estimate**: 3 hours

### **Phase 2: Enhanced Error Context** (Data Quality)

**Task T303: Expand Tool Executor Error Capture**
- **Goal**: Capture full error context (stdout, stderr, exit code, signal)
- **Scope**:
  - Update `executor.execute()` to capture full process output
  - Store exit codes and signals
  - Capture pre-execution workspace state
  - Include available tools list in context
- **Allowed Touches**: `frontend/core/agent/executor.mjs`
- **Estimate**: 3 hours

**Task T304: Add Error Classification System**
- **Goal**: Classify errors into actionable categories
- **Scope**:
  - Create error classifier (tool_not_found, permission_denied, invalid_args, etc.)
  - Map error types to recovery strategies
  - Add confidence scoring to classifications
- **Allowed Touches**: `frontend/core/agent/error-classifier.mjs`
- **Estimate**: 3 hours

### **Phase 3: Recovery Strategy Framework** (Intelligence)

**Task T305: Design Recovery Strategy Framework**
- **Goal**: Define systematic recovery approach for each error type
- **Scope**:
  - Document recovery decision tree
  - Define recovery chains for common errors
  - Specify fallback tool mappings
  - Define user clarification triggers
- **Deliverable**: `docs/autonomous/recovery-strategies.md`
- **Estimate**: 2 hours

**Task T306: Implement Recovery Planner**
- **Goal**: Generate concrete recovery plans from diagnostic results
- **Scope**:
  - Create `frontend/core/agent/recovery-planner.mjs`
  - Implement `generateRecoveryPlan(diagnosis, context)` function
  - Return prioritized list of recovery strategies
  - Include parameter adjustments for retries
- **Allowed Touches**: `frontend/core/agent/recovery-planner.mjs`
- **Estimate**: 4 hours

**Task T307: Integrate Recovery Execution**
- **Goal**: Execute recovery strategies within autonomous loop
- **Scope**:
  - Modify main reflection to include recovery plan
  - Allow same-iteration recovery for simple fixes
  - Track recovery outcomes
  - Prevent infinite recovery loops (max 2 recovery attempts per tool)
- **Allowed Touches**: `frontend/core/agent/autonomous.mjs`
- **Estimate**: 4 hours

### **Phase 4: Enhanced Memory & Learning** (Wisdom)

**Task T308: Extend Session Memory Schema**
- **Goal**: Store root causes, recovery attempts, and learned patterns
- **Scope**:
  - Add `failure_diagnosis` field to session records
  - Add `recovery_attempted` and `successful_recovery` fields
  - Add `learned_pattern` field for reusable strategies
  - Update session memory writer
- **Allowed Touches**: `frontend/core/agent/session-memory.mjs`
- **Estimate**: 2 hours

**Task T309: Extend Episodic Memory for Error Patterns**
- **Goal**: Search for similar past failures and successful recoveries
- **Scope**:
  - Add error pattern fields to episodes
  - Implement `searchSimilarFailures(error, context)` function
  - Return successful recovery strategies from past episodes
  - Inject recovery examples into diagnostic reflection
- **Allowed Touches**: `frontend/core/agent/episodic-memory.mjs`
- **Estimate**: 3 hours

**Task T310: Implement Pattern Learning System**
- **Goal**: Automatically extract and apply learned recovery patterns
- **Scope**:
  - Detect recurring error types across sessions
  - Build "if error X, try strategy Y" rules
  - Store high-confidence patterns for instant recovery
  - Apply patterns before running full diagnostic reflection (fast path)
- **Allowed Touches**: `frontend/core/agent/pattern-learner.mjs`, `frontend/core/agent/autonomous.mjs`
- **Estimate**: 4 hours

### **Phase 5: UI & Diagnostics** (Visibility)

**Task T311: Enhance ContextLog for Diagnostic Events**
- **Goal**: Log diagnostic reflections, recovery plans, and outcomes
- **Scope**:
  - Add event types: `diagnostic_reflection`, `recovery_plan`, `recovery_attempt`, `recovery_outcome`
  - Include why-chain, root cause, alternatives in events
  - Add recovery success/failure tracking
- **Allowed Touches**: `frontend/core/services/contextlog-events.mjs`, `frontend/server.contextlog.mjs`
- **Estimate**: 2 hours

**Task T312: Update Autonomous Panel with Diagnostic Display**
- **Goal**: Show "5 Whys" analysis and recovery attempts in UI
- **Scope**:
  - Add diagnostic section to action history
  - Display why-chain as expandable tree
  - Show recovery strategies with outcomes
  - Highlight root causes and learned patterns
- **Allowed Touches**: `frontend/src/components/AutonomousPanel.tsx`
- **Estimate**: 3 hours

**Task T313: Add Recovery Stats to Learning Dashboard**
- **Goal**: Surface recovery success rates and learned patterns
- **Scope**:
  - Show error types encountered and recovery success rates
  - Display top learned patterns
  - Show recovery time savings (iterations saved)
- **Allowed Touches**: `frontend/src/components/AutonomousPanel.tsx`
- **Estimate**: 2 hours

### **Phase 6: Testing & Refinement** (Quality)

**Task T314: Create Test Suite for Diagnostic Reflection**
- **Goal**: Validate "5 Whys" analysis quality
- **Scope**:
  - Unit tests for diagnostic reflection
  - Integration tests for recovery execution
  - Smoke tests with known failure scenarios (git not found, permission denied, etc.)
- **Allowed Touches**: `tests/autonomous/test_diagnostic_reflection.mjs`, `tests/autonomous/test_recovery.mjs`
- **Estimate**: 4 hours

**Task T315: Create Recovery Scenario Test Suite**
- **Goal**: Validate recovery strategies work for common failures
- **Scope**:
  - Test git clone failure → curl fallback
  - Test permission denied → sandbox adjustment
  - Test tool not found → alternative tool suggestion
  - Test timeout → scope reduction
- **Allowed Touches**: `tests/autonomous/test_recovery_scenarios.mjs`
- **Estimate**: 3 hours

**Task T316: Documentation & Examples**
- **Goal**: Document diagnostic reflection and recovery system
- **Scope**:
  - Update `CLAUDE.md` with diagnostic reflection architecture
  - Create `docs/autonomous/diagnostic-reflection.md` with examples
  - Create `docs/autonomous/recovery-strategies.md` with patterns
  - Update autonomous mode user guide
- **Allowed Touches**: `CLAUDE.md`, `docs/autonomous/*.md`
- **Estimate**: 3 hours

---

## Success Metrics

### **Before Enhancement** (Current State):
- Agent gets stuck in repetitive loops: **Common**
- Average iterations before stuck: **3-4**
- Recovery success rate: **~0%** (agent just stops)
- Root cause identification: **None**
- Learning from failures: **Minimal** (just tool names)

### **After Enhancement** (Target State):
- Agent gets stuck in repetitive loops: **Rare**
- Average iterations before stuck: **8-10** (more progress before truly stuck)
- Recovery success rate: **>60%** (can recover from common errors)
- Root cause identification: **>80%** (accurate diagnosis)
- Learning from failures: **High** (stores root causes and recoveries)

### **Key Performance Indicators (KPIs)**:
1. **Diagnostic Accuracy**: % of failures where root cause correctly identified → Target: **>80%**
2. **Recovery Success Rate**: % of failures recovered without user intervention → Target: **>60%**
3. **Iteration Efficiency**: Average iterations to complete successful tasks → Target: **<8**
4. **Pattern Reuse**: % of errors resolved using learned patterns (fast path) → Target: **>40%**
5. **Stuck Rate**: % of sessions ending in "no_progress" or "stuck_loop" → Target: **<15%**

---

## Risk Mitigation

### **Risks**:
1. **Diagnostic reflection adds latency** → Each failure triggers extra LLM call
   - **Mitigation**: Async diagnostic (don't block next iteration); cache common diagnoses

2. **"5 Whys" could be shallow or incorrect** → LLM may not have enough context
   - **Mitigation**: Inject full error context; validate diagnoses against patterns; human review loop

3. **Recovery strategies could fail repeatedly** → Infinite recovery loops
   - **Mitigation**: Max 2 recovery attempts per tool; track recovery outcomes; fail gracefully

4. **Memory storage growth** → Storing full diagnoses and why-chains is verbose
   - **Mitigation**: Compress/summarize old diagnoses; rotate after 7 days; store only high-confidence patterns

5. **Complex error scenarios** → Some failures may have no clear recovery
   - **Mitigation**: Fall back to user clarification; store "unrecoverable" patterns to skip next time

---

## Feature Flags & Configuration

```bash
# Enable diagnostic reflection (default: on for autonomous mode)
AUTONOMOUS_DIAGNOSTIC_REFLECTION_ENABLED=1

# Max "why" depth (default: 5)
AUTONOMOUS_DIAGNOSTIC_WHY_DEPTH=5

# Max recovery attempts per tool (default: 2)
AUTONOMOUS_MAX_RECOVERY_ATTEMPTS=2

# Enable pattern learning (default: on)
AUTONOMOUS_PATTERN_LEARNING_ENABLED=1

# Fast path recovery using learned patterns (default: on)
AUTONOMOUS_FAST_RECOVERY_ENABLED=1

# Store full diagnostic context (default: on, verbose)
AUTONOMOUS_STORE_FULL_DIAGNOSTICS=1

# Diagnostic reflection model temperature (default: 0.2, more deterministic)
AUTONOMOUS_DIAGNOSTIC_TEMP=0.2
```

---

## Rollout Plan

### **Week 1**: Foundation
- T300: Design ADR
- T301: Implement diagnostic reflection module
- T302: Integrate into autonomous loop

### **Week 2**: Intelligence
- T303: Enhanced error capture
- T304: Error classification
- T305: Recovery strategy design
- T306: Recovery planner implementation

### **Week 3**: Execution & Learning
- T307: Recovery execution integration
- T308: Session memory extension
- T309: Episodic memory enhancement
- T310: Pattern learning system

### **Week 4**: Polish & Validation
- T311: ContextLog enhancements
- T312: UI diagnostic display
- T313: Recovery stats dashboard
- T314: Test suite
- T315: Scenario tests
- T316: Documentation

---

## Example: Before vs After

### **Before** (Current System):

```
User: Clone the repo at https://github.com/gatewaybuddy/forgekeeper

Iteration 1:
  Reflection: "Use repo_browser tool to clone"
  Execute: repo_browser(url="...")
  Result: Error: "Tool 'repo_browser' not found"
  State: errors=1

Iteration 2:
  Reflection: "Use shell tool with git clone"
  Execute: shell(command="git clone ...")
  Result: Error: "Command failed"
  State: errors=2

Iteration 3:
  Reflection: "Request shell command to clone"
  Execute: shell(command="git clone ...")
  Result: SKIPPED (repetitive action)
  State: repetitiveActionDetected=true

Iteration 4:
  Reflection: "Try git clone again"
  Execute: shell(command="git clone ...")
  Result: SKIPPED (repetitive action)
  State: noProgressCount=3 → STOPPED (no_progress)

Result: FAILED - Agent stuck, 0% progress
```

### **After** (Enhanced System):

```
User: Clone the repo at https://github.com/gatewaybuddy/forgekeeper

Iteration 1:
  Reflection: "Use repo_browser tool to clone"
  Execute: repo_browser(url="...")
  Result: Error: "Tool 'repo_browser' not found"

  [DIAGNOSTIC REFLECTION TRIGGERED]
  Why 1: Tool 'repo_browser' doesn't exist
  Why 2: Agent assumed repo_browser was available without checking
  Why 3: No tool capability check before planning
  Why 4: No fallback strategy for repository operations
  Why 5: Missing tool introspection mechanism
  Root Cause: Assumed tool availability without verification

  Alternatives:
    1. Use run_bash with curl + tar to download repo
    2. Use read_dir to check if repo already exists locally
    3. Ask user if git is installed or if manual download is acceptable

  Recovery Plan:
    1. Try: run_bash with curl to download repo tarball
    2. Fallback: write_file to create placeholder
    3. Last resort: Clarify with user

  State: errors=1, recoveryPlan=["curl_download", "placeholder", "clarify"]

Iteration 2:
  Reflection: "Execute recovery: download via curl"
  Execute: run_bash(command="curl -L https://github.com/gatewaybuddy/forgekeeper/archive/refs/heads/main.tar.gz -o repo.tar.gz")
  Result: Success (downloaded repo.tar.gz)
  State: artifacts_created=1, progress_percent=50

Iteration 3:
  Reflection: "Extract the downloaded archive"
  Execute: run_bash(command="tar -xzf repo.tar.gz")
  Result: Success (extracted repo)
  State: artifacts_created=2, progress_percent=100

Iteration 4:
  Reflection: "Verify extraction and summarize"
  Execute: read_dir(path="./forgekeeper-main")
  Result: Success (lists files)
  Assessment: complete
  Confidence: 0.95

Result: SUCCESS - Repo cloned successfully via curl fallback
  Iterations: 4
  Recovery: Successful (curl strategy worked)
  Pattern Learned: "If repo_browser fails, use curl + tar"
```

---

## Dependencies

- **Blocked by**: None (can start immediately)
- **Blocks**: None (enhances existing autonomous mode)
- **Integrates with**:
  - Session Memory (T308)
  - Episodic Memory (T309)
  - ContextLog (T311)
  - Autonomous Panel UI (T312)

---

## Acceptance Criteria

1. ✅ Diagnostic reflection triggers after every tool failure
2. ✅ "5 Whys" analysis produces structured output with root cause
3. ✅ Recovery planner generates ≥3 alternative strategies
4. ✅ Agent successfully recovers from ≥60% of common failures
5. ✅ Session memory stores failure diagnoses and recovery outcomes
6. ✅ Episodic memory can search for similar past failures
7. ✅ Learned patterns enable fast recovery (no full reflection needed)
8. ✅ UI displays diagnostic results and recovery attempts
9. ✅ Test suite validates recovery for common scenarios
10. ✅ Documentation covers architecture, configuration, and examples

---

## Future Enhancements (Out of Scope for V1)

1. **Multi-Agent Peer Review**: Have a second agent validate diagnostic reflections
2. **Causal Graph Learning**: Build causal models of error relationships
3. **Predictive Failure Prevention**: Detect likely failures before execution
4. **Transfer Learning**: Apply recovery patterns across task types
5. **Human-in-the-Loop Validation**: Ask user to confirm diagnoses for critical errors
6. **Automated Root Cause DB**: Centralized knowledge base of root causes and fixes
7. **Adaptive Recovery**: Learn which recovery strategies work best for specific environments
8. **Recovery Confidence Scoring**: Probabilistic modeling of recovery success

---

## Related Documents

- **ADR-0001**: ContextLog JSONL MVP → `docs/contextlog/adr-0001-contextlog.md`
- **ADR-0002**: Self-Review and Chunked Reasoning → `docs/adr-0002-self-review-and-chunked-reasoning.md`
- **Autonomous Architecture**: Current implementation → `frontend/core/agent/autonomous.mjs`
- **Session Memory**: Learning system → `frontend/core/agent/session-memory.mjs`
- **Episodic Memory**: Semantic search → `frontend/core/agent/episodic-memory.mjs`
- **CLAUDE.md**: Architecture guide → `/mnt/d/projects/codex/CLAUDE.md`

---

**Next Steps**:
1. Review this plan with team
2. Create Task Cards (T300-T316) in `tasks.md`
3. Prioritize phases (likely start with Phase 1-2 for quick wins)
4. Assign ownership and timelines
5. Begin implementation with T300 (Design ADR)
