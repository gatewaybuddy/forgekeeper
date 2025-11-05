# TGT Task API Reference

**Base Path**: `/api/tasks`
**Requires**: `TASKGEN_ENABLED=1`
**Version**: Weeks 1-9 (Complete)

---

## Overview

The Task API provides comprehensive telemetry-driven task generation (TGT) with analytics, prioritization, dependencies, templates, and batch operations.

**Features**:
- Task generation from telemetry analysis
- Smart priority scoring and auto-approval
- Task dependencies with graph visualization
- Templates for common task patterns
- Batch operations (approve/dismiss)
- Real-time SSE updates
- Funnel analytics and metrics

---

## Task Management

### POST /api/tasks/suggest

Generate task suggestions from telemetry analysis.

**Request**:
```json
{
  "windowMin": 60,
  "minConfidence": 0.7,
  "maxTasks": 10
}
```

**Response**:
```json
{
  "ok": true,
  "tasks": [
    {
      "id": "01HQXYZ...",
      "type": "continuation_spike",
      "severity": "high",
      "priority": 75,
      "title": "High continuation rate detected",
      "description": "Continuation rate 18% in last hour (threshold: 15%)",
      "evidence": {
        "summary": "18 continuations out of 100 responses",
        "details": ["/api/chat/stream: 12 continuations"],
        "metrics": { "continuationRate": 0.18, "threshold": 0.15 }
      },
      "suggestedFix": "Review prompts causing incomplete responses",
      "acceptanceCriteria": ["Continuation rate <10%", "Monitor for 24 hours"],
      "generatedAt": "2025-11-04T...",
      "analyzer": "continuation",
      "confidence": 0.9,
      "status": "generated"
    }
  ],
  "analytics": {
    "analyzersRun": 5,
    "tasksGenerated": 3,
    "avgConfidence": 0.85
  }
}
```

---

### GET /api/tasks

List all tasks with optional filtering and sorting.

**Query Parameters**:
- `status` - Filter by status: `generated`, `approved`, `dismissed`, `completed`
- `type` - Filter by type: `continuation_spike`, `error_spike`, `docs_gap`, `performance`, `ux_issue`
- `severity` - Filter by severity: `critical`, `high`, `medium`, `low`
- `limit` - Max results (default: 50)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Sort field: `priority`, `confidence`, `createdAt` (default: `priority`)
- `sortOrder` - `asc` or `desc` (default: `desc`)

**Response**:
```json
{
  "ok": true,
  "tasks": [...],
  "total": 45,
  "offset": 0,
  "limit": 50
}
```

---

### GET /api/tasks/:id

Get a specific task by ID.

**Response**:
```json
{
  "ok": true,
  "task": {
    "id": "01HQXYZ...",
    "type": "continuation_spike",
    ...
  }
}
```

---

### POST /api/tasks/:id/approve

Approve a task for execution.

**Request**:
```json
{
  "comment": "Approved for execution"
}
```

**Response**:
```json
{
  "ok": true,
  "task": {
    "id": "01HQXYZ...",
    "status": "approved",
    "approvedAt": "2025-11-04T...",
    "approvedBy": "user"
  }
}
```

---

### POST /api/tasks/:id/dismiss

Dismiss a task with a reason.

**Request**:
```json
{
  "reason": "Not applicable",
  "comment": "Already fixed manually"
}
```

**Response**:
```json
{
  "ok": true,
  "task": {
    "id": "01HQXYZ...",
    "status": "dismissed",
    "dismissedAt": "2025-11-04T...",
    "dismissalReason": "Not applicable"
  }
}
```

---

### POST /api/tasks/cleanup

Remove old completed/dismissed tasks.

**Request**:
```json
{
  "olderThanDays": 7,
  "statuses": ["completed", "dismissed"]
}
```

**Response**:
```json
{
  "ok": true,
  "removed": 23,
  "retainedActive": 12
}
```

---

## Analytics & Metrics

### GET /api/tasks/analytics

Get comprehensive analytics dashboard data.

**Query Parameters**:
- `daysBack` - Days to analyze (default: 7)

