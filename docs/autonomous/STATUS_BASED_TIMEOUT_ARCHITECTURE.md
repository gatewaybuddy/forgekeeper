# Status-Based Timeout Architecture for Autonomous Agent

**Date**: 2025-11-03
**Status**: Planning
**Author**: Claude + User

---

## Problem Statement

Current timeout mechanisms are **time-based**, which doesn't work well for slow local LLM backends:

### Current Issues

1. **Task Planner Timeout**: 30 seconds (too short for slow LLMs)
   - Fallback to broken heuristics when LLM takes >30s
   - Location: `frontend/core/agent/autonomous.mjs:102`

2. **Test Timeouts**: 3 minutes for deployment, 2 minutes for implementation
   - Agent fails even if making real progress
   - Location: `tests/autonomous/test-autonomous-deployment.mjs`

3. **Reflection Timeouts**: No explicit timeout, but health check gives up after 15 attempts
   - Location: `frontend/server.health.mjs`

### Why Time-Based Timeouts Don't Work

- **Local LLM has no API limits**: User is okay with slow inference (no $/token cost)
- **Slow ≠ Stuck**: 28+ seconds for a reflection call is slow but valid
- **Premature failures**: Agent times out even when making genuine progress
- **Fixed mindset**: "Fast or fail" doesn't match local inference reality

---

## Solution: Status-Based Completion

Replace **time limits** with **progress indicators** and **explicit failure conditions**.

### Core Principles

1. **No time-based failures** - Only fail on explicit error conditions
2. **Progress tracking** - Detect stuck vs. slow based on state changes
3. **Concurrent monitoring** - Use parallel inference calls for status checks
4. **Heartbeat system** - Track that agent is alive and working
5. **Graceful degradation** - Fallback to simpler plans, not broken heuristics

---

## Architecture Changes

### 1. Task Planner: Remove Timeout, Add Progress Tracking

**Current** (`frontend/core/agent/task-planner.mjs`):
```javascript
async plan(planId, taskAction, context) {
  const timeout = this.config.timeout; // 30000ms

  const result = await Promise.race([
    this._callLLM(planId, taskAction, context),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Planning timeout')), timeout)
    ),
  ]);

  if (error) {
    return this.buildFallbackPlan(...); // Broken heuristics
  }
}
```

**Proposed**:
```javascript
async plan(planId, taskAction, context) {
  // No timeout! Just track progress
  const progressTracker = new PlanningProgressTracker(planId);

  progressTracker.start();

  try {
    const result = await this._callLLMWithProgress(
      planId,
      taskAction,
      context,
      progressTracker
    );

    progressTracker.complete();
    return result;

  } catch (error) {
    // Only fail on explicit errors (connection refused, auth failed, etc.)
    if (this._isRecoverableError(error)) {
      // Use LLM to generate simpler plan, not regex heuristics
      return await this._generateSimplifiedPlan(taskAction, context);
    }
    throw error;
  }
}
```

### 2. Progress Tracker: Detect Stuck vs. Slow

