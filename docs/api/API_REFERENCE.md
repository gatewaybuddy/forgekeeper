# Forgekeeper API Reference

**Last Updated**: 2025-11-13
**Total Endpoints**: 70+

Complete reference for all Forgekeeper API endpoints organized by category.

---

## Table of Contents

- [Core Chat & Orchestration](#core-chat--orchestration)
- [Autonomous Agent](#autonomous-agent)
- [Tools Management](#tools-management)
- [Preferences & Episodic Memory](#preferences--episodic-memory)
- [TGT (Task Generation)](#tgt-task-generation)
- [Auto PR (SAPL)](#auto-pr-sapl)
- [Metrics & Prompting](#metrics--prompting)
- [Thought World](#thought-world)
- [ContextLog & Harmony](#contextlog--harmony)
- [Repository Operations](#repository-operations)

---

## Core Chat & Orchestration

### GET /config.json
**Description**: Runtime configuration for UI (model, tools, capabilities)

**Response**:
```json
{
  "model": "core",
  "tools": ["get_time", "echo", "read_file", ...],
  "maxTokens": 8192,
  "temperature": 0.0,
  "features": {
    "autonomous": true,
    "tgt": true,
    "sapl": false
  }
}
```

### GET /health, /healthz, /health-ui
**Description**: Health check endpoints

**Response**:
```json
{
  "status": "ok",
  "upstream": "healthy",
  "timestamp": "2025-11-13T..."
}
```

### POST /api/chat
**Description**: Non-streaming chat orchestration with tool support

**Request**:
```json
{
  "messages": [
    {"role": "user", "content": "List files in current directory"}
  ],
  "model": "core",
  "tools": [...],
  "max_tokens": 8192
}
```

**Response**:
```json
{
  "assistant": {
    "content": "...",
    "reasoning": "..."
  },
  "messages": [...],
  "debug": {
    "toolCalls": 2,
    "iterations": 3,
    "elapsed_ms": 1234
  }
}
```

### POST /api/chat/stream
**Description**: Streaming final turn after tool loop (SSE)

**Request**: Same as `/api/chat`

**Response**: Server-Sent Events
```
data: {"content": "token"}
data: {"content": " next"}
data: [DONE]
```

### GET /metrics
**Description**: Rate limit and request counters

**Response**:
```json
{
  "totalRequests": 1234,
  "streamRequests": 567,
  "totalToolCalls": 890,
  "rateLimited": 12
}
```

### GET /api/diagnose
**Description**: System diagnostics and health

**Response**:
```json
{
  "ok": true,
  "upstream": {"status": "healthy", "latency_ms": 45},
  "tools": {"enabled": 15, "errors": 2},
  "circuit": {"open": false}
}
```

---

## Autonomous Agent

### POST /api/chat/autonomous
**Description**: Start autonomous execution session

**Request**:
```json
{
  "task": "Implement user authentication",
  "maxIterations": 50,
  "checkpointInterval": 10
}
```

**Response**:
```json
{
  "sessionId": "01HQX...",
  "status": "running",
  "iteration": 1
}
```

### POST /api/chat/autonomous/stop
**Description**: Stop autonomous session

**Request**:
```json
{
  "sessionId": "01HQX..."
}
```

**Response**:
```json
{
  "ok": true,
  "finalIteration": 15,
  "outcome": "user_stopped"
}
```

### GET /api/chat/autonomous/status
**Description**: Get session status

**Query Params**:
- `sessionId` (string): Session ID

**Response**:
```json
{
  "sessionId": "01HQX...",
  "status": "running|completed|failed|paused",
  "currentIteration": 12,
  "maxIterations": 50,
  "elapsedMs": 45678,
  "progress": 0.24
}
```

### GET /api/chat/autonomous/checkpoints
**Description**: List checkpoints for a session

**Query Params**:
- `sessionId` (string): Session ID

**Response**:
```json
{
  "checkpoints": [
    {
      "checkpointId": "01HQY...",
      "iteration": 10,
      "timestamp": "2025-11-13T...",
      "state": {...}
    }
  ]
}
```

### POST /api/chat/autonomous/resume
**Description**: Resume from checkpoint

**Request**:
```json
{
  "checkpointId": "01HQY..."
}
```

**Response**:
```json
{
  "sessionId": "01HQX...",
  "resumedFromIteration": 10
}
```

### POST /api/chat/autonomous/clarify
**Description**: Handle clarification request

**Request**:
```json
{
  "sessionId": "01HQX...",
  "clarificationId": "01HQZ...",
  "response": "Use bcrypt for password hashing"
}
```

**Response**:
```json
{
  "ok": true,
  "resumed": true
}
```

### GET /api/chat/autonomous/stats
**Description**: Performance statistics

**Query Params**:
- `hours` (number, optional): Time window (default: 24)

**Response**:
```json
{
  "totalSessions": 45,
  "successRate": 0.87,
  "avgIterations": 12.3,
  "avgDuration_ms": 34567,
  "topFailureReasons": ["timeout", "tool_error"]
}
```

### GET /api/chat/autonomous/recovery-stats
**Description**: Error recovery metrics

**Response**:
```json
{
  "totalRecoveries": 123,
  "successRate": 0.89,
  "avgRecoveryTime_ms": 2345,
  "topRecoveryStrategies": ["retry", "alternative_tool", "scope_reduction"]
}
```

### GET /api/chat/autonomous/history
**Description**: Session history

**Query Params**:
- `limit` (number, optional): Max sessions (default: 10)
- `offset` (number, optional): Pagination offset

**Response**:
```json
{
  "sessions": [
    {
      "sessionId": "01HQX...",
      "task": "...",
      "startedAt": "2025-11-13T...",
      "completedAt": "2025-11-13T...",
      "iterations": 15,
      "outcome": "success|failure"
    }
  ],
  "total": 45
}
```

### GET /api/autonomous/diagnose/:session_id
**Description**: "5 Whys" failure analysis

**Response**:
```json
{
  "sessionId": "01HQX...",
  "diagnosis": {
    "whyChain": ["Why 1?", "Why 2?", ...],
    "rootCause": "...",
    "errorCategory": "command_not_found",
    "alternatives": [...]
  },
  "recoveryPlan": {
    "steps": [...],
    "estimatedIterations": 3
  }
}
```

### GET /api/autonomous/failure-patterns
**Description**: Pattern analysis across sessions

**Query Params**:
- `hours` (number, optional): Time window (default: 168 = 7 days)

**Response**:
```json
{
  "patterns": [
    {
      "pattern": "command_not_found",
      "frequency": 12,
      "avgRecoveryIterations": 2.3,
      "successfulStrategies": [...]
    }
  ]
}
```

### POST /api/autonomous/propose-fix
**Description**: Suggest fixes for a failure

**Request**:
```json
{
  "sessionId": "01HQX...",
  "errorContext": {...}
}
```

**Response**:
```json
{
  "fixes": [
    {
      "description": "...",
      "confidence": 0.85,
      "steps": [...]
    }
  ]
}
```

---

## Tools Management

### GET /api/tools
**Description**: List all available tools

**Response**:
```json
{
  "enabled": true,
  "count": 15,
  "names": ["get_time", "echo", "read_file", ...],
  "defs": [
    {
      "name": "get_time",
      "description": "Get current UTC time",
      "parameters": {...}
    }
  ]
}
```

### GET /api/tools/config
**Description**: Get tools configuration

**Response**:
```json
{
  "allowlist": ["get_time", "echo", "read_file"],
  "approval_required": false,
  "max_output_bytes": 10240,
  "timeout_ms": 30000
}
```

### POST /api/tools/config
**Description**: Update tools configuration

**Request**:
```json
{
  "allowlist": ["get_time", "echo"],
  "approval_required": true
}
```

**Response**:
```json
{
  "ok": true,
  "config": {...}
}
```

### POST /api/tools/reload
**Description**: Reload tools from filesystem

**Response**:
```json
{
  "ok": true,
  "loaded": 15,
  "errors": []
}
```

### POST /api/tools/write
**Description**: Write a new tool (dynamic loading)

**Request**:
```json
{
  "toolName": "my_tool.mjs",
  "code": "export const def = {...}; export async function run(args) {...}"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Tool written successfully",
  "path": "frontend/tools/my_tool.mjs"
}
```

### POST /api/tools/propose
**Description**: Propose a new tool (approval workflow)

**Request**:
```json
{
  "tool_name": "new_feature.mjs",
  "code": "..."
}
```

**Response**:
```json
{
  "message": "Tool new_feature.mjs proposed. Awaiting approval.",
  "preview": "...",
  "approval_url": "/api/tools/approve/new_feature.mjs"
}
```

### GET /api/tools/pending
**Description**: List pending tool approvals

**Response**:
```json
{
  "pending": [
    {
      "toolName": "new_feature.mjs",
      "proposedAt": "2025-11-13T...",
      "code": "...",
      "preview": "..."
    }
  ]
}
```

### POST /api/tools/approve/:tool_name
**Description**: Approve a proposed tool

**Response**:
```json
{
  "ok": true,
  "message": "Tool new_feature.mjs approved and written",
  "path": "frontend/tools/new_feature.mjs"
}
```

### GET /api/tools/errors
**Description**: Get tool error statistics

**Response**:
```json
{
  "tools": [
    {
      "name": "run_bash",
      "errorCount": 5,
      "lastError": "2025-11-13T...",
      "topErrors": ["ENOENT", "EPERM"]
    }
  ]
}
```

### GET /api/tools/errors/:tool_name
**Description**: Get errors for specific tool

**Response**:
```json
{
  "toolName": "run_bash",
  "errorCount": 5,
  "errors": [
    {
      "timestamp": "2025-11-13T...",
      "error": "ENOENT",
      "message": "Command not found: git"
    }
  ]
}
```

### POST /api/tools/errors/:tool_name/clear
**Description**: Clear error statistics for a tool

**Response**:
```json
{
  "ok": true,
  "message": "Errors cleared for run_bash"
}
```

### GET /api/tools/regression
**Description**: Detect performance regressions

**Response**:
```json
{
  "regressions": [
    {
      "toolName": "read_file",
      "baseline_ms": 45,
      "current_ms": 123,
      "degradation_pct": 173
    }
  ]
}
```

### GET /api/tools/regression/:tool_name
**Description**: Get regression data for specific tool

**Response**:
```json
{
  "toolName": "read_file",
  "samples": 100,
  "baseline_ms": 45,
  "current_ms": 123,
  "degradation_pct": 173
}
```

### POST /api/tools/regression/:tool_name/clear
**Description**: Clear regression data

**Response**:
```json
{
  "ok": true,
  "message": "Regression data cleared for read_file"
}
```

### GET /api/tools/resources
**Description**: Resource usage for all tools

**Response**:
```json
{
  "tools": [
    {
      "name": "run_bash",
      "cpu_pct": 12.5,
      "mem_mb": 45,
      "disk_mb": 12
    }
  ]
}
```

### GET /api/tools/resources/:tool_name
**Description**: Resource usage for specific tool

**Response**:
```json
{
  "toolName": "run_bash",
  "cpu_pct": 12.5,
  "mem_mb": 45,
  "disk_mb": 12,
  "samples": 50
}
```

### POST /api/tools/resources/:tool_name/clear
**Description**: Clear resource tracking data

**Response**:
```json
{
  "ok": true,
  "message": "Resource data cleared for run_bash"
}
```

### GET /api/tools/audit
**Description**: Tool execution audit log

**Query Params**:
- `limit` (number, optional): Max entries (default: 100)
- `tool_name` (string, optional): Filter by tool

**Response**:
```json
{
  "entries": [
    {
      "ts": "2025-11-13T...",
      "toolName": "read_file",
      "args": {...},
      "result": "success|error",
      "elapsed_ms": 45
    }
  ]
}
```

---

## Preferences & Episodic Memory

### GET /api/preferences
**Description**: Get all user preferences

**Response**:
```json
{
  "preferences": [
    {
      "preference_id": "01HQX...",
      "domain": "coding_style",
      "category": "indentation",
      "preference": "spaces",
      "value": 2,
      "confidence": 0.95,
      "source": "inferred"
    }
  ]
}
```

### GET /api/preferences/:domain
**Description**: Get preferences for a domain

**Params**:
- `domain`: coding_style|tool_choice|workflow|testing|documentation

**Response**:
```json
{
  "domain": "coding_style",
  "preferences": [...]
}
```

### POST /api/preferences
**Description**: Record a preference manually

**Request**:
```json
{
  "domain": "tool_choice",
  "category": "test_framework",
  "preference": "pytest",
  "value": true,
  "source": "explicit"
}
```

**Response**:
```json
{
  "ok": true,
  "preference_id": "01HQX..."
}
```

### POST /api/preferences/infer
**Description**: Auto-infer preferences from code

**Request**:
```json
{
  "file_paths": ["src/app.py", "tests/test_app.py"]
}
```

**Response**:
```json
{
  "inferred": [
    {
      "domain": "coding_style",
      "category": "indentation",
      "value": 4,
      "confidence": 0.92,
      "evidence": ["4 spaces used in 95% of lines"]
    }
  ]
}
```

### DELETE /api/preferences/:id
**Description**: Delete a preference

**Response**:
```json
{
  "ok": true,
  "message": "Preference deleted"
}
```

### GET /api/preferences/guidance
**Description**: Get preference-based guidance for current task

**Response**:
```json
{
  "guidance": [
    "Use 4-space indentation (confidence: 95%)",
    "Prefer pytest for testing (confidence: 88%)",
    "Place tests in tests/ directory (confidence: 82%)"
  ]
}
```

### GET /api/episodes
**Description**: List episodic memory sessions

**Query Params**:
- `limit` (number, optional): Max episodes (default: 10)

**Response**:
```json
{
  "episodes": [
    {
      "episode_id": "01HQX...",
      "task": "Implement authentication",
      "outcome": "success",
      "iterations": 12,
      "timestamp": "2025-11-13T..."
    }
  ]
}
```

### POST /api/episodes/search
**Description**: Semantic similarity search

**Request**:
```json
{
  "query": "Add user registration with email verification",
  "limit": 3
}
```

**Response**:
```json
{
  "episodes": [
    {
      "episode_id": "01HQX...",
      "task": "Implement user signup",
      "similarity": 0.87,
      "strategies": ["Create model", "Add validation", "Send email"],
      "tools_used": ["write_file", "run_bash"],
      "iterations": 10
    }
  ]
}
```

### GET /api/episodes/stats
**Description**: Episode statistics

**Response**:
```json
{
  "totalEpisodes": 123,
  "successRate": 0.89,
  "avgIterations": 11.2,
  "topTasks": ["implement", "fix", "refactor"]
}
```

---

## TGT (Task Generation)

### POST /api/tasks/suggest
**Description**: Analyze telemetry and suggest tasks

**Query Params**:
- `window_min` (number, optional): Analysis window (default: 60)

**Response**:
```json
{
  "tasks": [
    {
      "id": "01HQX...",
      "type": "performance_degradation",
      "severity": "high",
      "title": "High continuation rate detected",
      "confidence": 0.92,
      "evidence": {...},
      "suggestedFix": "..."
    }
  ]
}
```

### GET /api/tasks
**Description**: List all tasks

**Query Params**:
- `status` (string, optional): Filter by status (pending|approved|dismissed)
- `limit` (number, optional): Max tasks (default: 50)

**Response**:
```json
{
  "tasks": [...],
  "total": 23
}
```

### GET /api/tasks/:id
**Description**: Get specific task

**Response**:
```json
{
  "id": "01HQX...",
  "type": "error_spike",
  "severity": "critical",
  "title": "...",
  "description": "...",
  "evidence": {...},
  "suggestedFix": "...",
  "acceptanceCriteria": [...],
  "status": "pending",
  "createdAt": "2025-11-13T..."
}
```

### POST /api/tasks/:id/approve
**Description**: Approve a task

**Response**:
```json
{
  "ok": true,
  "task": {...}
}
```

### POST /api/tasks/:id/dismiss
**Description**: Dismiss a task

**Request**:
```json
{
  "reason": "Not actionable|Duplicate|False positive"
}
```

**Response**:
```json
{
  "ok": true,
  "dismissedAt": "2025-11-13T..."
}
```

### POST /api/tasks/batch/approve
**Description**: Batch approve tasks

**Request**:
```json
{
  "task_ids": ["01HQX...", "01HQY..."]
}
```

**Response**:
```json
{
  "ok": true,
  "approved": 2
}
```

### POST /api/tasks/batch/dismiss
**Description**: Batch dismiss tasks

**Request**:
```json
{
  "task_ids": ["01HQX..."],
  "reason": "Not actionable"
}
```

**Response**:
```json
{
  "ok": true,
  "dismissed": 1
}
```

### GET /api/tasks/analytics
**Description**: Overall task analytics

**Response**:
```json
{
  "total": 123,
  "byStatus": {"pending": 45, "approved": 67, "dismissed": 11},
  "bySeverity": {"critical": 5, "high": 23, "medium": 45, "low": 50},
  "byType": {"performance_degradation": 34, "error_spike": 23, ...}
}
```

### GET /api/tasks/funnel
**Description**: Conversion funnel metrics

**Response**:
```json
{
  "generated": 123,
  "approved": 67,
  "implemented": 45,
  "conversionRate": 0.366
}
```

### GET /api/tasks/stats
**Description**: Task statistics

**Response**:
```json
{
  "avgTimeToApprove_min": 12.5,
  "avgTimeToImplement_hours": 3.2,
  "topAnalyzers": ["continuation-rate", "error-spike"],
  "autoApprovalRate": 0.15
}
```

### GET /api/tasks/templates
**Description**: Available task templates

**Response**:
```json
{
  "templates": [
    {
      "id": "perf-optimization",
      "name": "Performance Optimization",
      "description": "...",
      "fields": [...]
    }
  ]
}
```

### POST /api/tasks/from-template/:id
**Description**: Create task from template

**Request**:
```json
{
  "values": {
    "endpoint": "/api/chat",
    "baseline_ms": 100,
    "current_ms": 250
  }
}
```

**Response**:
```json
{
  "ok": true,
  "task_id": "01HQX..."
}
```

### GET /api/tasks/dependencies/graph
**Description**: Task dependency graph

**Response**:
```json
{
  "nodes": [
    {"id": "01HQX...", "title": "..."}
  ],
  "edges": [
    {"from": "01HQX...", "to": "01HQY..."}
  ]
}
```

### POST /api/tasks/:id/dependencies
**Description**: Set task dependencies

**Request**:
```json
{
  "dependencies": ["01HQY...", "01HQZ..."]
}
```

**Response**:
```json
{
  "ok": true
}
```

### POST /api/tasks/reprioritize
**Description**: Recalculate task priorities

**Response**:
```json
{
  "ok": true,
  "updated": 23
}
```

### GET /api/tasks/priority/distribution
**Description**: Priority distribution

**Response**:
```json
{
  "priority1": 5,
  "priority2": 12,
  "priority3": 23,
  "priority4": 15,
  "priority5": 10
}
```

### GET /api/tasks/scheduler/stats
**Description**: Scheduler statistics

**Response**:
```json
{
  "lastRun": "2025-11-13T...",
  "tasksGenerated": 12,
  "avgRunTime_ms": 345
}
```

### POST /api/tasks/scheduler/run
**Description**: Manually run task analysis

**Response**:
```json
{
  "ok": true,
  "tasksGenerated": 3,
  "elapsed_ms": 278
}
```

### GET /api/tasks/stream
**Description**: SSE stream of task updates

**Response**: Server-Sent Events
```
event: task_created
data: {"task_id": "01HQX...", ...}

event: task_approved
data: {"task_id": "01HQX...", ...}
```

---

## Auto PR (SAPL)

### GET /api/auto_pr/status
**Description**: Get SAPL configuration and status

**Response**:
```json
{
  "enabled": false,
  "dryRun": true,
  "autoMerge": false,
  "allowlist": ["README.md", "docs/**/*.md", "tests/**/*.mjs"],
  "labels": ["auto-pr", "safe", "documentation"]
}
```

### POST /api/auto_pr/preview
**Description**: Preview PR (dry-run, always safe)

**Request**:
```json
{
  "files": ["README.md", "docs/api.md"],
  "title": "docs: update documentation",
  "body": "Auto-generated from TGT task"
}
```

**Response**:
```json
{
  "ok": true,
  "dryRun": true,
  "branch": "auto-pr/update-docs-1234567890",
  "files": {
    "allowed": ["README.md", "docs/api.md"],
    "blocked": []
  },
  "diffs": [
    {
      "file": "README.md",
      "added": 12,
      "removed": 3,
      "diff": "..."
    }
  ],
  "stats": {
    "filesChanged": 2,
    "linesAdded": 15,
    "linesRemoved": 5
  }
}
```

### POST /api/auto_pr/create
**Description**: Create PR (requires AUTO_PR_ENABLED=1, AUTO_PR_DRYRUN=0)

**Request**:
```json
{
  "files": ["README.md"],
  "title": "docs: update README",
  "body": "Auto-generated update"
}
```

**Response**:
```json
{
  "ok": true,
  "pr_number": 123,
  "pr_url": "https://github.com/owner/repo/pull/123",
  "branch": "auto-pr/update-readme-1234567890"
}
```

### GET /api/auto_pr/git/status
**Description**: Get current git status

**Response**:
```json
{
  "branch": "feat/contextlog-guardrails-telemetry",
  "ahead": 2,
  "behind": 0,
  "modified": ["README.md"],
  "untracked": ["newfile.md"]
}
```

### POST /api/auto_pr/validate
**Description**: Validate files against allowlist

**Request**:
```json
{
  "files": ["README.md", "src/server.mjs"]
}
```

**Response**:
```json
{
  "allowed": ["README.md"],
  "blocked": ["src/server.mjs"],
  "warnings": [
    "src/server.mjs is runtime code and cannot be modified via Auto PR"
  ]
}
```

---

## Metrics & Prompting

### GET /api/scout/metrics
**Description**: Current metrics snapshot

**Response**:
```json
{
  "timestamp": "2025-11-13T...",
  "requests": {
    "/api/chat": {"count": 123, "p50_ms": 234, "p95_ms": 567},
    "/api/chat/stream": {"count": 67, "p50_ms": 123, "p95_ms": 345}
  },
  "errors": {
    "rate": 0.02,
    "topErrors": ["ENOENT", "timeout"]
  },
  "tools": {
    "read_file": {"count": 45, "avg_ms": 23},
    "run_bash": {"count": 12, "avg_ms": 456}
  }
}
```

### GET /api/scout/metrics/history
**Description**: Historical metrics

**Query Params**:
- `hours` (number, optional): Time window (default: 24)
- `interval` (string, optional): Granularity (1h|1d, default: 1h)

**Response**:
```json
{
  "history": [
    {
      "timestamp": "2025-11-13T12:00:00Z",
      "totalRequests": 123,
      "errorRate": 0.02,
      "avgLatency_ms": 234
    }
  ]
}
```

### GET /api/scout/metrics/report
**Description**: Generate metrics report

**Query Params**:
- `hours` (number, optional): Time window (default: 24)

**Response**:
```json
{
  "period": "last 24 hours",
  "summary": {
    "totalRequests": 1234,
    "successRate": 0.98,
    "avgLatency_ms": 234,
    "p95Latency_ms": 567
  },
  "topEndpoints": [...],
  "topErrors": [...]
}
```

### GET /api/prompting_hints/status
**Description**: MIP configuration and status

**Response**:
```json
{
  "ok": true,
  "enabled": false,
  "minutes": 10,
  "threshold": 0.15,
  "minSamples": 5
}
```

### GET /api/prompting_hints/stats
**Description**: Hint usage statistics

**Query Params**:
- `hours` (number, optional): Time window (default: 24)

**Response**:
```json
{
  "ok": true,
  "totalHints": 15,
  "hours": 24,
  "reasonCounts": {
    "fence": 8,
    "punct": 5,
    "short": 2
  },
  "mostCommonReason": "fence",
  "avgContinuationRate": 0.22
}
```

### GET /api/prompting_hints/analyze
**Description**: Analyze continuations and generate hint

**Query Params**:
- `conv_id` (string, optional): Conversation ID
- `minutes` (number, optional): Analysis window (default: 10)

**Response**:
```json
{
  "ok": true,
  "hint": "IMPORTANT: Close any open code fence (```) before finishing. Recent telemetry shows 25% of responses are incomplete due to unclosed code blocks.",
  "analysis": {
    "totalEvents": 20,
    "continuations": 5,
    "continuationRate": 0.25,
    "reasons": {"fence": 3, "punct": 2},
    "dominantReason": "fence",
    "shouldInjectHint": true,
    "threshold": 0.15
  }
}
```

---

## Thought World

### POST /api/chat/thought-world
**Description**: Start thought-world session

**Request**:
```json
{
  "messages": [...],
  "maxDepth": 5,
  "isolation": true
}
```

**Response**:
```json
{
  "sessionId": "01HQX...",
  "status": "running"
}
```

### POST /api/chat/thought-world/stream
**Description**: Streaming thought-world execution

**Request**: Same as `/api/chat/thought-world`

**Response**: Server-Sent Events

### POST /api/chat/thought-world/tools
**Description**: Tool execution in thought-world

**Request**:
```json
{
  "sessionId": "01HQX...",
  "toolCall": {
    "name": "write_file",
    "args": {...}
  },
  "simulate": true
}
```

**Response**:
```json
{
  "ok": true,
  "simulated": true,
  "result": "...",
  "sideEffects": []
}
```

### POST /api/thought-world/start
**Description**: Initialize thought-world session

**Request**:
```json
{
  "scenario": "Compare authentication approaches",
  "paths": [
    {"name": "OAuth2", "steps": [...]},
    {"name": "JWT", "steps": [...]}
  ]
}
```

**Response**:
```json
{
  "sessionId": "01HQX...",
  "paths": [...]
}
```

### GET /api/thought-world/stream/:sessionId
**Description**: Stream thought-world events

**Response**: Server-Sent Events
```
event: path_evaluated
data: {"path": "OAuth2", "score": 0.87}

event: simulation_complete
data: {"winner": "OAuth2"}
```

### POST /api/thought-world/human-input/:sessionId/:inputId
**Description**: Provide human input to simulation

**Request**:
```json
{
  "input": "Prefer simpler approach"
}
```

**Response**:
```json
{
  "ok": true,
  "resumed": true
}
```

---

## ContextLog & Harmony

### GET /api/ctx/tail
**Description**: Get recent ContextLog events

**Query Params**:
- `n` (number, optional): Number of events (default: 50)
- `conv_id` (string, optional): Filter by conversation

**Response**:
```json
{
  "events": [
    {
      "id": "01HQX...",
      "ts": "2025-11-13T...",
      "actor": "tool",
      "act": "tool_call",
      "conv_id": "conv-123",
      "trace_id": "trace-456",
      "iter": 2,
      "name": "read_file",
      "status": "ok",
      "elapsed_ms": 45
    }
  ],
  "total": 123
}
```

### GET /api/ctx/tail.json
**Description**: Get recent ContextLog events (JSON format)

**Query Params**: Same as `/api/ctx/tail`

**Response**: Array of events (same schema as above)

### POST /api/harmony/debug
**Description**: Debug Harmony protocol rendering

**Request**:
```json
{
  "messages": [...],
  "tools": [...]
}
```

**Response**:
```json
{
  "rendered": "<|start|>system<|message|>...",
  "extracted": {
    "reasoning": "...",
    "final": "..."
  }
}
```

---

## Repository Operations

### GET /api/repo/read
**Description**: Read repository file

**Query Params**:
- `path` (string): File path relative to repo root

**Response**:
```json
{
  "ok": true,
  "path": "src/app.py",
  "content": "...",
  "size": 1234
}
```

### POST /api/repo/write
**Description**: Write repository file

**Request**:
```json
{
  "path": "docs/api.md",
  "content": "..."
}
```

**Response**:
```json
{
  "ok": true,
  "path": "docs/api.md",
  "written": 2345
}
```

### POST /api/auth/github/token
**Description**: Set GitHub authentication token

**Request**:
```json
{
  "token": "ghp_..."
}
```

**Response**:
```json
{
  "ok": true,
  "message": "GitHub token configured"
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {...}
}
```

### Common Error Codes

- `invalid_request` — Malformed request (400)
- `unauthorized` — Authentication required (401)
- `forbidden` — Insufficient permissions (403)
- `not_found` — Resource not found (404)
- `rate_limited` — Too many requests (429)
- `upstream_error` — Inference backend error (502)
- `internal_error` — Server error (500)

---

## Rate Limiting

Rate limits are enforced per IP address based on the `API_RATE_PER_MIN` environment variable.

**Headers**:
- `X-RateLimit-Limit`: Maximum requests per minute
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp of rate limit reset

**Rate Limited Response** (429):
```json
{
  "error": "rate_limited",
  "message": "Too many requests",
  "retry_after_ms": 15000
}
```

---

## Authentication

Currently, most endpoints are open. Authentication is implemented for:

- GitHub token operations (`/api/auth/github/token`)
- Tool approval workflows (when `TOOLS_APPROVAL_REQUIRED=1`)

Future versions may add:
- API key authentication
- OAuth2 integration
- Role-based access control (RBAC)

---

## Versioning

API version is currently `v1` (implicit). Future versions will use explicit versioning:

- `/v2/api/chat`
- `/v2/api/autonomous`

Version 1 will remain supported during migration periods.

---

## See Also

- [CLAUDE.md](../../CLAUDE.md) — Architecture guide
- [README.md](../../forgekeeper/README.md) — Feature documentation
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [tasks.md](../../forgekeeper/tasks.md) — Task tracking