**Response**:
```json
{
  "ok": true,
  "analytics": {
    "overview": {
      "totalTasks": 156,
      "approvalRate": 0.68,
      "dismissalRate": 0.22,
      "avgPriority": 62.5,
      "autoApprovedCount": 12
    },
    "timeSeries": {
      "timeRange": {
        "start": "2025-10-28T...",
        "end": "2025-11-04T...",
        "daysBack": 7
      },
      "daily": [
        {
          "date": "2025-11-04",
          "generated": 23,
          "approved": 15,
          "dismissed": 5,
          "completed": 12
        }
      ]
    },
    "topTypes": [
      {
        "type": "continuation_spike",
        "count": 45,
        "percentage": 28.8,
        "avgPriority": 68
      }
    ],
    "dismissalReasons": [
      {
        "reason": "Not applicable",
        "count": 12,
        "percentage": 35.3
      }
    ],
    "priorityDistribution": {...},
    "severityDistribution": {...},
    "recommendations": [
      {
        "category": "approval_rate",
        "severity": "info",
        "message": "Approval rate is healthy at 68%",
        "actions": []
      }
    ]
  }
}
```

---

### GET /api/tasks/funnel

Get funnel metrics showing task lifecycle conversion rates.

**Query Parameters**:
- `daysBack` - Days to analyze (default: 7)

**Response**:
```json
{
  "ok": true,
  "funnel": {
    "period": {
      "daysBack": 7,
      "startDate": "2025-10-28",
      "endDate": "2025-11-04",
      "totalTasks": 156
    },
    "stages": {
      "generated": {
        "count": 156,
        "percentage": 100
      },
      "engaged": {
        "count": 142,
        "percentage": 91.0,
        "description": "Tasks viewed or interacted with"
      },
      "approved": {
        "count": 106,
        "percentage": 67.9,
        "description": "Tasks approved for execution"
      },
      "completed": {
        "count": 89,
        "percentage": 57.1,
        "description": "Tasks successfully completed"
      },
      "dismissed": {
        "count": 36,
        "percentage": 23.1,
        "description": "Tasks dismissed or rejected"
      }
    },
    "conversionRates": {
      "generatedToEngaged": {
        "rate": 0.910,
        "from": 156,
        "to": 142,
        "label": "Generated → Engaged"
      },
      "engagedToApproved": {
        "rate": 0.746,
        "from": 142,
        "to": 106,
        "label": "Engaged → Approved"
      },
      "approvedToCompleted": {
        "rate": 0.840,
        "from": 106,
        "to": 89,
        "label": "Approved → Completed"
      },
      "engagedToDismissed": {
        "rate": 0.254,
        "from": 142,
        "to": 36,
        "label": "Engaged → Dismissed"
      }
    },
    "dropoffs": [
      {
        "stage": "engaged_to_approved",
        "count": 36,
        "percentage": 25.4,
        "severity": "medium"
      }
    ],
    "summary": {
      "healthScore": 82,
      "topIssue": "25% drop-off from engaged to approved",
      "recommendation": "Review task relevance and suggested fixes"
    }
  }
}
```

---

### GET /api/tasks/stats

Get basic task statistics.

**Response**:
```json
{
  "ok": true,
  "stats": {
    "total": 156,
    "byStatus": {
      "generated": 23,
      "approved": 45,
      "dismissed": 34,
      "completed": 54
    },
    "bySeverity": {
      "critical": 5,
      "high": 23,
      "medium": 67,
      "low": 61
    },
    "byType": {
      "continuation_spike": 45,
      "error_spike": 23,
      "docs_gap": 34,
      "performance": 28,
      "ux_issue": 26
    }
  }
}
```

---

## Templates

### GET /api/tasks/templates

List all task templates.

**Response**:
```json
{
  "ok": true,
  "templates": [
    {
      "id": "tpl_continuation",
      "name": "Continuation Rate Fix",
      "description": "Template for addressing high continuation rates",
      "taskType": "continuation_spike",
      "severity": "high",
      "defaultPriority": 70,
      "titlePattern": "High continuation rate: {rate}%",
      "descriptionPattern": "Continuation rate is {rate}% (threshold: {threshold}%)",
      "suggestedFixPattern": "Review prompts and adjust max_tokens",
      "acceptanceCriteria": ["Continuation rate < 10%"],
      "usageCount": 12,
      "createdAt": "2025-10-15T..."
    }
  ]
}
```