**New Component** (`frontend/core/agent/progress-tracker.mjs`):
```javascript
export class ProgressTracker {
  constructor(sessionId, config = {}) {
    this.sessionId = sessionId;
    this.heartbeats = [];
    this.stateChanges = [];
    this.config = {
      heartbeatInterval: config.heartbeatInterval || 10000, // 10s
      stuckThreshold: config.stuckThreshold || 5, // 5 heartbeats with no state change
      enableConcurrentChecks: config.enableConcurrentChecks ?? true,
    };
  }

  /**
   * Record heartbeat - agent is alive
   */
  heartbeat(metadata = {}) {
    this.heartbeats.push({
      ts: Date.now(),
      iteration: metadata.iteration,
      phase: metadata.phase,
    });
  }

  /**
   * Record state change - agent is making progress
   */
  stateChange(change) {
    this.stateChanges.push({
      ts: Date.now(),
      type: change.type, // 'tool_call', 'reflection_complete', 'plan_generated'
      data: change.data,
    });
  }

  /**
   * Check if agent is stuck (alive but no progress)
   */
  isStuck() {
    if (this.heartbeats.length < this.config.stuckThreshold) {
      return false; // Not enough data
    }

    const recentHeartbeats = this.heartbeats.slice(-this.config.stuckThreshold);
    const firstTs = recentHeartbeats[0].ts;
    const lastTs = recentHeartbeats[recentHeartbeats.length - 1].ts;

    // Check if any state changes happened during this period
    const stateChangesInPeriod = this.stateChanges.filter(
      sc => sc.ts >= firstTs && sc.ts <= lastTs
    );

    // Stuck = heartbeats but no state changes
    return stateChangesInPeriod.length === 0;
  }

  /**
   * Get current status
   */
  getStatus() {
    const lastHeartbeat = this.heartbeats[this.heartbeats.length - 1];
    const lastStateChange = this.stateChanges[this.stateChanges.length - 1];

    return {
      alive: Date.now() - lastHeartbeat?.ts < this.config.heartbeatInterval * 2,
      stuck: this.isStuck(),
      progress: {
        heartbeats: this.heartbeats.length,
        stateChanges: this.stateChanges.length,
        lastChange: lastStateChange?.type,
        lastChangeAgo: lastStateChange ? Date.now() - lastStateChange.ts : null,
      },
    };
  }
}
```

### 3. Concurrent Status Checks

**New Feature** (`frontend/core/agent/concurrent-status-checker.mjs`):
```javascript
/**
 * Run concurrent LLM inference calls to check agent status without blocking main loop
 */
export class ConcurrentStatusChecker {
  constructor(llmClient, model) {
    this.llmClient = llmClient;
    this.model = model;
    this.runningChecks = new Map();
  }

  /**
   * Start a background status check (non-blocking)
   */
  async startCheck(checkId, context) {
    const checkPromise = this._runStatusCheck(context);
    this.runningChecks.set(checkId, checkPromise);

    // Don't await - run in background
    checkPromise
      .then(result => {
        console.log(`[StatusCheck:${checkId}] Result:`, result);
      })
      .catch(error => {
        console.warn(`[StatusCheck:${checkId}] Failed:`, error.message);
      })
      .finally(() => {
        this.runningChecks.delete(checkId);
      });
  }

  /**
   * Ask LLM: "Is this agent making progress or stuck?"
   */
  async _runStatusCheck(context) {
    const prompt = `You are monitoring an autonomous agent's progress.

**Agent Context**:
${JSON.stringify(context, null, 2)}

**Question**: Is this agent:
A) Making progress (slow but working)
B) Stuck in a loop (repeating same actions)
C) Blocked (waiting for external resource)
D) Failed (error condition)

Respond with ONLY one letter (A/B/C/D) followed by a brief reason.`;

    const response = await this.llmClient.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.0,
    });

    const content = response.choices[0].message.content.trim();
    const status = content[0]; // A, B, C, or D
    const reason = content.slice(2).trim();

    return { status, reason, ts: Date.now() };
  }

  /**
   * Get latest status check result (if available)
   */
  async getLatestResult(checkId, waitMs = 0) {
    const check = this.runningChecks.get(checkId);
    if (!check) return null;

    if (waitMs > 0) {
      // Wait up to waitMs for result
      try {
        return await Promise.race([
          check,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Check timeout')), waitMs)
          ),
        ]);
      } catch {
        return null; // Still running
      }
    }

    // Check if already resolved
    return await Promise.race([
      check,
      Promise.resolve(null),
    ]);
  }
}
```

### 4. Autonomous Agent: Integrate Progress Tracking

