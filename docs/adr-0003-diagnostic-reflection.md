---
title: ADR-0003 Diagnostic Reflection — "5 Whys" Root Cause Analysis for Autonomous Agent Failures
status: Proposed
date: 2025-10-29
owners: planning
---

# Context

The autonomous agent frequently gets stuck in failure loops, repeatedly attempting the same failed actions without understanding **why** they failed or **how** to recover. Current error handling is minimal:
- Tool failures tracked as simple error messages
- Repetitive actions detected and skipped, but no alternative suggested
- No root cause analysis or systematic recovery
- Memory stores only basic failure metadata (tool name, error message)

**Example Failure Loop**:
```
Task: Clone https://github.com/gatewaybuddy/forgekeeper
Iteration 1: repo_browser → Error: "Tool not found"
Iteration 2: shell git clone → Error: "Command failed"
Iteration 3: shell git clone → SKIPPED (repetitive)
Result: STOPPED (no_progress) — 0% completion
```

The agent never asks **"Why did git fail?"** or tries **curl as a fallback**.

# Decision

Implement a **"5 Whys" diagnostic reflection system** that triggers after every tool failure to:
1. **Diagnose root cause** through iterative "why" questioning
2. **Classify error types** into actionable categories
3. **Generate recovery strategies** with 3+ alternative approaches
4. **Learn failure patterns** for fast recovery in future sessions
5. **Prevent repetitive failures** through intelligent fallback chains

## Core Components

### 1. Diagnostic Reflection Module
**Location**: `frontend/core/agent/diagnostic-reflection.mjs`

**Trigger**: Immediately after any tool execution error

**Process**:
```
Tool Failure → Capture Full Context → Run "5 Whys" Reflection → Generate Diagnosis
```

**Output**: Structured diagnosis with:
- Why-chain (5 levels of causal analysis)
- Root cause identification
- Error classification
- Alternative approaches (3+ strategies)
- Recovery confidence score

### 2. Enhanced Error Context
Capture comprehensive error information:
- Exit codes, stdout, stderr, signals
- Available tools at time of failure
- Workspace state (files, directories)
- Previous action history
- Tool allowlist status

### 3. Recovery Planner
Generate prioritized recovery strategies:
- **Immediate fixes**: Retry with corrected parameters
- **Fallback tools**: Alternative tools for same goal
- **Scope reduction**: Smaller/simpler approach
- **User clarification**: Ask for help when truly stuck

### 4. Pattern Learning
Store successful recoveries for instant reuse:
- "When error X occurs, try strategy Y"
- Fast path: Apply learned patterns without full reflection
- Confidence scoring: Track recovery success rates

# Diagnostic Reflection Schema

## Input Context
```typescript
{
  failure: {
    tool: string;              // "shell", "read_file", etc.
    args: Record<string, any>; // Tool arguments
    error: {
      message: string;         // "Command failed: exit code 127"
      code?: number;           // 127
      stdout?: string;         // ""
      stderr?: string;         // "bash: git: command not found"
      signal?: string;         // null
    };
  };
  context: {
    iteration: number;         // Current iteration in autonomous loop
    previousActions: Array<{   // Last 3 actions
      tool: string;
      args: any;
      result: string;
      success: boolean;
    }>;
    availableTools: string[];  // All tools currently allowed
    workspaceState: {
      files: string[];         // Current workspace files
      directories: string[];   // Current workspace dirs
    };
    taskGoal: string;          // Original user task
  };
}
```

## Output Diagnosis
```typescript
{
  id: string;                  // Unique diagnosis ID (ULID)
  timestamp: string;           // ISO-8601
  iteration: number;           // Which iteration this occurred

  whyChain: {
    why1: string;              // "Tool 'git' not found in PATH"
    why2: string;              // "Container environment lacks git binary"
    why3: string;              // "Agent assumed git availability without verification"
    why4: string;              // "No fallback strategy for repository operations"
    why5: string;              // "Missing tool capability introspection mechanism"
  };

  rootCause: {
    category: string;          // "missing_binary" | "permission_denied" | "invalid_args" | ...
    description: string;       // "Command-line tool 'git' not installed in container"
    confidence: number;        // 0.0-1.0
  };

  errorClassification: {
    type: string;              // "tool_not_found" | "permission_denied" | "timeout" | ...
    severity: string;          // "recoverable" | "user_action_required" | "fatal"
    canRecover: boolean;       // true if recovery strategies exist
  };

  alternatives: Array<{
    strategy: string;          // "curl_download_and_extract"
    tools: string[];           // ["run_bash"]
    description: string;       // "Use curl to download repo tarball, then tar to extract"
    confidence: number;        // 0.0-1.0
    estimatedIterations: number; // 2-3 iterations expected
  }>;

  recoveryPlan: {
    priority: number;          // 1 (highest)
    strategy: string;          // "curl_download_and_extract"
    steps: Array<{
      action: string;          // "Download repo tarball via curl"
      tool: string;            // "run_bash"
      args: Record<string, any>; // { command: "curl -L ..." }
      expectedOutcome: string; // "repo.tar.gz file created"
    }>;
    fallbackChain: string[];   // ["manual_download", "ask_user"]
  };

  learningOpportunity: {
    pattern: string;           // "repo_browser_not_available"
    rule: string;              // "When repo_browser fails, use curl + tar fallback"
    applicableTaskTypes: string[]; // ["repository_clone", "code_download"]
    generalizability: number;  // 0.0-1.0 (how broadly this applies)
  };
}
```

