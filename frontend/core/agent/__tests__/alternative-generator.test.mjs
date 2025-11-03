/**
 * Unit Tests for AlternativeGenerator
 *
 * Run with: node frontend/core/agent/__tests__/alternative-generator.test.mjs
 */

import { createAlternativeGenerator } from '../alternative-generator.mjs';

console.log('Running AlternativeGenerator tests...\n');

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

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    testsFailed++;
  }
}

// Mock LLM client
function createMockLLMClient(responseOverride = null) {
  return {
    chat: async ({ messages, response_format }) => {
      if (responseOverride) {
        return responseOverride;
      }

      // Default: Generate 3 alternatives for testing
      const alternatives = {
        alternatives: [
          {
            name: 'Use npm install',
            description: 'Install using npm package manager',
            steps: [
              {
                tool: 'run_bash',
                args: { script: 'npm install' },
                description: 'Install dependencies',
                expectedOutcome: 'Dependencies installed'
              }
            ],
            assumptions: ['npm is installed'],
            prerequisites: ['npm'],
            confidence: 0.8
          },
          {
            name: 'Use yarn install',
            description: 'Install using yarn package manager',
            steps: [
              {
                tool: 'run_bash',
                args: { script: 'yarn install' },
                description: 'Install dependencies',
                expectedOutcome: 'Dependencies installed'
              }
            ],
            assumptions: ['yarn is installed'],
            prerequisites: ['yarn'],
            confidence: 0.75
          },
          {
            name: 'Manual download',
            description: 'Download packages manually',
            steps: [
              {
                tool: 'run_bash',
                args: { script: 'curl -O package.tar.gz' },
                description: 'Download package',
                expectedOutcome: 'Package downloaded'
              }
            ],
            assumptions: ['curl is installed'],
            prerequisites: ['curl'],
            confidence: 0.6
          }
        ]
      };

      return {
        choices: [
          {
            message: {
              content: JSON.stringify(alternatives)
            }
          }
        ]
      };
    }
  };
}

// Mock episodic memory
function createMockEpisodicMemory(results = []) {
  return {
    search: async (action, options) => {
      return results;
    }
  };
}

// Mock tool effectiveness tracker
function createMockToolEffectiveness(recommendations = []) {
  return {
    getRecommendations: async (taskGoal, recentFailures) => {
      return recommendations;
    }
  };
}

// Test 1: Basic generation (3-5 alternatives)
console.log('Test 1: Basic generation (3-5 alternatives)');
await (async () => {
  const llmClient = createMockLLMClient();
  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Install dependencies',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Install npm packages', context);

  assert(result.alternatives.length >= 3, 'Should generate at least 3 alternatives');
  assert(result.alternatives.length <= 5, 'Should generate at most 5 alternatives');
  assert(result.generationMethod === 'llm_with_historical_context', 'Should use LLM generation');
})();
console.log('');

// Test 2: Alternatives have required fields
console.log('Test 2: Alternatives have required fields');
await (async () => {
  const llmClient = createMockLLMClient();
  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Install dependencies',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Install npm packages', context);

  const alt = result.alternatives[0];
  assert(alt.id !== undefined, 'Alternative should have id');
  assert(alt.name !== undefined, 'Alternative should have name');
  assert(alt.description !== undefined, 'Alternative should have description');
  assert(Array.isArray(alt.steps), 'Alternative should have steps array');
  assert(Array.isArray(alt.assumptions), 'Alternative should have assumptions array');
  assert(Array.isArray(alt.prerequisites), 'Alternative should have prerequisites array');
  assert(typeof alt.confidence === 'number', 'Alternative should have confidence number');
})();
console.log('');

