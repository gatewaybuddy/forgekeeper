# Status-Based Timeout Implementation Guide

**Date**: 2025-11-03
**Implements**: STATUS_BASED_TIMEOUT_ARCHITECTURE.md
**Estimated Effort**: 5 days

---

## Quick Start

This guide provides step-by-step instructions for implementing the status-based timeout system for the autonomous agent.

---

## Phase 1: Core Infrastructure

### Step 1.1: Create Progress Tracker

**File**: `frontend/core/agent/progress-tracker.mjs`

**Implementation**:
```javascript
/**
 * Progress Tracker - Detect stuck vs. slow based on state changes
 *
 * Usage:
 *   const tracker = new ProgressTracker('session-123');
 *   tracker.heartbeat({ iteration: 1, phase: 'reflection' });
 *   tracker.stateChange({ type: 'tool_call', data: { tool: 'write_file' } });
 *   const stuck = tracker.isStuck(); // false = making progress
 */

export class ProgressTracker {
  constructor(sessionId, config = {}) {
    this.sessionId = sessionId;
    this.heartbeats = [];
    this.stateChanges = [];
    this.startTime = Date.now();

    // Configuration
    this.config = {
      heartbeatInterval: config.heartbeatInterval || 10000, // 10s
      stuckThreshold: config.stuckThreshold || 5, // 5 heartbeats with no change
      maxHeartbeatsInMemory: config.maxHeartbeatsInMemory || 100,
      maxStateChangesInMemory: config.maxStateChangesInMemory || 50,
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

    // Cleanup old heartbeats to prevent memory leak
    if (this.heartbeats.length > this.config.maxHeartbeatsInMemory) {
      this.heartbeats.shift();
    }
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

    // Cleanup old state changes
    if (this.stateChanges.length > this.config.maxStateChangesInMemory) {
      this.stateChanges.shift();
    }
  }

  /**
   * Check if agent is stuck (alive but no progress)
   *
   * Returns true if:
   * - At least N heartbeats recorded
   * - No state changes during the last N heartbeats
   */
  isStuck() {
    if (this.heartbeats.length < this.config.stuckThreshold) {
      return false; // Not enough data yet
    }

    const recentHeartbeats = this.heartbeats.slice(-this.config.stuckThreshold);
    const firstTs = recentHeartbeats[0].ts;
    const lastTs = recentHeartbeats[recentHeartbeats.length - 1].ts;

    // Count state changes during this period
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
    const now = Date.now();
    const lastHeartbeat = this.heartbeats[this.heartbeats.length - 1];
    const lastStateChange = this.stateChanges[this.stateChanges.length - 1];

    const alive = lastHeartbeat && (now - lastHeartbeat.ts) < (this.config.heartbeatInterval * 2);

    return {
      sessionId: this.sessionId,
      alive,
      stuck: this.isStuck(),
      uptime: now - this.startTime,
      progress: {
        heartbeats: this.heartbeats.length,
        stateChanges: this.stateChanges.length,
        lastChange: lastStateChange?.type,
        lastChangeAgo: lastStateChange ? now - lastStateChange.ts : null,
      },
      currentPhase: lastHeartbeat?.phase,
      currentIteration: lastHeartbeat?.iteration,
    };
  }

  /**
   * Reset tracker (for recovery)
   */
  reset() {
    this.heartbeats = [];
    this.stateChanges = [];
  }
}
```