---

### GET /api/tasks/templates/:id

Get a specific template.

---

### POST /api/tasks/templates

Create a new template.

**Request**:
```json
{
  "name": "Custom Template",
  "description": "Template for custom tasks",
  "taskType": "custom",
  "severity": "medium",
  "defaultPriority": 50,
  "titlePattern": "Custom: {title}",
  "descriptionPattern": "{description}",
  "acceptanceCriteria": ["Task completed"]
}
```

---

### PUT /api/tasks/templates/:id

Update an existing template.

---

### DELETE /api/tasks/templates/:id

Delete a template.

---

### POST /api/tasks/from-template/:id

Create a task from a template.

**Request**:
```json
{
  "variables": {
    "rate": "18",
    "threshold": "15"
  },
  "overrides": {
    "severity": "critical"
  }
}
```

**Response**:
```json
{
  "ok": true,
  "task": {
    "id": "01HQXYZ...",
    "title": "High continuation rate: 18%",
    ...
  }
}
```

---

## Batch Operations

### POST /api/tasks/batch/approve

Approve multiple tasks at once.

**Request**:
```json
{
  "taskIds": ["01HQXYZ...", "01HQABC..."],
  "comment": "Batch approved"
}
```

**Response**:
```json
{
  "ok": true,
  "results": [
    {
      "id": "01HQXYZ...",
      "success": true,
      "status": "approved"
    },
    {
      "id": "01HQABC...",
      "success": false,
      "error": "Task already approved"
    }
  ],
  "summary": {
    "total": 2,
    "succeeded": 1,
    "failed": 1
  }
}
```

---

### POST /api/tasks/batch/dismiss

Dismiss multiple tasks at once.

**Request**:
```json
{
  "taskIds": ["01HQXYZ...", "01HQABC..."],
  "reason": "Not applicable",
  "comment": "Batch dismissed"
}
```

**Response**: Similar to batch approve

---

## Prioritization

### POST /api/tasks/reprioritize

Recalculate priority scores for all tasks.

**Response**:
```json
{
  "ok": true,
  "reprioritized": 45,
  "avgPriorityBefore": 58.2,
  "avgPriorityAfter": 62.5
}
```

---

### GET /api/tasks/priority/distribution

Get priority score distribution.

**Response**:
```json
{
  "ok": true,
  "distribution": {
    "urgent": { "range": "80-100", "count": 5, "percentage": 3.2 },
    "high": { "range": "60-79", "count": 23, "percentage": 14.7 },
    "medium": { "range": "40-59", "count": 67, "percentage": 42.9 },
    "low": { "range": "20-39", "count": 45, "percentage": 28.8 },
    "veryLow": { "range": "0-19", "count": 16, "percentage": 10.3 }
  }
}
```

---

## Dependencies

### POST /api/tasks/:id/dependencies

Add a dependency between tasks.

**Request**:
```json
{
  "dependsOn": "01HQABC...",
  "relationship": "blocks"
}
```

**Response**:
```json
{
  "ok": true,
  "task": {
    "id": "01HQXYZ...",
    "dependencies": ["01HQABC..."]
  }
}
```

---

### DELETE /api/tasks/:id/dependencies/:depId

Remove a dependency.

---

### GET /api/tasks/dependencies/graph

Get the full dependency graph.

**Response**:
```json
{
  "ok": true,
  "graph": {
    "nodes": [
      {
        "id": "01HQXYZ...",
        "title": "Fix continuation rate",
        "status": "approved",
        "priority": 75
      }
    ],
    "edges": [
      {
        "from": "01HQXYZ...",
        "to": "01HQABC...",
        "relationship": "blocks"
      }
    ],
    "cycles": [],
    "criticalPath": ["01HQXYZ...", "01HQABC...", "01HQDEF..."]
  }
}
```

---

### GET /api/tasks/dependencies/stats

Get dependency statistics.

**Response**:
```json
{
  "ok": true,
  "stats": {
    "totalTasks": 156,
    "tasksWithDependencies": 34,
    "avgDependenciesPerTask": 1.8,
    "blockedTasks": 12,
    "circularDependencies": 0
  }
}
```

---

### GET /api/tasks/dependencies/blocked

List all blocked tasks.

