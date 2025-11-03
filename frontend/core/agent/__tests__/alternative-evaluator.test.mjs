/**
 * Unit Tests for AlternativeEvaluator
 *
 * Run with: node frontend/core/agent/__tests__/alternative-evaluator.test.mjs
 */

import { createAlternativeEvaluator } from '../alternative-evaluator.mjs';

console.log('Running AlternativeEvaluator tests...\n');

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

// Helper: Create test alternative
function createTestAlternative(overrides = {}) {
  return {
    id: 'alt-test',
    name: 'Test alternative',
    description: 'Test description',
    steps: [{ tool: 'run_bash', args: {}, description: 'Step 1' }],
    assumptions: [],
    prerequisites: [],
    confidence: 0.8,
    ...overrides
  };
}

// Helper: Create test effort estimate
function createTestEffort(overrides = {}) {
  return {
    alternativeId: 'alt-test',
    alternativeName: 'Test alternative',
    complexity: { complexityScore: 3.0, complexityLevel: 'medium' },
    risk: { riskScore: 2.0, riskLevel: 'low' },
    iterations: { estimate: 3, min: 1, max: 5 },
    ...overrides
  };
}

// Helper: Create test alignment result
function createTestAlignment(overrides = {}) {
  return {
    alternativeId: 'alt-test',
    alternativeName: 'Test alternative',
    alignmentScore: 0.8,
    relevance: 'high',
    contribution: 'Directly supports goal',
    ...overrides
  };
}

// Test 1: Basic evaluation
console.log('Test 1: Basic evaluation');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.rankedAlternatives.length === 1, 'Should have 1 ranked alternative');
  assert(result.chosen !== undefined, 'Should have chosen alternative');
  assert(result.weights !== undefined, 'Should have weights');
  assert(result.evaluationId !== undefined, 'Should have evaluation ID');
  assert(result.timestamp !== undefined, 'Should have timestamp');
}
console.log('');

// Test 2: Ranking by overall score
console.log('Test 2: Ranking by overall score');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'High effort', confidence: 0.7 }),
    createTestAlternative({ id: 'alt-2', name: 'Low effort', confidence: 0.9 }),
    createTestAlternative({ id: 'alt-3', name: 'Medium effort', confidence: 0.8 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-1', complexity: { complexityScore: 8.0 }, risk: { riskScore: 7.0 }, iterations: { estimate: 8 } }),
    createTestEffort({ alternativeId: 'alt-2', complexity: { complexityScore: 2.0 }, risk: { riskScore: 1.0 }, iterations: { estimate: 2 } }),
    createTestEffort({ alternativeId: 'alt-3', complexity: { complexityScore: 5.0 }, risk: { riskScore: 4.0 }, iterations: { estimate: 5 } })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-1', alignmentScore: 0.7 }),
    createTestAlignment({ alternativeId: 'alt-2', alignmentScore: 0.9 }),
    createTestAlignment({ alternativeId: 'alt-3', alignmentScore: 0.8 })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.rankedAlternatives.length === 3, 'Should have 3 ranked alternatives');
  assert(result.rankedAlternatives[0].rank === 1, 'First should have rank 1');
  assert(result.rankedAlternatives[1].rank === 2, 'Second should have rank 2');
  assert(result.rankedAlternatives[2].rank === 3, 'Third should have rank 3');

  // Low effort + high alignment should rank highest
  assert(result.rankedAlternatives[0].alternativeId === 'alt-2', 'Low effort alternative should rank first');
  assert(result.chosen.alternativeId === 'alt-2', 'Low effort alternative should be chosen');
}
console.log('');

// Test 3: Score breakdown
console.log('Test 3: Score breakdown');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);
  const ranked = result.rankedAlternatives[0];

  assert(ranked.score_breakdown !== undefined, 'Should have score breakdown');
  assert(ranked.score_breakdown.effort !== undefined, 'Should have effort score');
  assert(ranked.score_breakdown.risk !== undefined, 'Should have risk score');
  assert(ranked.score_breakdown.alignment !== undefined, 'Should have alignment score');
  assert(ranked.score_breakdown.confidence !== undefined, 'Should have confidence score');
  assertRange(ranked.overall_score, 0, 1, 'Overall score should be 0-1');
}
console.log('');