// Test 3: Tool validation (replaces invalid tools)
console.log('Test 3: Tool validation (replaces invalid tools)');
await (async () => {
  const llmClient = createMockLLMClient({
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: [
              {
                name: 'Invalid tool approach',
                description: 'Uses non-existent tool',
                steps: [
                  {
                    tool: 'non_existent_tool',
                    args: { arg: 'value' },
                    description: 'Do something',
                    expectedOutcome: 'Something happens'
                  }
                ],
                assumptions: [],
                prerequisites: [],
                confidence: 0.8
              }
            ]
          })
        }
      }
    ]
  });

  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Test validation',
    availableTools: ['echo'], // Only echo available
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  // Should have replaced invalid tool with echo
  assert(result.alternatives.length >= 1, 'Should have at least 1 alternative');
  const step = result.alternatives[0].steps[0];
  assertEquals(step.tool, 'echo', 'Should replace invalid tool with echo');
})();
console.log('');

// Test 4: Minimum alternatives enforced
console.log('Test 4: Minimum alternatives enforced');
await (async () => {
  const llmClient = createMockLLMClient({
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: [
              {
                name: 'Only one',
                description: 'Single alternative',
                steps: [{ tool: 'echo', args: {}, description: 'Test', expectedOutcome: 'Test' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.8
              }
            ]
          })
        }
      }
    ]
  });

  const generator = createAlternativeGenerator(llmClient, 'test-model', null, null, {
    minAlternatives: 3
  });

  const context = {
    taskGoal: 'Test minimum',
    availableTools: ['echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  assert(result.alternatives.length >= 3, 'Should add fallback to meet minimum (3)');
})();
console.log('');

// Test 5: Maximum alternatives enforced
console.log('Test 5: Maximum alternatives enforced');
await (async () => {
  const llmClient = createMockLLMClient({
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: Array(10).fill(null).map((_, i) => ({
              name: `Alternative ${i + 1}`,
              description: `Approach ${i + 1}`,
              steps: [{ tool: 'echo', args: {}, description: 'Test', expectedOutcome: 'Test' }],
              assumptions: [],
              prerequisites: [],
              confidence: 0.8
            }))
          })
        }
      }
    ]
  });

  const generator = createAlternativeGenerator(llmClient, 'test-model', null, null, {
    maxAlternatives: 5
  });

  const context = {
    taskGoal: 'Test maximum',
    availableTools: ['echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  assertEquals(result.alternatives.length, 5, 'Should limit to max (5) alternatives');
})();
console.log('');

