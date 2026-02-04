/**
 * Unit Tests for MultiStepEvaluator
 *
 * Run with: node frontend/core/agent/__tests__/multi-step-evaluator.test.mjs
 */

import { createMultiStepEvaluator } from '../multi-step-evaluator.mjs';

console.log('Running MultiStepEvaluator tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function assertRange(actual, min, max, message) {
  if (actual >= min && actual <= max) {
    console.log(`✓ ${message} (value: ${actual.toFixed(2)})`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${min} <= ${actual} <= ${max}`);
    testsFailed++;
  }
}

// Mock effort estimator
function createMockEffortEstimator(complexityOverride = null, riskOverride = null) {
  return {
    estimate: async (alternative, context) => ({
      alternativeId: alternative.id,
      complexity: {
        complexityScore: complexityOverride !== null ? complexityOverride : 3.0,
        complexityLevel: 'moderate',
      },
      risk: {
        riskScore: riskOverride !== null ? riskOverride : 4.0,
        riskLevel: 'moderate',
      },
      iterations: {
        estimate: 2,
        reasoning: 'Mock estimate',
      },
    }),
  };
}

// Mock alignment checker
function createMockAlignmentChecker(alignmentOverride = null) {
  return {
    checkAlignment: async (alternative, context) => ({
      alternativeId: alternative.id,
      alternativeName: alternative.name,
      alignmentScore: alignmentOverride !== null ? alignmentOverride : 0.8,
      relevance: 'high',
      contribution: 'Directly supports the goal',
      reasoning: 'Mock alignment',
      method: 'heuristic',
    }),
  };
}

// Helper: Create test path
function createTestPath(stepCount = 2, overrides = {}) {
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push({
      id: `alt-${i}`,
      name: `Step ${i + 1}`,
      description: `Test step ${i + 1}`,
      confidence: 0.9,
      steps: [
        { tool: 'run_bash', args: {}, expectedOutcome: 'Success' },
      ],
      ...overrides,
    });
  }

  return {
    id: 'path-test',
    steps,
    depth: stepCount,
  };
}

// Test 1: Evaluate single-step path
console.log('Test 1: Evaluate single-step path');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = createTestPath(1);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  assert(result.pathId === 'path-test', 'Should have path ID');
  assert(result.path !== undefined, 'Should have path');
  assert(result.totalEffort !== undefined, 'Should have total effort');
  assert(result.totalRisk !== undefined, 'Should have total risk');
  assert(result.compoundComplexity !== undefined, 'Should have compound complexity');
  assert(result.goalAlignment !== undefined, 'Should have goal alignment');
  assert(result.pathConfidence !== undefined, 'Should have path confidence');
  assert(result.pathScore !== undefined, 'Should have path score');
  assertRange(result.pathScore, 0, 1, 'Path score should be 0-1');
})();
console.log('');

// Test 2: Evaluate multi-step path (2 steps)
console.log('Test 2: Evaluate multi-step path (2 steps)');
await (async () => {
  const effortEstimator = createMockEffortEstimator(3.0, 4.0);
  const alignmentChecker = createMockAlignmentChecker(0.8);
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Total effort should be sum of step efforts
  assert(result.totalEffort === 6.0, `Total effort should be 6.0 (3+3), got ${result.totalEffort}`);

  // Goal alignment should be from final step
  assert(result.goalAlignment === 0.8, 'Goal alignment should be from final step');

  // Path confidence should be product of step confidences
  assertRange(result.pathConfidence, 0.8, 0.82, 'Path confidence should be ~0.81 (0.9^2)');
})();
console.log('');

// Test 3: Risk aggregation - max
console.log('Test 3: Risk aggregation - max');
await (async () => {
  let callCount = 0;
  const effortEstimator = {
    estimate: async () => {
      callCount++;
      return {
        complexity: { complexityScore: 3.0 },
        risk: { riskScore: callCount === 1 ? 3.0 : 7.0 }, // First step low risk, second high
        iterations: { estimate: 2 },
      };
    },
  };
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker, {
    riskAggregation: 'max',
  });

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Should use max risk (7.0)
  assert(result.totalRisk === 7.0, `Total risk should be 7.0 (max), got ${result.totalRisk}`);
})();
console.log('');

// Test 4: Risk aggregation - average
console.log('Test 4: Risk aggregation - average');
await (async () => {
  let callCount = 0;
  const effortEstimator = {
    estimate: async () => {
      callCount++;
      return {
        complexity: { complexityScore: 3.0 },
        risk: { riskScore: callCount === 1 ? 2.0 : 6.0 }, // 2.0 and 6.0
        iterations: { estimate: 2 },
      };
    },
  };
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker, {
    riskAggregation: 'avg',
  });

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Should use average risk (4.0)
  assert(result.totalRisk === 4.0, `Total risk should be 4.0 (avg of 2 and 6), got ${result.totalRisk}`);
})();
console.log('');

// Test 5: Compound complexity calculation
console.log('Test 5: Compound complexity calculation');
await (async () => {
  const effortEstimator = createMockEffortEstimator(5.0, 4.0);
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker, {
    compoundFactor: 1.2, // 20% increase for multi-step
  });

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Base complexity: 5 + 5 = 10
  // Compound: 10 × (1 + (2-1) × (1.2-1)) = 10 × 1.2 = 12
  assert(result.compoundComplexity === 12.0, `Compound complexity should be 12.0, got ${result.compoundComplexity}`);
})();
console.log('');

// Test 6: Path confidence (product of step confidences)
console.log('Test 6: Path confidence (product of step confidences)');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = createTestPath(3, { confidence: 0.9 }); // 3 steps, each 0.9 confidence
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // 0.9^3 = 0.729
  assertRange(result.pathConfidence, 0.72, 0.74, 'Path confidence should be ~0.729 (0.9^3)');
})();
console.log('');

// Test 7: Total iterations
console.log('Test 7: Total iterations');
await (async () => {
  const effortEstimator = {
    estimate: async () => ({
      complexity: { complexityScore: 3.0 },
      risk: { riskScore: 4.0 },
      iterations: { estimate: 2 }, // Each step estimates 2 iterations
    }),
  };
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = createTestPath(3); // 3 steps
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  assert(result.totalIterations === 6, `Total iterations should be 6 (3 steps × 2), got ${result.totalIterations}`);
})();
console.log('');

// Test 8: Evaluate multiple paths
console.log('Test 8: Evaluate multiple paths');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const paths = [
    createTestPath(1, { id: 'alt-1' }),
    createTestPath(2, { id: 'alt-2' }),
    createTestPath(3, { id: 'alt-3' }),
  ];
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const results = await evaluator.evaluatePaths(paths, context);

  assert(results.length === 3, 'Should evaluate all 3 paths');
  assert(results[0].pathScore !== undefined, 'First result should have path score');

  // Results should be sorted by score (highest first)
  if (results.length > 1) {
    assert(results[0].pathScore >= results[1].pathScore, 'Should be sorted by score (descending)');
  }
})();
console.log('');

// Test 9: Low effort path scores higher
console.log('Test 9: Low effort path scores higher');
await (async () => {
  const effortEstimator = {
    estimate: async (alternative, context) => ({
      complexity: { complexityScore: alternative.id === 'alt-1' ? 2.0 : 8.0 }, // alt-1 low effort, alt-2 high
      risk: { riskScore: 4.0 },
      iterations: { estimate: 2 },
    }),
  };
  const alignmentChecker = createMockAlignmentChecker(0.8);
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const paths = [
    { id: 'path-low-effort', steps: [{ id: 'alt-1', name: 'Low effort', confidence: 0.9 }], depth: 1 },
    { id: 'path-high-effort', steps: [{ id: 'alt-2', name: 'High effort', confidence: 0.9 }], depth: 1 },
  ];
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const results = await evaluator.evaluatePaths(paths, context);

  // Low effort path should score higher
  const lowEffortResult = results.find(r => r.pathId === 'path-low-effort');
  const highEffortResult = results.find(r => r.pathId === 'path-high-effort');

  assert(lowEffortResult.pathScore > highEffortResult.pathScore, 'Low effort path should score higher');
})();
console.log('');

// Test 10: High alignment path scores higher
console.log('Test 10: High alignment path scores higher');
await (async () => {
  const effortEstimator = createMockEffortEstimator(3.0, 4.0);
  let pathIndex = 0;
  const alignmentChecker = {
    checkAlignment: async () => ({
      alignmentScore: pathIndex === 0 ? 0.9 : 0.3, // First path high alignment
      relevance: pathIndex === 0 ? 'high' : 'low',
      contribution: 'Mock',
      reasoning: 'Mock',
      method: 'heuristic',
    }),
  };
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const paths = [
    { id: 'path-high-align', steps: [{ id: 'alt-1', name: 'High align', confidence: 0.9 }], depth: 1 },
    { id: 'path-low-align', steps: [{ id: 'alt-2', name: 'Low align', confidence: 0.9 }], depth: 1 },
  ];
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  pathIndex = 0;
  const path1 = await evaluator.evaluatePath(paths[0], context);
  pathIndex = 1;
  const path2 = await evaluator.evaluatePath(paths[1], context);

  assert(path1.pathScore > path2.pathScore, 'High alignment path should score higher');
})();
console.log('');

// Test 11: Custom weights
console.log('Test 11: Custom weights');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker, {
    weights: {
      effort: 0.50,      // Prioritize low effort
      risk: 0.20,
      alignment: 0.20,
      confidence: 0.10,
    },
  });

  const path = createTestPath(1);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  assert(result.pathScore !== undefined, 'Should evaluate with custom weights');
  assertRange(result.pathScore, 0, 1, 'Path score should still be 0-1');
})();
console.log('');

// Test 12: Step efforts and alignments included
console.log('Test 12: Step efforts and alignments included');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  assert(result.stepEfforts !== undefined, 'Should include step efforts');
  assert(result.stepAlignments !== undefined, 'Should include step alignments');
  assert(result.stepEfforts.length === 2, 'Should have 2 step efforts');
  assert(result.stepAlignments.length === 2, 'Should have 2 step alignments');
})();
console.log('');

// Test 13: Weighted risk aggregation
console.log('Test 13: Weighted risk aggregation');
await (async () => {
  let callCount = 0;
  const effortEstimator = {
    estimate: async () => {
      callCount++;
      return {
        complexity: { complexityScore: 3.0 },
        risk: { riskScore: callCount === 1 ? 2.0 : 6.0 }, // First step 2.0, second 6.0
        iterations: { estimate: 2 },
      };
    },
  };
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker, {
    riskAggregation: 'weighted',
  });

  const path = createTestPath(2);
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Weighted: (2×1 + 6×2) / (1+2) = 14/3 = 4.67
  assertRange(result.totalRisk, 4.6, 4.7, 'Weighted risk should be ~4.67');
})();
console.log('');

// Test 14: Empty path
console.log('Test 14: Empty path');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = { id: 'path-empty', steps: [], depth: 0 };
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  assert(result.totalEffort === 0, 'Empty path should have 0 effort');
  assert(result.pathConfidence === 1.0, 'Empty path should have confidence 1.0 (product of empty = 1)');
})();
console.log('');

// Test 15: Default confidence fallback
console.log('Test 15: Default confidence fallback');
await (async () => {
  const effortEstimator = createMockEffortEstimator();
  const alignmentChecker = createMockAlignmentChecker();
  const evaluator = createMultiStepEvaluator(effortEstimator, alignmentChecker);

  const path = {
    id: 'path-no-confidence',
    steps: [
      { id: 'alt-1', name: 'Step 1' }, // No confidence field
    ],
    depth: 1,
  };
  const context = { taskGoal: 'Test goal', cwd: '/test' };

  const result = await evaluator.evaluatePath(path, context);

  // Should use default confidence 0.5
  assert(result.pathConfidence === 0.5, `Path confidence should default to 0.5, got ${result.pathConfidence}`);
})();
console.log('');

// Summary
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\n✓ All MultiStepEvaluator tests passed!\n');
