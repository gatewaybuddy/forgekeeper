# Phase 7: Multi-Step Lookahead & Learning - Design Document

**Status**: 🔧 **IN PROGRESS**
**Date**: 2025-11-03
**Author**: Autonomous Agent Development Team

---

## Overview

Phase 7 extends Phase 6's proactive planning with:

1. **Multi-step lookahead**: Evaluate entire task sequences (2-3 steps ahead), not just immediate next action
2. **Weight learning**: Learn optimal MCDM weights based on success/failure patterns
3. **Outcome tracking**: Track which alternatives succeeded/failed and adapt accordingly

This transforms the agent from **single-step planning** to **multi-step strategic planning** with **continuous learning**.

---

## Motivation

### Current Limitations (Phase 6)

Phase 6 evaluates only the **immediate next action**:
```
Current Task → Generate Alternatives → Evaluate → Execute Best
```

**Problems**:
1. **Short-sighted**: May choose a "quick win" that makes future steps harder
2. **Static weights**: Same weights for all task types (install, test, build, etc.)
3. **No learning**: Doesn't improve from experience
4. **No adaptation**: Can't adjust strategy based on outcomes

### Phase 7 Solution

**Multi-step lookahead**:
```
Current Task → Generate Alternatives → For each alternative:
  - Simulate next 2-3 steps
  - Estimate total effort/risk across all steps
  - Evaluate final outcome quality
→ Choose alternative with best long-term outcome
```

**Weight learning**:
```
After each task:
  - Record: alternative chosen, weights used, outcome (success/failure)
  - Analyze: Which weights led to success? Which to failure?
  - Adapt: Adjust weights for similar future tasks
```

---

## Architecture

### Phase 7 Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Phase 7 Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 7.1: Task Graph Builder                                   │  │
│  │  - Build multi-step task graph (2-3 steps ahead)          │  │
│  │  - Detect dependencies between steps                      │  │
│  │  - Prune infeasible paths                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 7.2: Multi-Step Evaluator                                 │  │
│  │  - Evaluate entire path (not just next step)              │  │
│  │  - Aggregate effort/risk across all steps                 │  │
│  │  - Consider compound complexity                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 7.3: Outcome Tracker                                      │  │
│  │  - Record alternative outcomes (success/failure)          │  │
│  │  - Track weights used and results                         │  │
│  │  - Store to .forgekeeper/learning/outcomes.jsonl          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           ↓                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 7.4: Weight Learner                                       │  │
│  │  - Analyze outcome patterns                               │  │
│  │  - Learn optimal weights per task category                │  │
│  │  - Adapt weights based on success rate                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 7.1: Task Graph Builder

### Purpose
Build a multi-step task graph showing possible paths from current state to goal.

### Key Concepts

**Task Graph**:
```
Current State: "Need to install dependencies"
    ↓
Step 1a: Check package.json → Step 2a: npm install → Goal: Dependencies installed
    ↓
Step 1b: Check requirements.txt → Step 2b: pip install → Goal: Dependencies installed
    ↓
Step 1c: Search for package files → Step 2c: Determine package manager → Step 3c: Install → Goal
```

**Graph Structure**:
```javascript
{
  nodes: [
    { id: 'node-1', step: {...}, depth: 0 },
    { id: 'node-2a', step: {...}, depth: 1 },
    { id: 'node-2b', step: {...}, depth: 1 },
    // ...
  ],
  edges: [
    { from: 'node-1', to: 'node-2a', probability: 0.8 },
    { from: 'node-1', to: 'node-2b', probability: 0.6 },
    // ...
  ],
  paths: [
    { steps: ['node-1', 'node-2a', 'node-3a'], totalEffort: 5, totalRisk: 3 },
    { steps: ['node-1', 'node-2b', 'node-3b'], totalEffort: 7, totalRisk: 5 },
    // ...
  ]
}
```

### Implementation

**File**: `frontend/core/agent/task-graph-builder.mjs`

