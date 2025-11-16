# TGT User Guide: Telemetry-Driven Task Generation

**Turn system telemetry into actionable improvements automatically.**

TGT watches your Forgekeeper instance and creates task cards when it detects issues like high error rates, incomplete responses, or missing documentation. Think of it as an automated code reviewer that never sleeps.

---

## Table of Contents

- [What is TGT?](#what-is-tgt)
- [Quick Start](#quick-start)
- [What Does TGT Detect?](#what-does-tgt-detect)
- [Using the Tasks UI](#using-the-tasks-ui)
- [Configuration](#configuration)
- [Real-World Examples](#real-world-examples)
- [Advanced Features](#advanced-features)
- [Troubleshooting](#troubleshooting)

---

## What is TGT?

**TGT (Telemetry-Driven Task Generation)** automatically analyzes your Forgekeeper system's health and generates task cards when it finds problems.

### How It Works

```
1. Forgekeeper runs → generates telemetry (logs, metrics, errors)
2. TGT analyzes telemetry every N minutes
3. TGT detects patterns (high error rate, slow responses, etc.)
4. TGT creates task cards with evidence and suggested fixes
5. You review tasks in the UI and approve/dismiss them
6. (Optional) SAPL can auto-create PRs for approved tasks
```

### Why Use TGT?

**Without TGT:**
- You manually grep logs to find issues
- Problems go unnoticed until users complain
- Improvements are reactive, not proactive
- Hard to prioritize what needs fixing

**With TGT:**
- Automatic issue detection from real usage patterns
- Proactive improvement suggestions with evidence
- Clear prioritization (critical → low)
- Ready-to-implement task cards

---

## Quick Start

### 1. Enable TGT

Edit your `.env` file:

```bash
# Enable TGT
TASKGEN_ENABLED=1

# How often to analyze (minutes)
TASKGEN_WINDOW_MIN=60

# Minimum confidence for task generation (0-1)
TASKGEN_MIN_CONFIDENCE=0.7

# Maximum tasks to generate at once
TASKGEN_MAX_TASKS=10
```

### 2. Restart Forgekeeper

```bash
# Restart to load new config
docker compose restart frontend

# Or restart full stack
python -m forgekeeper ensure-stack
```

### 3. Generate Your First Tasks

**Option A: Use the UI**
1. Open Forgekeeper at `http://localhost:3000`
2. Click the "Tasks" drawer button in the footer
3. Click "Analyze Now" to trigger analysis

**Option B: Use the API**

```bash
# Trigger analysis manually
curl http://localhost:3000/api/tasks/suggest

# View generated tasks
curl http://localhost:3000/api/tasks
```

### 4. Review and Approve

Tasks appear in the Tasks drawer with:
- **Severity** (critical, high, medium, low)
- **Evidence** (what telemetry triggered it)
- **Suggested Fix** (what to do about it)

Click **Approve** to mark it for action, or **Dismiss** if it's not relevant.

---

## What Does TGT Detect?

TGT has 5 built-in analyzers that watch different aspects of your system:

### 1. High Continuation Rate

**What it detects:** Too many incomplete responses that need continuation

**Trigger:** >15% of responses trigger auto-continuation in the last hour

**Example task generated:**
```
🔴 CRITICAL: High continuation rate detected

Evidence:
- 18 continuations out of 100 responses (18%)
- Threshold: 15%
- Most common: unclosed code fences, incomplete sentences

Suggested Fix:
- Review prompts in server.orchestrator.mjs
- Enable MIP (Metrics-Informed Prompting) for hints
- Check if max_tokens is too low

Acceptance Criteria:
✓ Continuation rate drops below 10%
✓ Monitor for 24 hours to confirm
```

**Configuration:**
```bash
TASKGEN_CONT_MIN=5                    # Minimum continuations to trigger
TASKGEN_CONT_RATIO_THRESHOLD=0.15     # 15% threshold
```

### 2. Error Spike

**What it detects:** Unusual increase in errors (tool failures, upstream errors)

**Trigger:** >5 errors per hour from same source

**Example task generated:**
```
🟠 HIGH: Error spike in upstream API

Evidence:
- 12 upstream errors in last hour
- Error: "Connection timeout to llama-core:8001"
- Affected endpoints: /api/chat, /api/chat/stream

Suggested Fix:
- Check llama-core container health
- Review network configuration
- Increase timeout in server.orchestrator.mjs

Acceptance Criteria:
✓ Zero connection timeouts for 1 hour
✓ Response time p95 < 2 seconds
```

**Configuration:**
```bash
TASKGEN_UPSTREAM_MIN=3                # Minimum errors to trigger
TASKGEN_TOOL_MIN=5                    # Tool errors threshold
```

### 3. Documentation Gap

**What it detects:** New features or endpoints without documentation

**Trigger:** New API endpoints or components not in docs/

**Example task generated:**
```
🟡 MEDIUM: Missing documentation for new feature

Evidence:
- New endpoint: POST /api/thought-world/start
- No matching docs in docs/api/
- Feature added 2 days ago (commit abc123)

Suggested Fix:
- Add docs/api/thought_world_api.md
- Include endpoint description, parameters, examples
- Update docs/README.md index

Acceptance Criteria:
✓ Documentation exists and is discoverable
✓ Examples are runnable
✓ Linked from main docs index
```

**Configuration:**
```bash
TASKGEN_DOCS_CHECK_ENABLED=1          # Enable docs checking
```

### 4. Performance Degradation

**What it detects:** Endpoints getting slower over time

**Trigger:** p95 response time >2x baseline for 1+ hour

**Example task generated:**
```
🟠 HIGH: Performance degradation in /api/chat

Evidence:
- Baseline p95: 800ms
- Current p95: 1850ms (2.3x slower)
- Degradation started 4 hours ago

Suggested Fix:
- Profile with Scout metrics (/api/scout/metrics)
- Check for memory leaks in tool execution
- Review recent commits for performance regressions

Acceptance Criteria:
✓ p95 response time < 1000ms
✓ No memory leaks detected
```

**Configuration:**
```bash
TASKGEN_PERF_THRESHOLD=2.0            # 2x slowdown threshold
```

### 5. UX Issues

**What it detects:** User friction patterns (high abort rate, repeated errors)

**Trigger:** Patterns indicating poor user experience

**Example task generated:**
```
🟡 MEDIUM: High chat abort rate

Evidence:
- 25% of chats aborted before completion
- Common abort point: after 2-3 tool calls
- User refreshes page instead of waiting

Suggested Fix:
- Add progress indicator during tool execution
- Show "Working on it..." status messages
- Improve tool execution performance

Acceptance Criteria:
✓ Abort rate < 10%
✓ User feedback positive
```

---

## Using the Tasks UI

### Tasks Drawer

**Location:** Footer of the chat UI, "Tasks" button

**Features:**
- **Filter by severity:** Critical, High, Medium, Low
- **Sort by:** Priority, Confidence, Date
- **Multi-select:** Approve/dismiss multiple tasks at once
- **Search:** Find tasks by keyword
- **Analytics:** View task funnel metrics

### Task Card Details

Each task shows:

**Header:**
- 🔴🟠🟡🔵 Severity badge
- Confidence score (0-100%)
- Generated timestamp
- Auto-approved badge (if applicable)

**Body:**
- **Title:** Brief description
- **Evidence:** What triggered the detection
  - Summary stats
  - Detailed breakdowns
  - Relevant metrics
- **Suggested Fix:** Concrete steps to resolve
- **Acceptance Criteria:** How to verify it's fixed

**Actions:**
- **Approve:** Mark for action (sends to SAPL if enabled)
- **Dismiss:** Hide task with optional reason
- **View Details:** Expand evidence and raw telemetry
- **📝 Propose PR:** Create PR preview (requires SAPL)

### Batch Operations

Select multiple tasks and:
- **Batch Approve:** Approve all selected
- **Batch Dismiss:** Dismiss all with same reason
- **Bulk Export:** Export as JSON for analysis

### Analytics Dashboard

Click "Analytics" to see:
- **Task Funnel:** Generated → Approved → Fixed → Verified
- **Detection Rate:** Tasks per hour/day
- **Resolution Time:** Time to fix by severity
- **Auto-Approval Stats:** Accuracy and rate
- **Top Analyzers:** Which detectors are most active

---

## Configuration

### Core Settings

```bash
# .env

# Enable/Disable TGT
TASKGEN_ENABLED=1                     # 0 = off, 1 = on

# Analysis Window
TASKGEN_WINDOW_MIN=60                 # Analyze last 60 minutes

# Confidence Filtering
TASKGEN_MIN_CONFIDENCE=0.7            # Only generate tasks with ≥70% confidence
TASKGEN_MAX_TASKS=10                  # Max tasks per analysis run
```

### Analyzer-Specific Settings

**Continuation Rate:**
```bash
TASKGEN_CONT_MIN=5                    # Min continuations to trigger
TASKGEN_CONT_RATIO_THRESHOLD=0.15     # 15% continuation rate threshold
```

**Error Spikes:**
```bash
TASKGEN_UPSTREAM_MIN=3                # Min upstream errors
TASKGEN_TOOL_MIN=5                    # Min tool errors
```

**Performance:**
```bash
TASKGEN_PERF_THRESHOLD=2.0            # 2x slowdown = task
```

### Auto-Approval Settings

**Use with caution!** Auto-approval automatically approves high-confidence tasks.

```bash
# Enable auto-approval
TASKGEN_AUTO_APPROVE=1                # 0 = off (safe default)

# Minimum confidence for auto-approval
TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9   # 90% confidence required

# Trusted analyzers (comma-separated)
TASKGEN_AUTO_APPROVE_TRUSTED=error-spike,performance

# Rate limiting
TASKGEN_AUTO_APPROVE_MAX_PER_HOUR=5   # Max 5 auto-approvals/hour
```

**Safety notes:**
- Start with `TASKGEN_AUTO_APPROVE=0` (manual approval only)
- Only enable for trusted analyzers you've validated
- Set high confidence threshold (0.9+)
- Monitor auto-approval accuracy in analytics

---

## Real-World Examples

### Example 1: Detecting a Memory Leak

**Scenario:** After deploying a new feature, response times gradually increase.

**TGT Detection:**
```
🔴 CRITICAL: Performance degradation in /api/chat

Evidence:
- Baseline p95: 450ms (2 weeks ago)
- Current p95: 3200ms (7.1x slower)
- Memory usage increased 400% since deployment
- Gradual degradation over 3 days

Suggested Fix:
- Profile memory usage with Node.js heap snapshots
- Check for event listener leaks in thought-world feature
- Review recent commits (hash: abc123, def456)
- Consider reverting feature until fixed

Acceptance Criteria:
✓ p95 response time < 600ms
✓ Memory usage stable over 24 hours
✓ No memory leaks detected in profiling
```

**Action:** You approve the task, investigate, find an event listener leak in thought-world sessions, fix it, and verify performance returns to normal.

### Example 2: Catching Missing Documentation

**Scenario:** You add a new TGT analytics API but forget to document it.

**TGT Detection:**
```
🟡 MEDIUM: Missing documentation for new endpoints

Evidence:
- New endpoints detected:
  * GET /api/tasks/analytics
  * GET /api/tasks/funnel
  * POST /api/tasks/reprioritize
- No matching documentation in docs/api/
- Endpoints added in commit abc123 (2 days ago)

Suggested Fix:
- Create docs/api/tasks_api.md
- Document all 3 endpoints with:
  * Parameters and response format
  * Usage examples with curl
  * Error codes and handling
- Update docs/README.md to link new file

Acceptance Criteria:
✓ Documentation exists and is complete
✓ Examples are copy-pasteable
✓ Linked from main docs index
```

**Action:** You approve, write the docs, and the task is marked as fixed.

### Example 3: Prompt Quality Issue

**Scenario:** After updating the autonomous agent prompt, continuation rate spikes.

**TGT Detection:**
```
🔴 CRITICAL: High continuation rate detected

Evidence:
- Current rate: 28% (was 8% yesterday)
- 42 continuations out of 150 responses
- Spike started 6 hours ago (correlates with commit def456)
- Common pattern: truncated JSON tool responses

Suggested Fix:
- Review autonomous agent prompt changes (commit def456)
- Check if prompt length increased (may exceed context)
- Enable MIP hints for JSON completion
- Revert prompt change if necessary

Acceptance Criteria:
✓ Continuation rate < 10%
✓ No JSON truncation errors
✓ Monitor for 24 hours
```

**Action:** You review the commit, realize the new prompt is too verbose, shorten it, and continuation rate drops to 5%.

---

## Advanced Features

### Templates

Pre-defined task templates for common improvements:

**Usage:**
```bash
# Get available templates
curl http://localhost:3000/api/tasks/templates

# Create task from template
curl -X POST http://localhost:3000/api/tasks/from-template/perf-optimization \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "/api/chat", "baseline_ms": 800, "current_ms": 1500}'
```

**Available templates:**
- `perf-optimization` - Performance improvement task
- `docs-gap` - Missing documentation task
- `error-investigation` - Error spike investigation
- `test-coverage` - Test coverage improvement

### Dependencies

Link related tasks:

```bash
# Set dependencies
curl -X POST http://localhost:3000/api/tasks/T123/dependencies \
  -H "Content-Type: application/json" \
  -d '{"dependencies": ["T121", "T122"]}'

# View dependency graph
curl http://localhost:3000/api/tasks/dependencies/graph
```

**UI:** Tasks with dependencies show:
- 🔒 Blocked badge if dependencies incomplete
- Dependency tree visualization
- Auto-update when dependencies resolve

### Priority Scoring

Tasks are auto-prioritized using:

```
priority_score = (severity × 0.4) + (confidence × 0.3) +
                 (age_factor × 0.2) + (impact × 0.1)
```

**Manually reprioritize:**
```bash
curl -X POST http://localhost:3000/api/tasks/reprioritize
```

### Scheduled Analysis

TGT can run analysis automatically:

```bash
# .env
TASKGEN_SCHEDULER_ENABLED=1           # Enable scheduled analysis
TASKGEN_SCHEDULER_INTERVAL_MIN=30     # Run every 30 minutes
TASKGEN_SCHEDULER_OFFSET_MIN=5        # Start 5 min after hour
```

**View scheduler stats:**
```bash
curl http://localhost:3000/api/tasks/scheduler/stats
```

### Real-Time Updates (SSE)

Subscribe to task updates:

```javascript
// In your UI code
const eventSource = new EventSource('/api/tasks/stream');

eventSource.addEventListener('task_generated', (event) => {
  const task = JSON.parse(event.data);
  console.log('New task:', task.title);
});

eventSource.addEventListener('task_approved', (event) => {
  const task = JSON.parse(event.data);
  console.log('Task approved:', task.id);
});
```

---

## Troubleshooting

### No Tasks Generated

**Problem:** TGT runs but generates no tasks

**Possible causes:**
1. **Not enough telemetry**
   - Solution: Use the system for at least 1 hour to generate baseline data
   - Check ContextLog: `ls -la .forgekeeper/context_log/`

2. **Confidence threshold too high**
   - Solution: Lower `TASKGEN_MIN_CONFIDENCE` to 0.5 temporarily
   - Check: `curl http://localhost:3000/api/tasks/suggest?debug=1`

3. **All tasks dismissed**
   - Solution: Check dismissed tasks in UI (toggle "Show dismissed")

4. **Analysis window too narrow**
   - Solution: Increase `TASKGEN_WINDOW_MIN` to 120 (2 hours)

### Too Many False Positives

**Problem:** TGT generates tasks for non-issues

**Solutions:**

1. **Increase confidence threshold:**
```bash
TASKGEN_MIN_CONFIDENCE=0.8            # Was 0.7
```

2. **Tighten analyzer thresholds:**
```bash
TASKGEN_CONT_RATIO_THRESHOLD=0.20     # Was 0.15 (less sensitive)
TASKGEN_UPSTREAM_MIN=10               # Was 3 (higher bar)
```

3. **Disable noisy analyzers:**
```bash
# Disable specific analyzers
TASKGEN_ANALYZERS_ENABLED=continuation-rate,error-spike
# (omit docs-gap and ux-issues if too noisy)
```

### Tasks Not Auto-Approved

**Problem:** High-confidence tasks not auto-approved

**Check:**

1. **Auto-approval enabled?**
```bash
# Should be 1
echo $TASKGEN_AUTO_APPROVE
```

2. **Confidence high enough?**
```bash
# Task confidence must be ≥ TASKGEN_AUTO_APPROVE_CONFIDENCE
TASKGEN_AUTO_APPROVE_CONFIDENCE=0.9
```

3. **Analyzer trusted?**
```bash
# Must be in trusted list
TASKGEN_AUTO_APPROVE_TRUSTED=error-spike,performance,continuation-rate
```

4. **Rate limit hit?**
```bash
# Check current hour's approvals
curl http://localhost:3000/api/tasks/analytics | grep auto_approved
```

### API Endpoint Not Found

**Problem:** `/api/tasks/*` returns 404

**Solutions:**

1. **Check TGT enabled:**
```bash
grep TASKGEN_ENABLED .env
# Should show: TASKGEN_ENABLED=1
```

2. **Restart frontend:**
```bash
docker compose restart frontend
```

3. **Check server logs:**
```bash
docker compose logs frontend | grep -i tgt
# Look for "TGT initialized" message
```

### Performance Impact

**Problem:** TGT analysis slows down the system

**Solutions:**

1. **Reduce analysis frequency:**
```bash
TASKGEN_SCHEDULER_INTERVAL_MIN=60     # Was 30 (run less often)
```

2. **Narrow analysis window:**
```bash
TASKGEN_WINDOW_MIN=30                 # Was 60 (analyze less data)
```

3. **Limit max tasks:**
```bash
TASKGEN_MAX_TASKS=5                   # Was 10 (generate fewer)
```

4. **Disable real-time updates:**
```bash
TASKGEN_REALTIME_ENABLED=0            # Disable SSE streaming
```

---

## API Reference

For complete API documentation, see:
- [docs/api/tasks_api.md](../api/tasks_api.md)
- [docs/autonomous/tgt/TGT_IMPLEMENTATION_STATUS.md](../autonomous/tgt/TGT_IMPLEMENTATION_STATUS.md)

**Quick reference:**

```bash
# Generate tasks from telemetry
POST /api/tasks/suggest

# List all tasks
GET /api/tasks

# Get specific task
GET /api/tasks/:id

# Approve task
POST /api/tasks/:id/approve

# Dismiss task
POST /api/tasks/:id/dismiss

# Batch operations
POST /api/tasks/batch/approve
POST /api/tasks/batch/dismiss

# Analytics
GET /api/tasks/analytics
GET /api/tasks/funnel
GET /api/tasks/stats

# Templates
GET /api/tasks/templates
POST /api/tasks/from-template/:id

# Dependencies
GET /api/tasks/dependencies/graph
POST /api/tasks/:id/dependencies

# Scheduler
GET /api/tasks/scheduler/stats
POST /api/tasks/scheduler/run

# Real-time
GET /api/tasks/stream (SSE)
```

---

## Next Steps

### Integrate with SAPL

Once you're comfortable with TGT, enable **SAPL (Safe Auto-PR Loop)** to automatically create PRs for approved tasks:

1. Install GitHub CLI: `gh auth login`
2. Enable SAPL: `AUTO_PR_ENABLED=1` in `.env`
3. Approve a task in TGT UI
4. Click "📝 Propose PR"
5. Review PR preview
6. Click "Create PR"

See **[SAPL User Guide](SAPL_USER_GUIDE.md)** for complete details and examples.

### Enable MIP

**MIP (Metrics-Informed Prompting)** uses TGT's continuation rate data to inject hints into prompts:

```bash
# .env
PROMPTING_HINTS_ENABLED=1
```

When TGT detects high continuation rates, MIP automatically adds hints like:
- "Close any open code fence (\`\`\`) before finishing"
- "Complete your sentences with proper punctuation"

---

## Further Reading

- [TGT Implementation Status](../autonomous/tgt/TGT_IMPLEMENTATION_STATUS.md) - Technical details
- [TGT Design Document](../autonomous/tgt/tgt_telemetry_driven_task_generator.md) - Original concept
- [Week-by-Week Implementation](../autonomous/tgt/) - Development history
- [SAPL User Guide](SAPL_USER_GUIDE.md) - Automated PR creation
- [ContextLog ADR](../contextlog/adr-0001-contextlog.md) - Telemetry foundation

---

**Questions or feedback?** Open an issue on GitHub or check the [troubleshooting section](#troubleshooting).

**Last Updated:** 2025-11-14