## Example Diagnosis (Full)
```json
{
  "id": "diag_01J9YH...",
  "timestamp": "2025-10-29T10:35:12.345Z",
  "iteration": 2,

  "whyChain": {
    "why1": "Shell command 'git clone' failed with exit code 127",
    "why2": "Binary 'git' not found in container PATH",
    "why3": "Agent assumed git would be available without pre-flight check",
    "why4": "No fallback strategy prepared for repository download operations",
    "why5": "System lacks tool capability introspection mechanism"
  },

  "rootCause": {
    "category": "missing_binary",
    "description": "Required command-line tool 'git' is not installed in the container environment",
    "confidence": 0.95
  },

  "errorClassification": {
    "type": "command_not_found",
    "severity": "recoverable",
    "canRecover": true
  },

  "alternatives": [
    {
      "strategy": "curl_download_and_extract",
      "tools": ["run_bash"],
      "description": "Download repository tarball via curl, extract with tar",
      "confidence": 0.9,
      "estimatedIterations": 3
    },
    {
      "strategy": "manual_http_download",
      "tools": ["write_file"],
      "description": "Manually download files via HTTP API and recreate structure",
      "confidence": 0.6,
      "estimatedIterations": 5
    },
    {
      "strategy": "request_user_setup",
      "tools": [],
      "description": "Ask user to install git in container or provide alternative",
      "confidence": 0.8,
      "estimatedIterations": 1
    }
  ],

  "recoveryPlan": {
    "priority": 1,
    "strategy": "curl_download_and_extract",
    "steps": [
      {
        "action": "Download repository tarball from GitHub",
        "tool": "run_bash",
        "args": {
          "command": "curl -L https://github.com/gatewaybuddy/forgekeeper/archive/refs/heads/main.tar.gz -o repo.tar.gz"
        },
        "expectedOutcome": "repo.tar.gz file created in workspace"
      },
      {
        "action": "Extract tarball contents",
        "tool": "run_bash",
        "args": {
          "command": "tar -xzf repo.tar.gz"
        },
        "expectedOutcome": "Repository files extracted to forgekeeper-main/"
      },
      {
        "action": "Verify extraction success",
        "tool": "read_dir",
        "args": {
          "path": "./forgekeeper-main"
        },
        "expectedOutcome": "Directory listing shows repository structure"
      }
    ],
    "fallbackChain": ["manual_http_download", "request_user_setup"]
  },

  "learningOpportunity": {
    "pattern": "git_not_available_use_curl",
    "rule": "When git commands fail with 'command not found', use curl to download GitHub tarball and tar to extract",
    "applicableTaskTypes": ["repository_clone", "code_download", "dependency_fetch"],
    "generalizability": 0.85
  }
}
```

# Integration with Autonomous Loop

## Current Loop
```
Reflect → Execute Tools → Update State → Check Stopping Criteria
```

## Enhanced Loop
```
Reflect
  ↓
Execute Tools
  ↓
[ON ERROR]
  ↓
Diagnostic Reflection (5 Whys)
  ↓
Generate Recovery Plan
  ↓
Update Memory (root cause + recovery)
  ↓
Include Diagnosis in Next Reflection
  ↓
Continue with Recovery Strategy
```

## Reflection Prompt Enhancement

**Before**: Reflection sees only:
```
"Previous iteration failed. Tool: shell, Error: Command failed"
```

**After**: Reflection sees:
```
"Previous iteration failed. Diagnostic analysis:

Root Cause: git binary not installed in container (confidence: 0.95)

Why it happened:
1. Shell command 'git clone' failed with exit code 127
2. Binary 'git' not found in container PATH
3. Agent assumed git would be available without checking
4. No fallback strategy prepared
5. Missing tool capability introspection

Recommended Recovery (Priority 1):
Strategy: curl_download_and_extract (confidence: 0.9)
Steps:
  1. Download tarball: curl -L https://github.com/.../main.tar.gz -o repo.tar.gz
  2. Extract: tar -xzf repo.tar.gz
  3. Verify: read_dir ./forgekeeper-main

Alternatives if curl fails:
  - Manual HTTP download via write_file
  - Ask user to install git or provide alternative

Pattern to learn: When git unavailable, use curl + tar for GitHub repos"
```

