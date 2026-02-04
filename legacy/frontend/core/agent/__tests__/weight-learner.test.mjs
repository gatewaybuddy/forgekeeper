/**
 * Unit Tests for WeightLearner
 *
 * Run with: node frontend/core/agent/__tests__/weight-learner.test.mjs
 */

import { createWeightLearner } from '../weight-learner.mjs';

console.log('Running WeightLearner tests...\n');

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

// Mock outcome tracker
function createMockOutcomeTracker(outcomes = []) {
  return {
    queryOutcomes: async (filters) => {
      // Filter outcomes by taskCategory
      if (filters.taskCategory) {
        return outcomes.filter(o => o.taskCategory === filters.taskCategory);
      }
      return outcomes;
    },
  };
}

// Test 1: No outcomes - use defaults
console.log('Test 1: No outcomes - use defaults');
await (async () => {
  const tracker = createMockOutcomeTracker([]);
  const learner = createWeightLearner(tracker);

  const result = await learner.learnWeights('install');

  assert(result.method === 'default', 'Should use default method');
  assert(result.confidence === 0, 'Should have 0 confidence');
  assert(result.dataPoints === 0, 'Should have 0 data points');
  assert(result.weights.effort === 0.35, 'Should use default effort weight');
  assert(result.weights.risk === 0.25, 'Should use default risk weight');
  assert(result.weights.alignment === 0.30, 'Should use default alignment weight');
  assert(result.weights.confidence === 0.10, 'Should use default confidence weight');
})();
console.log('');

// Test 2: Few outcomes (< 10) - use defaults
console.log('Test 2: Few outcomes (< 10) - use defaults');
await (async () => {
  const outcomes = [
    { taskCategory: 'install', outcome: 'success', weights: { effort: 0.5, risk: 0.2, alignment: 0.2, confidence: 0.1 } },
    { taskCategory: 'install', outcome: 'success', weights: { effort: 0.5, risk: 0.2, alignment: 0.2, confidence: 0.1 } },
  ];
  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker, { minOutcomes: 10 });

  const result = await learner.learnWeights('install');

  assert(result.method === 'default', 'Should use default method (not enough data)');
  assert(result.dataPoints === 2, 'Should have 2 data points');
})();
console.log('');

// Test 3: Moderate outcomes (10-50) - blend
console.log('Test 3: Moderate outcomes (10-50) - blend');
await (async () => {
  const outcomes = [];
  for (let i = 0; i < 20; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }
  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker, { minOutcomes: 10, blendThreshold: 50 });

  const result = await learner.learnWeights('install');

  assert(result.method === 'blended', 'Should use blended method');
  assertRange(result.confidence, 0.35, 0.45, 'Confidence should be ~0.4 (20/50)');
  assert(result.dataPoints === 20, 'Should have 20 data points');

  // Weights should be blend of learned (0.5, 0.2, 0.2, 0.1) and default (0.35, 0.25, 0.30, 0.10)
  // Blend ratio: 20/50 = 0.4
  // Effort: 0.5 × 0.4 + 0.35 × 0.6 = 0.2 + 0.21 = 0.41
  assertRange(result.weights.effort, 0.40, 0.42, 'Effort weight should be blended');
})();
console.log('');

// Test 4: Many outcomes (> 50) - use learned
console.log('Test 4: Many outcomes (> 50) - use learned');
await (async () => {
  const outcomes = [];
  for (let i = 0; i < 60; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }
  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker, { minOutcomes: 10, blendThreshold: 50 });

  const result = await learner.learnWeights('install');

  assert(result.method === 'learned', 'Should use learned method');
  assert(result.confidence === 1.0, 'Should have full confidence (60/50 capped at 1.0)');
  assert(result.dataPoints === 60, 'Should have 60 data points');

  // Weights should be fully learned (no blending)
  assertRange(result.weights.effort, 0.49, 0.51, 'Effort weight should be fully learned');
  assertRange(result.weights.risk, 0.19, 0.21, 'Risk weight should be fully learned');
})();
console.log('');

// Test 5: No successful outcomes - use defaults
console.log('Test 5: No successful outcomes - use defaults');
await (async () => {
  const outcomes = [];
  for (let i = 0; i < 15; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'failure',
      weights: { effort: 0.5, risk: 0.2, alignment: 0.2, confidence: 0.1 },
    });
  }
  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker);

  const result = await learner.learnWeights('install');

  assert(result.method === 'default', 'Should use defaults (no successes)');
  assert(result.dataPoints === 15, 'Should have 15 data points');
})();
console.log('');