**Key Functions**:
```javascript
export function createTaskGraphBuilder(alternativeGenerator, effortEstimator, config = {}) {
  const maxDepth = config.maxDepth || 3;        // Look ahead 3 steps
  const maxBranches = config.maxBranches || 2;  // Top 2 alternatives per step
  const maxPaths = config.maxPaths || 10;       // Limit total paths to evaluate

  async function buildGraph(task, context) {
    // Build tree of alternatives
    const root = await generateAlternatives(task, context, depth = 0);

    // For each alternative at depth 0, generate next level
    for (const alt of root.alternatives) {
      if (depth < maxDepth) {
        const nextTask = deriveNextTask(alt);
        const nextAlternatives = await generateAlternatives(nextTask, context, depth + 1);
        // ... recursively build tree
      }
    }

    // Extract all complete paths
    const paths = extractPaths(root, maxDepth);

    // Evaluate each path
    const evaluatedPaths = await evaluatePaths(paths, effortEstimator);

    return {
      graph: root,
      paths: evaluatedPaths,
      bestPath: selectBestPath(evaluatedPaths),
    };
  }
}
```

**Pruning Strategy**:
- Only keep top N alternatives per step (avoid combinatorial explosion)
- Prune paths with total effort > threshold
- Prune paths with total risk > threshold
- Prune paths that don't advance toward goal

---

## Phase 7.2: Multi-Step Evaluator

### Purpose
Evaluate entire paths (sequences of steps), not just individual steps.

### Key Concepts

**Path Evaluation**:
```javascript
Path: [Step 1, Step 2, Step 3]

// Naive approach (wrong): Sum individual scores
pathScore = score(Step 1) + score(Step 2) + score(Step 3)

// Better approach (right): Aggregate metrics, then score
totalEffort = effort(Step 1) + effort(Step 2) + effort(Step 3)
totalRisk = max(risk(Step 1), risk(Step 2), risk(Step 3))  // Weakest link
compoundComplexity = complexity(Step 1) × complexity(Step 2) × complexity(Step 3)

pathScore = evaluateMCDM({
  effort: totalEffort,
  risk: totalRisk,
  complexity: compoundComplexity,
  alignment: goalAlignment(Step 3),  // Final step alignment matters most
})
```

**Compound Complexity**:
Some sequences are more complex than the sum of parts:
- Step 1: Install dependencies (complexity: 3)
- Step 2: Configure environment (complexity: 4)
- Combined: 3 + 4 = 7 (naive)
- **But**: Configuration depends on installation → compound complexity = 3 × 1.2 = 8.4

**Risk Propagation**:
- Risk doesn't add linearly
- One high-risk step makes entire path risky
- Use **max risk** or **weighted average** with recency bias

### Implementation

**File**: `frontend/core/agent/multi-step-evaluator.mjs`

**Key Functions**:
```javascript
export function createMultiStepEvaluator(config = {}) {
  const riskAggregation = config.riskAggregation || 'max';  // 'max', 'avg', 'weighted'
  const compoundFactor = config.compoundFactor || 1.2;      // Complexity multiplier

  function evaluatePath(path, context) {
    // Aggregate effort (sum)
    const totalEffort = path.steps.reduce((sum, step) => sum + step.effort, 0);

    // Aggregate risk (max or weighted)
    const totalRisk = aggregateRisk(path.steps, riskAggregation);

    // Compound complexity
    const compoundComplexity = calculateCompoundComplexity(path.steps, compoundFactor);

    // Final step alignment (most important)
    const goalAlignment = path.steps[path.steps.length - 1].alignment;

    // Path confidence (product of individual confidences)
    const pathConfidence = path.steps.reduce((prod, step) => prod * step.confidence, 1.0);

    // Use MCDM to score
    const pathScore = evaluateMCDM({
      effort: totalEffort,
      risk: totalRisk,
      complexity: compoundComplexity,
      alignment: goalAlignment,
      confidence: pathConfidence,
    });

    return {
      path,
      totalEffort,
      totalRisk,
      compoundComplexity,
      goalAlignment,
      pathConfidence,
      pathScore,
    };
  }
}
```

---

## Phase 7.3: Outcome Tracker

### Purpose
Record which alternatives were chosen and whether they succeeded or failed.

### Key Concepts

**Outcome Record**:
```javascript
{
  id: 'outcome-01HFKT...',
  ts: '2025-11-03T12:34:56.789Z',
  sessionId: 'sess-789',
  convId: 'conv-123',
  iteration: 5,

  // Task context
  taskGoal: 'Install npm dependencies',
  taskCategory: 'install',  // Derived from goal

  // Alternative chosen
  alternativeId: 'alt-01HFKT...',
  alternativeName: 'Use npm install',

  // Weights used
  weights: {
    effort: 0.35,
    risk: 0.25,
    alignment: 0.30,
    confidence: 0.10,
  },

  // Metrics
  overallScore: 0.87,
  effort: 3.2,
  risk: 4.5,
  alignment: 0.85,
  confidence: 0.9,

  // Outcome
  outcome: 'success',  // 'success' | 'failure' | 'partial'
  actualIterations: 2,
  elapsedMs: 4520,

  // Failure details (if applicable)
  failureReason: null,
  errorCategory: null,
}
```