// Test 6: Integration with episodic memory
console.log('Test 6: Integration with episodic memory');
await (async () => {
  const similarTasks = [
    {
      description: 'Install React dependencies',
      successful: true,
      tools_used: ['run_bash'],
      approach: 'Used npm install',
      iterations: 2
    }
  ];

  const llmClient = createMockLLMClient();
  const episodicMemory = createMockEpisodicMemory(similarTasks);
  const generator = createAlternativeGenerator(llmClient, 'test-model', episodicMemory);

  const context = {
    taskGoal: 'Install dependencies',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Install npm packages', context);

  assert(result.alternatives.length >= 3, 'Should generate alternatives with episodic memory');
  assert(result.generationMethod === 'llm_with_historical_context', 'Should use LLM with history');
})();
console.log('');

// Test 7: Integration with tool effectiveness
console.log('Test 7: Integration with tool effectiveness');
await (async () => {
  const toolRecs = [
    {
      tool: 'run_bash',
      reason: 'High success rate for installations',
      successRate: 0.9
    }
  ];

  const llmClient = createMockLLMClient();
  const toolEffectiveness = createMockToolEffectiveness(toolRecs);
  const generator = createAlternativeGenerator(llmClient, 'test-model', null, toolEffectiveness);

  const context = {
    taskGoal: 'Install dependencies',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Install npm packages', context);

  assert(result.alternatives.length >= 3, 'Should generate alternatives with tool effectiveness');
})();
console.log('');

// Test 8: Fallback on LLM failure
console.log('Test 8: Fallback on LLM failure');
await (async () => {
  const llmClient = {
    chat: async () => {
      throw new Error('LLM connection failed');
    }
  };

  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Clone repository',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Clone GitHub repo', context);

  assert(result.alternatives.length >= 1, 'Should create fallback alternatives on LLM failure');
  assert(result.generationMethod === 'heuristic_fallback', 'Should use heuristic fallback');
  assert(result.error !== undefined, 'Should document error');
})();
console.log('');

// Test 9: Diversity checking
console.log('Test 9: Diversity checking');
await (async () => {
  // Mock response with low diversity (all use same tool sequence)
  const llmClient = createMockLLMClient({
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: [
              {
                name: 'Approach 1',
                description: 'First approach',
                steps: [{ tool: 'run_bash', args: { script: 'cmd1' }, description: 'Step 1', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.8
              },
              {
                name: 'Approach 2',
                description: 'Second approach',
                steps: [{ tool: 'run_bash', args: { script: 'cmd2' }, description: 'Step 2', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.7
              },
              {
                name: 'Approach 3',
                description: 'Third approach',
                steps: [{ tool: 'run_bash', args: { script: 'cmd3' }, description: 'Step 3', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.6
              }
            ]
          })
        }
      }
    ]
  });

  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Test diversity',
    availableTools: ['run_bash', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  // All alternatives use 'run_bash' so diversity is low (33% unique - only 1 sequence)
  // Generator should still return alternatives (with warning logged)
  assert(result.alternatives.length >= 3, 'Should still return alternatives even with low diversity');
})();
console.log('');

// Test 10: High diversity alternatives
console.log('Test 10: High diversity alternatives');
await (async () => {
  // Mock response with high diversity (different tool sequences)
  const llmClient = createMockLLMClient({
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: [
              {
                name: 'Bash approach',
                description: 'Use bash',
                steps: [{ tool: 'run_bash', args: {}, description: 'Run', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.8
              },
              {
                name: 'Read approach',
                description: 'Read first',
                steps: [{ tool: 'read_file', args: {}, description: 'Read', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.7
              },
              {
                name: 'Echo approach',
                description: 'Echo message',
                steps: [{ tool: 'echo', args: {}, description: 'Echo', expectedOutcome: 'Done' }],
                assumptions: [],
                prerequisites: [],
                confidence: 0.6
              }
            ]
          })
        }
      }
    ]
  });

  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Test high diversity',
    availableTools: ['run_bash', 'read_file', 'echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  assert(result.alternatives.length === 3, 'Should have 3 diverse alternatives');
  // Diversity should be 100% (3 unique sequences / 3 alternatives)
  const tools = result.alternatives.map(alt => alt.steps.map(s => s.tool).join('→'));
  const uniqueTools = new Set(tools);
  assertEquals(uniqueTools.size, 3, 'Should have 3 unique tool sequences (100% diversity)');
})();
console.log('');

// Test 11: Metadata fields
console.log('Test 11: Metadata fields');
await (async () => {
  const llmClient = createMockLLMClient();
  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Test metadata',
    availableTools: ['echo'],
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  assert(result.generationId !== undefined, 'Should have generationId');
  assert(result.timestamp !== undefined, 'Should have timestamp');
  assert(result.generationMethod !== undefined, 'Should have generationMethod');
  assert(result.elapsedMs !== undefined, 'Should have elapsedMs');
})();
console.log('');

// Test 12: Empty available tools
console.log('Test 12: Empty available tools');
await (async () => {
  const llmClient = createMockLLMClient();
  const generator = createAlternativeGenerator(llmClient, 'test-model');

  const context = {
    taskGoal: 'Test with no tools',
    availableTools: [], // No tools available
    cwd: '/test'
  };

  const result = await generator.generateAlternatives('Do something', context);

  assert(result.alternatives.length >= 1, 'Should still generate alternatives');
  // All tool calls should be replaced with echo
  const allStepsValid = result.alternatives.every(alt =>
    alt.steps.every(step => step.tool === 'echo')
  );
  assert(allStepsValid, 'Should replace all invalid tools with echo');
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

console.log('\n✓ All AlternativeGenerator tests passed!\n');
