/**
 * Unit Tests for PlanAlignmentChecker
 *
 * Run with: node frontend/core/agent/__tests__/plan-alignment-checker.test.mjs
 */

import { createPlanAlignmentChecker } from '../plan-alignment-checker.mjs';

console.log('Running PlanAlignmentChecker tests...\n');

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

// Mock LLM client
function createMockLLMClient(scoreOverride = null) {
  return {
    chat: async ({ messages }) => {
      const score = scoreOverride !== null ? scoreOverride : 0.8;
      const alignment = {
        alignmentScore: score,
        contribution: score >= 0.8 ? 'Directly supports the goal' :
                      score >= 0.6 ? 'Contributes to the goal' :
                      score >= 0.4 ? 'May indirectly help' : 'Unclear contribution',
        reasoning: 'LLM-based alignment analysis'
      };

      return {
        choices: [
          {
            message: {
              content: JSON.stringify(alignment)
            }
          }
        ]
      };
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
      { tool: 'run_bash', args: {}, description: 'Step 1' }
    ],
    prerequisites: [],
    ...overrides
  };
}

// Test 1: Basic alignment check (heuristic)
console.log('Test 1: Basic alignment check (heuristic)');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });
  const alternative = createTestAlternative({
    name: 'Install npm packages',
    description: 'Install dependencies using npm'
  });
  const context = {
    taskGoal: 'Install npm dependencies for the project',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assert(result.alternativeId === 'alt-test', 'Should have alternative ID');
  assert(result.alternativeName === 'Install npm packages', 'Should have alternative name');
  assertRange(result.alignmentScore, 0, 1, 'Alignment score should be 0-1');
  assert(['low', 'medium', 'high'].includes(result.relevance), 'Should have relevance level');
  assert(result.contribution !== undefined, 'Should have contribution');
  assert(result.reasoning !== undefined, 'Should have reasoning');
  assert(result.method === 'heuristic', 'Should use heuristic method');
})();
console.log('');

// Test 2: High alignment (strong keyword match)
console.log('Test 2: High alignment (strong keyword match)');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });
  const alternative = createTestAlternative({
    name: 'Install npm dependencies',
    description: 'Run npm install to install project dependencies'
  });
  const context = {
    taskGoal: 'Install npm dependencies for the project',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.7, 1.0, 'Should have high alignment with strong keyword match');
  assert(result.relevance === 'high', 'Should have high relevance');
})();
console.log('');

// Test 3: Low alignment (no keyword match)
console.log('Test 3: Low alignment (no keyword match)');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });
  const alternative = createTestAlternative({
    name: 'Format code',
    description: 'Run prettier to format the codebase'
  });
  const context = {
    taskGoal: 'Deploy application to production',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.0, 0.5, 'Should have low alignment with no keyword match');
  assert(['low', 'medium'].includes(result.relevance), 'Should have low or medium relevance');
})();
console.log('');

// Test 4: Medium alignment (partial keyword match)
console.log('Test 4: Medium alignment (partial keyword match)');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });
  const alternative = createTestAlternative({
    name: 'Build project',
    description: 'Compile and build the project'
  });
  const context = {
    taskGoal: 'Build and deploy the application',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.5, 0.9, 'Should have medium-high alignment with partial match');
})();
console.log('');

// Test 5: LLM-based alignment check
console.log('Test 5: LLM-based alignment check');
await (async () => {
  const llmClient = createMockLLMClient(0.9);
  const checker = createPlanAlignmentChecker(llmClient, 'core', { useLLM: true });

  const alternative = createTestAlternative({
    name: 'Install dependencies',
    description: 'Install required packages'
  });
  const context = {
    taskGoal: 'Set up development environment',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.8, 1.0, 'LLM should provide high alignment score');
  assert(result.method === 'llm', 'Should use LLM method');
  assert(result.relevance === 'high', 'Should have high relevance');
})();
console.log('');

// Test 6: LLM failure fallback to heuristic
console.log('Test 6: LLM failure fallback to heuristic');
await (async () => {
  const brokenLLM = {
    chat: async () => {
      throw new Error('LLM connection failed');
    }
  };
  const checker = createPlanAlignmentChecker(brokenLLM, 'core', { useLLM: true });

  const alternative = createTestAlternative({
    name: 'Install npm packages',
    description: 'Install dependencies'
  });
  const context = {
    taskGoal: 'Install npm dependencies',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assert(result.method === 'heuristic', 'Should fallback to heuristic on LLM failure');
  assertRange(result.alignmentScore, 0, 1, 'Should still provide alignment score');
})();
console.log('');

// Test 7: Action type alignment bonus
console.log('Test 7: Action type alignment bonus');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  // Test install action with install goal
  const alternative = createTestAlternative({
    name: 'Install packages',
    description: 'Install required dependencies'
  });
  const context = {
    taskGoal: 'Install and configure the application',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.6, 1.0, 'Should have bonus for matching action type');
})();
console.log('');

// Test 8: Test action with test goal
console.log('Test 8: Test action with test goal');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternative = createTestAlternative({
    name: 'Run test suite',
    description: 'Execute all tests'
  });
  const context = {
    taskGoal: 'Test the application thoroughly',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.6, 1.0, 'Should have high alignment for test action with test goal');
})();
console.log('');