# ContextLog Events

New event type: `diagnostic_reflection`

```json
{
  "id": "01J9YH...",
  "ts": "2025-10-29T10:35:12.345Z",
  "actor": "system",
  "act": "diagnostic_reflection",
  "conv_id": "c_7e...",
  "trace_id": "t_c4...",
  "iter": 2,
  "name": "5_whys_analysis",
  "status": "ok",
  "elapsed_ms": 1250,
  "metadata": {
    "failed_tool": "shell",
    "error_type": "command_not_found",
    "root_cause": "missing_binary",
    "recovery_strategy": "curl_download_and_extract",
    "confidence": 0.9,
    "alternatives_count": 3
  },
  "result_preview": "Root: git not installed; Recovery: curl + tar; Confidence: 0.9"
}
```

# Memory Extensions

## Session Memory (.session_memory.jsonl)
Add fields:
```json
{
  "failure_diagnosis": {
    "immediate_cause": "git command not found",
    "root_cause": "missing_binary_in_container",
    "why_chain": ["...", "...", "...", "...", "..."],
    "recovery_attempted": [
      {
        "strategy": "curl_download_and_extract",
        "outcome": "success",
        "iterations_to_success": 3
      }
    ]
  },
  "learned_pattern": {
    "when": "git_command_not_found",
    "then": "use_curl_tar_fallback",
    "confidence": 0.95
  }
}
```

## Episodic Memory (.episodic_memory.jsonl)
Add fields:
```json
{
  "error_encountered": {
    "type": "missing_binary",
    "tool": "shell",
    "diagnosis": "git not in PATH",
    "root_cause": "container_environment"
  },
  "successful_recovery": {
    "strategy": "curl_download_and_extract",
    "tools": ["run_bash"],
    "iterations_to_success": 3,
    "confidence": 0.95
  },
  "reusable_pattern": {
    "trigger": "command_not_found_error",
    "action": "suggest_curl_tar_fallback",
    "success_rate": 0.9
  }
}
```

# Error Classification Taxonomy

## Primary Categories
1. **tool_not_found** - Requested tool not in allowlist
2. **command_not_found** - Shell command/binary missing (exit 127)
3. **permission_denied** - Filesystem/resource access denied
4. **invalid_arguments** - Tool parameters incorrect/malformed
5. **timeout** - Operation exceeded time limit
6. **output_too_large** - Response truncated due to size
7. **rate_limited** - Too many requests
8. **network_error** - Connection/DNS failure
9. **syntax_error** - Code/command syntax invalid
10. **environment_missing** - Required env var/dependency absent

## Severity Levels
- **recoverable**: Can fix with alternative tools/parameters
- **user_action_required**: Needs user input/permission
- **fatal**: Cannot proceed (task impossible)

# Recovery Strategy Templates

## Template: missing_binary
```
If: Command not found (exit 127)
Then:
  1. Check if alternative tool exists (curl vs wget, tar vs unzip)
  2. Try HTTP download + manual extraction
  3. Ask user to install binary or provide workaround
```

## Template: permission_denied
```
If: Permission denied error
Then:
  1. Check TOOLS_FS_ROOT sandbox boundaries
  2. Try writing to allowed directory
  3. Ask user to adjust permissions or use sudo
```

## Template: timeout
```
If: Operation times out
Then:
  1. Reduce scope (fewer files, smaller dataset)
  2. Add streaming/chunking
  3. Increase timeout limit
  4. Ask user if long-running OK
```

## Template: tool_not_found
```
If: Tool not in allowlist
Then:
  1. Check available tools for similar functionality
  2. Suggest built-in alternative (run_bash, read_file, etc.)
  3. Ask user to enable tool if appropriate
```

# Configuration Flags

```bash
# Enable diagnostic reflection (default: on for autonomous mode)
AUTONOMOUS_DIAGNOSTIC_REFLECTION_ENABLED=1

# Max "why" depth for causal analysis (default: 5)
AUTONOMOUS_DIAGNOSTIC_WHY_DEPTH=5

# Model temperature for diagnostic reflection (lower = more deterministic)
AUTONOMOUS_DIAGNOSTIC_TEMP=0.2

# Max diagnostic reflection tokens (keep concise)
AUTONOMOUS_DIAGNOSTIC_MAX_TOKENS=1024

# Max recovery attempts per tool before giving up (default: 2)
AUTONOMOUS_MAX_RECOVERY_ATTEMPTS=2

# Enable fast path recovery using learned patterns (default: on)
AUTONOMOUS_FAST_RECOVERY_ENABLED=1

# Store full diagnostic context in memory (verbose but useful for learning)
AUTONOMOUS_STORE_FULL_DIAGNOSTICS=1
```

