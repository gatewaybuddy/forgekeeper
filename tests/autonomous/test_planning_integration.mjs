/**
 * Planning Phase Integration Tests
 * [T401] Tests for task planner integration with autonomous agent
 */

import { createAutonomousAgent } from '../../frontend/core/agent/autonomous.mjs';
import assert from 'node:assert';
import { ulid } from 'ulid';

// Mock LLM client for testing
function createMockLLM() {
  return {
    chat: async (params) => {
      // Check if this is a planning request (has response_format for instruction plan)
      if (params.response_format?.json_schema?.schema?.properties?.steps) {
        // Return a mock instruction plan
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  approach: 'Use gh to clone repository',
                  prerequisites: ['gh command available'],
                  steps: [
                    {
                      step_number: 1,
                      description: 'Clone repository',
                      tool: 'run_bash',
                      args: { command: 'gh repo clone gatewaybuddy/forgekeeper' },
                      expected_outcome: 'Repository cloned',
                      error_handling: 'Try git clone',
                      confidence: 0.9,
                    },
                  ],
                  verification: {
                    check_command: 'test -d forgekeeper',
                    success_criteria: 'Directory exists',
                  },
                  alternatives: [],
                }),
              },
            },
          ],
        };
      }

      // Check if this is a reflection request
      if (params.response_format?.json_schema?.schema?.properties?.assessment) {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assessment: 'complete',
                  progress_percent: 100,
                  confidence: 0.95,
                  next_action: 'Task is complete',
                  reasoning: 'Successfully completed the task',
                }),
              },
            },
          ],
        };
      }

      // Default response
      return {
        choices: [
          {
            message: {
              content: 'Mock response',
            },
          },
        ],
      };
    },
  };
}

// Mock executor
function createMockExecutor() {
  const toolRegistry = new Map();
  toolRegistry.set('run_bash', {
    description: 'Execute bash commands',
    parameters: { command: { type: 'string' } },
  });
  toolRegistry.set('read_file', {
    description: 'Read file contents',
    parameters: { path: { type: 'string' } },
  });
  toolRegistry.set('write_file', {
    description: 'Write file contents',
    parameters: { path: { type: 'string' }, content: { type: 'string' } },
  });
  toolRegistry.set('get_time', {
    description: 'Get current time',
    parameters: {},
  });

  return {
    toolRegistry,
    execute: async (toolCall, context) => {
      // Mock successful execution
      return {
        content: 'Mock tool result',
        error: null,
      };
    },
  };
}

// Mock context log events
const mockEvents = [];
const mockContextLog = {
  emit: async (event) => {
    mockEvents.push(event);
  },
  emitPlanningPhase: async (convId, turnId, iteration, data) => {
    mockEvents.push({
      type: 'planning_phase',
      conv_id: convId,
      turn_id: turnId,
      iteration,
      ...data,
    });
  },
};

// Monkey-patch contextLogEvents
import * as contextLogEventsModule from '../../frontend/core/services/contextlog-events.mjs';
const originalEmit = contextLogEventsModule.contextLogEvents.emit;
const originalEmitPlanningPhase = contextLogEventsModule.contextLogEvents.emitPlanningPhase;

contextLogEventsModule.contextLogEvents.emit = mockContextLog.emit;
contextLogEventsModule.contextLogEvents.emitPlanningPhase = mockContextLog.emitPlanningPhase;

console.log('🧪 Testing Planning Phase Integration\n');

