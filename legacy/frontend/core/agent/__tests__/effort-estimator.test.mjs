/**
 * Unit Tests for EffortEstimator
 *
 * Run with: node frontend/core/agent/__tests__/effort-estimator.test.mjs
 */

import { createEffortEstimator } from '../effort-estimator.mjs';

console.log('Running EffortEstimator tests...\n');

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
    console.log(`✓ ${message} (value: ${actual})`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${min} <= ${actual} <= ${max}`);
    testsFailed++;
  }
}

// Mock episodic memory
function createMockEpisodicMemory(results = []) {
  return {
    search: async (query, options) => {
      return results;
    }
  };
}

// Helper: Create test alternative
function createTestAlternative(overrides = {}) {
  return {
    id: 'alt-test',
    name: 'Test alternative',
    description: 'Test description',
    steps: [
      { tool: 'run_bash', args: {}, description: 'Step 1', expectedOutcome: 'Done' }
    ],
    assumptions: [],
    prerequisites: [],
    confidence: 0.8,
    ...overrides
  };
}

// Test 1: Basic effort estimation
console.log('Test 1: Basic effort estimation');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative();
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assert(estimate.alternativeId === 'alt-test', 'Should have alternative ID');
  assert(estimate.alternativeName === 'Test alternative', 'Should have alternative name');
  assert(estimate.complexity !== undefined, 'Should have complexity');
  assert(estimate.risk !== undefined, 'Should have risk');
  assert(estimate.iterations !== undefined, 'Should have iterations');
  assert(estimate.estimateId !== undefined, 'Should have estimate ID');
  assert(estimate.timestamp !== undefined, 'Should have timestamp');
})();
console.log('');

// Test 2: Complexity score calculation
console.log('Test 2: Complexity score calculation');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    steps: [
      { tool: 'run_bash', args: {}, description: 'Step 1', expectedOutcome: 'Done' },
      { tool: 'read_file', args: {}, description: 'Step 2', expectedOutcome: 'Done' },
      { tool: 'write_file', args: {}, description: 'Step 3', expectedOutcome: 'Done' }
    ],
    assumptions: ['Assumption 1', 'Assumption 2'],
    prerequisites: ['Prereq 1'],
    confidence: 0.7
  });
  const context = {
    availableTools: ['run_bash', 'read_file', 'write_file', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assertRange(estimate.complexity.complexityScore, 0, 10, 'Complexity score should be 0-10');
  assert(['low', 'medium', 'high'].includes(estimate.complexity.complexityLevel), 'Should have complexity level');
  assert(Array.isArray(estimate.complexity.factors), 'Should have complexity factors');
  assert(estimate.complexity.factors.length > 0, 'Should have at least one complexity factor');
})();
console.log('');

// Test 3: Low complexity alternative
console.log('Test 3: Low complexity alternative');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    steps: [{ tool: 'echo', args: {}, description: 'Echo', expectedOutcome: 'Done' }],
    assumptions: [],
    prerequisites: [],
    confidence: 0.95
  });
  const context = {
    availableTools: ['echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assertRange(estimate.complexity.complexityScore, 0, 4, 'Low complexity should be < 4');
  assert(estimate.complexity.complexityLevel === 'low', 'Should be low complexity');
})();
console.log('');

// Test 4: High complexity alternative
console.log('Test 4: High complexity alternative');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    steps: Array(8).fill(null).map((_, i) => ({
      tool: `tool_${i}`,
      args: {},
      description: `Step ${i}`,
      expectedOutcome: 'Done'
    })),
    assumptions: ['A1', 'A2', 'A3', 'A4'],
    prerequisites: ['P1', 'P2', 'P3'],
    confidence: 0.4
  });
  const context = {
    availableTools: Array(10).fill(null).map((_, i) => `tool_${i}`),
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assertRange(estimate.complexity.complexityScore, 6, 10, 'High complexity should be >= 6');
  assert(estimate.complexity.complexityLevel === 'high', 'Should be high complexity');
})();
console.log('');

// Test 5: Risk assessment
console.log('Test 5: Risk assessment');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative();
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assertRange(estimate.risk.riskScore, 0, 10, 'Risk score should be 0-10');
  assert(['low', 'medium', 'high'].includes(estimate.risk.riskLevel), 'Should have risk level');
  assert(Array.isArray(estimate.risk.factors), 'Should have risk factors');
  assert(estimate.risk.factors.length > 0, 'Should have at least one risk factor');
})();
console.log('');

// Test 6: Tool availability risk (low risk - all tools available)
console.log('Test 6: Tool availability risk (low)');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    steps: [
      { tool: 'run_bash', args: {}, description: 'Step 1', expectedOutcome: 'Done' },
      { tool: 'echo', args: {}, description: 'Step 2', expectedOutcome: 'Done' }
    ]
  });
  const context = {
    availableTools: ['run_bash', 'echo', 'read_file'], // All required tools available
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  const toolRisk = estimate.risk.factors.find(f => f.name === 'tool_availability');
  assert(toolRisk !== undefined, 'Should have tool availability risk factor');
  assert(toolRisk.likelihood === 0, 'Should have 0 likelihood when all tools available');
  assert(toolRisk.score === 0, 'Should have 0 risk score when all tools available');
})();
console.log('');

// Test 7: Tool availability risk (high risk - tools unavailable)
console.log('Test 7: Tool availability risk (high)');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    steps: [
      { tool: 'missing_tool', args: {}, description: 'Step 1', expectedOutcome: 'Done' },
      { tool: 'another_missing_tool', args: {}, description: 'Step 2', expectedOutcome: 'Done' }
    ]
  });
  const context = {
    availableTools: ['echo'], // Required tools NOT available
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  const toolRisk = estimate.risk.factors.find(f => f.name === 'tool_availability');
  assert(toolRisk !== undefined, 'Should have tool availability risk factor');
  assert(toolRisk.likelihood === 1.0, 'Should have 1.0 likelihood when all tools unavailable');
  assert(toolRisk.score > 5, 'Should have high risk score when tools unavailable');
})();
console.log('');

// Test 8: Prerequisite risk
console.log('Test 8: Prerequisite risk');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    prerequisites: ['git', 'npm', 'node']
  });
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  const prereqRisk = estimate.risk.factors.find(f => f.name === 'prerequisite_satisfaction');
  assert(prereqRisk !== undefined, 'Should have prerequisite risk factor');
  assert(prereqRisk.likelihood > 0, 'Should have non-zero likelihood with prerequisites');
  assert(prereqRisk.score > 0, 'Should have non-zero risk score with prerequisites');
})();
console.log('');

// Test 9: Iteration estimation
console.log('Test 9: Iteration estimation');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative();
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  assert(typeof estimate.iterations.estimate === 'number', 'Should have iteration estimate');
  assert(estimate.iterations.estimate >= 1, 'Iteration estimate should be >= 1');
  assert(typeof estimate.iterations.min === 'number', 'Should have min iterations');
  assert(typeof estimate.iterations.max === 'number', 'Should have max iterations');
  assert(estimate.iterations.min <= estimate.iterations.estimate, 'Min should be <= estimate');
  assert(estimate.iterations.estimate <= estimate.iterations.max, 'Estimate should be <= max');
})();
console.log('');

// Test 10: Historical data integration
console.log('Test 10: Historical data integration');
await (async () => {
  const historicalEpisodes = [
    {
      description: 'Similar task 1',
      successful: true,
      iterations: 3,
      tools_used: ['run_bash']
    },
    {
      description: 'Similar task 2',
      successful: true,
      iterations: 4,
      tools_used: ['run_bash']
    },
    {
      description: 'Similar task 3',
      successful: true,
      iterations: 5,
      tools_used: ['run_bash']
    }
  ];

  const episodicMemory = createMockEpisodicMemory(historicalEpisodes);
  const estimator = createEffortEstimator(episodicMemory);

  const alternative = createTestAlternative({
    steps: [{ tool: 'run_bash', args: {}, description: 'Bash', expectedOutcome: 'Done' }]
  });
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  // Should use historical estimate (average of 3, 4, 5 = 4)
  assert(estimate.iterations.confidence > 0.5, 'Should have higher confidence with historical data');
})();
console.log('');

// Test 11: Historical failure patterns
console.log('Test 11: Historical failure patterns');
await (async () => {
  const historicalEpisodes = [
    {
      description: 'Failed task 1',
      successful: false,
      iterations: 10,
      tools_used: ['run_bash']
    },
    {
      description: 'Failed task 2',
      successful: false,
      iterations: 8,
      tools_used: ['run_bash']
    },
    {
      description: 'Success task',
      successful: true,
      iterations: 3,
      tools_used: ['run_bash']
    }
  ];

  const episodicMemory = createMockEpisodicMemory(historicalEpisodes);
  const estimator = createEffortEstimator(episodicMemory);

  const alternative = createTestAlternative({
    steps: [{ tool: 'run_bash', args: {}, description: 'Bash', expectedOutcome: 'Done' }]
  });
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  // Should detect historical failures
  const historicalRisk = estimate.risk.factors.find(f => f.name === 'historical_failure');
  assert(historicalRisk !== undefined, 'Should have historical failure risk factor');
  assert(historicalRisk.likelihood > 0.5, 'Should have high likelihood with 2/3 failures');
})();
console.log('');

// Test 12: Estimate all efforts
console.log('Test 12: Estimate all efforts');
await (async () => {
  const estimator = createEffortEstimator();
  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'Alt 1' }),
    createTestAlternative({ id: 'alt-2', name: 'Alt 2' }),
    createTestAlternative({ id: 'alt-3', name: 'Alt 3' })
  ];
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimates = await estimator.estimateAllEfforts(alternatives, context);

  assert(estimates.length === 3, 'Should estimate all 3 alternatives');
  assert(estimates[0].alternativeId === 'alt-1', 'Should preserve order');
  assert(estimates[1].alternativeId === 'alt-2', 'Should preserve order');
  assert(estimates[2].alternativeId === 'alt-3', 'Should preserve order');
})();
console.log('');

// Test 13: Complexity factors present
console.log('Test 13: Complexity factors present');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative();
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  const factorNames = estimate.complexity.factors.map(f => f.name);
  assert(factorNames.includes('step_count'), 'Should have step_count factor');
  assert(factorNames.includes('tool_diversity'), 'Should have tool_diversity factor');
  assert(factorNames.includes('assumptions'), 'Should have assumptions factor');
  assert(factorNames.includes('prerequisites'), 'Should have prerequisites factor');
  assert(factorNames.includes('uncertainty'), 'Should have uncertainty factor');
})();
console.log('');

// Test 14: Risk factors present
console.log('Test 14: Risk factors present');
await (async () => {
  const estimator = createEffortEstimator();
  const alternative = createTestAlternative({
    prerequisites: ['git'],
    assumptions: ['Assumption 1']
  });
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const estimate = await estimator.estimateEffort(alternative, context);

  const factorNames = estimate.risk.factors.map(f => f.name);
  assert(factorNames.includes('tool_availability'), 'Should have tool_availability factor');
  assert(factorNames.includes('prerequisite_satisfaction'), 'Should have prerequisite_satisfaction factor');
  assert(factorNames.includes('assumption_validity'), 'Should have assumption_validity factor');
})();
console.log('');

// Test 15: Fallback estimate on error
console.log('Test 15: Fallback estimate on error');
await (async () => {
  const brokenMemory = {
    search: async () => {
      throw new Error('Memory search failed');
    }
  };

  const estimator = createEffortEstimator(brokenMemory);
  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'Alt 1' })
  ];
  const context = {
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  // Should not throw, should create fallback estimate
  const estimates = await estimator.estimateAllEfforts(alternatives, context);

  assert(estimates.length === 1, 'Should return 1 estimate');
  assert(estimates[0].alternativeId === 'alt-1', 'Should have alternative ID');
  // Fallback should still have basic structure
  assert(estimates[0].complexity !== undefined, 'Should have complexity in fallback');
  assert(estimates[0].risk !== undefined, 'Should have risk in fallback');
  assert(estimates[0].iterations !== undefined, 'Should have iterations in fallback');
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

console.log('\n✓ All EffortEstimator tests passed!\n');