// Test 4: Raw metrics included
console.log('Test 4: Raw metrics included');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);
  const ranked = result.rankedAlternatives[0];

  assert(ranked.raw_metrics !== undefined, 'Should have raw metrics');
  assert(ranked.raw_metrics.complexity === 3.0, 'Should have complexity score');
  assert(ranked.raw_metrics.risk === 2.0, 'Should have risk score');
  assert(ranked.raw_metrics.iterations === 3, 'Should have iterations');
  assert(ranked.raw_metrics.alignment === 0.8, 'Should have alignment score');
  assert(ranked.raw_metrics.confidence === 0.8, 'Should have confidence');
}
console.log('');

// Test 5: Justification provided
console.log('Test 5: Justification provided');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'First', confidence: 0.8 }),
    createTestAlternative({ id: 'alt-2', name: 'Second', confidence: 0.7 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-1', complexity: { complexityScore: 2.0 }, iterations: { estimate: 2 } }),
    createTestEffort({ alternativeId: 'alt-2', complexity: { complexityScore: 5.0 }, iterations: { estimate: 5 } })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-1', alignmentScore: 0.9 }),
    createTestAlignment({ alternativeId: 'alt-2', alignmentScore: 0.7 })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.chosen.justification !== undefined, 'Should have justification');
  assert(typeof result.chosen.justification === 'string', 'Justification should be string');
  assert(result.chosen.justification.length > 0, 'Justification should not be empty');
  assert(result.chosen.justification.includes('overall score'), 'Should mention overall score');
}
console.log('');

// Test 6: Custom weights
console.log('Test 6: Custom weights');
{
  const evaluator = createAlternativeEvaluator({
    weights: {
      effort: 0.5,      // 50% effort weight
      risk: 0.2,        // 20% risk weight
      alignment: 0.2,   // 20% alignment weight
      confidence: 0.1   // 10% confidence weight
    }
  });

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.weights.effort === 0.5, 'Should use custom effort weight');
  assert(result.weights.risk === 0.2, 'Should use custom risk weight');
  assert(result.weights.alignment === 0.2, 'Should use custom alignment weight');
  assert(result.weights.confidence === 0.1, 'Should use custom confidence weight');
}
console.log('');

// Test 7: High alignment vs low effort (alignment weight test)
console.log('Test 7: High alignment vs low effort');
{
  const evaluator = createAlternativeEvaluator({
    weights: {
      effort: 0.2,       // Lower effort weight
      risk: 0.2,
      alignment: 0.5,    // Higher alignment weight
      confidence: 0.1
    }
  });

  const alternatives = [
    createTestAlternative({ id: 'alt-high-align', name: 'High alignment', confidence: 0.7 }),
    createTestAlternative({ id: 'alt-low-effort', name: 'Low effort', confidence: 0.7 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-high-align', complexity: { complexityScore: 8.0 }, iterations: { estimate: 8 } }),
    createTestEffort({ alternativeId: 'alt-low-effort', complexity: { complexityScore: 2.0 }, iterations: { estimate: 2 } })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-high-align', alignmentScore: 0.95 }),
    createTestAlignment({ alternativeId: 'alt-low-effort', alignmentScore: 0.5 })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  // With high alignment weight, high alignment should win despite higher effort
  assert(result.chosen.alternativeId === 'alt-high-align', 'High alignment should win with high alignment weight');
}
console.log('');

// Test 8: Single alternative
console.log('Test 8: Single alternative');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.rankedAlternatives.length === 1, 'Should have 1 ranked alternative');
  assert(result.rankedAlternatives[0].rank === 1, 'Should have rank 1');
  assert(result.chosen.alternativeId === 'alt-test', 'Should choose the only alternative');
  assert(result.chosen.chosen === true, 'Should mark as chosen');
}
console.log('');

// Test 9: Missing effort/alignment (fallback defaults)
console.log('Test 9: Missing effort/alignment (fallback defaults)');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'With data' }),
    createTestAlternative({ id: 'alt-2', name: 'Without data' })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-1' })
    // Missing effort for alt-2
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-1' })
    // Missing alignment for alt-2
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.rankedAlternatives.length === 2, 'Should evaluate both alternatives');
  // Alternative with data should rank higher
  assert(result.rankedAlternatives[0].alternativeId === 'alt-1', 'Alternative with data should rank first');
}
console.log('');