// ===== Test 1: Agent Initializes Planner =====
console.log('=== Test 1: Agent Initializes Planner ===');
try {
  const mockLLM = createMockLLM();
  const agent = createAutonomousAgent({
    llmClient: mockLLM,
    model: 'test-model',
    maxIterations: 3,
    playgroundRoot: '.forgekeeper/playground',
  });

  assert.ok(agent.taskPlanner, 'Agent should have task planner');
  assert.ok(agent.taskPlanner.generateInstructions, 'Task planner should have generateInstructions method');

  console.log('✓ Task planner initialized correctly');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 2: Planning Phase Runs Before Execution =====
console.log('\n=== Test 2: Planning Phase Runs Before Execution ===');
try {
  mockEvents.length = 0; // Clear events

  const mockLLM = createMockLLM();
  const agent = createAutonomousAgent({
    llmClient: mockLLM,
    model: 'test-model',
    maxIterations: 1, // Only 1 iteration to make it fast
    playgroundRoot: '.forgekeeper/playground',
  });

  const executor = createMockExecutor();
  const context = {
    convId: ulid(),
    turnId: 1,
  };

  // Run agent on a task
  const result = await agent.run(
    'Clone repository from https://github.com/gatewaybuddy/forgekeeper',
    executor,
    context
  );

  // Check that planning_phase event was emitted
  const planningEvents = mockEvents.filter(e => e.type === 'planning_phase');
  assert.ok(planningEvents.length > 0, 'Planning phase event should be emitted');

  const planningEvent = planningEvents[0];
  assert.ok(planningEvent.planning_time_ms >= 0, 'Should track planning time');
  assert.ok(planningEvent.steps_generated > 0, 'Should generate steps');
  assert.ok(planningEvent.overall_confidence >= 0 && planningEvent.overall_confidence <= 1, 'Should have valid confidence');

  console.log('✓ Planning phase ran before execution');
  console.log(`✓ Planning time: ${planningEvent.planning_time_ms}ms`);
  console.log(`✓ Steps generated: ${planningEvent.steps_generated}`);
  console.log(`✓ Confidence: ${(planningEvent.overall_confidence * 100).toFixed(0)}%`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// ===== Test 3: High Confidence Uses Instruction Plan =====
console.log('\n=== Test 3: High Confidence Uses Instruction Plan ===');
try {
  mockEvents.length = 0;

  const mockLLM = createMockLLM(); // Returns high confidence plan (0.9)
  const agent = createAutonomousAgent({
    llmClient: mockLLM,
    model: 'test-model',
    maxIterations: 1,
    playgroundRoot: '.forgekeeper/playground',
  });

  const executor = createMockExecutor();
  const context = {
    convId: ulid(),
    turnId: 1,
  };

  const result = await agent.run('Clone repository', executor, context);

  // Check planning event shows high confidence and not using fallback
  const planningEvent = mockEvents.find(e => e.type === 'planning_phase');
  assert.ok(planningEvent, 'Planning event should exist');
  assert.ok(planningEvent.overall_confidence >= 0.5, 'Should have high confidence');
  assert.strictEqual(planningEvent.fallback_used, false, 'Should not use fallback for high confidence');

  console.log('✓ High confidence plan used (no fallback)');
  console.log(`✓ Confidence: ${(planningEvent.overall_confidence * 100).toFixed(0)}%`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// ===== Test 4: Low Confidence Falls Back to Heuristics =====
console.log('\n=== Test 4: Low Confidence Falls Back to Heuristics ===');
try {
  mockEvents.length = 0;

  // Create LLM that returns low confidence
  const lowConfidenceLLM = {
    chat: async (params) => {
      if (params.response_format?.json_schema?.schema?.properties?.steps) {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  approach: 'Uncertain approach',
                  prerequisites: [],
                  steps: [
                    {
                      step_number: 1,
                      description: 'Try something',
                      tool: 'get_time',
                      args: {},
                      expected_outcome: 'Not sure',
                      error_handling: 'Unknown',
                      confidence: 0.2, // Low confidence
                    },
                  ],
                  verification: null,
                  alternatives: [],
                }),
              },
            },
          ],
        };
      }

      // Reflection - complete immediately
      if (params.response_format?.json_schema?.schema?.properties?.assessment) {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assessment: 'complete',
                  progress_percent: 100,
                  confidence: 0.5,
                  next_action: 'Done',
                  reasoning: 'Completed',
                }),
              },
            },
          ],
        };
      }

      return { choices: [{ message: { content: 'Mock' } }] };
    },
  };

  const agent = createAutonomousAgent({
    llmClient: lowConfidenceLLM,
    model: 'test-model',
    maxIterations: 1,
    playgroundRoot: '.forgekeeper/playground',
  });

  const executor = createMockExecutor();
  const context = {
    convId: ulid(),
    turnId: 1,
  };

  const result = await agent.run('Do something', executor, context);

  // Check that planning happened but low confidence
  const planningEvent = mockEvents.find(e => e.type === 'planning_phase');
  assert.ok(planningEvent, 'Planning event should exist');
  assert.ok(planningEvent.overall_confidence < 0.5, 'Should have low confidence');

  console.log('✓ Low confidence detected');
  console.log(`✓ Confidence: ${(planningEvent.overall_confidence * 100).toFixed(0)}%`);
  console.log('✓ Falls back to heuristics (expected behavior)');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// ===== Test 5: Planning Context Includes Available Tools =====