**Changes** (`frontend/core/agent/autonomous.mjs`):
```javascript
import { ProgressTracker } from './progress-tracker.mjs';
import { ConcurrentStatusChecker } from './concurrent-status-checker.mjs';

export function createAutonomousAgent(config) {
  const progressTracker = new ProgressTracker(sessionId);
  const statusChecker = new ConcurrentStatusChecker(llmClient, model);

  async function run() {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // Heartbeat: Agent is alive
      progressTracker.heartbeat({ iteration, phase: 'reflection' });

      // Reflect (no timeout!)
      const reflection = await reflect();
      progressTracker.stateChange({ type: 'reflection_complete', data: reflection });

      // Check if stuck (every 5 iterations)
      if (iteration % 5 === 0) {
        const status = progressTracker.getStatus();
        if (status.stuck) {
          // Start concurrent status check (non-blocking)
          statusChecker.startCheck(`iter-${iteration}`, {
            iteration,
            recentActions: memory.slice(-3),
            currentTask: task,
          });

          // Optional: Wait briefly for result
          const statusResult = await statusChecker.getLatestResult(`iter-${iteration}`, 5000);
          if (statusResult?.status === 'B') {
            console.warn(`[Autonomous] Stuck detected: ${statusResult.reason}`);
            // Trigger recovery logic
          }
        }
      }

      // Execute action
      progressTracker.heartbeat({ iteration, phase: 'execution' });
      const toolResult = await executeAction(reflection.next_action);
      progressTracker.stateChange({ type: 'tool_call', data: { tool: toolResult.tool } });

      // Check completion (NOT timeout!)
      if (reflection.assessment === 'task_complete') {
        return { status: 'completed', iterations: iteration };
      }
    }

    // Only fail after max iterations
    return { status: 'incomplete', reason: 'max_iterations_reached' };
  }
}
```

### 5. Test Scripts: Remove Time Limits

