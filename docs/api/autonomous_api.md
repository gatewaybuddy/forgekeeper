# Autonomous Agent API Reference

**Base Path**: `/api/chat/autonomous`, `/api/autonomous`
**Status**: Fully Implemented (Phases 1-7)

---

## Overview

The Autonomous Agent API provides self-directed task execution with learning, checkpointing, diagnostics, and error recovery.

**Features** (Phases 1-7):
- Recursive feedback loop with self-reflection
- Progress tracking and stuck detection
- Cross-session learning and episodic memory
- User preference learning
- Proactive planning with alternative strategies
- Pattern learning and heuristic task planning
- Diagnostic reflection and error recovery
- Checkpointing and resume capability
- Real-time status polling
- Failure analysis and recovery proposals

---

## Session Management

### POST /api/chat/autonomous

Start a new autonomous agent session.

**Request**:
```json
{
  "task": "Analyze the repository and identify optimization opportunities",
  "model": "core",
  "maxIterations": 50,
  "timeoutMs": 300000,
  "options": {
    "enableLearning": true,
    "enableCheckpoints": true,
    "checkpointInterval": 5,
    "trustLevel": "moderate",
    "allowedTools": ["read_file", "read_dir", "run_bash"],
    "forbiddenPaths": [".env", "secrets/"]
  }
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_abc123",
  "task": "Analyze the repository and identify optimization opportunities",
  "status": "running",
  "startedAt": "2025-11-04T12:34:56Z",
  "estimatedDuration": 180000,
  "checkpointEnabled": true
}
```

---

### POST /api/chat/autonomous/stop

Stop a running autonomous session.

**Request**:
```json
{
  "sessionId": "ses_abc123",
  "reason": "user_requested"
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_abc123",
  "status": "stopped",
  "stoppedAt": "2025-11-04T12:45:23Z",
  "iterations": 12,
  "result": {
    "completed": false,
    "reason": "user_stopped",
    "partialResults": "..."
  }
}
```

---

### GET /api/chat/autonomous/status

Poll session status (real-time updates).

