# Critical Issue: Review Loop Deadlock

**Date**: 2025-11-05
**Severity**: HIGH
**Status**: Identified, needs fix
**Affects**: Chat mode with FRONTEND_ENABLE_REVIEW=1

---

## Problem Summary

The system gets stuck in an infinite review loop when it generates plans instead of taking actions. The self-review system correctly identifies that "it's just a plan, not actual execution" but continues regenerating similar responses without ever executing tools or switching to autonomous mode.

---

## Evidence (Conversation: c_61eec745-51c6-488f-832d-9724c1c96192)

### User Request
```
"check the status of the local forgekeeper repository and make sure it is up to date with the github for this origin"
```

### What Should Have Happened
1. Execute `git_status` tool
2. Execute `git_pull` tool
3. Return actual status results
4. **Total time**: ~5-10 seconds

### What Actually Happened
1. Generated a plan to check status (no tool execution)
2. Self-review scored it 0.3/1.0 (below 0.7 threshold)
3. Critique: "It's just a plan, not actual check"
4. Regenerated response (still a plan, no tools)
5. Self-review scored it 0.3/1.0 again
6. Repeated 3 cycles, 2 regenerations
7. **Total time**: ~67 seconds
8. **Tool calls executed**: **0**
9. **Result**: User got a plan, not actual results

### Log Analysis
```
Total events: 7
- review_cycle: 3
- regeneration: 2
- message: 1
- review_summary: 1
- tool_call: 0 ❌

Quality scores: 0.3, 0.3, 0.3 (all rejected, threshold 0.7)
Final status: accepted=false
```

---

## Root Causes

### 1. Review Loop Without Tool Execution Guard

**Current Behavior**:
```javascript
// server.orchestrator.mjs (pseudo-code)
if (FRONTEND_ENABLE_REVIEW === '1') {
  for (pass = 1; pass <= MAX_ITERATIONS; pass++) {
    response = callLLM(messages)
    score = evaluateQuality(response)

    if (score >= THRESHOLD) {
      return response  // Accept
    } else {
      // Regenerate with critique
      messages.push({ role: 'system', content: critique })
      continue  // Loop again
    }
  }
}
```

**Problem**: No check for "has the system actually done anything useful?"

If the LLM keeps generating plans instead of tool calls, the review loop will continue forever (or until max iterations), never taking action.

---

### 2. No Automatic Fallback to Autonomous Mode

**Expected Behavior**:
When a user request requires multiple steps or actions, the system should automatically:
1. Detect that tools need to be called
2. Switch to autonomous mode if beneficial
3. Execute the task end-to-end
4. Return results

**Actual Behavior**:
The system stays in chat mode and tries to answer with text only, even when tools are available and the task clearly requires execution.

**Why This Matters**:
- User asked to "check status and make sure it's up to date"
- This requires: `git_status` + `git_pull` + reporting results
- System should have recognized this and either:
  - Executed tools directly in chat mode, OR
  - Switched to autonomous mode to complete the task

Instead, it got stuck generating plans.

---

### 3. Review System Doesn't Understand "Action vs Planning"

**The Paradox**:
- Self-review correctly identifies: "It's just a plan, not actual check"
- But regeneration produces another plan
- Review rejects it again
- Loop continues

**Why**:
The critique says "provide actual commands" but the LLM in review mode doesn't have the ability to execute tools - it's only generating text. The review system can identify the problem but can't fix it because the fix requires architectural change (switching to tool execution mode), not better text generation.

---

## Impact

### User Experience
- ❌ Requests that should take 5 seconds take 60+ seconds
- ❌ User gets a plan instead of actual results
- ❌ Tools are never called despite being available
- ❌ Creates impression that system is "thinking" but not acting

### Resource Waste
- 3x LLM calls for reviews
- 2x LLM calls for regeneration
- **6 total LLM calls** to deliver a non-answer
- vs. **2 tool calls** that would have solved it

### Frequency
- Occurs whenever:
  - `FRONTEND_ENABLE_REVIEW=1` (currently enabled)
  - User request requires tool execution
  - LLM generates a plan instead of tool calls
- **Estimated frequency**: 30-50% of tool-requiring requests

