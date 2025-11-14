# Self-Reflection & Recursive Diagnosis Review

**Date**: 2025-11-03
**Purpose**: Comprehensive analysis of Forgekeeper's self-reflection capabilities and identification of gaps

---

## Executive Summary

Forgekeeper has **strong reactive self-reflection** (error diagnosis, recovery, pattern learning) but **weak proactive self-reflection** (alternative generation, cost estimation, plan alignment).

**Current Strengths** (8/10):
- ✅ Excellent error diagnosis and recovery
- ✅ Strong meta-cognitive monitoring (biases, overconfidence)
- ✅ Good pattern recognition (success/failure)
- ✅ Solid progress tracking (stuck detection)

**Critical Gaps** (needs work):
- ❌ No multi-alternative planning (generates only one approach)
- ❌ No effort/cost estimation before execution
- ❌ No plan alignment checking (does task fit overall goal?)
- ❌ Limited recursive self-diagnosis (only after failure)

---

## Current Self-Reflection Capabilities

### 1. Meta-Reflection System ✅ **Strong**

**Location**: `autonomous.mjs` (lines 513-604)

**What It Does**:
- Scores accuracy of previous reflection vs actual outcome
- Tracks progress errors, confidence errors, assessment correctness
- Generates critique of previous reasoning
- Feeds back into next reflection

**Example**:
```
Iteration 5: Predicted 80% progress, actual 60%
→ Meta-reflection: "20% progress error - you were too optimistic"
Iteration 6: Agent adjusts prediction to be more conservative
```

**Strengths**:
- Quantitative accuracy tracking (progress %, confidence %)
- Historical learning (last 5 reflections kept)
- Self-correction mechanism

**Gaps**:
- Only looks backward (not forward)
- Doesn't generate alternatives
- Doesn't estimate effort before acting

---

### 2. Self-Evaluator ✅ **Strong**

**Location**: `self-evaluator.mjs` (612 lines)

**What It Does**:
- **Confidence calibration**: Adjusts predictions based on historical accuracy
- **Pattern recognition**: Learns what works and what fails
- **Bias detection**: Overconfidence, optimism, repetition blindness
- **Risk assessment**: Evaluates risk before execution

**Example**:
```
Agent: "I'm 85% confident this will work"
Self-Evaluator: "You've been overconfident 3 times recently (avg error 32%)"
→ Calibrated: 70% confidence
```

**Strengths**:
- Proactive risk assessment
- Self-awareness of biases
- Historical pattern learning

