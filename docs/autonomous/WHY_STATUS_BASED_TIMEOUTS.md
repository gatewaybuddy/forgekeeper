# Why Status-Based Timeouts for Local LLM Inference

**TL;DR**: Time-based timeouts make sense for cloud APIs ($0.01/token), but are counterproductive for local LLMs (unlimited inference). We should detect **stuck vs. slow** through progress tracking, not arbitrary time limits.

---

## The Problem with Time-Based Timeouts

### Scenario: Cloud API (OpenAI, Anthropic)

```
Cost: $0.01 per 1K tokens
Timeout after 30s: ✅ Good!
- Saves money (kills expensive stuck calls)
- API is fast anyway (<5s typical)
- Failure = pay less
```

### Scenario: Local LLM (llama.cpp, vLLM)

```
Cost: $0.00 per token (one-time GPU purchase)
Timeout after 30s: ❌ Bad!
- Wastes work (kills slow but valid calls)
- LLM can be slow (28s+ is normal on older GPUs)
- Failure = wasted electricity, no result
```

---

## Real Example from Testing

### What Happened

```
[AutonomousAgent] Iteration 1/25
[AutonomousAgent] Reflecting... (started at 00:24:58)
[TaskPlanner] Planning how to: "Create marker file..."
[TaskPlanner] Planning failed after 28417ms: Planning timeout  ❌ FAILED

Agent fell back to broken regex heuristics:
  Expected: write_file("frontend/AUTONOMOUS_DEPLOYMENT_TEST_MARKER.txt", "...")
  Got: write_file("frontend", "TODO: Agent should provide content")  ❌ WRONG
```

### What Should Have Happened

```
[AutonomousAgent] Iteration 1/25
[AutonomousAgent] Reflecting... (started at 00:24:58)
[TaskPlanner] Planning how to: "Create marker file..."
[TaskPlanner] LLM response received after 32 seconds  ✅ SUCCESS
[TaskPlanner] Plan: write_file("frontend/AUTONOMOUS_DEPLOYMENT_TEST_MARKER.txt", "...")
```

**Key Insight**: The LLM was **slow, not stuck**. 28 seconds is valid inference time for:
- Complex reasoning tasks
- Large context windows
- Slower GPUs (RTX 3060 vs. A100)
- CPU inference with LocalAI

---

## Slow vs. Stuck: How to Tell the Difference

### Slow (Keep Going)

```
Iteration 1: get_time() → success (28s)
Iteration 2: write_file() → success (31s)
Iteration 3: git_add() → success (29s)
```

**Indicators**:
- State changes every iteration (tool calls, reflections)
- Each action is different
- Making progress toward goal
- Just takes time per LLM call

**Action**: Keep waiting, agent is working

---

### Stuck (Intervention Needed)

```
Iteration 1: get_time() → success (5s)
Iteration 2: get_time() → success (5s)
Iteration 3: get_time() → success (5s)
Iteration 4: get_time() → success (5s)
```

**Indicators**:
- No state changes (repeating same tool)
- Fast iterations (no progress, quick loops)
- Same action repeatedly
- Not advancing toward goal

**Action**: Stop agent, trigger recovery

---

## Status-Based Detection

### Heartbeat Tracking

```javascript
// Agent is alive if sending heartbeats
progressTracker.heartbeat({ iteration: 5, phase: 'reflection' });
```

**Alive** = Heartbeat within last 2x heartbeat interval (20s if interval=10s)

### State Change Tracking

```javascript
// Agent is making progress if state changes
progressTracker.stateChange({ type: 'tool_call', data: { tool: 'write_file' } });
```

**Progress** = State changes (tool calls, reflections, plan generations)

### Stuck Detection

```javascript
// Stuck = alive but no progress
const stuck = tracker.isStuck();
// True if: 5 heartbeats with 0 state changes
```

**Stuck** = Heartbeats but no state changes over N iterations

---

## Benefits of Status-Based Approach