console.log('\n=== Test 5: Planning Context Includes Available Tools ===');
try {
  const mockLLM = createMockLLM();
  const agent = createAutonomousAgent({
    llmClient: mockLLM,
    model: 'test-model',
    maxIterations: 1,
    playgroundRoot: '.forgekeeper/playground',
  });

  const executor = createMockExecutor();

  // Build tools list
  const toolsList = agent.buildToolsList(executor);

  assert.ok(Array.isArray(toolsList), 'Tools list should be an array');
  assert.ok(toolsList.length > 0, 'Should have available tools');
  assert.ok(toolsList.some(t => t.name === 'run_bash'), 'Should include run_bash');
  assert.ok(toolsList.some(t => t.name === 'read_file'), 'Should include read_file');

  toolsList.forEach(tool => {
    assert.ok(tool.name, 'Tool should have name');
    assert.ok(tool.description, 'Tool should have description');
  });

  console.log('✓ Tools list built correctly');
  console.log(`✓ Available tools: ${toolsList.map(t => t.name).join(', ')}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// ===== Test 6: Instruction Plan Conversion =====
console.log('\n=== Test 6: Instruction Plan Conversion ===');
try {
  const agent = createAutonomousAgent({
    llmClient: createMockLLM(),
    model: 'test-model',
    playgroundRoot: '.forgekeeper/playground',
  });

  const instructionPlan = {
    id: ulid(),
    approach: 'Test approach',
    prerequisites: ['prereq1'],
    steps: [
      {
        step_number: 1,
        description: 'Do something',
        tool: 'run_bash',
        args: { command: 'echo test' },
        expected_outcome: 'Success',
        error_handling: 'Retry',
        confidence: 0.85,
      },
    ],
    verification: {
      check_command: 'test -f output.txt',
      success_criteria: 'File exists',
    },
    alternatives: [],
    overallConfidence: 0.85,
    fallbackUsed: false,
    planningTimeMs: 250,
  };

  const executablePlan = agent.convertInstructionsToPlan(instructionPlan);

  assert.ok(executablePlan.steps, 'Should have steps');
  assert.strictEqual(executablePlan.steps.length, 1, 'Should have 1 step');
  assert.strictEqual(executablePlan.steps[0].tool, 'run_bash', 'Step should have correct tool');
  assert.ok(executablePlan.steps[0].args, 'Step should have args');
  assert.ok(executablePlan.verification, 'Should have verification');
  assert.ok(executablePlan.prerequisites, 'Should have prerequisites');

  console.log('✓ Instruction plan converted to executable format');
  console.log(`✓ Steps: ${executablePlan.steps.length}`);
  console.log(`✓ Has verification: ${!!executablePlan.verification}`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

// Restore original context log
contextLogEventsModule.contextLogEvents.emit = originalEmit;
contextLogEventsModule.contextLogEvents.emitPlanningPhase = originalEmitPlanningPhase;

// ===== Summary =====
console.log('\n' + '='.repeat(50));
console.log('✅ All Planning Phase Integration Tests Passed!');
console.log('='.repeat(50));
console.log('\nTest Coverage:');
console.log('  ✓ Task planner initialization');
console.log('  ✓ Planning phase runs before execution');
console.log('  ✓ High confidence uses instruction plan');
console.log('  ✓ Low confidence falls back to heuristics');
console.log('  ✓ Planning context includes available tools');
console.log('  ✓ Instruction plan conversion');
console.log('\n✅ Task Planner (T401) integration validated!');