// Test 6: Learn from successes + failures
console.log('Test 6: Learn from successes + failures');
await (async () => {
  const outcomes = [];

  // Successes with high effort weight
  for (let i = 0; i < 30; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }

  // Failures with low effort weight
  for (let i = 0; i < 10; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'failure',
      weights: { effort: 0.20, risk: 0.40, alignment: 0.30, confidence: 0.10 },
    });
  }

  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker, { learningRate: 0.1 });

  const result = await learner.learnWeights('install');

  assert(result.dataPoints === 40, 'Should have 40 data points');
  assert(result.successRate === 0.75, 'Success rate should be 75% (30/40)');

  // Learned weights should move toward success pattern (high effort) and away from failure pattern (low effort)
  // Success avg effort: 0.50
  // Failure avg effort: 0.20
  // Learned: 0.50 + (0.50 - 0.20) × 0.1 = 0.50 + 0.03 = 0.53 (before normalization)
  // After normalization and blending, effort should be higher than default 0.35
  assert(result.weights.effort > 0.35, `Effort weight should increase (learned from successes), got ${result.weights.effort.toFixed(2)}`);
})();
console.log('');

// Test 7: Weight normalization
console.log('Test 7: Weight normalization');
await (async () => {
  const outcomes = [];
  for (let i = 0; i < 60; i++) {
    outcomes.push({
      taskCategory: 'test',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }
  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker);

  const result = await learner.learnWeights('test');

  // All weights should sum to 1.0
  const sum = result.weights.effort + result.weights.risk + result.weights.alignment + result.weights.confidence;
  assert(Math.abs(sum - 1.0) < 0.01, `Weights should sum to 1.0, got ${sum.toFixed(2)}`);
})();
console.log('');

// Test 8: Different task categories
console.log('Test 8: Different task categories');
await (async () => {
  const outcomes = [];

  // Install outcomes: high effort weight
  for (let i = 0; i < 60; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }

  // Test outcomes: high alignment weight
  for (let i = 0; i < 60; i++) {
    outcomes.push({
      taskCategory: 'test',
      outcome: 'success',
      weights: { effort: 0.20, risk: 0.20, alignment: 0.50, confidence: 0.10 },
    });
  }

  const tracker = createMockOutcomeTracker(outcomes);
  const learner = createWeightLearner(tracker);

  const installResult = await learner.learnWeights('install');
  const testResult = await learner.learnWeights('test');

  // Install should have higher effort weight
  assert(installResult.weights.effort > testResult.weights.effort, 'Install should prioritize effort more');

  // Test should have higher alignment weight
  assert(testResult.weights.alignment > installResult.weights.alignment, 'Test should prioritize alignment more');
})();
console.log('');

// Test 9: Blend ratio calculation
console.log('Test 9: Blend ratio calculation');
await (async () => {
  const tracker1 = createMockOutcomeTracker(Array(25).fill({ taskCategory: 'install', outcome: 'success', weights: { effort: 0.5, risk: 0.2, alignment: 0.2, confidence: 0.1 } }));
  const learner1 = createWeightLearner(tracker1, { blendThreshold: 50 });
  const result1 = await learner1.learnWeights('install');

  // 25/50 = 0.5 blend ratio
  assertRange(result1.confidence, 0.49, 0.51, 'Blend ratio should be 0.5 for 25 outcomes');

  const tracker2 = createMockOutcomeTracker(Array(75).fill({ taskCategory: 'install', outcome: 'success', weights: { effort: 0.5, risk: 0.2, alignment: 0.2, confidence: 0.1 } }));
  const learner2 = createWeightLearner(tracker2, { blendThreshold: 50 });
  const result2 = await learner2.learnWeights('install');

  // 75/50 = 1.5 → capped at 1.0
  assert(result2.confidence === 1.0, 'Blend ratio should be capped at 1.0 for 75 outcomes');
})();
console.log('');

// Test 10: Custom learning rate
console.log('Test 10: Custom learning rate');
await (async () => {
  const outcomes = [];

  // Successes
  for (let i = 0; i < 30; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'success',
      weights: { effort: 0.50, risk: 0.20, alignment: 0.20, confidence: 0.10 },
    });
  }

  // Failures
  for (let i = 0; i < 10; i++) {
    outcomes.push({
      taskCategory: 'install',
      outcome: 'failure',
      weights: { effort: 0.20, risk: 0.40, alignment: 0.30, confidence: 0.10 },
    });
  }

  const trackerLow = createMockOutcomeTracker(outcomes);
  const learnerLow = createWeightLearner(trackerLow, { learningRate: 0.05 }); // Low learning rate

  const trackerHigh = createMockOutcomeTracker(outcomes);
  const learnerHigh = createWeightLearner(trackerHigh, { learningRate: 0.5 }); // High learning rate

  const resultLow = await learnerLow.learnWeights('install');
  const resultHigh = await learnerHigh.learnWeights('install');

  // Higher learning rate should diverge more from defaults
  assert(resultHigh.weights.effort !== resultLow.weights.effort, 'Different learning rates should produce different weights');
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

console.log('\n✓ All WeightLearner tests passed!\n');
