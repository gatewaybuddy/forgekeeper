# Continuous Self-Terminating Mode Design

**Status:** 🔄 Design Phase
**Date:** 2025-11-03
**Context:** Strategic design for autonomous mode that can handle long-running goals while safely self-terminating when objectives are met

---

## Executive Summary

Continuous self-terminating mode enables Forgekeeper to pursue complex, long-duration goals autonomously while intelligently deciding when to stop. Unlike fixed iteration limits (e.g., 50 iterations), this mode uses **metacognitive reflection** to evaluate progress, detect completion, and terminate gracefully.

**Key Innovation**: Self-awareness of goal completion through periodic reflection rather than arbitrary iteration caps.

---

## Problem Statement

Current autonomous mode limitations:
1. **Arbitrary iteration limits** (50 iterations) - stops mid-task or wastes cycles
2. **No goal awareness** - can't tell when task is truly complete
3. **Ambiguous goals** - unclear termination criteria (e.g., "learn how to run a business")
4. **Risk of runaway** - could loop indefinitely on vague goals
5. **No progress assessment** - can't differentiate between stuck vs. making progress

---

## Design Principles

1. **Goal-Oriented Termination** - Stop when objective is met, not when counter hits N
2. **Safety First** - Multiple guardrails prevent runaway execution
3. **Metacognitive Reflection** - Self-assess progress every N iterations
4. **Explicit Milestones** - Break ambiguous goals into concrete checkpoints
5. **Graceful Degradation** - Fall back to fixed limits if reflection fails
6. **User Override** - Always allow manual intervention

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Continuous Autonomous Loop                 │
├─────────────────────────────────────────────────────────────┤
│  1. Goal Parser                                              │
│     ├─ Extract success criteria                             │
│     ├─ Identify ambiguous terms                             │
│     └─ Generate measurable milestones                       │
│                                                              │
│  2. Iteration Loop                                           │
│     ├─ Execute autonomous iteration                         │
│     ├─ Log outcomes to ContextLog                           │
│     └─ Update progress tracker                              │
│                                                              │
│  3. Metacognitive Reflector (every 10 iterations)           │
│     ├─ LLM-powered self-assessment                          │
│     ├─ Goal completion check                                │
│     ├─ Progress velocity analysis                           │
│     ├─ Stuck detection                                      │
│     └─ Termination recommendation                           │
│                                                              │
│  4. Safety Guardrails                                        │
│     ├─ Wall-clock timeout (default: 2 hours)                │
│     ├─ Max iterations cap (default: 200)                    │
│     ├─ Cost limit (token count)                             │
│     ├─ Error threshold (5 consecutive failures)             │
│     └─ User interrupt signal                                │
│                                                              │
│  5. Termination Decision                                     │
│     ├─ Goal achieved → graceful stop                        │
│     ├─ Stuck/no progress → request guidance                 │
│     ├─ Safety limit hit → forced stop + report              │
│     └─ User interrupt → immediate stop + checkpoint         │
└─────────────────────────────────────────────────────────────┘
```

---

## Metacognitive Reflection System

### Reflection Trigger
- **Frequency**: Every 10 iterations (configurable via `AUTONOMOUS_REFLECTION_INTERVAL`)
- **Context**: Last 10 iterations from ContextLog + original goal
- **Model**: Use default LLM with analysis preset (temperature=0.7, top_p=0.6)

### Reflection Prompt Structure

```javascript
const reflectionPrompt = `
You are evaluating your own progress on a goal. Analyze objectively.

**Original Goal**: ${goal}

**Success Criteria**: ${criteria}

**Last 10 Iterations Summary**:
${iterations.map(i => `- Iteration ${i.num}: ${i.tool} → ${i.outcome}`).join('\n')}

**Current State**:
- Total iterations: ${totalIterations}
- Time elapsed: ${timeElapsed}
- Tools used: ${toolsUsed}
- Successes: ${successes} | Failures: ${failures}

**Analysis Questions**:
1. Is the goal achieved? (YES/NO/PARTIAL)
2. Are we making progress? (GOOD/SLOW/STUCK)
3. What percentage complete? (0-100%)
4. Are we stuck in a loop? (YES/NO)
5. Should we continue? (CONTINUE/STOP/ASK_USER)

**Output Format** (JSON):
{
  "goalAchieved": "YES|NO|PARTIAL",
  "progress": "GOOD|SLOW|STUCK",
  "percentComplete": 0-100,
  "loopDetected": true|false,
  "recommendation": "CONTINUE|STOP|ASK_USER",
  "reasoning": "Brief explanation",
  "nextSteps": ["concrete action 1", "concrete action 2"]
}

Provide your assessment:
`;
```

### Reflection Evaluation

```javascript
function evaluateReflection(reflection, context) {
  const { goalAchieved, progress, percentComplete, loopDetected, recommendation } = reflection;

  // Decision matrix
  if (goalAchieved === 'YES') {
    return { action: 'STOP', reason: 'Goal achieved', graceful: true };
  }

  if (loopDetected && progress === 'STUCK') {
    return { action: 'ASK_USER', reason: 'Stuck in loop', guidance: reflection.nextSteps };
  }

  if (progress === 'GOOD' && percentComplete < 90) {
    return { action: 'CONTINUE', reason: 'Making progress', estimate: estimateRemaining(percentComplete) };
  }

  if (progress === 'SLOW' && context.consecutiveSlowReflections >= 3) {
    return { action: 'ASK_USER', reason: 'Progress too slow', refinement: true };
  }

  if (recommendation === 'ASK_USER') {
    return { action: 'ASK_USER', reason: reflection.reasoning, options: reflection.nextSteps };
  }

  // Default: continue with caution
  return { action: 'CONTINUE', reason: 'Progress detected', monitor: true };
}
```

---

## Goal Refinement for Ambiguous Tasks

### Ambiguity Detector

Flags like: "learn", "understand", "explore", "research", "optimize" without concrete deliverables

```javascript
const ambiguousPatterns = [
  /learn (?:about|how to)/i,
  /understand (?:the|how)/i,
  /explore (?:ways|options)/i,
  /research (?:the|how)/i,
  /optimize (?:everything|the system)/i,
  /improve (?:the|our) (?:business|process)/i
];