**Storage**: `.forgekeeper/learning/outcomes.jsonl` (JSONL format for easy append)

### Implementation

**File**: `frontend/core/agent/outcome-tracker.mjs`

**Key Functions**:
```javascript
export function createOutcomeTracker(config = {}) {
  const outcomesDir = config.outcomesDir || '.forgekeeper/learning';
  const outcomesFile = path.join(outcomesDir, 'outcomes.jsonl');

  async function recordOutcome(outcome) {
    // Ensure directory exists
    await fs.mkdir(outcomesDir, { recursive: true });

    // Append to JSONL
    const line = JSON.stringify(outcome) + '\n';
    await fs.appendFile(outcomesFile, line);

    console.log(`[OutcomeTracker] Recorded outcome: ${outcome.outcome} for "${outcome.alternativeName}"`);
  }

  async function queryOutcomes(filters = {}) {
    // Read JSONL
    const content = await fs.readFile(outcomesFile, 'utf-8');
    const lines = content.trim().split('\n');
    const outcomes = lines.map(line => JSON.parse(line));

    // Filter by task category, outcome, etc.
    return outcomes.filter(o => {
      if (filters.taskCategory && o.taskCategory !== filters.taskCategory) return false;
      if (filters.outcome && o.outcome !== filters.outcome) return false;
      if (filters.minScore && o.overallScore < filters.minScore) return false;
      return true;
    });
  }

  return {
    recordOutcome,
    queryOutcomes,
  };
}
```

---

## Phase 7.4: Weight Learner

### Purpose
Learn optimal MCDM weights based on historical outcomes.

### Key Concepts