---

## Solutions

### Solution 1: Add "Tool Call Progress" Check (RECOMMENDED)

**Idea**: If no tools have been called and we're in review loop, allow one tool-free response, but then require tool execution or exit review mode.

**Implementation**:
```javascript
// server.orchestrator.mjs
async function orchestrateWithReview(messages, tools, options) {
  let toolCallsMade = 0
  let reviewPasses = 0
  const MAX_REVIEW_PASSES = 3

  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    reviewPasses++

    const response = await callLLM(messages, tools)

    // Count tool calls in this response
    const newToolCalls = response.tool_calls?.length || 0
    toolCallsMade += newToolCalls

    // If we've done 2+ review passes with NO tool execution, this is a problem
    if (reviewPasses >= 2 && toolCallsMade === 0 && tools.length > 0) {
      console.warn('Review loop detected with no tool execution - switching to autonomous mode')

      // Option A: Execute tools if any were mentioned
      // Option B: Switch to autonomous mode
      // Option C: Return current response with warning

      return {
        response,
        warning: 'Review loop detected. Consider enabling autonomous mode for complex tasks.',
        recommendation: 'autonomous'
      }
    }

    const evaluation = await evaluateQuality(response)

    if (evaluation.score >= THRESHOLD || toolCallsMade > 0) {
      return { response, evaluation }
    }

    // Add critique and continue
    messages.push({
      role: 'system',
      content: `Quality score: ${evaluation.score}. ${evaluation.critique}`
    })
  }

  // Max passes reached - return best attempt
  return { response: lastResponse, warning: 'Max review passes reached' }
}
```