// Test 9: Build action with build goal
console.log('Test 9: Build action with build goal');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternative = createTestAlternative({
    name: 'Build project',
    description: 'Compile and package'
  });
  const context = {
    taskGoal: 'Build the application for production',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assertRange(result.alignmentScore, 0.6, 1.0, 'Should have high alignment for build action with build goal');
})();
console.log('');

// Test 10: Check all alignments
console.log('Test 10: Check all alignments');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'Install dependencies', description: 'npm install' }),
    createTestAlternative({ id: 'alt-2', name: 'Build project', description: 'npm run build' }),
    createTestAlternative({ id: 'alt-3', name: 'Run tests', description: 'npm test' })
  ];
  const context = {
    taskGoal: 'Install and build the project',
    cwd: '/test'
  };

  const results = await checker.checkAllAlignments(alternatives, context);

  assert(results.length === 3, 'Should check all 3 alternatives');
  assert(results[0].alternativeId === 'alt-1', 'Should preserve order');
  assert(results[1].alternativeId === 'alt-2', 'Should preserve order');
  assert(results[2].alternativeId === 'alt-3', 'Should preserve order');

  // Install should have high alignment
  assertRange(results[0].alignmentScore, 0.6, 1.0, 'Install should align with "install and build"');

  // Build should have high alignment
  assertRange(results[1].alignmentScore, 0.6, 1.0, 'Build should align with "install and build"');

  // Test should have lower alignment (not mentioned in goal)
  assertRange(results[2].alignmentScore, 0.0, 0.7, 'Test should have lower alignment (not in goal)');
})();
console.log('');

// Test 11: Prerequisite bonus
console.log('Test 11: Prerequisite bonus');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternative = createTestAlternative({
    name: 'Setup environment',
    description: 'Configure development environment',
    prerequisites: ['node', 'npm', 'git']
  });
  const context = {
    taskGoal: 'Build application',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  // Should get small bonus for having prerequisites (likely foundational)
  assert(result.alignmentScore >= 0.3, 'Should have bonus for prerequisite action');
})();
console.log('');

// Test 12: Relevance level determination
console.log('Test 12: Relevance level determination');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternatives = [
    createTestAlternative({ id: 'alt-high', name: 'Deploy app', description: 'Deploy to production' }),
    createTestAlternative({ id: 'alt-med', name: 'Test app', description: 'Run some tests' }),
    createTestAlternative({ id: 'alt-low', name: 'Format code', description: 'Format files' })
  ];
  const context = {
    taskGoal: 'Deploy application to production',
    cwd: '/test'
  };

  const results = await checker.checkAllAlignments(alternatives, context);

  // High alignment should have high relevance
  const highResult = results.find(r => r.alternativeId === 'alt-high');
  assert(highResult.relevance === 'high', 'Deploy should have high relevance');

  // Medium alignment should have medium relevance
  const medResult = results.find(r => r.alternativeId === 'alt-med');
  assert(['medium', 'high'].includes(medResult.relevance), 'Test should have medium-high relevance');

  // Low alignment should have low-medium relevance
  const lowResult = results.find(r => r.alternativeId === 'alt-low');
  assert(['low', 'medium'].includes(lowResult.relevance), 'Format should have low-medium relevance');
})();
console.log('');

// Test 13: Metadata fields
console.log('Test 13: Metadata fields');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternative = createTestAlternative();
  const context = {
    taskGoal: 'Complete the task',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assert(result.checkId !== undefined, 'Should have checkId');
  assert(result.timestamp !== undefined, 'Should have timestamp');
  assert(result.elapsedMs !== undefined, 'Should have elapsedMs');
  assert(result.method !== undefined, 'Should have method');
})();
console.log('');

// Test 14: Contribution messages
console.log('Test 14: Contribution messages');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternative = createTestAlternative({
    name: 'Install npm packages',
    description: 'Install project dependencies'
  });
  const context = {
    taskGoal: 'Install dependencies and build project',
    cwd: '/test'
  };

  const result = await checker.checkAlignment(alternative, context);

  assert(typeof result.contribution === 'string', 'Should have contribution string');
  assert(result.contribution.length > 0, 'Contribution should not be empty');
  assert(typeof result.reasoning === 'string', 'Should have reasoning string');
  assert(result.reasoning.length > 0, 'Reasoning should not be empty');
})();
console.log('');

// Test 15: Fallback on error
console.log('Test 15: Fallback on error');
await (async () => {
  const checker = createPlanAlignmentChecker(null, 'core', { useLLM: false });

  const alternatives = [
    createTestAlternative({ id: 'alt-1', name: 'Action 1' })
  ];
  const context = {
    taskGoal: 'Complete task',
    cwd: '/test'
  };

  // Should not throw even if something goes wrong
  const results = await checker.checkAllAlignments(alternatives, context);

  assert(results.length === 1, 'Should return 1 result');
  assert(results[0].alternativeId === 'alt-1', 'Should have alternative ID');
  assert(results[0].alignmentScore !== undefined, 'Should have alignment score');
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

console.log('\n✓ All PlanAlignmentChecker tests passed!\n');