// Test 10: Tied scores
console.log('Test 10: Tied scores');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'First', confidence: 0.8 }),
    createTestAlternative({ id: 'alt-2', name: 'Second', confidence: 0.8 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-1' }),
    createTestEffort({ alternativeId: 'alt-2' })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-1' }),
    createTestAlignment({ alternativeId: 'alt-2' })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.rankedAlternatives.length === 2, 'Should have 2 ranked alternatives');
  // When tied, first alternative wins (stable sort)
  assert(result.chosen.alternativeId !== undefined, 'Should choose one alternative');
}
console.log('');

// Test 11: Confidence impact
console.log('Test 11: Confidence impact');
{
  const evaluator = createAlternativeEvaluator({
    weights: {
      effort: 0.3,
      risk: 0.2,
      alignment: 0.3,
      confidence: 0.2  // Higher confidence weight
    }
  });

  const alternatives = [
    createTestAlternative({ id: 'alt-high-conf', name: 'High confidence', confidence: 0.95 }),
    createTestAlternative({ id: 'alt-low-conf', name: 'Low confidence', confidence: 0.4 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-high-conf' }),
    createTestEffort({ alternativeId: 'alt-low-conf' })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-high-conf' }),
    createTestAlignment({ alternativeId: 'alt-low-conf' })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  // High confidence should rank higher
  assert(result.rankedAlternatives[0].alternativeId === 'alt-high-conf', 'High confidence should rank first');
}
console.log('');

// Test 12: Risk impact
console.log('Test 12: Risk impact');
{
  const evaluator = createAlternativeEvaluator({
    weights: {
      effort: 0.2,
      risk: 0.5,      // High risk weight
      alignment: 0.2,
      confidence: 0.1
    }
  });

  const alternatives = [
    createTestAlternative({ id: 'alt-low-risk', name: 'Low risk', confidence: 0.7 }),
    createTestAlternative({ id: 'alt-high-risk', name: 'High risk', confidence: 0.7 })
  ];

  const efforts = [
    createTestEffort({ alternativeId: 'alt-low-risk', risk: { riskScore: 1.0, riskLevel: 'low' } }),
    createTestEffort({ alternativeId: 'alt-high-risk', risk: { riskScore: 9.0, riskLevel: 'high' } })
  ];

  const alignments = [
    createTestAlignment({ alternativeId: 'alt-low-risk' }),
    createTestAlignment({ alternativeId: 'alt-high-risk' })
  ];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  // Low risk should rank higher with high risk weight
  assert(result.rankedAlternatives[0].alternativeId === 'alt-low-risk', 'Low risk should rank first');
}
console.log('');

// Test 13: Iteration estimation in raw metrics
console.log('Test 13: Iteration estimation in raw metrics');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort({ iterations: { estimate: 7, min: 5, max: 10 } })];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.chosen.raw_metrics.iterations === 7, 'Should include iteration estimate');
  assert(result.chosen.justification.includes('7 iteration'), 'Justification should mention iterations');
}
console.log('');

// Test 14: Complexity levels in raw metrics
console.log('Test 14: Complexity levels in raw metrics');
{
  const evaluator = createAlternativeEvaluator();

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort({ complexity: { complexityScore: 7.5, complexityLevel: 'high' } })];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  assert(result.chosen.raw_metrics.complexityLevel === 'high', 'Should include complexity level');
  assert(result.chosen.raw_metrics.complexity === 7.5, 'Should include complexity score');
}
console.log('');

// Test 15: Weight normalization
console.log('Test 15: Weight normalization');
{
  const evaluator = createAlternativeEvaluator({
    weights: {
      effort: 0.4,
      risk: 0.3,
      alignment: 0.3,
      confidence: 0.2  // Sum = 1.2 (invalid)
    }
  });

  const alternatives = [createTestAlternative()];
  const efforts = [createTestEffort()];
  const alignments = [createTestAlignment()];

  const result = evaluator.evaluateAlternatives(alternatives, efforts, alignments);

  // Weights should be normalized
  const weightSum = result.weights.effort + result.weights.risk + result.weights.alignment + result.weights.confidence;
  assertRange(weightSum, 0.99, 1.01, 'Normalized weights should sum to 1.0');
}
console.log('');

// Summary
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\n✓ All AlternativeEvaluator tests passed!\n');