function detectAmbiguity(goal) {
  const matches = ambiguousPatterns.filter(p => p.test(goal));
  return {
    isAmbiguous: matches.length > 0,
    patterns: matches,
    confidence: matches.length / ambiguousPatterns.length
  };
}
```

### Goal Refinement Prompt

When ambiguity detected:

```javascript
const refinementPrompt = `
Your goal is too ambiguous for autonomous execution: "${goal}"

**Issue**: No clear termination criteria or deliverables.

**Refinement Options**:
1. Define concrete deliverables (e.g., "learn Python" → "write 3 working Python scripts")
2. Set time/scope limits (e.g., "research AI tools" → "create comparison table of top 5 AI tools")
3. Specify success criteria (e.g., "optimize database" → "reduce query time by 20%")

**Please refine your goal**:
- What specific outcome would indicate success?
- What deliverable(s) should exist when complete?
- What metrics define "done"?

**Suggested refinement**: ${suggestRefinement(goal)}

Would you like to:
A) Use suggested refinement
B) Provide your own refinement
C) Proceed with time limit (risk: may not complete goal)
`;
```

---

## Safety Guardrails

### 1. Wall-Clock Timeout
```javascript
const MAX_WALL_TIME_MS = env.AUTONOMOUS_MAX_WALL_TIME_MS || 2 * 60 * 60 * 1000; // 2 hours
if (Date.now() - startTime > MAX_WALL_TIME_MS) {
  return terminate('TIMEOUT', 'Wall-clock limit reached', saveCheckpoint=true);
}
```

### 2. Iteration Cap
```javascript
const MAX_ITERATIONS = env.AUTONOMOUS_MAX_ITERATIONS || 200;
if (iterationCount >= MAX_ITERATIONS) {
  return terminate('MAX_ITERATIONS', 'Hard iteration limit reached', saveCheckpoint=true);
}
```

### 3. Cost Limit (Token Budget)
```javascript
const MAX_TOKENS = env.AUTONOMOUS_MAX_TOKENS || 500_000; // ~$1 at typical pricing
if (totalTokensUsed >= MAX_TOKENS) {
  return terminate('COST_LIMIT', 'Token budget exhausted', saveCheckpoint=true);
}
```

### 4. Error Threshold
```javascript
const MAX_CONSECUTIVE_ERRORS = 5;
if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
  return terminate('ERROR_THRESHOLD', 'Too many consecutive failures', requestHelp=true);
}
```

### 5. User Interrupt
```javascript
// Listen for SIGINT, UI stop button, or /api/autonomous/{id}/stop
process.on('SIGINT', () => {
  return terminate('USER_INTERRUPT', 'User requested stop', graceful=true, saveCheckpoint=true);
});
```

---

## Termination Modes

### 1. Graceful Termination (Goal Achieved)
```javascript
{
  status: 'completed',
  reason: 'goal_achieved',
  summary: 'Successfully completed: ...',
  iterations: 42,
  timeElapsed: '1h 23m',
  outcomes: { successes: 38, failures: 4 },
  deliverables: [...],
  checkpointSaved: true
}
```

### 2. Request Guidance (Stuck)
```javascript
{
  status: 'paused',
  reason: 'stuck',
  summary: 'No progress detected after 30 iterations',
  suggestions: ['Try alternative approach X', 'Break into smaller sub-tasks'],
  awaitingUserInput: true,
  checkpointSaved: true
}
```

### 3. Forced Stop (Safety Limit)
```javascript
{
  status: 'stopped',
  reason: 'timeout',
  summary: 'Wall-clock limit (2h) reached',
  progress: '67% complete',
  nextSteps: ['Resume from checkpoint', 'Increase time limit', 'Refine goal'],
  checkpointSaved: true
}
```

### 4. User Interrupt
```javascript
{
  status: 'interrupted',
  reason: 'user_stop',
  summary: 'User requested stop at iteration 25',
  progress: '40% complete',
  checkpointSaved: true,
  resumable: true
}
```

---

## Implementation Plan

### Phase 1: Metacognitive Reflection (M1) - 1 week
**Deliverables**:
- `frontend/core/agent/reflection.mjs` - Reflection engine
- `frontend/core/agent/reflection-prompts.mjs` - Prompt templates
- Reflection triggers every 10 iterations
- Basic goal completion detection

**Success Criteria**:
- ✅ Reflection runs without errors
- ✅ Detects goal completion in 80% of test cases
- ✅ Identifies stuck state correctly
- ✅ JSON output parseable

---

### Phase 2: Goal Refinement (M2) - 3 days
**Deliverables**:
- `frontend/core/agent/goal-parser.mjs` - Ambiguity detection
- `frontend/core/agent/goal-refiner.mjs` - Refinement UI
- Pre-flight goal analysis
- User confirmation for ambiguous goals

**Success Criteria**:
- ✅ Detects ambiguous goals (e.g., "learn Python")
- ✅ Suggests concrete refinements
- ✅ User can accept/reject/modify
- ✅ Refined goals have clear success criteria

---

### Phase 3: Safety Guardrails (M3) - 2 days
**Deliverables**:
- Wall-clock timeout
- Iteration cap
- Token budget tracker
- Error threshold detection
- User interrupt handler

**Success Criteria**:
- ✅ All guardrails trigger correctly
- ✅ Checkpoints saved on forced stop
- ✅ User can resume from checkpoint
- ✅ No runaway execution possible

---

### Phase 4: Continuous Loop Integration (M4) - 3 days
**Deliverables**:
- Replace fixed 50-iteration limit with continuous mode
- Integrate reflection → decision → action loop
- Add `mode` parameter: `fixed|continuous` (default: `fixed` for backwards compat)
- UI toggle for continuous mode

**Success Criteria**:
- ✅ Continuous mode terminates on goal completion
- ✅ Falls back gracefully on reflection errors
- ✅ Backwards compatible with fixed mode
- ✅ User can switch modes mid-session

---

### Phase 5: Progress Tracking & Visualization (M5) - 3 days
**Deliverables**:
- Progress percentage display in UI
- Estimated time remaining
- Milestone tracker (checkboxes)
- Iteration velocity graph
- Live reflection summaries

**Success Criteria**:
- ✅ User sees real-time progress
- ✅ ETR updates every reflection
- ✅ Milestones visually tracked
- ✅ Reflection insights surfaced to UI

---

## Configuration

### Environment Variables

```bash
# Continuous mode toggle
AUTONOMOUS_MODE=continuous|fixed              # default: fixed