### 1. Works with Any LLM Speed

| LLM Speed | Time-Based (30s timeout) | Status-Based |
|-----------|--------------------------|--------------|
| Fast (5s/call) | ✅ Works | ✅ Works |
| Medium (15s/call) | ✅ Works | ✅ Works |
| Slow (30s/call) | ❌ Timeout! | ✅ Works |
| Very slow (60s/call) | ❌ Timeout! | ✅ Works |

### 2. Detects Real Problems, Not Slow Inference

| Scenario | Time-Based | Status-Based |
|----------|------------|--------------|
| Slow GPU | ❌ False positive (timeout) | ✅ Detects progress |
| Infinite loop | ❌ Eventually times out | ✅ Detects immediately |
| Network issue | ✅ Detects timeout | ✅ Detects connection error |
| LLM crashed | ✅ Detects timeout | ✅ Detects no heartbeat |

### 3. No Arbitrary Time Limits

```javascript
// Time-based: "You have 30 seconds. Go!"
const timeout = 30000;

// Status-based: "Take as long as you need, just make progress"
const stuckThreshold = 5; // 5 iterations with no change = stuck
```

### 4. Better Observability

**Time-based**: "It timed out" (no idea why)

**Status-based**: Full diagnostics
```json
{
  "alive": true,
  "stuck": false,
  "progress": {
    "heartbeats": 47,
    "stateChanges": 12,
    "lastChange": "tool_call",
    "lastChangeAgo": 3200
  }
}
```

---

## Concurrent Status Checks

### Problem: How do we check if agent is stuck without blocking it?

**Answer**: Run a **parallel LLM call** to analyze the agent's state.

```javascript
// Main loop (keeps running)
const reflection = await agent.reflect(); // Takes 28 seconds

// Meanwhile, in parallel:
statusChecker.startCheck('check-001', {
  recentActions: [...],
  currentTask: '...',
});

// 5 seconds later, get result (non-blocking)
const result = await statusChecker.getLatestResult('check-001', 5000);
// { status: 'A', reason: 'Making progress, just slow' }
```

### Cost Comparison

**Cloud API**:
```
Main call: $0.10 (10K tokens)
Status check: $0.05 (5K tokens)
Total: $0.15 per check
```

**Local LLM**:
```
Main call: $0.00
Status check: $0.00 (same GPU!)
Total: $0.00 per check
```

**Insight**: Concurrent checks are **free** with local inference. Use them liberally!

---

## Real-World Scenarios

### Scenario 1: Slow GPU (RTX 3060)

**Time-based**:
```
Iteration 1: Reflection (28s) → ❌ TIMEOUT
Falls back to broken regex
Agent writes to wrong file
Deployment fails
```

**Status-based**:
```
Iteration 1: Reflection (28s) → ✅ STATE CHANGE (reflection_complete)
Iteration 2: Tool call (31s) → ✅ STATE CHANGE (tool_call)
Iteration 3: Tool call (29s) → ✅ STATE CHANGE (tool_call)
...continues until completion
Deployment succeeds
```

### Scenario 2: Agent Stuck in Loop

**Time-based**:
```
Iteration 1: get_time() (5s) → ✅ Success
Iteration 2: get_time() (5s) → ✅ Success
...
Iteration 6: get_time() (5s) → ❌ TIMEOUT (30s total)
```

**Status-based**:
```
Iteration 1: get_time() (5s) → ✅ STATE CHANGE
Iteration 2: get_time() (5s) → ❌ NO STATE CHANGE
Iteration 3: get_time() (5s) → ❌ NO STATE CHANGE
Iteration 4: get_time() (5s) → ❌ NO STATE CHANGE
Iteration 5: get_time() (5s) → ❌ NO STATE CHANGE

[StatusCheck] Agent stuck in loop - calling same tool repeatedly
→ Trigger recovery immediately (after 5 iterations, not 6)
```

**Status-based detects stuck FASTER** (25s vs. 30s)

