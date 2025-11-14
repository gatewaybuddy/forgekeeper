# TGT: Telemetry-Driven Task Generator

**Status:** 🔄 Design Phase
**Date:** 2025-11-03
**Priority:** Phase 1 of Self-Improvement Plan (TGT → SAPL → MIP)

---

## Executive Summary

**TGT (Telemetry-Driven Task Generator)** converts ContextLog events and system metrics into actionable Task Cards that Forgekeeper can autonomously address. This creates a closed-loop self-improvement system where Forgekeeper identifies its own weaknesses and generates concrete improvement tasks.

**Key Innovation**: Observability → Insights → Tasks → Autonomous Fixes

**Why First**: Delivers immediate value without code changes; foundation for SAPL (Safe Auto-PR Loop) and MIP (Metrics-Informed Prompting)

---

## Problem Statement

Current state:
1. **Silent Failures**: Errors logged to ContextLog but never surfaced to user
2. **Manual Detection**: Developers must grep logs to find patterns
3. **No Self-Awareness**: System doesn't know when it's struggling
4. **Reactive Fixes**: Problems discovered by users, not proactively
5. **Lost Insights**: Telemetry collected but not actionable

**Example**: 15% of chat requests trigger continuations due to incomplete responses, but nobody notices until a user complains.

---

## Design Principles