# Reflection settings
AUTONOMOUS_REFLECTION_INTERVAL=10             # iterations between reflections
AUTONOMOUS_REFLECTION_MODEL=core              # model for reflection
AUTONOMOUS_REFLECTION_TEMPERATURE=0.7
AUTONOMOUS_REFLECTION_TOP_P=0.6

# Safety limits
AUTONOMOUS_MAX_WALL_TIME_MS=7200000           # 2 hours
AUTONOMOUS_MAX_ITERATIONS=200
AUTONOMOUS_MAX_TOKENS=500000
AUTONOMOUS_MAX_CONSECUTIVE_ERRORS=5

# Goal handling
AUTONOMOUS_REQUIRE_CONCRETE_GOALS=true        # Reject ambiguous goals
AUTONOMOUS_AUTO_REFINE_GOALS=false            # Auto-suggest refinements

# Checkpointing
AUTONOMOUS_CHECKPOINT_INTERVAL=10             # Save every N iterations
AUTONOMOUS_CHECKPOINT_DIR=.forgekeeper/playground/.checkpoints
```

---

## Testing Strategy

### Unit Tests
- `test_reflection_engine.mjs` - Reflection prompt/parse
- `test_goal_parser.mjs` - Ambiguity detection
- `test_safety_guardrails.mjs` - Each guardrail triggers correctly
- `test_termination_logic.mjs` - Decision matrix coverage

### Integration Tests
- `test_continuous_mode_simple.mjs` - Simple goal (e.g., "create a file")
- `test_continuous_mode_complex.mjs` - Multi-step goal (e.g., "build REST API")
- `test_continuous_mode_ambiguous.mjs` - Ambiguous goal handling
- `test_continuous_mode_timeout.mjs` - Timeout triggers gracefully
- `test_continuous_mode_stuck.mjs` - Stuck detection + user prompt

### End-to-End Tests
- Real autonomous session: "Analyze codebase and write architecture doc"
- Expected: Completes within 50-100 iterations, self-terminates, doc exists
- Validation: Doc quality check (keywords, structure)

---

## Example Scenarios

### Scenario 1: Simple Goal (Self-Terminates Quickly)
**Goal**: "Create a README.md file with project description"

**Expected Flow**:
```
Iteration 1: Plan approach (use write_file tool)
Iteration 2: Draft README content
Iteration 3: Write file to disk
Iteration 4: Verify file exists
Iteration 5: [Reflection] Goal 100% complete → STOP