**Test File**: `frontend/core/agent/__tests__/progress-tracker.test.mjs`
```javascript
import { ProgressTracker } from '../progress-tracker.mjs';

// Test: Not stuck when making progress
{
  const tracker = new ProgressTracker('test-1', { stuckThreshold: 3 });

  tracker.heartbeat({ iteration: 1 });
  tracker.stateChange({ type: 'tool_call' });

  tracker.heartbeat({ iteration: 2 });
  tracker.stateChange({ type: 'reflection_complete' });

  tracker.heartbeat({ iteration: 3 });

  console.assert(!tracker.isStuck(), 'Should not be stuck when state changes');
  console.log('✓ Progress tracker: not stuck test passed');
}

// Test: Stuck when no state changes
{
  const tracker = new ProgressTracker('test-2', { stuckThreshold: 3 });

  tracker.heartbeat({ iteration: 1 });
  tracker.heartbeat({ iteration: 2 });
  tracker.heartbeat({ iteration: 3 });
  // No state changes!

  console.assert(tracker.isStuck(), 'Should be stuck when no state changes');
  console.log('✓ Progress tracker: stuck detection test passed');
}

// Test: Status reporting
{
  const tracker = new ProgressTracker('test-3');

  tracker.heartbeat({ iteration: 1, phase: 'reflection' });
  tracker.stateChange({ type: 'tool_call', data: { tool: 'write_file' } });

  const status = tracker.getStatus();
  console.assert(status.alive === true, 'Should be alive');
  console.assert(status.progress.heartbeats === 1, 'Should have 1 heartbeat');
  console.assert(status.progress.stateChanges === 1, 'Should have 1 state change');
  console.log('✓ Progress tracker: status reporting test passed');
}

console.log('All progress tracker tests passed!');
```

---

### Step 1.2: Create Concurrent Status Checker

**File**: `frontend/core/agent/concurrent-status-checker.mjs`

**Implementation**:
```javascript
/**
 * Concurrent Status Checker
 *
 * Runs parallel LLM inference calls to check if agent is stuck/slow/blocked
 * without blocking the main autonomous loop.
 *
 * Usage:
 *   const checker = new ConcurrentStatusChecker(llmClient, 'core');
 *   checker.startCheck('check-001', { iteration: 5, recentActions: [...] });
 *   const result = await checker.getLatestResult('check-001', 5000);
 */

export class ConcurrentStatusChecker {
  constructor(llmClient, model, config = {}) {
    this.llmClient = llmClient;
    this.model = model;
    this.runningChecks = new Map();
    this.completedChecks = new Map();

    this.config = {
      maxConcurrentChecks: config.maxConcurrentChecks || 3,
      resultRetentionTime: config.resultRetentionTime || 60000, // 1 minute
    };
  }

  /**
   * Start a background status check (non-blocking)
   *
   * @param {string} checkId - Unique identifier for this check
   * @param {object} context - Agent context to analyze
   */
  startCheck(checkId, context) {
    // Limit concurrent checks
    if (this.runningChecks.size >= this.config.maxConcurrentChecks) {
      console.warn(`[ConcurrentStatusChecker] Max concurrent checks (${this.config.maxConcurrentChecks}) reached, skipping check ${checkId}`);
      return false;
    }

    const checkPromise = this._runStatusCheck(context);
    this.runningChecks.set(checkId, checkPromise);

    // Handle completion in background
    checkPromise
      .then(result => {
        console.log(`[StatusCheck:${checkId}] ${result.status} - ${result.reason}`);
        this.completedChecks.set(checkId, result);

        // Cleanup after retention time
        setTimeout(() => {
          this.completedChecks.delete(checkId);
        }, this.config.resultRetentionTime);
      })
      .catch(error => {
        console.warn(`[StatusCheck:${checkId}] Failed: ${error.message}`);
      })
      .finally(() => {
        this.runningChecks.delete(checkId);
      });

    return true;
  }

  /**
   * Run LLM inference to analyze agent status
   */
  async _runStatusCheck(context) {
    const prompt = `You are monitoring an autonomous agent's progress.

**Agent Context**:
- Session ID: ${context.sessionId || 'unknown'}
- Current Iteration: ${context.iteration || 'unknown'}
- Current Task: ${context.currentTask || 'unknown'}

**Recent Actions** (last 3):
${JSON.stringify(context.recentActions || [], null, 2)}

**Recent Tool Results**:
${JSON.stringify(context.recentResults || [], null, 2)}

**Question**: Is this agent:
A) Making progress (slow but working correctly)
B) Stuck in a loop (repeating same actions without progress)
C) Blocked (waiting for external resource or condition)
D) Failed (error condition that requires intervention)

Respond with ONLY one letter (A/B/C/D) followed by a brief 1-sentence reason.