**Response**:
```json
{
  "ok": true,
  "blocked": [
    {
      "id": "01HQXYZ...",
      "title": "Deploy new feature",
      "blockedBy": [
        {
          "id": "01HQABC...",
          "title": "Fix test failures",
          "status": "approved"
        }
      ]
    }
  ]
}
```

---

## Scheduler

### GET /api/tasks/scheduler/stats

Get scheduler statistics.

**Response**:
```json
{
  "ok": true,
  "stats": {
    "enabled": true,
    "intervalMs": 300000,
    "lastRun": "2025-11-04T12:34:56Z",
    "nextRun": "2025-11-04T12:39:56Z",
    "totalRuns": 456,
    "tasksGeneratedTotal": 1234,
    "avgTasksPerRun": 2.7
  }
}
```

---

### POST /api/tasks/scheduler/run

Trigger an immediate scheduler run.

**Response**:
```json
{
  "ok": true,
  "run": {
    "triggeredAt": "2025-11-04T12:35:00Z",
    "tasksGenerated": 3,
    "analysisTimeMs": 1234
  }
}
```

---

## Real-Time Updates

### GET /api/tasks/stream

Server-Sent Events (SSE) endpoint for real-time task updates.

**Connection**:
```javascript
const eventSource = new EventSource('/api/tasks/stream');

eventSource.addEventListener('update', (event) => {
  const data = JSON.parse(event.data);
  console.log('Tasks updated:', data.tasks);
});

eventSource.addEventListener('notification', (event) => {
  const data = JSON.parse(event.data);
  console.log('Notification:', data.message);
});
```

**Event Types**:
- `update` - Task list changed
- `notification` - User notification
- `heartbeat` - Keep-alive ping (every 30s)

**Update Event**:
```json
{
  "type": "update",
  "tasks": [...],
  "count": 23,
  "newTasksCount": 3,
  "timestamp": 1699123456789
}
```

**Notification Event**:
```json
{
  "type": "notification",
  "message": "3 new tasks generated",
  "severity": "info",
  "timestamp": 1699123456789
}
```

---

## Error Responses

### 403 Forbidden
TGT is disabled. Set `TASKGEN_ENABLED=1`.

```json
{
  "ok": false,
  "error": "disabled",
  "message": "TGT is disabled. Set TASKGEN_ENABLED=1."
}
```

### 404 Not Found
Task not found.

```json
{
  "ok": false,
  "error": "not_found",
  "message": "Task 01HQXYZ... not found"
}
```

### 400 Bad Request
Invalid request parameters.

```json
{
  "ok": false,
  "error": "invalid_params",
  "message": "Invalid status filter: 'invalid'"
}
```

### 500 Internal Server Error
Server error.

```json
{
  "ok": false,
  "error": "server_error",
  "message": "Failed to generate tasks"
}
```

---

## Environment Variables

See README.md TGT section for complete list.

**Key Variables**:
- `TASKGEN_ENABLED=1` - Enable TGT (required)
- `TASKGEN_WINDOW_MIN=60` - Analysis window
- `TASKGEN_AUTO_APPROVE=1` - Enable auto-approval
- `TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9` - Auto-approve threshold

---

## Implementation Files

**Router**: `frontend/server.tasks.mjs`
**Core Logic**: `frontend/core/taskgen/`
- `analyzer.mjs` - Main analyzer
- `analyzers/` - 5 analyzer types
- `taskcard.mjs` - Task card structure
- `prioritization.mjs` - Priority scoring
- `auto-approval.mjs` - Auto-approval logic
- `dependencies.mjs` - Dependency management
- `templates.mjs` - Template system
- `task-store.mjs` - Storage layer
- `task-analytics.mjs` - Analytics
- `task-lifecycle.mjs` - Funnel metrics
- `scheduler.mjs` - Background scheduler

---

## See Also

- [TGT Implementation Guide](../autonomous/tgt/README.md)
- [UI Integration Guide](../../frontend/docs/UI_COMPONENTS_INTEGRATION_GUIDE.md)
- [Week Summaries](../autonomous/tgt/)
- [Testing Guide](../../frontend/tests/week8-week9-integration.test.mjs)

---

**Last Updated**: 2025-11-04
**API Version**: Weeks 1-9 (Complete)