**Task Categories**:
Different task types need different weight priorities:
- **Install tasks**: Prioritize low risk (don't break existing setup)
- **Test tasks**: Prioritize alignment (ensure tests match goal)
- **Build tasks**: Prioritize low effort (builds should be fast)
- **Debug tasks**: Prioritize confidence (need reliable fixes)

**Learning Strategy**:

1. **Group outcomes by task category**:
```javascript
{
  'install': [outcome1, outcome2, ...],
  'test': [outcome3, outcome4, ...],
  'build': [outcome5, outcome6, ...],
}
```

2. **For each category, analyze success patterns**:
```javascript
const successfulOutcomes = category.filter(o => o.outcome === 'success');
const failedOutcomes = category.filter(o => o.outcome === 'failure');

// What weights led to success?
const successWeights = successfulOutcomes.map(o => o.weights);
const avgSuccessWeights = average(successWeights);

// What weights led to failure?
const failureWeights = failedOutcomes.map(o => o.weights);
const avgFailureWeights = average(failureWeights);

// Adjust weights: move toward success patterns, away from failure patterns
const learnedWeights = {
  effort: avgSuccessWeights.effort + (avgSuccessWeights.effort - avgFailureWeights.effort) * learningRate,
  risk: avgSuccessWeights.risk + (avgSuccessWeights.risk - avgFailureWeights.risk) * learningRate,
  alignment: avgSuccessWeights.alignment + (avgSuccessWeights.alignment - avgFailureWeights.alignment) * learningRate,
  confidence: avgSuccessWeights.confidence + (avgSuccessWeights.confidence - avgFailureWeights.confidence) * learningRate,
};
```

3. **Normalize weights** (must sum to 1.0)

4. **Apply with confidence**:
   - If < 10 outcomes: Use default weights (not enough data)
   - If 10-50 outcomes: Blend learned + default (70% learned, 30% default)
   - If > 50 outcomes: Use learned weights (high confidence)

### Implementation

**File**: `frontend/core/agent/weight-learner.mjs`

**Key Functions**:
```javascript
export function createWeightLearner(outcomeTracker, config = {}) {
  const learningRate = config.learningRate || 0.1;
  const minOutcomes = config.minOutcomes || 10;
  const blendThreshold = config.blendThreshold || 50;

  const defaultWeights = {
    effort: 0.35,
    risk: 0.25,
    alignment: 0.30,
    confidence: 0.10,
  };

  async function learnWeights(taskCategory) {
    // Query outcomes for this category
    const outcomes = await outcomeTracker.queryOutcomes({ taskCategory });

    // Not enough data? Use defaults
    if (outcomes.length < minOutcomes) {
      console.log(`[WeightLearner] Not enough data for "${taskCategory}" (${outcomes.length} < ${minOutcomes}). Using defaults.`);
      return defaultWeights;
    }

    // Split successes and failures
    const successes = outcomes.filter(o => o.outcome === 'success');
    const failures = outcomes.filter(o => o.outcome === 'failure');

    // Calculate average weights
    const avgSuccessWeights = averageWeights(successes.map(o => o.weights));
    const avgFailureWeights = averageWeights(failures.map(o => o.weights));

    // Learn: Move toward success, away from failure
    const learnedWeights = {
      effort: avgSuccessWeights.effort + (avgSuccessWeights.effort - avgFailureWeights.effort) * learningRate,
      risk: avgSuccessWeights.risk + (avgSuccessWeights.risk - avgFailureWeights.risk) * learningRate,
      alignment: avgSuccessWeights.alignment + (avgSuccessWeights.alignment - avgFailureWeights.alignment) * learningRate,
      confidence: avgSuccessWeights.confidence + (avgSuccessWeights.confidence - avgFailureWeights.confidence) * learningRate,
    };

    // Normalize (must sum to 1.0)
    const normalized = normalizeWeights(learnedWeights);

    // Blend with defaults if not enough data
    const blendRatio = Math.min(outcomes.length / blendThreshold, 1.0);
    const blended = blendWeights(normalized, defaultWeights, blendRatio);

    console.log(`[WeightLearner] Learned weights for "${taskCategory}" (${outcomes.length} outcomes, ${successes.length} successes):`);
    console.log(`  Effort: ${blended.effort.toFixed(2)}`);
    console.log(`  Risk: ${blended.risk.toFixed(2)}`);
    console.log(`  Alignment: ${blended.alignment.toFixed(2)}`);
    console.log(`  Confidence: ${blended.confidence.toFixed(2)}`);

    return blended;
  }

  return {
    learnWeights,
  };
}
```

---

## Integration with Existing System

### Modification to `autonomous.mjs`

**Before (Phase 6)**:
```javascript
// Generate alternatives
const alternatives = await alternativeGenerator.generateAlternatives(task, context);

// Estimate effort
const effortEstimates = await effortEstimator.estimateAll(alternatives);

// Check alignment
const alignmentResults = await alignmentChecker.checkAllAlignments(alternatives, context);

// Evaluate and choose
const evaluation = await alternativeEvaluator.evaluateAlternatives(
  alternatives,
  effortEstimates,
  alignmentResults
);

// Execute
this.state.chosenAlternative = evaluation.chosen;
```

**After (Phase 7)**:
```javascript
// [Phase 7.1] Build multi-step task graph
const taskGraph = await taskGraphBuilder.buildGraph(task, context);

// [Phase 7.2] Evaluate entire paths (not just individual steps)
const pathEvaluations = await multiStepEvaluator.evaluatePaths(taskGraph.paths, context);

// [Phase 7.4] Get learned weights for this task category
const taskCategory = categorizeTask(task);
const learnedWeights = await weightLearner.learnWeights(taskCategory);

// [Phase 6.4 - Modified] Evaluate with learned weights
const evaluation = await alternativeEvaluator.evaluateAlternatives(
  pathEvaluations,
  effortEstimates,
  alignmentResults,
  { weights: learnedWeights }  // Use learned weights
);

// Execute
this.state.chosenAlternative = evaluation.chosen;

// [Phase 7.3] Record outcome after execution
const outcome = await executeAndTrackOutcome(evaluation.chosen);
await outcomeTracker.recordOutcome(outcome);
```

---

## Performance Considerations

### Complexity

**Phase 6 (single-step)**:
- Evaluate N alternatives: O(N)
- Total time: ~2-3 seconds for 4 alternatives

**Phase 7 (multi-step)**:
- Evaluate N alternatives at depth D: O(N^D)
- With pruning (keep top K per level): O(K^D)
- Example: K=2, D=3 → 2^3 = 8 paths to evaluate
- Total time: ~5-8 seconds for 8 paths

**Mitigation**:
- Limit depth (D=2 or D=3)
- Limit branches per step (K=2)
- Prune low-scoring paths early
- Cache effort/alignment calculations

### Storage

**Outcome tracking**:
- ~500 bytes per outcome record
- 1000 outcomes = 500 KB
- 10,000 outcomes = 5 MB (very manageable)

**Weight learning**:
- Compute on-demand (no persistent storage needed)
- Cache learned weights in memory per category

---

## Testing Strategy

### Unit Tests

**Phase 7.1: Task Graph Builder**
- Build single-level graph (depth=1)
- Build multi-level graph (depth=3)
- Pruning: Limit branches
- Path extraction: Find all complete paths

**Phase 7.2: Multi-Step Evaluator**
- Path effort aggregation
- Path risk aggregation (max, avg, weighted)
- Compound complexity calculation
- Path scoring

**Phase 7.3: Outcome Tracker**
- Record outcome to JSONL
- Query outcomes by category
- Query outcomes by success/failure
- Handle missing file gracefully

**Phase 7.4: Weight Learner**
- Learn from successes only
- Learn from successes + failures
- Blend with defaults (< 50 outcomes)
- Use learned weights (> 50 outcomes)
- Handle no outcomes (use defaults)

### Integration Tests

**End-to-end**:
1. Run task with Phase 7 enabled
2. Build multi-step graph
3. Evaluate paths
4. Choose best path
5. Execute
6. Record outcome
7. Learn weights
8. Verify learned weights applied on next similar task

---

## Configuration

### Enable/Disable Phase 7

```javascript
// In autonomous.mjs
const enableMultiStepLookahead = true;  // Set to false to use Phase 6 only
const multiStepDepth = 2;               // Look ahead 2 steps (3 = too slow)
```

### Tuning Parameters

```javascript
const phase7Config = {
  // Task Graph Builder
  maxDepth: 2,                // Look ahead depth
  maxBranches: 2,             // Top N alternatives per step
  maxPaths: 10,               // Total paths to evaluate

  // Multi-Step Evaluator
  riskAggregation: 'max',     // 'max' | 'avg' | 'weighted'
  compoundFactor: 1.2,        // Complexity multiplier

  // Weight Learner
  learningRate: 0.1,          // How quickly to adapt (0.0-1.0)
  minOutcomes: 10,            // Min outcomes before learning
  blendThreshold: 50,         // Outcomes for 100% learned weights
};
```

---

## Success Metrics

**Before Phase 7** (Phase 6):
- Single-step planning
- Static weights for all tasks
- No learning from outcomes

**After Phase 7**:
- Multi-step planning (2-3 steps ahead)
- Learned weights per task category
- Continuous improvement from experience

**Expected Improvements**:
- **15-20% fewer total iterations** (better long-term planning)
- **25-30% higher success rate** for complex multi-step tasks
- **Adaptive weights** converge to optimal after ~50 outcomes per category

---

## Implementation Phases

### Phase 7.1: Task Graph Builder ✅ (1-2 days)
- Build multi-step task graph
- Prune infeasible paths
- Extract complete paths
- Unit tests (graph building, pruning)

### Phase 7.2: Multi-Step Evaluator ✅ (1 day)
- Aggregate metrics across paths
- Compound complexity calculation
- Path scoring with MCDM
- Unit tests (aggregation, scoring)

### Phase 7.3: Outcome Tracker ✅ (1 day)
- Record outcomes to JSONL
- Query outcomes by category/outcome
- Handle file I/O
- Unit tests (record, query)

### Phase 7.4: Weight Learner ✅ (1-2 days)
- Learn weights from outcomes
- Blend with defaults
- Categorize tasks
- Unit tests (learning, blending)

### Phase 7.5: Integration ✅ (1 day)
- Wire into autonomous.mjs
- Add config flags
- End-to-end testing
- Documentation

**Total Estimate**: 5-7 days

---

## Future Extensions (Phase 8+)

**Probabilistic execution**:
- Try multiple high-scoring paths in parallel
- Use first successful result
- Requires sandboxed execution environments

**Cost-benefit analysis**:
- Factor in token usage, API calls, time
- Choose path with best cost/benefit ratio

**User feedback loop**:
- Ask user to rate outcomes
- Incorporate user ratings into learning

**Transfer learning**:
- Learn from other users' outcomes (privacy-preserving)
- Bootstrap new installations with learned weights

---

## Conclusion

Phase 7 will transform the agent from **single-step reactive planning** to **multi-step strategic planning with continuous learning**. This enables:

1. ✅ Better long-term decisions (look ahead 2-3 steps)
2. ✅ Task-specific optimization (learned weights per category)
3. ✅ Continuous improvement (adapt from experience)

**Status**: Ready for implementation!

---

**Last Updated**: 2025-11-03
**Next**: Implement Phase 7.1 (Task Graph Builder)