Example: "A - Agent is writing files and making commits, just slow due to LLM inference time."`;

    try {
      const response = await this.llmClient.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.0,
      });

      const content = response.choices[0].message.content.trim();
      const status = content[0]; // A, B, C, or D
      const reason = content.slice(2).trim();

      return {
        status,
        reason,
        ts: Date.now(),
        context: context.sessionId,
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Get latest status check result
   *
   * @param {string} checkId - Check identifier
   * @param {number} waitMs - Max time to wait for result (0 = don't wait)
   * @returns {object|null} Result or null if not ready
   */
  async getLatestResult(checkId, waitMs = 0) {
    // Check if already completed
    const completed = this.completedChecks.get(checkId);
    if (completed) return completed;

    // Check if still running
    const running = this.runningChecks.get(checkId);
    if (!running) return null; // Not found

    if (waitMs === 0) {
      return null; // Don't wait, return null
    }

    // Wait up to waitMs for result
    try {
      return await Promise.race([
        running,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Wait timeout')), waitMs)
        ),
      ]);
    } catch {
      return null; // Still running after timeout
    }
  }

  /**
   * Check if a specific check is running
   */
  isRunning(checkId) {
    return this.runningChecks.has(checkId);
  }

  /**
   * Get count of running checks
   */
  getRunningCount() {
    return this.runningChecks.size;
  }
}
```

---

## Phase 2: Agent Integration

### Step 2.1: Integrate into Autonomous Agent

**File**: `frontend/core/agent/autonomous.mjs`

**Changes**:
```javascript
// Add imports
import { ProgressTracker } from './progress-tracker.mjs';
import { ConcurrentStatusChecker } from './concurrent-status-checker.mjs';

export function createAutonomousAgent(config) {
  // ... existing code ...

  // Initialize progress tracking
  const progressTracker = new ProgressTracker(sessionId, {
    heartbeatInterval: config.heartbeatInterval || 10000,
    stuckThreshold: config.stuckThreshold || 5,
  });

  const statusChecker = new ConcurrentStatusChecker(llmClient, model, {
    maxConcurrentChecks: config.maxConcurrentChecks || 3,
  });

  async function run() {
    try {
      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        // HEARTBEAT: Agent is alive
        progressTracker.heartbeat({ iteration, phase: 'reflection' });

        // Reflection phase
        const reflection = await reflect();

        // STATE CHANGE: Reflection completed
        progressTracker.stateChange({
          type: 'reflection_complete',
          data: {
            assessment: reflection.assessment,
            progress: reflection.progress,
            confidence: reflection.confidence,
          },
        });

        // Check for stuck condition (every 5 iterations)
        if (iteration % 5 === 0) {
          const status = progressTracker.getStatus();

          if (status.stuck) {
            console.warn(`[Autonomous] Stuck detected at iteration ${iteration}`);

            // Start concurrent status check (non-blocking)
            statusChecker.startCheck(`iter-${iteration}`, {
              sessionId,
              iteration,
              currentTask: task,
              recentActions: memory.slice(-3),
              recentResults: memory.slice(-3).map(m => m.result),
            });

            // Optionally wait briefly for result
            const statusResult = await statusChecker.getLatestResult(
              `iter-${iteration}`,
              5000 // Wait max 5s
            );

            if (statusResult?.status === 'B') {
              console.error(`[Autonomous] Confirmed stuck: ${statusResult.reason}`);
              // Trigger recovery or ask user
              return {
                status: 'stuck',
                reason: statusResult.reason,
                iteration,
              };
            }
          }
        }

        // Check completion
        if (reflection.assessment === 'task_complete') {
          return {
            status: 'completed',
            iterations: iteration,
            confidence: reflection.confidence,
          };
        }

        // Execution phase
        progressTracker.heartbeat({ iteration, phase: 'execution' });

        const toolResult = await executeAction(reflection.next_action);

        // STATE CHANGE: Tool executed
        progressTracker.stateChange({
          type: 'tool_call',
          data: {
            tool: toolResult.tool,
            status: toolResult.status,
          },
        });

        // Continue loop
      }

      // Reached max iterations
      return {
        status: 'incomplete',
        reason: 'max_iterations_reached',
        iterations: maxIterations,
      };

    } finally {
      // Always emit session end event
      contextLogEvents.emit('autonomous_session_end', {
        sessionId,
        status: 'completed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    run,
    getProgress: () => progressTracker.getStatus(),
    checkStatus: (checkId) => statusChecker.getLatestResult(checkId),
  };
}
```