# Alternatives Considered

## Alternative 1: Simple Retry with Backoff
**Approach**: Retry failed tools with exponential backoff
**Rejected**: Doesn't address root cause; wastes iterations on doomed retries

## Alternative 2: Hard-Coded Recovery Rules
**Approach**: Pre-defined if-then rules for each error type
**Rejected**: Not adaptable; can't learn new patterns; brittle

## Alternative 3: Multi-Agent Peer Review
**Approach**: Second agent validates diagnoses
**Deferred**: Adds complexity and latency; can add in Phase 4 if needed

## Alternative 4: External Error Database
**Approach**: Query centralized error/solution database
**Deferred**: Requires infrastructure; local learning sufficient for V1

# Implications

## Agent Behavior Changes
1. **More iterations used**: Diagnostic reflection adds 1-2 iterations per failure
2. **Better recovery**: >60% of failures should recover vs 0% currently
3. **Faster learning**: Patterns stored for instant reuse
4. **Less stuck loops**: Intelligent alternatives vs blind retries

## Performance Impact
- **Latency**: +1-2 seconds per failure (diagnostic LLM call)
- **Token usage**: +500-1000 tokens per diagnostic reflection
- **Storage**: +500 bytes per failure in session memory

**Mitigation**: Async diagnostic (doesn't block); fast path for learned patterns

## Developer Experience
- **More visibility**: See why-chain and recovery attempts in UI
- **Better debugging**: Root causes logged to ContextLog
- **Learning feedback**: See which patterns work

## User Experience
- **Higher success rate**: Tasks complete instead of getting stuck
- **Faster resolution**: Recovery in 3-5 iterations vs giving up
- **Less intervention**: Agent self-recovers vs requiring user help

# Success Metrics

| Metric | Baseline (Current) | Target (After) |
|--------|-------------------|----------------|
| Recovery success rate | 0% | >60% |
| Root cause accuracy | N/A | >80% |
| Stuck loop rate | ~40% | <15% |
| Avg iterations to success | N/A (fails) | <8 |
| Pattern reuse (fast path) | 0% | >40% |
| User intervention required | ~80% | <30% |

# Rollout Plan

## Phase 1 (Week 1)
- Implement diagnostic reflection module
- Integrate into autonomous loop
- Basic error classification

## Phase 2 (Week 2)
- Recovery planner implementation
- Pattern learning system
- UI diagnostics display

## Phase 3 (Week 3)
- Fast path recovery
- Enhanced memory storage
- Comprehensive testing

# Testing Strategy

## Unit Tests
- Diagnostic reflection prompt generation
- Error classification accuracy
- Recovery plan generation logic

## Integration Tests
- End-to-end autonomous session with failures
- Verify recovery strategies execute correctly
- Check pattern learning persistence

## Smoke Tests
- Known failure scenarios:
  - git not found → curl fallback
  - Permission denied → sandbox adjustment
  - Tool not found → alternative suggestion
  - Timeout → scope reduction

## Acceptance Criteria
1. Diagnostic reflection triggers after every tool failure
2. "5 Whys" analysis produces structured output with root cause
3. Recovery planner generates ≥3 alternatives
4. Agent successfully recovers from ≥60% of test failures
5. Learned patterns enable fast recovery (no full reflection)
6. UI displays diagnostic results clearly
7. Session/episodic memory stores diagnoses correctly

# Open Questions

1. **Q**: Should diagnostic reflection run synchronously (blocks next iteration) or asynchronously?
   **A**: Start synchronous for simplicity; optimize to async in Phase 2 if latency becomes issue

2. **Q**: How to handle cascading failures (recovery itself fails)?
   **A**: Max 2 recovery attempts; then fall back to user clarification

3. **Q**: Should we store failed recovery attempts?
   **A**: Yes, critical for learning which strategies DON'T work

4. **Q**: How to prevent diagnostic reflection from hallucinating root causes?
   **A**: Inject full error context; validate against known patterns; track confidence scores

# Related Documents

- **Autonomous Agent**: `frontend/core/agent/autonomous.mjs` (main loop)
- **Session Memory**: `frontend/core/agent/session-memory.mjs` (learning system)
- **Episodic Memory**: `frontend/core/agent/episodic-memory.mjs` (semantic search)
- **ContextLog**: `docs/contextlog/adr-0001-contextlog.md` (event logging)
- **Recovery Plan**: `docs/autonomous_error_recovery_plan.md` (full implementation plan)

---

**Status**: Ready for implementation (T301)
**Next**: Implement `frontend/core/agent/diagnostic-reflection.mjs`