**Gaps**:
- Risk assessment is binary (proceed/don't proceed)
- Doesn't suggest alternative approaches
- No cost/effort estimation

---

### 3. Diagnostic Reflection (5 Whys) ✅ **Excellent**

**Location**: `diagnostic-reflection.mjs` (implements ADR-0003)

**What It Does**:
- Root cause analysis using "5 Whys" method
- LLM-powered diagnosis of failures
- Traces errors back to underlying cause

**Example**:
```
Error: "command not found: gh"
Why? → gh not installed
Why? → User's environment lacks GitHub CLI
Why? → Agent assumed gh was available
Why? → Agent didn't verify prerequisites
Root Cause: Missing prerequisite check
```

**Strengths**:
- Deep causal analysis
- LLM-powered (understands context)
- Identifies root cause, not just symptom

**Gaps**:
- Only runs AFTER failure (reactive, not proactive)
- Doesn't prevent problems before they occur
- No alternative generation

---

### 4. Recovery Planner ✅ **Good**

**Location**: `recovery-planner.mjs` (implements T306-T307)

**What It Does**:
- Generates recovery strategies after failure
- Scores strategies by confidence and estimated iterations
- Provides concrete steps with tools and arguments

**Example**:
```
Error: git clone failed (ENOENT)
Recovery Strategies:
  1. Install git via package manager (confidence: 0.8, iterations: 2)
  2. Use curl + tar fallback (confidence: 0.7, iterations: 3)
  3. Ask user for manual clone (confidence: 0.6, iterations: 1)
→ Chooses: Strategy 1 (highest confidence)
```

**Strengths**:
- Multiple strategies considered
- Concrete, executable plans
- Automatic execution

**Gaps**:
- Only runs AFTER failure (reactive)
- Doesn't prevent problems proactively
- No alignment with overall goal check

---

### 5. Task Planner ⚠️ **Moderate**

**Location**: `task-planner.mjs` (implements ADR-0004)

**What It Does**:
- Generates detailed instruction plans for high-level actions
- Breaks actions into steps with tools, args, expected outcomes
- Validates tool names and provides verification steps

**Example**:
```
Action: "Clone GitHub repository"
Plan:
  Step 1: Check if gh command is available
  Step 2: Clone using gh repo clone
  Step 3: Verify clone succeeded (check directory exists)
```

**Strengths**:
- Detailed step-by-step plans
- Prerequisite checking
- Verification steps included

**Gaps**:
- ❌ **Only generates ONE plan** (no alternatives)
- ❌ **No effort estimation** (time, complexity, risk)
- ❌ **No alignment check** (does this fit the overall goal?)
- ❌ **No comparison** of different approaches

---

### 6. Progress Tracker ✅ **Good**

**Location**: `progress-tracker.mjs` (Phase 2)

**What It Does**:
- Detects stuck vs slow based on state changes
- Heartbeats (agent alive) vs state changes (agent progressing)
- Concurrent LLM verification for stuck detection

**Example**:
```
Iteration 1-5: Heartbeats ✓, State changes ✓ → Making progress
Iteration 6-10: Heartbeats ✓, State changes ✗ → STUCK!
```

**Strengths**:
- Status-based (not time-based)
- Fast stuck detection (5 iterations)
- LLM verification for confidence

**Gaps**:
- Only detects stuck DURING execution
- Doesn't predict stuck before starting
- No alternative suggestion when stuck

---

### 7. Episodic Memory ✅ **Good**

**Location**: `episodic-memory.mjs` (Phase 5 Option A)

**What It Does**:
- Records past task attempts with success/failure
- Semantic search for similar tasks
- Provides concrete examples of what worked

**Example**:
```
Current task: "Clone GitHub repo"
Similar past tasks:
  1. "Clone react repository" (succeeded, used gh CLI, 3 iterations)
  2. "Clone nodejs project" (succeeded, used git clone, 2 iterations)
→ Recommendation: Use gh CLI or git clone
```

**Strengths**:
- Learns from experience
- Semantic similarity (not keyword matching)
- Concrete examples with tools and iterations

**Gaps**:
- Doesn't suggest which approach is best for current context
- No cost comparison between approaches
- Doesn't explain WHY one approach is better

---

## Gap Analysis

### ❌ Gap 1: No Multi-Alternative Planning

**Current Behavior**:
```
User: "Clone the repository"
Task Planner: Generates ONE plan using gh CLI
Agent: Executes plan
→ If gh not installed → failure → recovery
```

**Desired Behavior**:
```
User: "Clone the repository"
Alternative Generator: Creates 3 approaches:
  1. Use gh CLI (effort: low IF installed, high IF not)
  2. Use git clone (effort: medium, requires git)
  3. Use curl + tar (effort: high, always works)
Evaluator: Checks which tools are available
→ Chooses: git clone (installed, medium effort)
Agent: Executes chosen approach
→ Success (no failure needed)
```

**Impact**: High - Avoids unnecessary failures and recovery loops

---

### ❌ Gap 2: No Effort/Cost Estimation

**Current Behavior**:
```
Task: "Create comprehensive test suite"
Agent: Starts implementing (no effort estimate)
→ 15 iterations later, still not complete
→ Realizes this is much bigger than expected
```

**Desired Behavior**:
```
Task: "Create comprehensive test suite"
Effort Estimator:
  - Complexity: HIGH (requires multiple test files, fixtures, mocks)
  - Time: ~20 iterations (based on similar past tasks)
  - Risk: MODERATE (test dependencies might be missing)
Agent: "This is a 20-iteration task. Break into smaller chunks?"
User: "Yes, start with unit tests only"
Agent: Adjusts scope (5 iterations)
→ Completes in 5 iterations as estimated
```

**Impact**: High - Prevents scope creep and unrealistic expectations

---

### ❌ Gap 3: No Plan Alignment Checking

**Current Behavior**:
```
Overall Goal: "Prepare repository for deployment"
Current iteration: Agent decides to refactor code style
Agent: Executes refactor (3 iterations)
→ No alignment check - this doesn't help deployment goal
```

**Desired Behavior**:
```
Overall Goal: "Prepare repository for deployment"
Current iteration: Agent considers refactoring code style
Plan Alignment Checker:
  - Goal: Prepare for deployment (build, test, CI/CD)
  - Current action: Refactor code style
  - Alignment: LOW (not necessary for deployment)
  - Alternative: Run tests, fix CI, update dependencies
→ Agent: "Refactoring doesn't align with deployment goal. Running tests instead."
```

**Impact**: High - Keeps agent focused on actual goal

---

### ❌ Gap 4: Limited Recursive Self-Diagnosis

**Current Behavior**:
```
Agent: Executes action
→ Failure
Agent: Runs diagnostic reflection (5 Whys)
Agent: Generates recovery plan
Agent: Executes recovery
→ Success or failure
```

**Desired Behavior**:
```
Agent: BEFORE executing, asks:
  - "What could go wrong?"
  - "What are my assumptions?"
  - "Do I have what I need?"
Agent: Verifies assumptions
Agent: Executes action
→ If failure:
  Agent: "Why did this fail? What did I miss?"
  Agent: Re-evaluates original assumptions
  Agent: "Was my diagnosis correct?"
  Agent: Recursively improves diagnosis
```

**Impact**: Medium - Faster root cause identification

---

## Self-Reflection Depth Comparison

### Current Self-Reflection Depth

```
Iteration Loop:
  1. Reflect (assess progress)
  2. Plan (generate ONE approach)
  3. Execute (run tools)
  4. Meta-reflect (score accuracy)
  5. Loop

Depth: 1 level (only evaluates what happened)
```

### Desired Self-Reflection Depth

```
Iteration Loop:
  1. Reflect (assess progress)
  2. **Pre-Planning Self-Diagnosis**:
     - What am I trying to achieve?
     - What do I know? What don't I know?
     - What assumptions am I making?
  3. **Alternative Generation**:
     - Generate 3-5 different approaches
     - Estimate effort/cost for each
     - Evaluate alignment with overall goal
  4. **Recursive Evaluation**:
     - Which approach is best? Why?
     - What could go wrong with each?
     - Which assumptions are risky?
  5. **Choice & Justification**:
     - Choose optimal approach
     - Document reasoning
     - Set success criteria
  6. Execute (run tools)
  7. **Post-Execution Reflection**:
     - Did it work as expected?
     - Were my estimates accurate?
     - What did I learn?
  8. **Recursive Learning**:
     - Update effort estimates
     - Refine approach rankings
     - Improve future choices
  9. Loop

Depth: 3 levels (before, during, after)
```

---

## Comparison: Reactive vs Proactive

### Reactive Self-Reflection (Current) ⚠️

| Component | Timing | Trigger | Outcome |
|-----------|--------|---------|---------|
| Meta-Reflection | After iteration | Automatic | Accuracy scores |
| Diagnostic Reflection | After failure | Error | Root cause |
| Recovery Planner | After diagnosis | Failure | Recovery steps |
| Pattern Learner | After recovery | Success/failure | Pattern storage |

**Characteristic**: Waits for problems to happen, then fixes them

### Proactive Self-Reflection (Desired) ✅

| Component | Timing | Trigger | Outcome |
|-----------|--------|---------|---------|
| Alternative Generator | Before execution | Planning | Multiple options |
| Effort Estimator | Before execution | Planning | Cost estimates |
| Plan Alignment Checker | Before execution | Planning | Goal alignment score |
| Assumption Validator | Before execution | Planning | Risk identification |
| Recursive Evaluator | During planning | Alternatives | Optimal choice |

**Characteristic**: Anticipates problems before they happen, chooses best approach

---

## Recursion Analysis

### Current Recursion Depth: **Shallow** (1-2 levels)

**Example**:
```
Level 0: User asks "Clone repository"
Level 1: Agent reflects "I need to clone a repo"
Level 2: Agent plans "Use gh CLI"
Level 3: Agent executes
→ Failure
Level 4: Agent diagnoses "gh not installed"
Level 5: Agent recovers "Install gh"
```

**Recursion Points**: Only at failure (Level 4)

### Desired Recursion Depth: **Deep** (4-5 levels)

**Example**:
```
Level 0: User asks "Clone repository"
Level 1: Agent reflects "I need to clone a repo"
Level 2: Agent asks "What approaches exist?"
  Level 2.1: Generate alternatives (gh, git, curl)
  Level 2.2: Estimate effort for each
    Level 2.2.1: "Does gh exist?" (verify assumption)
    Level 2.2.2: "Does git exist?" (verify assumption)
    Level 2.2.3: "Does curl exist?" (verify assumption)
  Level 2.3: Evaluate alignment
    Level 2.3.1: "Does cloning help the overall goal?"
    Level 2.3.2: "Is this the right time to clone?"
  Level 2.4: Choose optimal approach
    Level 2.4.1: "Why is git best?"
    Level 2.4.2: "What could still go wrong?"
Level 3: Agent plans "Use git clone"
Level 4: Agent executes
→ Success (no failure needed)
```

**Recursion Points**: Before execution (Levels 2.x)

---

## Recommendations

### Priority 1: Multi-Alternative Planning ⭐⭐⭐

**Why**: Biggest impact, prevents failures proactively

**Components Needed**:
1. Alternative Generator
2. Effort Estimator
3. Plan Alignment Checker
4. Alternative Evaluator & Ranker

**Estimated Complexity**: High (3-4 days)

### Priority 2: Effort/Cost Estimation ⭐⭐⭐

**Why**: Critical for scope management and realistic planning

**Components Needed**:
1. Effort Estimator (complexity, time, risk)
2. Historical effort tracker
3. Effort-based prioritization

**Estimated Complexity**: Medium (2-3 days)

### Priority 3: Plan Alignment Checking ⭐⭐

**Why**: Keeps agent focused on actual goal

**Components Needed**:
1. Goal decomposition system
2. Alignment scorer
3. Relevance checker

**Estimated Complexity**: Medium (2 days)

### Priority 4: Recursive Self-Diagnosis ⭐

**Why**: Nice-to-have, improves diagnosis quality

**Components Needed**:
1. Assumption validator
2. Recursive questioning system
3. Meta-diagnostic reflection

**Estimated Complexity**: Low (1-2 days)

---

## Integration Points

New systems integrate with existing components:

```
┌─────────────────────────────────────────────────────────┐
│                   Autonomous Agent                      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Reflect    │ (Existing)
                    └──────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  🆕 Alternative Generator      │ ◄── Episodic Memory
            │  - Generate 3-5 approaches    │ ◄── Tool Effectiveness
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  🆕 Effort Estimator          │ ◄── Session Memory
            │  - Complexity, time, risk     │ ◄── Past similar tasks
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  🆕 Plan Alignment Checker    │ ◄── Overall goal
            │  - Goal relevance score       │ ◄── Task decomposition
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  🆕 Alternative Evaluator     │ ◄── Self-Evaluator
            │  - Rank approaches            │ ◄── Risk assessment
            │  - Choose optimal             │
            └───────────────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Execute    │ (Existing)
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Meta-Reflect │ (Existing)
                    └──────────────┘
```

---

## Conclusion

**Current State**: Forgekeeper has **strong reactive self-reflection** (8/10) but **weak proactive self-reflection** (4/10).

**Missing Capabilities**:
1. ❌ Multi-alternative planning (only generates one approach)
2. ❌ Effort/cost estimation (no estimate before execution)
3. ❌ Plan alignment checking (no goal relevance check)
4. ❌ Deep recursion (only 1-2 levels, needs 4-5)

**Recommendation**: Implement Priority 1-3 systems in **Phase 6: Proactive Self-Reflection**.

**Estimated Effort**: 7-9 days total (3-4 weeks part-time)

**Expected Impact**:
- 40-60% reduction in failed iterations
- 30-50% faster task completion
- Better goal alignment
- More realistic progress estimates

---

**Next Steps**: Design detailed architecture for Phase 6 components.