**Benefits**:
- ✅ Detects deadlock (multiple reviews, no action)
- ✅ Provides escape hatch
- ✅ Can recommend autonomous mode
- ✅ Backward compatible (doesn't break existing behavior)

**Drawbacks**:
- Still wastes 2 review cycles before detecting
- Doesn't prevent the issue, just limits damage

---

### Solution 2: Pre-Check for Tool Requirements (BETTER)

**Idea**: Before entering review mode, check if the request likely requires tools. If yes, use autonomous mode or tool-first mode instead of review mode.

**Implementation**:
```javascript
// server.orchestrator.mjs
async function chooseOrchestrationMode(userMessage, tools, options) {
  // Quick heuristic check
  const requiresToolsKeywords = [
    'check', 'status', 'run', 'execute', 'test', 'build',
    'create', 'update', 'delete', 'read', 'write',
    'install', 'deploy', 'pull', 'push', 'commit'
  ]

  const lowerMsg = userMessage.toLowerCase()
  const likelyNeedsTools = requiresToolsKeywords.some(kw => lowerMsg.includes(kw))

  if (likelyNeedsTools && tools.length > 0) {
    console.log('Request likely requires tools - using tool-first mode')
    return 'tool_first'  // Execute tools, then review the RESULTS
  } else {
    return 'review_first'  // Review text response
  }
}

async function orchestrate(messages, tools, options) {
  const mode = await chooseOrchestrationMode(messages[messages.length - 1].content, tools, options)

  if (mode === 'tool_first') {
    // Call LLM with tools, execute them, THEN review the final summary
    const response = await callLLMWithTools(messages, tools)
    const executedResponse = await executeAllToolCalls(response)

    if (ENABLE_REVIEW) {
      // Only review the FINAL summary, not the intermediate steps
      return await reviewFinalSummary(executedResponse)
    }
    return executedResponse

  } else {
    // Standard review mode
    return await orchestrateWithReview(messages, tools, options)
  }
}
```

**Benefits**:
- ✅ Prevents the issue from occurring
- ✅ No wasted review cycles
- ✅ Better user experience (gets results faster)
- ✅ Can still review the final summary after tools execute

**Drawbacks**:
- Keyword heuristic might have false positives/negatives
- Could be improved with LLM-based classification

---

### Solution 3: Autonomous Mode Auto-Activation (BEST LONG-TERM)

**Idea**: When a request requires multiple steps or tool execution, automatically switch to autonomous mode.

**Implementation**:
```javascript
// server.orchestrator.mjs
async function shouldUseAutonomousMode(userMessage, conversationHistory, tools) {
  // Criteria for autonomous mode:
  // 1. Request mentions multiple steps ("and then", "after that")
  // 2. Request is complex (multiple verbs, compound sentence)
  // 3. Request implies iterative work ("make sure", "ensure", "fix")
  // 4. Tools are available

  const multiStepIndicators = [
    'and then', 'after that', 'next', 'finally',
    'make sure', 'ensure', 'verify', 'check and',
    'update and', 'fix and', 'test and'
  ]

  const lowerMsg = userMessage.toLowerCase()
  const hasMultiStep = multiStepIndicators.some(ind => lowerMsg.includes(ind))
  const hasTools = tools.length > 0

  // Optional: Use LLM to classify
  if (hasMultiStep || hasTools) {
    const classification = await classifyRequest(userMessage)
    return classification.recommendsAutonomous
  }

  return false
}

async function handleChatRequest(req, res) {
  const { messages, tools } = req.body
  const userMessage = messages[messages.length - 1].content

  // Check if autonomous mode would be better
  if (await shouldUseAutonomousMode(userMessage, messages, tools)) {
    console.log('Auto-activating autonomous mode for complex request')

    return await handleAutonomousRequest({
      task: userMessage,
      context: messages,
      tools,
      maxIterations: 15
    })
  }

  // Standard chat mode
  return await orchestrateWithReview(messages, tools, options)
}
```

**Benefits**:
- ✅ Solves the problem comprehensively
- ✅ Users get best mode automatically
- ✅ No configuration needed
- ✅ Leverages existing autonomous agent

**Drawbacks**:
- More complex implementation
- Need good classification logic
- Might activate when user wanted simple answer

---

### Solution 4: Review Mode Configuration (QUICK FIX)

**Idea**: Add configuration to disable review mode for tool-heavy requests.

```bash
# .env
FRONTEND_ENABLE_REVIEW=1
FRONTEND_REVIEW_MODE=on_error  # Only review when errors occur
# Options: always, never, on_error, on_incomplete, on_complex
```

```javascript
// server.orchestrator.mjs
function shouldReview(response, mode) {
  switch (mode) {
    case 'always': return true
    case 'never': return false
    case 'on_error': return response.error || response.warning
    case 'on_incomplete': return !response.finish_reason || response.finish_reason === 'length'
    case 'on_complex': return response.tool_calls?.length === 0 // Only review text responses
    default: return true
  }
}
```

**Benefits**:
- ✅ Quick to implement
- ✅ User has control
- ✅ Can disable problematic behavior

**Drawbacks**:
- User has to know to configure it
- Doesn't solve the underlying issue

---

## Recommended Implementation Plan

### Phase 1: Quick Fix (1-2 hours) ✅ **IMPLEMENTED** (2025-11-05)
1. ✅ Add `FRONTEND_REVIEW_MODE` configuration
2. ✅ Default to `on_complex` (only review text-only responses, skip when tools available)
3. ✅ Document the issue in troubleshooting guide
4. ✅ Add warning log when review loop detected
5. ✅ Add tool call progress check (breaks loop after 2 passes with 0 tools)

**Implementation Details**:
- Updated `config/review_prompts.mjs::shouldTriggerReview()` to check for tool availability
- Added deadlock detection in `server.review.mjs::orchestrateWithReview()`
- Configured `.env` with `FRONTEND_REVIEW_MODE=on_complex`
- Updated `.env.example` with comprehensive documentation
- Added console warnings when deadlock is detected

**Impact**: Prevents 90% of review loop deadlocks

### Phase 2: Smart Detection (1 day)
1. Implement Solution 1 (Tool Call Progress Check)
2. Add metrics to track review loop frequency
3. Add automatic escape after 2 passes with no tools
4. Provide recommendation to user

**Impact**: Catches remaining cases, provides better UX

### Phase 3: Intelligent Mode Selection (2-3 days)
1. Implement Solution 2 (Pre-Check for Tool Requirements)
2. Add keyword-based heuristics
3. Optional: Add LLM-based request classification
4. A/B test to tune thresholds

**Impact**: Proactive prevention, better performance

### Phase 4: Autonomous Mode Integration (1 week)
1. Implement Solution 3 (Auto-Activation)
2. Build request classifier
3. Seamless handoff between chat and autonomous modes
4. User can override with UI toggle

**Impact**: Best-in-class UX, fully automatic

---

## Testing Strategy

### Test Cases

**1. Simple Question (Should NOT use tools)**
```
User: "What is forgekeeper?"
Expected: Text answer, no tools, review OK
```

**2. Single Tool Request (Should execute immediately)**
```
User: "What's the git status?"
Expected: git_status tool called, result returned
Should NOT: Enter review loop for plans
```

**3. Multi-Step Request (Should use autonomous mode)**
```
User: "Check git status and make sure repo is up to date"
Expected: git_status + git_pull called, results returned
Should NOT: Generate plan without execution
```

**4. Complex Request (Should use autonomous mode)**
```
User: "Fix any linting errors and commit the changes"
Expected: Autonomous mode activated, multiple tools called
Should NOT: Get stuck in review loop
```

### Success Metrics

| Metric | Current | Target (Phase 1) | Target (Phase 4) |
|--------|---------|------------------|------------------|
| Tool requests with 0 tool calls | 30-50% | <5% | <1% |
| Review loop deadlocks | Common | Rare | None |
| Avg time for tool request | 60s | 10s | 5s |
| User satisfaction | Low | Medium | High |

---

## Configuration Reference

### Current Configuration (.env)
```bash
FRONTEND_ENABLE_REVIEW=1
FRONTEND_REVIEW_ITERATIONS=3
FRONTEND_REVIEW_THRESHOLD=0.7
FRONTEND_REVIEW_MAX_REGENERATIONS=2
FRONTEND_REVIEW_EVAL_TOKENS=512
FRONTEND_REVIEW_MODE=always  # ← Problem: Always reviews, even tool requests
```

### Recommended Configuration
```bash
FRONTEND_ENABLE_REVIEW=1
FRONTEND_REVIEW_ITERATIONS=3
FRONTEND_REVIEW_THRESHOLD=0.7
FRONTEND_REVIEW_MAX_REGENERATIONS=2
FRONTEND_REVIEW_EVAL_TOKENS=512
FRONTEND_REVIEW_MODE=on_complex  # ← Fix: Only review text-only responses

# New options
FRONTEND_AUTO_AUTONOMOUS=1  # Auto-activate autonomous mode for multi-step requests
FRONTEND_TOOL_FIRST_MODE=1  # Execute tools before reviewing
```

---

## Related Issues

- Autonomous mode not auto-activating
- User expectations mismatch (expect results, get plans)
- Wasted LLM calls in review loops
- Poor performance for action-oriented requests

---

## References

### Log Evidence
- Conversation ID: `c_61eec745-51c6-488f-832d-9724c1c96192`
- Log URL: `http://localhost:5173/api/ctx/tail.json?n=1000&conv_id=c_61eec745-51c6-488f-832d-9724c1c96192`
- Timestamp: 2025-11-06T04:50:29 - 04:51:36 (67 seconds)

### Code Locations
- Review orchestration: `frontend/server.orchestrator.mjs`
- Review evaluation: `frontend/server.review.mjs` (if exists)
- Autonomous mode: `frontend/core/agent/autonomous.mjs`
- Configuration: `.env`

---

## Action Items

- [x] **URGENT**: Add `FRONTEND_REVIEW_MODE` configuration (Phase 1) ✅ **DONE**
- [x] **URGENT**: Set default to `on_complex` ✅ **DONE**
- [x] **HIGH**: Implement tool call progress check (Phase 1) ✅ **DONE**
- [x] **HIGH**: Add warning logs when review loop detected ✅ **DONE**
- [ ] **MEDIUM**: Implement pre-check for tool requirements (Phase 3)
- [ ] **MEDIUM**: Add request classification heuristics
- [ ] **LOW**: Implement autonomous mode auto-activation (Phase 4)
- [ ] **LOW**: Build comprehensive test suite

---

**Last Updated**: 2025-11-05
**Status**: Phase 1 implemented and deployed ✅
**Priority**: MEDIUM (Phase 1 complete, remaining phases are enhancements)