---

## Phase 3: Task Planner Refactor

### Step 3.1: Remove Timeout from Task Planner

**File**: `frontend/core/agent/task-planner.mjs`

**Changes**:
```javascript
async plan(planId, taskAction, context) {
  console.log(`[TaskPlanner] ${planId}: Planning how to: "${taskAction}"`);

  try {
    // NO TIMEOUT! Just call LLM and wait
    const result = await this._callLLM(planId, taskAction, context);

    return {
      steps: result.steps,
      confidence: result.confidence || 0.8,
      source: 'llm',
    };

  } catch (error) {
    console.error(`[TaskPlanner] ${planId}: Planning failed:`, error.message);

    // Only use fallback for connection errors, not timeouts
    if (this._isConnectionError(error)) {
      console.log(`[TaskPlanner] ${planId}: Using simplified LLM plan (connection issue)`);
      return await this._generateSimplifiedPlan(taskAction, context);
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Generate a simplified plan using LLM (not regex!)
 */
async _generateSimplifiedPlan(taskAction, context) {
  const prompt = `Generate a SIMPLE 1-step plan for: "${taskAction}"

Respond with JSON:
{
  "tool": "tool_name",
  "args": { "arg1": "value1" },
  "description": "what this does"
}`;

  try {
    const response = await this.llmClient.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.0,
    });

    const plan = JSON.parse(response.choices[0].message.content);

    return {
      steps: [{
        step_number: 1,
        tool: plan.tool,
        args: plan.args,
        description: plan.description,
        confidence: 0.6, // Lower confidence for simplified plan
      }],
      confidence: 0.6,
      source: 'llm_simplified',
    };
  } catch {
    // Last resort: echo tool (safe default)
    return {
      steps: [{
        step_number: 1,
        tool: 'echo',
        args: { message: `Unable to plan: ${taskAction}` },
        description: 'Fallback plan - report planning failure',
        confidence: 0.3,
      }],
      confidence: 0.3,
      source: 'fallback',
    };
  }
}

_isConnectionError(error) {
  const code = String(error.code || '').toUpperCase();
  const message = String(error.message || '').toLowerCase();

  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    message.includes('fetch failed') ||
    message.includes('network')
  );
}
```

---

## Phase 4: Test Updates

### Step 4.1: Update Deployment Test

**File**: `tests/autonomous/test-autonomous-deployment.mjs`

**Changes**:
```javascript
// Remove timeout constant
// const DEPLOYMENT_TIMEOUT = 3 * 60 * 1000; // DELETE THIS

async function waitForDeployment(sessionId) {
  console.log(chalk.cyan('Waiting for agent to complete deployment...'));

  let checkCount = 0;
  let lastIteration = 0;
  let stuckCount = 0;

  while (true) {
    checkCount++;

    const status = await fetch(`http://localhost:3000/api/chat/autonomous/status?sessionId=${sessionId}`)
      .then(r => r.json());

    // Check explicit completion
    if (status.status === 'completed') {
      console.log(chalk.green(`✓ Deployment completed after ${checkCount} status checks`));
      return { success: true, status };
    }

    // Check explicit failure
    if (status.status === 'failed' || status.status === 'stuck') {
      console.log(chalk.red(`✗ Deployment ${status.status}: ${status.error || status.reason}`));
      return { success: false, status };
    }

    // Stuck detection: no iteration progress for 10 checks
    if (status.iteration === lastIteration) {
      stuckCount++;
      if (stuckCount >= 10) {
        console.warn(chalk.yellow(`⚠ Agent appears stuck at iteration ${status.iteration} (${stuckCount} checks with no progress)`));

        // Ask user
        const answer = await promptUser('Agent appears stuck. Continue waiting? (y/n): ');
        if (answer.toLowerCase() !== 'y') {
          return { success: false, reason: 'user_cancelled_stuck' };
        }

        stuckCount = 0; // Reset
      }
    } else {
      stuckCount = 0; // Reset on progress
      lastIteration = status.iteration;
    }

    // Log progress every 10 checks
    if (checkCount % 10 === 0) {
      console.log(chalk.yellow(`  Agent working... (iteration ${status.iteration}, ${checkCount} checks, ${Math.floor(checkCount * 10 / 60)}min elapsed)`));
    }

    // Wait 10 seconds before next check
    await sleep(10000);
  }
}