1. **Data-Driven**: All tasks generated from real telemetry, not assumptions
2. **Actionable**: Every task has concrete evidence and suggested fix
3. **Prioritized**: High-impact, high-confidence tasks surface first
4. **Safe**: Read-only analysis; no automatic code changes (that's SAPL Phase 2)
5. **Transparent**: User sees evidence, can dismiss or approve
6. **Incremental**: Start with simple heuristics; add ML later

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   TGT Task Generation Pipeline              │
├─────────────────────────────────────────────────────────────┤
│  1. Data Sources                                             │
│     ├─ ContextLog (JSONL events)                            │
│     ├─ /metrics endpoint (Prometheus-style)                 │
│     ├─ Frontend analytics (optional)                        │
│     └─ User feedback (optional)                             │
│                                                              │
│  2. Heuristic Analyzers                                      │
│     ├─ Continuation Detector (incomplete responses)         │
│     ├─ Error Spike Detector (tool/upstream failures)        │
│     ├─ Documentation Gap Detector (undocumented features)   │
│     ├─ Performance Degradation (slow endpoints)             │
│     └─ User Experience Issues (high abort rate)             │
│                                                              │
│  3. Task Card Generator                                      │
│     ├─ Aggregate evidence                                   │
│     ├─ Calculate severity (critical, high, medium, low)     │
│     ├─ Generate title + description                         │
│     ├─ Suggest concrete fix (file + approach)               │
│     ├─ Define acceptance criteria                           │
│     └─ Assign priority score                                │
│                                                              │
│  4. Task API                                                 │
│     ├─ GET /api/tasks/suggest (generate new tasks)          │
│     ├─ GET /api/tasks/list (list all generated tasks)       │
│     ├─ POST /api/tasks/:id/dismiss (hide task)              │
│     ├─ POST /api/tasks/:id/approve (mark for SAPL)          │
│     └─ GET /api/tasks/:id/evidence (detailed telemetry)     │
│                                                              │
│  5. UI Integration                                           │
│     ├─ "Tasks" drawer in Chat footer                        │
│     ├─ Badge with task count (e.g., "🔧 3 issues detected") │
│     ├─ Click → drawer opens with task cards                 │
│     ├─ Each card shows: title, severity, evidence, fix      │
│     └─ Actions: "Dismiss", "Propose PR", "View Details"     │
└─────────────────────────────────────────────────────────────┘
```

---

## Heuristic Analyzers

### 1. Continuation Detector

**Purpose**: Detect when LLM responses are frequently incomplete

**Signal**: Finish reason = `length` or continuation triggered

**Heuristic**:
```javascript
const continuations = contextLog.filter(e =>
  e.act === 'assistant_response' &&
  (e.finish_reason === 'length' || e.metadata?.continuation)
);

const total = contextLog.filter(e => e.act === 'assistant_response').length;
const ratio = continuations.length / total;

if (ratio > 0.15) { // 15% threshold
  return {
    taskType: 'continuation_issue',
    severity: ratio > 0.30 ? 'critical' : 'high',
    evidence: {
      continuations: continuations.length,
      total,
      ratio: (ratio * 100).toFixed(1) + '%',
      timeWindow: '60 minutes'
    },
    suggestedFix: {
      approach: 'increase_max_tokens',
      files: ['.env'],
      changes: [`FRONTEND_MAX_TOKENS=16384 (currently ${currentMaxTokens})`]
    },
    acceptanceCriteria: [
      'Continuation ratio drops below 10%',
      'No user complaints about truncated responses',
      'Latency remains acceptable (<5s p95)'
    ]
  };
}
```

**Task Card Output**:
```
Title: "Reduce continuation rate from 18% to <10%"
Severity: High
Evidence:
  - 34 of 189 responses triggered continuations in last 60 min
  - Ratio: 18.0% (threshold: 15%)
  - Most common: code generation tasks
Suggested Fix:
  - Increase FRONTEND_MAX_TOKENS from 8192 to 16384
  - Monitor latency impact (expect +0.5s avg)
  - Rollback if p95 latency exceeds 8s
Acceptance Criteria:
  - Continuation ratio < 10% over 24h window
  - p95 latency remains < 5s
  - Zero user reports of truncated code
```

---

### 2. Error Spike Detector

**Purpose**: Detect sudden increases in tool or upstream errors

**Signal**: Error count exceeds baseline by 3x

**Heuristic**:
```javascript
const current = contextLog.filter(e =>
  e.status === 'error' &&
  e.ts > Date.now() - 3600000 // Last hour
).length;

const baseline = historicalAverage(contextLog, 'errors_per_hour', { window: '7d' });

if (current > baseline * 3) {
  const errorsByType = groupBy(contextLog.filter(e => e.status === 'error'), 'name');
  const topError = maxBy(errorsByType, errors => errors.length);

  return {
    taskType: 'error_spike',
    severity: current > baseline * 5 ? 'critical' : 'high',
    evidence: {
      currentCount: current,
      baseline,
      ratio: (current / baseline).toFixed(1) + 'x',
      topError: {
        name: topError.key,
        count: topError.length,
        sample: topError[0].result_preview
      }
    },
    suggestedFix: {
      approach: 'investigate_and_mitigate',
      files: determineRelevantFiles(topError.key),
      changes: ['Add error handling', 'Improve validation', 'Add retry logic']
    },
    acceptanceCriteria: [
      `${topError.key} error rate drops below baseline`,
      'Root cause identified and documented',
      'Mitigation deployed or ticket created'
    ]
  };
}
```

**Task Card Output**:
```
Title: "Investigate 5.2x error spike: 'read_file' failures"
Severity: Critical
Evidence:
  - 52 errors in last hour (baseline: 10/hour)
  - 5.2x increase over 7-day average
  - Top error: read_file (38 occurrences)
  - Sample: "ENOENT: no such file or directory"
Suggested Fix:
  - Check recent changes to file tool handling
  - Add file existence validation before read attempts
  - Improve error messages with suggested paths
Root Cause Candidates:
  - Recent sandbox path changes?
  - User providing invalid paths?
  - Tool argument schema changed?
Acceptance Criteria:
  - read_file error rate < 12/hour (baseline + 20%)
  - Root cause documented in ContextLog event
  - Mitigation deployed or follow-up task created
```

---

### 3. Documentation Gap Detector

**Purpose**: Find features that exist in code but lack documentation

**Signal**: New API endpoints, tools, or UI features added without docs

**Heuristic**:
```javascript
const recentCommits = await gitLog({ since: '7 days ago' });
const newFeatures = recentCommits.filter(c =>
  c.message.includes('feat:') ||
  c.message.includes('feature:')
);

for (const feature of newFeatures) {
  const changedFiles = await gitDiff(feature.hash);
  const hasDocsUpdate = changedFiles.some(f =>
    f.startsWith('docs/') ||
    f === 'README.md' ||
    f.endsWith('.md')
  );

  if (!hasDocsUpdate) {
    return {
      taskType: 'documentation_gap',
      severity: 'medium',
      evidence: {
        commit: feature.hash.slice(0, 7),
        message: feature.message,
        changedFiles: changedFiles.filter(f => f.includes('.')).slice(0, 5),
        author: feature.author,
        date: feature.date
      },
      suggestedFix: {
        approach: 'add_documentation',
        files: determineDocLocation(changedFiles),
        changes: [
          'Document new feature in README or docs/',
          'Add usage examples',
          'Update API reference if applicable'
        ]
      },
      acceptanceCriteria: [
        'Feature documented in appropriate location',
        'At least one usage example included',
        'User can find feature via docs search'
      ]
    };
  }
}
```

**Task Card Output**:
```
Title: "Document new 'auto-retry' tool feature (commit a3f2b1c)"
Severity: Medium
Evidence:
  - Commit: a3f2b1c ("feat: add auto-retry for transient failures")
  - Date: 2025-11-01
  - Changed files:
    - frontend/tools/retry.mjs (new)
    - frontend/server.tools.mjs (modified)
    - frontend/config.json (modified)
  - No documentation files updated
Suggested Fix:
  - Add section to docs/tools.md: "Auto-Retry Tool"
  - Explain retry logic (3 attempts, exponential backoff)
  - Show usage example: {"tool": "retry", "args": {...}}
  - Update README.md feature list
Acceptance Criteria:
  - docs/tools.md includes auto-retry section
  - At least 1 working example provided
  - Feature listed in README under "Tools"
```

---

### 4. Performance Degradation Detector

**Purpose**: Detect endpoints/tools that are slowing down

**Signal**: P95 latency increases by >50% compared to baseline

**Heuristic**:
```javascript
const endpoints = ['/api/chat', '/api/chat/stream', '/v1/chat/completions'];

for (const endpoint of endpoints) {
  const currentP95 = percentile(
    contextLog.filter(e => e.act === 'http_request' && e.name === endpoint),
    'elapsed_ms',
    95
  );

  const baselineP95 = historicalPercentile(contextLog, endpoint, 95, { window: '7d' });

  if (currentP95 > baselineP95 * 1.5) {
    return {
      taskType: 'performance_degradation',
      severity: currentP95 > baselineP95 * 2 ? 'high' : 'medium',
      evidence: {
        endpoint,
        currentP95: currentP95.toFixed(0) + 'ms',
        baselineP95: baselineP95.toFixed(0) + 'ms',
        increase: ((currentP95 / baselineP95 - 1) * 100).toFixed(1) + '%',
        sampleRequests: slowestRequests(contextLog, endpoint, 3)
      },
      suggestedFix: {
        approach: 'profile_and_optimize',
        files: determineEndpointFiles(endpoint),
        changes: [
          'Profile slow requests',
          'Identify bottleneck (DB query, LLM call, etc.)',
          'Add caching or optimize algorithm',
          'Monitor impact on latency'
        ]
      },
      acceptanceCriteria: [
        `${endpoint} p95 latency < ${(baselineP95 * 1.2).toFixed(0)}ms`,
        'Bottleneck identified and documented',
        'Optimization deployed or follow-up task created'
      ]
    };
  }
}
```

**Task Card Output**:
```
Title: "Optimize /api/chat: p95 latency increased 67% (3.8s → 6.4s)"
Severity: High
Evidence:
  - Current p95: 6,400ms (last 24h)
  - Baseline p95: 3,800ms (7-day avg)
  - Increase: 67.0%
  - Slowest requests:
    - 12,345ms (conv_c4a..., 500 token response)
    - 9,876ms (conv_7e2..., tool-heavy)
    - 8,123ms (conv_3f1..., continuation triggered)
Suggested Fix:
  - Profile slow requests with detailed timing
  - Check if vLLM backend is saturated (queue depth)
  - Consider tool execution parallelization
  - Add caching for read-only tool results
Likely Causes:
  - Increased traffic (check request volume)
  - vLLM backend contention
  - Tool execution serialization
Acceptance Criteria:
  - /api/chat p95 latency < 4,500ms (baseline + 20%)
  - Root cause identified
  - Optimization deployed or infra scaled
```

---

### 5. User Experience Issue Detector

**Purpose**: Find user frustration patterns (aborts, reloads, errors)

**Signal**: High abort rate or rapid retry pattern

**Heuristic**:
```javascript
const conversations = groupBy(contextLog, 'conv_id');

let highAbortRate = 0;
for (const [convId, events] of Object.entries(conversations)) {
  const aborts = events.filter(e => e.act === 'user_abort' || e.act === 'user_cancel');
  const completions = events.filter(e => e.act === 'assistant_response' && e.status === 'ok');

  if (aborts.length > completions.length) {
    highAbortRate++;
  }
}

const abortRatio = highAbortRate / Object.keys(conversations).length;

if (abortRatio > 0.20) { // 20% of conversations have more aborts than completions
  return {
    taskType: 'user_experience_issue',
    severity: 'high',
    evidence: {
      highAbortConversations: highAbortRate,
      totalConversations: Object.keys(conversations).length,
      ratio: (abortRatio * 100).toFixed(1) + '%',
      commonAbortReasons: analyzeAbortPatterns(contextLog)
    },
    suggestedFix: {
      approach: 'investigate_user_frustration',
      files: ['frontend/src/components/Chat.tsx', 'frontend/server.orchestrator.mjs'],
      changes: [
        'Add abort reason tracking',
        'Improve response streaming UX',
        'Show progress indicators',
        'Reduce latency on first token'
      ]
    },
    acceptanceCriteria: [
      'Abort rate drops below 15%',
      'User feedback collected on abort reasons',
      'UX improvements deployed'
    ]
  };
}
```

**Task Card Output**:
```
Title: "Reduce user abort rate from 24% to <15%"
Severity: High
Evidence:
  - 23 of 96 conversations had more aborts than completions
  - Abort rate: 24.0% (threshold: 20%)
  - Common patterns:
    - 8 aborts during tool execution (long wait)
    - 7 aborts after partial response (slow streaming)
    - 5 aborts immediately after send (no feedback)
Suggested Fix:
  - Add streaming progress indicator ("Thinking...", "Running tools...")
  - Show tool execution status ("git clone in progress...")
  - Reduce time-to-first-token (optimize prompt, cache system message)
  - Add "Cancel" button that's clearly visible
Acceptance Criteria:
  - Abort rate < 15% over 7-day window
  - User survey feedback on UX improvements
  - No regressions in completion quality
```

---

## Task Card Schema

```typescript
interface TaskCard {
  id: string;                // ULID
  type: TaskType;            // 'continuation_issue' | 'error_spike' | ...
  severity: Severity;        // 'critical' | 'high' | 'medium' | 'low'
  status: TaskStatus;        // 'generated' | 'approved' | 'dismissed' | 'completed'

  title: string;             // "Reduce continuation rate from 18% to <10%"
  description: string;       // Full explanation

  evidence: {
    metric: string;          // "continuation_ratio"
    current: string;         // "18.0%"
    baseline?: string;       // "7.2%"
    threshold: string;       // "15.0%"
    timeWindow: string;      // "60 minutes"
    samples: Array<any>;     // Top 3-5 examples
  };

  suggestedFix: {
    approach: string;        // "increase_max_tokens"
    files: string[];         // [".env", "frontend/server.orchestrator.mjs"]
    changes: string[];       // ["FRONTEND_MAX_TOKENS=16384", "Update validation"]
    estimatedEffort: string; // "30 minutes"
  };

  acceptanceCriteria: string[];  // ["Continuation ratio < 10%", ...]

  priority: number;          // 1-100 (higher = more urgent)
  confidence: number;        // 0.0-1.0 (how confident we are in the diagnosis)

  generatedAt: string;       // ISO-8601
  generatedBy: string;       // "TGT_v1.0"

  metadata: {
    relatedEvents: string[]; // ContextLog event IDs
    relatedCommits?: string[]; // Git hashes if applicable
    relatedTasks?: string[];   // Other task IDs
  };
}
```

---

## API Specification

### 1. Generate Tasks
```
GET /api/tasks/suggest?window_min=60&limit=10
```

**Query Parameters**:
- `window_min` (default: 60) - Time window in minutes to analyze
- `limit` (default: 10) - Max tasks to return
- `types` (optional) - Filter by task types (comma-separated)

**Response**:
```json
{
  "tasks": [
    {
      "id": "task_01K...",
      "type": "continuation_issue",
      "severity": "high",
      "title": "Reduce continuation rate from 18% to <10%",
      ...
    },
    ...
  ],
  "meta": {
    "analyzed": {
      "events": 1247,
      "timeWindow": "60 minutes",
      "from": "2025-11-03T10:00:00Z",
      "to": "2025-11-03T11:00:00Z"
    },
    "generated": 3,
    "suppressed": 0
  }
}
```

---

### 2. List Tasks
```
GET /api/tasks/list?status=generated&severity=high,critical
```

**Query Parameters**:
- `status` (optional) - Filter by status
- `severity` (optional) - Filter by severity
- `limit` (default: 50) - Max results

**Response**:
```json
{
  "tasks": [...],
  "total": 23,
  "filtered": 5
}
```

---

### 3. Get Task Details
```
GET /api/tasks/:id
```

**Response**:
```json
{
  "task": {...full task card...},
  "evidence": {
    "events": [...ContextLog events...],
    "metrics": {...relevant metrics...}
  }
}
```

---

### 4. Dismiss Task
```
POST /api/tasks/:id/dismiss
{
  "reason": "Not actionable right now",
  "permanent": false
}
```

**Response**:
```json
{
  "task": {...updated task...},
  "status": "dismissed"
}
```

---

### 5. Approve Task for SAPL
```
POST /api/tasks/:id/approve
{
  "notes": "Approved for auto-PR generation"
}
```

**Response**:
```json
{
  "task": {...updated task...},
  "status": "approved",
  "saplEligible": true
}
```

---

## UI Integration

### Tasks Drawer

**Location**: Chat footer, next to other controls

**Badge**:
```
[🔧 3 issues detected]  [⚙️ Settings]  [📊 Diagnostics]
```

**Drawer Open**:
```
┌─────────────────────────────────────────────────┐
│ Suggested Tasks (3)                  [Refresh]  │
├─────────────────────────────────────────────────┤
│ 🔴 CRITICAL                                      │
│ Investigate 5.2x error spike: read_file         │
│ 52 errors in last hour (baseline: 10/hour)      │
│ [View Details]  [Dismiss]  [Propose PR]         │
├─────────────────────────────────────────────────┤
│ 🟠 HIGH                                          │
│ Reduce continuation rate from 18% to <10%       │
│ 34 of 189 responses triggered continuations     │
│ [View Details]  [Dismiss]  [Propose PR]         │
├─────────────────────────────────────────────────┤
│ 🟡 MEDIUM                                        │
│ Document new 'auto-retry' tool feature          │
│ Commit a3f2b1c has no documentation updates     │
│ [View Details]  [Dismiss]  [Propose PR]         │
└─────────────────────────────────────────────────┘
```

**View Details Modal**:
```
┌─────────────────────────────────────────────────┐
│ Task: Reduce continuation rate from 18% to <10% │
├─────────────────────────────────────────────────┤
│ Severity: HIGH                                   │
│ Confidence: 92%                                  │
│                                                  │
│ Evidence:                                        │
│ • 34 of 189 responses triggered continuations   │
│ • Ratio: 18.0% (threshold: 15%)                 │
│ • Most common: code generation tasks            │
│                                                  │
│ Suggested Fix:                                   │
│ • Increase FRONTEND_MAX_TOKENS from 8192 to     │
│   16384 in .env                                  │
│ • Monitor latency impact (expect +0.5s avg)     │
│ • Rollback if p95 latency exceeds 8s            │
│                                                  │
│ Acceptance Criteria:                             │
│ ✓ Continuation ratio < 10% over 24h            │
│ ✓ p95 latency remains < 5s                     │
│ ✓ Zero user reports of truncated code          │
│                                                  │
│ [Dismiss]  [Propose PR]  [View ContextLog]      │
└─────────────────────────────────────────────────┘
```

---

## Configuration

```bash
# Enable TGT (default: off for safety)
TASKGEN_ENABLED=1

# Time window for analysis (minutes)
TASKGEN_WINDOW_MIN=60

# Minimum confidence to generate task (0.0-1.0)
TASKGEN_MIN_CONFIDENCE=0.7

# Max tasks to generate per analysis
TASKGEN_MAX_TASKS=10

# Heuristic thresholds
TASKGEN_CONTINUATION_THRESHOLD=0.15    # 15%
TASKGEN_ERROR_SPIKE_MULTIPLIER=3.0    # 3x baseline
TASKGEN_PERF_DEGRADATION_THRESHOLD=1.5 # 50% slower
TASKGEN_ABORT_RATE_THRESHOLD=0.20      # 20%

# Auto-analysis schedule (cron format)
TASKGEN_CRON_SCHEDULE="0 * * * *"      # Every hour

# Suppress dismissed tasks (days)
TASKGEN_SUPPRESS_DISMISSED_DAYS=7
```

---

## Implementation Plan

### Week 1: Core Infrastructure
**Deliverables**:
- `frontend/core/taskgen/analyzer.mjs` - Base analyzer class
- `frontend/core/taskgen/taskcard.mjs` - Task card schema + validation
- `GET /api/tasks/suggest` endpoint (stub)
- ContextLog query helpers

**Success Criteria**:
- ✅ Analyzer interface defined
- ✅ Task card schema validated
- ✅ API endpoint returns empty array

---

### Week 2: Heuristic Analyzers
**Deliverables**:
- `frontend/core/taskgen/analyzers/continuation.mjs`
- `frontend/core/taskgen/analyzers/error-spike.mjs`
- `frontend/core/taskgen/analyzers/docs-gap.mjs`
- `frontend/core/taskgen/analyzers/performance.mjs`
- `frontend/core/taskgen/analyzers/ux-issue.mjs`

**Success Criteria**:
- ✅ Each analyzer returns valid task cards
- ✅ Unit tests for each heuristic
- ✅ Integration test with real ContextLog data

---

### Week 3: API & Persistence
**Deliverables**:
- Full API implementation (suggest, list, get, dismiss, approve)
- Task storage: `.forgekeeper/tasks/generated_tasks.jsonl`
- Suppress dismissed tasks logic
- Prioritization algorithm

**Success Criteria**:
- ✅ All API endpoints functional
- ✅ Tasks persisted to JSONL
- ✅ Dismissed tasks suppressed for 7 days
- ✅ Priority scoring working

---

### Week 4: UI Integration
**Deliverables**:
- Tasks drawer component
- Badge with task count
- Task card display
- Dismiss/approve actions
- View details modal

**Success Criteria**:
- ✅ Drawer opens/closes smoothly
- ✅ Task cards rendered correctly
- ✅ Actions (dismiss, approve) update state
- ✅ Modal shows full evidence

---

## Testing Strategy

### Unit Tests
- Each heuristic analyzer in isolation
- Task card schema validation
- Priority scoring algorithm
- Evidence aggregation logic

### Integration Tests
- End-to-end: ContextLog → Analyzer → Task Card → API
- Multiple analyzers running concurrently
- Task persistence and retrieval
- Dismiss/approve workflows

### Smoke Tests
**Scenario 1: Continuation Issue**
1. Generate 100 chat responses with 20% triggering continuations
2. Run `GET /api/tasks/suggest`
3. Expect: 1 task with type='continuation_issue', severity='high'

**Scenario 2: Error Spike**
1. Generate 50 read_file errors in last hour (baseline: 10)
2. Run `GET /api/tasks/suggest`
3. Expect: 1 task with type='error_spike', severity='critical'

**Scenario 3: Documentation Gap**
1. Commit new feature without docs
2. Run `GET /api/tasks/suggest`
3. Expect: 1 task with type='documentation_gap', severity='medium'

---

## Success Metrics

| Metric | Target (Week 4) | Target (Week 12) |
|--------|-----------------|------------------|
| Tasks generated/day | 5-10 | 10-20 |
| Task accuracy (actionable) | >70% | >85% |
| False positive rate | <30% | <15% |
| User dismissal rate | <40% | <25% |
| Tasks leading to PRs | >20% | >40% |
| Time from issue to task | <60 min | <30 min |

---

## Future Enhancements (Post-MVP)

### 1. Machine Learning Classifier
**Replace heuristics with trained model**:
- Train on historical ContextLog + user feedback
- Predict task type, severity, confidence
- Continual learning from dismiss/approve signals

### 2. Natural Language Task Descriptions
**Use LLM to generate human-readable summaries**:
- "Your chat completions are getting cut off 18% of the time. Bumping max_tokens to 16K should fix this."
- More engaging than template-based descriptions

### 3. Multi-Source Data Fusion
**Combine ContextLog + metrics + user feedback + git commits**:
- Correlate error spikes with recent deployments
- Link performance regressions to specific commits
- Surface user complaints from feedback forms

### 4. Predictive Task Generation
**Generate tasks before problems become severe**:
- "Continuation rate trending up (12% → 14% → 16%). Consider increasing max_tokens soon."
- Proactive rather than reactive

### 5. Cross-Repository Task Generation
**Analyze multiple Forgekeeper instances**:
- "80% of prod instances experiencing read_file errors after v2.3 upgrade"
- Aggregate insights from fleet telemetry

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| High false positive rate | Users ignore tasks | Start with high confidence thresholds (0.7+), tune over time |
| Task spam (too many tasks) | Overwhelms user | Limit to top 10 by priority, suppress dismissed tasks |
| Incorrect root cause | Wasted effort | Show evidence, allow user to dismiss with feedback |
| Privacy concerns (telemetry exposure) | User distrust | Redact PII in task cards, allow opt-out via flag |
| Performance overhead | Slow API response | Run analysis async, cache results for 10 minutes |

---

## Dependencies

### Required Before TGT
- ✅ ContextLog operational (ADR-0001)
- ✅ /metrics endpoint functional
- ✅ Episodic memory for historical baselines

### Blocks SAPL (Phase 2)
- ❌ TGT must generate actionable tasks first
- ❌ User feedback loop must validate task quality

### Enables MIP (Phase 3)
- ✅ TGT provides insights for prompt hints
- ✅ Continuation detection feeds MIP triggers

---

## Conclusion

TGT is the **foundation of Forgekeeper's self-improvement loop**. By converting silent telemetry into actionable tasks, TGT enables:

1. **Proactive Issue Detection**: Catch problems before users complain
2. **Data-Driven Improvements**: Prioritize fixes based on real impact
3. **Autonomous Fixes** (via SAPL): Generate PRs automatically for safe changes
4. **Continuous Learning**: Close the loop from observation → insight → action → verification

**Next Steps**:
1. Implement Week 1 deliverables (analyzer infrastructure)
2. Validate heuristics with real ContextLog data
3. Design UI mockups with stakeholders
4. Plan integration with SAPL (Phase 2)

---

## References

- **Self-Improvement Plan**: `docs/roadmap/self_improvement_plan.md`
- **ContextLog ADR**: `docs/contextlog/adr-0001-contextlog.md`
- **Comprehensive Roadmap**: `COMPREHENSIVE_ROADMAP_ANALYSIS.md`
- **SAPL Design** (coming next): `docs/autonomous/sapl_safe_auto_pr_loop.md`
- **MIP Design** (coming next): `docs/autonomous/mip_metrics_informed_prompting.md`

---

**Last Updated**: 2025-11-03
**Status**: Design Complete, Ready for Implementation
**Estimated Effort**: 4 weeks (1 week per phase)