Result: Terminated at iteration 5 (not 50)
```

---

### Scenario 2: Complex Goal (Periodic Reflections)
**Goal**: "Refactor authentication module to use JWT tokens"

**Expected Flow**:
```
Iterations 1-10: Read current auth code, identify changes needed
[Reflection 1] 20% complete, making progress → CONTINUE

Iterations 11-20: Implement JWT generation/validation
[Reflection 2] 50% complete, good progress → CONTINUE

Iterations 21-30: Update routes to use JWT middleware
[Reflection 3] 75% complete, almost done → CONTINUE

Iterations 31-35: Write tests, verify functionality
[Reflection 4] 100% complete, all tests passing → STOP

Result: Terminated at iteration 35 with deliverable
```

---

### Scenario 3: Ambiguous Goal (Refinement Required)
**Goal**: "Learn how to run a business"

**Expected Flow**:
```
[Pre-flight] Ambiguous goal detected
[Prompt User] Suggested refinement:
  "Research business fundamentals and create a 5-page guide covering:
   1. Business planning basics
   2. Financial management
   3. Marketing strategies
   4. Legal requirements
   5. Key metrics to track"

[User Accepts] Proceed with refined goal

Iterations 1-50: Research each topic, draft sections
[Reflection 1-5] Progress tracked per section
[Final] All sections complete, guide exists → STOP

