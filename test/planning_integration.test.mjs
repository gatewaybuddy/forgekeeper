/**
 * Planning Phase Integration Tests
 * [T401] Tests for task planner integration with autonomous agent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAutonomousAgent } from '../core/agent/autonomous.mjs';
import { ulid } from 'ulid';

// Mock LLM client
function createMockLLM(options = {}) {
  return {
    chat: async (params) => {
      // Planning request
      if (params.response_format?.json_schema?.schema?.properties?.steps) {
        const confidence = options.planningConfidence || 0.9;
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
                      confidence,
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

      // Reflection request
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
                  reasoning: 'Successfully completed',
                }),
              },
            },
          ],
        };
      }

      return { choices: [{ message: { content: 'Mock' } }] };
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
    execute: async () => ({ content: 'Mock result', error: null }),
  };
}

describe('Planning Phase Integration (T401)', () => {
  let mockEvents = [];

  beforeEach(() => {
    mockEvents = [];
  });

  it('should initialize task planner in agent', () => {
    const agent = createAutonomousAgent({
      llmClient: createMockLLM(),
      model: 'test-model',
      maxIterations: 3,
      playgroundRoot: '.forgekeeper/playground',
    });

    expect(agent.taskPlanner).toBeDefined();
    expect(agent.taskPlanner.generateInstructions).toBeDefined();
  });

  it('should build tools list from executor', () => {
    const agent = createAutonomousAgent({
      llmClient: createMockLLM(),
      model: 'test-model',
      playgroundRoot: '.forgekeeper/playground',
    });

    const executor = createMockExecutor();
    const toolsList = agent.buildToolsList(executor);

    expect(Array.isArray(toolsList)).toBe(true);
    expect(toolsList.length).toBeGreaterThan(0);
    expect(toolsList.some(t => t.name === 'run_bash')).toBe(true);
    expect(toolsList.some(t => t.name === 'read_file')).toBe(true);

    toolsList.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
    });
  });

  it('should convert instruction plan to executable format', () => {
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

    expect(executablePlan.steps).toBeDefined();
    expect(executablePlan.steps.length).toBe(1);
    expect(executablePlan.steps[0].tool).toBe('run_bash');
    expect(executablePlan.steps[0].args).toBeDefined();
    expect(executablePlan.verification).toBeDefined();
    expect(executablePlan.prerequisites).toBeDefined();
  });

  it('should use high confidence instruction plan', async () => {
    const agent = createAutonomousAgent({
      llmClient: createMockLLM({ planningConfidence: 0.9 }),
      model: 'test-model',
      maxIterations: 1,
      playgroundRoot: '.forgekeeper/playground',
    });

    const executor = createMockExecutor();
    const context = { convId: ulid(), turnId: 1 };

    const result = await agent.run('Clone repository', executor, context);

    expect(result).toBeDefined();
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('should handle low confidence gracefully', async () => {
    const agent = createAutonomousAgent({
      llmClient: createMockLLM({ planningConfidence: 0.2 }),
      model: 'test-model',
      maxIterations: 1,
      playgroundRoot: '.forgekeeper/playground',
    });

    const executor = createMockExecutor();
    const context = { convId: ulid(), turnId: 1 };

    // Should complete even with low confidence (falls back to heuristics)
    const result = await agent.run('Do something', executor, context);

    expect(result).toBeDefined();
    expect(result.iterations).toBeGreaterThan(0);
  });
});