**Changes** (`tests/autonomous/test-autonomous-deployment.mjs`):
```javascript
// BEFORE: 3-minute timeout
const DEPLOYMENT_TIMEOUT = 3 * 60 * 1000; // 3 minutes

// AFTER: Status-based completion
async function waitForDeployment(sessionId) {
  let iteration = 0;
  let lastStatus = null;

  while (true) {
    iteration++;

    const status = await fetch(`http://localhost:3000/api/chat/autonomous/status?sessionId=${sessionId}`)
      .then(r => r.json());

    // Check explicit completion
    if (status.status === 'completed') {
      console.log(`✓ Deployment completed after ${iteration} checks`);
      return { success: true, status };
    }

    if (status.status === 'failed') {
      console.log(`✗ Deployment failed: ${status.error}`);
      return { success: false, status };
    }

    // Check if stuck (no progress for 10 checks)
    if (lastStatus &&
        status.iteration === lastStatus.iteration &&
        iteration - lastStuckCheck > 10) {
      console.warn(`⚠ Agent appears stuck at iteration ${status.iteration}`);

      // Ask user or trigger recovery
      const shouldContinue = await promptUser('Agent appears stuck. Continue waiting? (y/n)');
      if (!shouldContinue) {
        return { success: false, reason: 'user_cancelled_stuck' };
      }

      lastStuckCheck = iteration;
    }

    // Log progress
    if (iteration % 10 === 0) {
      console.log(`  Agent working... (iteration ${status.iteration}, ${iteration} checks)`);
    }

    lastStatus = status;
    await sleep(10000); // Check every 10 seconds (not a timeout!)
  }
}
```

---

## Failure Conditions (Explicit, Not Time-Based)

The agent should ONLY fail on:

1. **Explicit Errors**
   - Connection refused (backend completely down)
   - Authentication failure
   - Tool execution error (file not found, permission denied)
   - LLM API error (4xx, 5xx)

2. **Stuck Detection**
   - Agent alive (heartbeats) but no state changes for N heartbeats
   - Concurrent status check confirms "stuck in loop"
   - User manually cancels

3. **Max Iterations**
   - Agent completes 25 iterations without task completion
   - This is a last-resort safety, NOT a timeout

4. **Explicit Task Failure**
   - Agent reports `assessment: "task_failed"`
   - Agent reports confidence < threshold after multiple attempts

---

## Benefits

### 1. Works with Slow LLMs
- 28+ second reflections? No problem.
- Agent continues as long as it's making progress

### 2. Detects Real Problems
- Stuck in loop → Detected by state tracking, not timeout
- Backend crash → Detected by connection error, not timeout

### 3. Better Observability
- Progress tracking shows what's happening
- Concurrent checks provide insight without blocking

### 4. Cost-Effective for Local Inference
- No API rate limits to worry about
- Extra concurrent checks are free (same local GPU)

---

## Implementation Plan

### Phase 1: Core Infrastructure (1-2 days)
1. ✅ Create `frontend/core/agent/progress-tracker.mjs`
2. ✅ Create `frontend/core/agent/concurrent-status-checker.mjs`
3. ✅ Add unit tests for progress tracking logic

### Phase 2: Agent Integration (1 day)
1. ✅ Integrate ProgressTracker into `autonomous.mjs`
2. ✅ Add heartbeat calls throughout agent loop
3. ✅ Add state change tracking for tool calls, reflections

### Phase 3: Task Planner Refactor (1 day)
1. ✅ Remove timeout from task planner
2. ✅ Replace broken regex fallback with LLM-based simplified planning
3. ✅ Add progress tracking to planning phase

### Phase 4: Test Updates (1 day)
1. ✅ Remove time-based timeouts from all test scripts
2. ✅ Add status-based completion checks
3. ✅ Add user prompts for stuck scenarios

### Phase 5: Monitoring & Debugging (1 day)
1. ✅ Add dashboard endpoint: `GET /api/autonomous/progress/:sessionId`
2. ✅ Add concurrent status check endpoint: `POST /api/autonomous/check-status`
3. ✅ Add logging for all heartbeats and state changes to ContextLog

---

## API Endpoints

### GET /api/autonomous/progress/:sessionId
Returns detailed progress information:
```json
{
  "sessionId": "01ABC123...",
  "alive": true,
  "stuck": false,
  "progress": {
    "heartbeats": 47,
    "stateChanges": 12,
    "lastChange": "tool_call",
    "lastChangeAgo": 3200
  },
  "currentPhase": "execution",
  "iteration": 6
}
```

### POST /api/autonomous/check-status
Starts a concurrent status check:
```json
{
  "sessionId": "01ABC123...",
  "checkId": "check-001"
}
```

Returns immediately with checkId. Poll GET `/api/autonomous/check-status/:checkId` for result.

---

## Migration Strategy

1. **Backwards compatible**: Keep existing timeouts as config options (default: disabled)
2. **Gradual rollout**: Enable status-based mode with env var `AUTONOMOUS_STATUS_BASED_TIMEOUT=1`
3. **Monitoring**: Log both time-based and status-based results to compare
4. **Fallback**: If status tracking fails, fall back to time-based timeout

---

## Testing Strategy

### Unit Tests
- ProgressTracker: stuck detection, heartbeat tracking
- ConcurrentStatusChecker: concurrent inference, result retrieval

### Integration Tests
- Autonomous agent with slow LLM (simulated 30s delays)
- Agent stuck in loop (repeat same action)
- Agent with intermittent backend failures

### Performance Tests
- Concurrent status checks don't slow down main loop
- Memory usage stable over long-running sessions

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent runs forever | Resource exhaustion | Max iterations failsafe (25 iterations) |
| Stuck detection false positives | Premature termination | Concurrent LLM check confirms stuck state |
| Concurrent checks slow down LLM | Main loop blocked | Non-blocking checks, optional result waiting |
| ProgressTracker memory leak | Long sessions fail | Periodic cleanup of old heartbeats/state |

---

## Future Enhancements

1. **Adaptive heartbeat intervals**: Faster during execution, slower during reflection
2. **Multi-agent progress tracking**: Track multiple concurrent sessions
3. **ML-based stuck prediction**: Train model to predict stuck vs. slow
4. **User-configurable stuck thresholds**: Per-task sensitivity settings
5. **Visual progress dashboard**: Real-time web UI for monitoring

---

## References

- Current implementation: `frontend/core/agent/autonomous.mjs`
- Health checks: `frontend/server.health.mjs`
- Resilient LLM client: `frontend/core/agent/resilient-llm-client.mjs`
- Test analysis: `AUTONOMOUS_TESTS_ANALYSIS.md`