**Query Parameters**:
- `session_id` - Session ID (required)

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_abc123",
  "status": "running",
  "progress": {
    "iteration": 8,
    "maxIterations": 50,
    "percentage": 16,
    "currentAction": "Analyzing database schema",
    "toolsUsed": 15,
    "successfulActions": 14,
    "failedActions": 1
  },
  "reflection": {
    "lastReflection": "Schema analysis complete. Identified 3 optimization opportunities.",
    "confidence": 0.85,
    "nextSteps": ["Profile query performance", "Analyze index usage"]
  },
  "health": {
    "stuck": false,
    "repeatingActions": false,
    "progressRate": 0.12,
    "estimatedTimeRemaining": 120000
  }
}
```

---

## Checkpoints & Resume

### GET /api/chat/autonomous/checkpoints

List all saved checkpoints (Day 10 feature).

**Response**:
```json
{
  "ok": true,
  "checkpoints": [
    {
      "id": "ckpt_xyz789",
      "sessionId": "ses_abc123",
      "task": "Analyze repository",
      "iteration": 15,
      "createdAt": "2025-11-04T12:40:00Z",
      "status": "completed",
      "progress": {
        "completionPct": 60,
        "tasksCompleted": 12,
        "tasksPending": 8
      },
      "metadata": {
        "tools_used": 25,
        "files_analyzed": 45,
        "size_bytes": 524288
      }
    }
  ],
  "total": 5
}
```

---

### POST /api/chat/autonomous/resume

Resume from a checkpoint (Day 10 feature).

**Request**:
```json
{
  "checkpointId": "ckpt_xyz789",
  "options": {
    "continueTask": true,
    "newTask": null,
    "maxAdditionalIterations": 20
  }
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_def456",
  "resumedFrom": "ckpt_xyz789",
  "status": "running",
  "startedAt": "2025-11-04T13:00:00Z",
  "previousProgress": {
    "iteration": 15,
    "completionPct": 60
  }
}
```

---

## Learning & Clarification

### POST /api/chat/autonomous/clarify

Provide clarification to a waiting agent (Day 10 feature).

**Request**:
```json
{
  "sessionId": "ses_abc123",
  "clarification": "Use the production database, not staging",
  "context": {
    "question": "Which database should I analyze?",
    "options": ["production", "staging", "both"]
  }
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_abc123",
  "status": "resumed",
  "clarificationReceived": "Use the production database, not staging",
  "resumedAt": "2025-11-04T12:50:00Z"
}
```

---

### GET /api/chat/autonomous/stats

Get learning statistics (Day 10 feature).

**Response**:
```json
{
  "ok": true,
  "stats": {
    "totalSessions": 156,
    "completedSessions": 142,
    "failedSessions": 14,
    "successRate": 0.910,
    "avgIterations": 18.5,
    "avgDurationMs": 245000,
    "learning": {
      "patternsLearned": 48,
      "userPreferences": 23,
      "episodicMemories": 156,
      "recoveriesStored": 34
    },
    "tools": {
      "mostUsed": "read_file",
      "totalToolCalls": 3456,
      "avgToolCallsPerSession": 22.2
    }
  }
}
```

---

## Error Recovery & Diagnostics

### GET /api/chat/autonomous/recovery-stats

Get recovery pattern statistics (T313 feature).

**Response**:
```json
{
  "ok": true,
  "stats": {
    "totalRecoveries": 34,
    "successfulRecoveries": 29,
    "failedRecoveries": 5,
    "successRate": 0.853,
    "topPatterns": [
      {
        "errorCategory": "command_not_found",
        "occurrences": 12,
        "recoveryStrategy": "fallback_to_alternative",
        "successRate": 0.916,
        "avgRecoveryTime": 2500
      },
      {
        "errorCategory": "permission_denied",
        "occurrences": 8,
        "recoveryStrategy": "adjust_permissions",
        "successRate": 0.875,
        "avgRecoveryTime": 1800
      }
    ],
    "errorCategories": [
      "command_not_found",
      "permission_denied",
      "file_not_found",
      "timeout",
      "tool_not_found"
    ]
  }
}
```

---

### GET /api/chat/autonomous/history

Get full session history from JSONL.

**Query Parameters**:
- `limit` - Max sessions to return (default: 50)
- `offset` - Pagination offset (default: 0)
- `status` - Filter by status: `completed`, `failed`, `stopped`

**Response**:
```json
{
  "ok": true,
  "sessions": [
    {
      "session_id": "ses_abc123",
      "task": "Analyze repository",
      "completed": true,
      "reason": "task_complete",
      "ts": "2025-11-04T12:45:23Z",
      "iterations": 18,
      "duration_ms": 245000,
      "tools_used": 42,
      "outcome": "success"
    }
  ],
  "total": 156,
  "file_path": ".forgekeeper/playground/.autonomous_sessions.jsonl"
}
```

---

### GET /api/autonomous/diagnose/:session_id

Analyze a failed session and identify root cause.

**Response**:
```json
{
  "ok": true,
  "sessionId": "ses_abc123",
  "diagnosis": {
    "rootCause": "command_not_found",
    "category": "tool_error",
    "severity": "medium",
    "analysis": {
      "why1": "git command failed with exit code 127",
      "why2": "git executable not found in container PATH",
      "why3": "Container image missing git package",
      "why4": "Base image uses minimal Alpine Linux",
      "why5": "Git installation not in Dockerfile"
    },
    "failurePoint": {
      "iteration": 5,
      "action": "clone_repository",
      "tool": "run_bash",
      "args": {"command": "git clone https://..."}
    },
    "impact": {
      "iterations_wasted": 3,
      "time_lost_ms": 45000,
      "cascading_failures": 2
    }
  },
  "recommendations": [
    {
      "priority": 1,
      "action": "install_git",
      "description": "Add git to Dockerfile: RUN apk add git",
      "effort": "low",
      "impact": "high"
    },
    {
      "priority": 2,
      "action": "add_fallback",
      "description": "Implement curl + tar fallback for git operations",
      "effort": "medium",
      "impact": "medium"
    }
  ]
}
```

---

### GET /api/autonomous/failure-patterns

Get common failure patterns across all sessions.

**Response**:
```json
{
  "ok": true,
  "patterns": [
    {
      "pattern": "command_not_found_git",
      "frequency": 12,
      "percentage": 8.6,
      "category": "command_not_found",
      "firstSeen": "2025-10-15T...",
      "lastSeen": "2025-11-04T...",
      "affectedSessions": ["ses_abc", "ses_def", ...],
      "commonContext": {
        "tool": "run_bash",
        "command_prefix": "git",
        "container": "frontend"
      },
      "recoveryStrategies": [
        {
          "strategy": "install_missing_package",
          "successRate": 0.916,
          "avgRecoveryTime": 2500
        },
        {
          "strategy": "fallback_to_curl_tar",
          "successRate": 0.833,
          "avgRecoveryTime": 4200
        }
      ]
    },
    {
      "pattern": "permission_denied_sandbox",
      "frequency": 8,
      "percentage": 5.7,
      "category": "permission_denied",
      ...
    }
  ],
  "summary": {
    "totalPatterns": 14,
    "totalOccurrences": 45,
    "mostCommon": "command_not_found_git",
    "highestImpact": "timeout_llm_inference"
  }
}
```

---

### POST /api/autonomous/propose-fix

Propose code fixes for a given failure pattern.

**Request**:
```json
{
  "patternId": "command_not_found_git",
  "context": {
    "sessionId": "ses_abc123",
    "iteration": 5,
    "tool": "run_bash",
    "command": "git clone https://..."
  },
  "options": {
    "includeTests": true,
    "targetFiles": ["Dockerfile", "docker-compose.yml"],
    "preferredApproach": "automated"
  }
}
```

**Response**:
```json
{
  "ok": true,
  "fixes": [
    {
      "id": "fix_001",
      "type": "dockerfile_addition",
      "priority": 1,
      "description": "Add git package to Dockerfile",
      "effort": "low",
      "impact": "high",
      "automated": true,
      "changes": [
        {
          "file": "Dockerfile",
          "action": "insert_after",
          "line": 5,
          "content": "RUN apk add --no-cache git"
        }
      ],
      "tests": [
        {
          "type": "smoke_test",
          "command": "docker exec frontend git --version",
          "expectedOutput": "git version"
        }
      ],
      "rollback": {
        "instructions": "Remove line from Dockerfile and rebuild",
        "automated": true
      }
    },
    {
      "id": "fix_002",
      "type": "fallback_implementation",
      "priority": 2,
      "description": "Implement curl + tar fallback for git operations",
      "effort": "medium",
      "impact": "medium",
      "automated": false,
      "changes": [...],
      "tests": [...]
    }
  ],
  "recommendation": {
    "suggestedFix": "fix_001",
    "reasoning": "Low effort, high impact, fully automated",
    "estimatedTime": "5 minutes"
  }
}
```

---

## User Preferences API

### GET /api/preferences

Get all user preferences (Phase 5 Option D).

**Response**:
```json
{
  "ok": true,
  "preferences": [
    {
      "preference_id": "pref_abc123",
      "user_id": "default",
      "domain": "coding_style",
      "category": "indentation",
      "preference": "spaces",
      "value": 2,
      "confidence": 0.95,
      "source": "observed",
      "observation_count": 45,
      "last_observed": "2025-11-04T...",
      "created_at": "2025-10-15T..."
    }
  ],
  "total": 23
}
```

---

### GET /api/preferences/:domain

Get preferences for a specific domain.

**Domains**:
- `coding_style` - Indentation, quotes, docstrings, type hints
- `tool_choices` - Test frameworks, package managers, formatters
- `workflow_patterns` - Branch naming, commit style, test location
- `documentation_style` - Comment verbosity, README structure

---

### POST /api/preferences

Record an explicit preference.

**Request**:
```json
{
  "domain": "coding_style",
  "category": "indentation",
  "preference": "spaces",
  "value": 2,
  "source": "explicit"
}
```

**Response**:
```json
{
  "ok": true,
  "preference": {
    "preference_id": "pref_xyz789",
    "confidence": 1.0,
    "created_at": "2025-11-04T..."
  }
}
```

---

### POST /api/preferences/infer

Trigger preference inference on file(s).

**Request**:
```json
{
  "files": ["src/**/*.ts", "lib/**/*.js"],
  "domains": ["coding_style", "documentation_style"]
}
```

**Response**:
```json
{
  "ok": true,
  "inferred": [
    {
      "domain": "coding_style",
      "category": "indentation",
      "preference": "spaces",
      "value": 2,
      "confidence": 0.92,
      "evidence": {
        "files_analyzed": 45,
        "occurrences": 412,
        "consistency": 0.98
      }
    }
  ],
  "filesAnalyzed": 45,
  "timeMs": 1234
}
```

---

### DELETE /api/preferences/:id

Delete a preference.

---

### GET /api/preferences/guidance

Get formatted preference guidance for LLM prompts.

**Response**:
```json
{
  "ok": true,
  "guidance": {
    "coding_style": [
      "Use 2 spaces for indentation (confidence: 95%)",
      "Use single quotes for strings (confidence: 88%)",
      "Include type hints in Python (confidence: 92%)"
    ],
    "tool_choices": [
      "Use pytest for testing (confidence: 100%)",
      "Use npm for package management (confidence: 100%)"
    ],
    "workflow_patterns": [
      "Place tests in tests/ directory (confidence: 85%)",
      "Use conventional commits (confidence: 78%)"
    ],
    "formatted": "## User Preferences\n\n### Coding Style\n- Use 2 spaces for indentation (95% confidence)\n..."
  }
}
```

---

## Episodic Memory API

### GET /api/episodes

Get recent episodes (Phase 5 Option A).

**Query Parameters**:
- `limit` - Max episodes (default: 10)
- `status` - Filter by status: `completed`, `failed`

**Response**:
```json
{
  "ok": true,
  "episodes": [
    {
      "episode_id": "ep_abc123",
      "task": "Add authentication to API",
      "outcome": "success",
      "iterations": 12,
      "duration_ms": 180000,
      "tools_used": ["read_file", "write_file", "run_bash"],
      "key_actions": [
        "Read existing API code",
        "Implemented JWT middleware",
        "Added auth tests",
        "Updated documentation"
      ],
      "lessons_learned": [
        "JWT middleware pattern works well",
        "Tests should cover token expiry"
      ],
      "timestamp": "2025-11-04T..."
    }
  ],
  "total": 156
}
```

---

### POST /api/episodes/search

Search for similar episodes using semantic similarity.

**Request**:
```json
{
  "query": "implement user authentication",
  "topK": 3,
  "minSimilarity": 0.6,
  "filters": {
    "outcome": "success",
    "minIterations": 5
  }
}
```

**Response**:
```json
{
  "ok": true,
  "results": [
    {
      "episode_id": "ep_abc123",
      "task": "Add authentication to API",
      "similarity": 0.92,
      "outcome": "success",
      "relevantActions": [
        "Implemented JWT middleware",
        "Added auth tests"
      ],
      "applicableStrategies": [
        "Use JWT for stateless auth",
        "Test token expiry edge cases"
      ]
    }
  ],
  "searchTime": 45,
  "totalEpisodes": 156
}
```

---

### GET /api/episodes/stats

Get episodic memory statistics.

**Response**:
```json
{
  "ok": true,
  "stats": {
    "totalEpisodes": 156,
    "successfulEpisodes": 142,
    "failedEpisodes": 14,
    "avgIterations": 18.5,
    "avgDuration": 245000,
    "topTasks": [
      {"task": "Add feature", "count": 45},
      {"task": "Fix bug", "count": 34}
    ],
    "embeddingStats": {
      "vectorDimensions": 384,
      "indexSize": 156,
      "avgSearchTime": 42
    }
  }
}
```

---

## Configuration

### Environment Variables

**Session Management**:
- `AUTONOMOUS_MAX_ITERATIONS=50` - Max iterations per session
- `AUTONOMOUS_TIMEOUT_MS=300000` - Session timeout (5 min default)
- `AUTONOMOUS_CHECKPOINT_INTERVAL=5` - Checkpoint every N iterations

**Learning**:
- `AUTONOMOUS_LEARNING_ENABLED=1` - Enable cross-session learning
- `AUTONOMOUS_EPISODIC_MEMORY=1` - Enable episodic memory
- `AUTONOMOUS_USER_PREFERENCES=1` - Enable preference learning

**Safety**:
- `AUTONOMOUS_TRUST_LEVEL=moderate` - Trust level: low, moderate, high
- `AUTONOMOUS_REQUIRE_APPROVAL=1` - Require human approval for risky actions
- `AUTONOMOUS_SANDBOX_STRICT=1` - Strict sandbox enforcement

---

## Implementation Files

**Core Agent**: `frontend/core/agent/autonomous.mjs`
**Session Memory**: `frontend/core/agent/session-memory.mjs`
**Progress Tracker**: `frontend/core/agent/progress-tracker.mjs`
**Self Evaluator**: `frontend/core/agent/self-evaluator.mjs`
**User Preferences**: `frontend/core/agent/user-preferences.mjs`
**Episodic Memory**: `frontend/core/agent/episodic-memory.mjs`
**Diagnostic Reflection**: `frontend/core/agent/diagnostic-reflection.mjs`
**Pattern Learner**: `frontend/core/agent/pattern-learner.mjs`
**Task Planner**: `frontend/core/agent/task-planner.mjs`

---

## See Also

- [Autonomous Agent Overview](../autonomous/README.md)
- [Phase Completion Reports](../autonomous/phases/)
- [Diagnostic Reflection](../adr-0003-diagnostic-reflection.md)
- [User Preference Learning](../PHASE5_USER_PREFERENCE_LEARNING.md)
- [Episodic Memory](../PHASE5_EPISODIC_MEMORY.md)

---

**Last Updated**: 2025-11-04
**Phases**: 1-7 (Complete)