Result: Concrete deliverable instead of infinite loop
```

---

### Scenario 4: Stuck State (Request Guidance)
**Goal**: "Fix failing unit tests in test_auth.py"

**Expected Flow**:
```
Iterations 1-10: Analyze test failures, attempt fixes
Iterations 11-20: Still failing, try alternative approaches
Iterations 21-30: Same errors, no progress
[Reflection 3] STUCK detected, looping on same approach

[Prompt User]:
  "I'm stuck after 30 iterations. The tests are failing with:
   Error: 'Module jwt not found'

   I've tried:
   - Installing jwt library (failed - permission denied)
   - Using alternative library (not found)

   Options:
   A) Install dependencies as root user
   B) Use Docker container with pre-installed deps
   C) Skip JWT tests for now

   What should I do?"

[User Selects B] Resume with new approach
Iterations 31-35: Use Docker, tests pass → STOP
```

---

## Metrics & Observability

### Key Metrics
- **Goal Completion Rate**: % of goals successfully completed without hitting limits
- **Average Iterations to Completion**: Tracks efficiency improvements
- **Reflection Accuracy**: % of reflections that correctly assessed progress
- **Termination Reason Distribution**: completed|stuck|timeout|error|user_interrupt
- **False Positive Stop Rate**: % of premature terminations (goal not actually done)

### ContextLog Events
```json
{
  "act": "reflection",
  "iter": 30,
  "goal_achieved": "NO",
  "progress": "GOOD",
  "percent_complete": 65,
  "recommendation": "CONTINUE",
  "reasoning": "Making steady progress, 2 of 3 modules complete"
}
```

```json
{
  "act": "termination",
  "iter": 47,
  "reason": "goal_achieved",
  "graceful": true,
  "deliverables": ["README.md", "API documentation"],
  "checkpointSaved": true
}
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM reflection fails/hallucinates | High | Fall back to fixed iteration limit, validate JSON output |
| Goal declared complete prematurely | Medium | Require explicit deliverable verification (file exists, test passes) |
| Stuck in loop despite reflection | Medium | Hard timeout (2h) always enforces stop |
| Ambiguous goal accepted without refinement | Low | Flag ambiguous patterns, require user confirmation |
| Token costs explode | High | Hard token limit (500K), show running cost estimate |
| User loses work on forced stop | Low | Auto-checkpoint every 10 iterations |

---

## Future Enhancements (Phase 6+)

### 1. Multi-Goal Orchestration
- Handle goals like "Build feature X AND write tests AND update docs"
- Track sub-goal completion independently
- Parallelize where possible

### 2. Learning from Reflections
- Store reflection patterns → train classifier
- "This reflection pattern indicates 90% completion" → adjust termination threshold
- Feed into Episodic Memory for future goal estimation

### 3. Dynamic Reflection Interval
- Reflect more frequently when stuck (every 5 iterations)
- Reflect less frequently when progress is good (every 20 iterations)
- Adaptive based on velocity

### 4. Goal Decomposition
- Automatically break complex goals into milestones
- "Build REST API" → [Design schema, Implement routes, Write tests, Add docs]
- Track milestone progress separately

### 5. Cost Prediction
- "This goal will cost ~$0.50 and take ~30 minutes. Proceed?"
- Based on historical data + goal complexity
- Let user set budget constraints

---

## Success Criteria (Overall)

✅ **Phase 1-4 Complete**: Continuous mode operational
✅ **Goal Completion Rate**: >80% for concrete goals
✅ **Premature Termination**: <5% false positives
✅ **Safety**: Zero runaway executions in testing
✅ **User Satisfaction**: Preferred over fixed mode in surveys

---

## References

- [Autonomous Agent Capabilities](../AUTONOMOUS_AGENT_CAPABILITIES_2025-11-02.md)
- [Comprehensive Roadmap Analysis](../../COMPREHENSIVE_ROADMAP_ANALYSIS.md)
- [Diagnostic Reflection ADR](../adr-0003-diagnostic-reflection.md)
- [Episodic Memory Design](../PHASE5_EPISODIC_MEMORY.md)

---

**Last Updated**: 2025-11-03
**Status**: Design Phase
**Next Step**: Implement Phase 1 (Metacognitive Reflection)