### Scenario 3: LLM Backend Restart

**Time-based**:
```
Iteration 5: Reflection → Backend restarting...
Wait 30s → ❌ TIMEOUT
Agent fails, user must restart
```

**Status-based**:
```
Iteration 5: Reflection → Backend restarting...
Health check polling every 5s → 🔄 Waiting...
Backend healthy after 45s → ✅ Resume
Reflection completes (28s) → ✅ STATE CHANGE
Agent continues normally
```

**Status-based is resilient** to backend restarts

---

## Implementation Complexity

### Time-based (Current)

```javascript
// Simple timeout
const result = await Promise.race([
  llmCall(),
  sleep(30000).then(() => { throw new Error('Timeout'); }),
]);
```

**Lines of code**: ~5
**Effectiveness**: ❌ Poor (false positives)

### Status-based (Proposed)

```javascript
// Progress tracking
progressTracker.heartbeat({ iteration });
const result = await llmCall(); // No timeout!
progressTracker.stateChange({ type: 'reflection_complete' });

if (progressTracker.isStuck()) {
  // Concurrent status check
  statusChecker.startCheck('check-001', context);
}
```

**Lines of code**: ~200 (tracker + checker)
**Effectiveness**: ✅ Excellent (detects stuck vs. slow)

**Trade-off**: More code, but much better behavior

---

## Migration Path

### Phase 1: Implement Status-Based (Opt-In)

```bash
# .env
AUTONOMOUS_STATUS_BASED=1  # Enable new system
AUTONOMOUS_FALLBACK_TIMEOUT=300000  # Keep 5min safety timeout
```

### Phase 2: Test Both Systems in Parallel

```javascript
// Run both, log results
const timeBasedResult = await withTimeout(fn, 30000);
const statusBasedResult = await withProgressTracking(fn);

// Compare: which one failed incorrectly?
if (timeBasedResult === 'timeout' && statusBasedResult === 'success') {
  console.log('Time-based false positive detected');
}
```

### Phase 3: Switch Default (Opt-Out)

```bash
# .env
AUTONOMOUS_STATUS_BASED=1  # Default
AUTONOMOUS_LEGACY_TIMEOUT=0  # Disable time-based
```

### Phase 4: Remove Time-Based Code

Once validated, remove old timeout logic entirely.

---

## Frequently Asked Questions

### Q: What if the agent runs forever?

**A**: It won't. Max iterations (25) is still enforced. Status-based only removes **arbitrary time limits**, not **iteration limits**.

```javascript
// This stays:
for (let iteration = 1; iteration <= 25; iteration++) {
  // Agent work
}
// Returns after 25 iterations max
```

### Q: What if stuck detection fails?

**A**: Multiple safety layers:
1. Stuck detection (5 iterations, no state change)
2. Concurrent LLM status check (confirms stuck)
3. User prompt ("Agent appears stuck, continue? y/n")
4. Max iterations failsafe (25 iterations)

### Q: Won't this use more GPU memory?

**A**: No. Concurrent checks are sequential (one at a time on same GPU). We just don't **block** the main loop while checking.

### Q: What about CPU-only inference?

**A**: Works even better! CPUs handle multiple threads well. Status checks run on spare cores.

---

## Conclusion

**Time-based timeouts** = Optimized for **cost** (cloud APIs)
**Status-based completion** = Optimized for **correctness** (local LLMs)

Since we're running **local inference with no API costs**, we should prioritize **correctness over speed**.

**Recommended Action**: Implement status-based timeouts with time-based as optional fallback.

---

## References

- Architecture: `docs/autonomous/STATUS_BASED_TIMEOUT_ARCHITECTURE.md`
- Implementation: `docs/autonomous/STATUS_BASED_TIMEOUT_IMPLEMENTATION_GUIDE.md`
- Test results: `AUTONOMOUS_TESTS_ANALYSIS.md`
- Current timeout behavior: `frontend/core/agent/task-planner.mjs:102`