function promptUser(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}
```

---

## Phase 5: Monitoring Endpoints

### Step 5.1: Add Progress Endpoint

**File**: `frontend/server.mjs`

**Add endpoint**:
```javascript
// GET /api/autonomous/progress/:sessionId
app.get('/api/autonomous/progress/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Get progress from running session
  const session = runningSessionsMap.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const progress = session.agent.getProgress();

  res.json(progress);
});

// POST /api/autonomous/check-status
app.post('/api/autonomous/check-status', async (req, res) => {
  const { sessionId, checkId } = req.body;

  const session = runningSessionsMap.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Start concurrent check (non-blocking)
  const started = session.agent.startStatusCheck(checkId, {
    sessionId,
    iteration: session.currentIteration,
    currentTask: session.task,
  });

  if (!started) {
    return res.status(429).json({ error: 'Max concurrent checks reached' });
  }

  res.json({ checkId, status: 'started' });
});

// GET /api/autonomous/check-status/:checkId
app.get('/api/autonomous/check-status/:checkId', async (req, res) => {
  const { checkId } = req.params;
  const { sessionId } = req.query;

  const session = runningSessionsMap.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const result = await session.agent.checkStatus(checkId);

  if (!result) {
    return res.json({ status: 'pending' });
  }

  res.json({ status: 'completed', result });
});
```

---

## Testing Checklist

### Unit Tests
- [ ] ProgressTracker: heartbeat recording
- [ ] ProgressTracker: state change tracking
- [ ] ProgressTracker: stuck detection (5 heartbeats, 0 state changes)
- [ ] ProgressTracker: not stuck when making progress
- [ ] ConcurrentStatusChecker: start check (non-blocking)
- [ ] ConcurrentStatusChecker: get result (completed)
- [ ] ConcurrentStatusChecker: get result (still running)
- [ ] ConcurrentStatusChecker: max concurrent limit

### Integration Tests
- [ ] Autonomous agent with slow LLM (30s+ reflections)
- [ ] Agent stuck in loop (repeat same action)
- [ ] Agent with intermittent backend failures
- [ ] Status check runs concurrently without blocking main loop
- [ ] Progress endpoint returns correct status

### Manual Tests
- [ ] Run deployment test without timeout
- [ ] Agent completes after 5+ minutes (slow LLM)
- [ ] User can cancel stuck agent
- [ ] ContextLog shows all heartbeats and state changes

---

## Deployment

### Environment Variables

Add to `.env`:
```bash
# Status-based timeout configuration
AUTONOMOUS_STATUS_BASED=1
AUTONOMOUS_HEARTBEAT_INTERVAL=10000
AUTONOMOUS_STUCK_THRESHOLD=5
AUTONOMOUS_MAX_CONCURRENT_CHECKS=3
```

### Backwards Compatibility

Keep existing time-based timeouts as fallback:
```javascript
const useStatusBased = process.env.AUTONOMOUS_STATUS_BASED === '1';

if (useStatusBased) {
  // Use new status-based system
} else {
  // Use old time-based timeouts
}
```

---

## Success Criteria

1. **Agent completes with slow LLM** (28+ second reflections)
2. **Stuck detection works** (detects loops, not slow inference)
3. **No premature timeouts** (agent works as long as making progress)
4. **Memory stable** (no leaks in long sessions)
5. **Tests pass** (all autonomous tests complete)

---

## Rollback Plan

If status-based system causes issues:
1. Set `AUTONOMOUS_STATUS_BASED=0`
2. Falls back to time-based timeouts
3. No code changes needed

---

## Next Steps

After implementation:
1. Monitor ContextLog for heartbeat/state change patterns
2. Tune stuck detection threshold based on real data
3. Add ML-based stuck prediction (future enhancement)
4. Build visual dashboard for progress monitoring
