/**
 * Unit tests for LLMClient orchestrator module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMClient } from '../../core/agent/orchestrator/llm-client.mjs';
import { createMockLLMClient, createMockReflection, createMockCompletion } from '../utils/mock-llm-client.mjs';
import { mockAgentState, mockReflection, mockToolResult, mockFailedToolResult } from '../utils/fixtures.mjs';

describe('LLMClient', () => {
  let llmClient;
  let mockLLM;
  let mockDiagnosticReflection;

  beforeEach(() => {
    mockLLM = createMockLLMClient({
      responses: [
        createMockCompletion(createMockReflection())
      ]
    });

    mockDiagnosticReflection = {
      runDiagnosticReflection: vi.fn().mockResolvedValue({
        whyChain: ['Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5'],
        rootCause: 'Test root cause',
        recoveryStrategy: 'Test recovery strategy'
      })
    };

    llmClient = new LLMClient(
      { chat: (params) => mockLLM.chat.completions.create(params) },
      'test-model',
      mockDiagnosticReflection
    );
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(llmClient.llmClient).toBeDefined();
      expect(llmClient.model).toBe('test-model');
      expect(llmClient.diagnosticReflection).toBe(mockDiagnosticReflection);
    });
  });

  describe('detectTaskType', () => {
    it('should detect exploratory tasks with uncertain patterns', () => {
      const taskType = llmClient.detectTaskType('See if there is an authentication system');
      expect(taskType).toBe('exploratory');
    });

    it('should detect documentation tasks', () => {
      const taskType = llmClient.detectTaskType('Update the README with new features');
      expect(taskType).toBe('documentation');
    });

    it('should detect research tasks', () => {
      const taskType = llmClient.detectTaskType('Analyze the performance bottlenecks');
      expect(taskType).toBe('research');
    });

    it('should detect multi-step tasks with test creation', () => {
      const taskType = llmClient.detectTaskType('Write tests for the authentication module');
      expect(taskType).toBe('multi-step');
    });

    it('should detect self-improvement tasks', () => {
      const taskType = llmClient.detectTaskType('Refactor the user service to improve performance');
      expect(taskType).toBe('self-improvement');
    });

    it('should detect multi-step tasks with multiple files', () => {
      const taskType = llmClient.detectTaskType('Update 5 files to use new API');
      expect(taskType).toBe('multi-step');
    });

    it('should default to simple for basic tasks', () => {
      const taskType = llmClient.detectTaskType('Add a button');
      expect(taskType).toBe('simple');
    });

    it('should handle empty task', () => {
      const taskType = llmClient.detectTaskType('');
      expect(taskType).toBe('simple');
    });
  });

  describe('buildFailureWarnings', () => {
    it('should return empty string for no failures', () => {
      const warnings = llmClient.buildFailureWarnings([]);
      expect(warnings).toBe('');
    });

    it('should build warnings with diagnosis information', () => {
      const recentFailures = [
        {
          tool: 'bash',
          args: { command: 'test' },
          error: 'Command failed',
          diagnosis: {
            rootCause: {
              category: 'command_error',
              description: 'File not found'
            },
            whyChain: {
              why1: 'Command not found',
              why5: 'Path incorrect'
            }
          }
        }
      ];

      const warnings = llmClient.buildFailureWarnings(recentFailures);
      expect(warnings).toContain('Recent Failures');
      expect(warnings).toContain('bash');
      expect(warnings).toContain('Command failed');
      expect(warnings).toContain('File not found');
    });

    it('should include alternative strategies if available', () => {
      const recentFailures = [
        {
          tool: 'read_file',
          args: { path: 'test.txt' },
          error: 'File not found',
          diagnosis: {
            rootCause: {
              category: 'file_error',
              description: 'Path incorrect'
            },
            alternatives: [
              { strategy: 'Use ls to check path first', description: 'Verify path exists', tools: ['bash'] }
            ]
          }
        }
      ];

      const warnings = llmClient.buildFailureWarnings(recentFailures);
      expect(warnings).toContain('Recommended Recovery Strategies');
      expect(warnings).toContain('Use ls to check path first');
    });
  });

  describe('buildRepetitionWarning', () => {
    it('should return empty string when no repetition detected', () => {
      const state = {
        repetitiveActionDetected: false,
        toolDiversityNeeded: false
      };

      const warning = llmClient.buildRepetitionWarning(state);
      expect(warning).toBe('');
    });

    it('should warn about tool diversity when needed', () => {
      const state = {
        repetitiveActionDetected: false,
        toolDiversityNeeded: true,
        overusedTool: 'bash',
        toolUsageCounts: { bash: 8, read_file: 1 }
      };

      const warning = llmClient.buildRepetitionWarning(state);
      expect(warning).toContain('REPETITION DETECTED');
      expect(warning).toContain('TOOL DIVERSITY ISSUE');
      expect(warning).toContain('bash');
    });

    it('should warn about repetitive actions', () => {
      const state = {
        repetitiveActionDetected: true,
        repetitiveActionDetails: {
          action: 'reading same file',
          count: 5
        }
      };

      const warning = llmClient.buildRepetitionWarning(state);
      expect(warning).toContain('REPETITION DETECTED');
      expect(warning).toContain('same action multiple times');
      expect(warning).toContain('STUCK');
    });
  });

  describe('buildToolRecommendationsGuidance', () => {
    it('should return empty string for no recommendations', () => {
      const guidance = llmClient.buildToolRecommendationsGuidance([], 'implementation');
      expect(guidance).toBe('');
    });

    it('should build recommendations with statistics', () => {
      const recommendations = [
        {
          tool: 'read_file',
          successRate: 0.95,
          reason: 'Works well for reading files',
          sampleSize: 100
        },
        {
          tool: 'bash',
          successRate: 0.85,
          reason: 'Good for command execution',
          sampleSize: 80
        }
      ];

      const guidance = llmClient.buildToolRecommendationsGuidance(recommendations, 'implementation');
      expect(guidance).toContain('Tool Recommendations');
      expect(guidance).toContain('read_file');
      expect(guidance).toContain('95%');
      expect(guidance).toContain('bash');
      expect(guidance).toContain('85%');
    });

    it('should highlight best performing tool', () => {
      const recommendations = [
        {
          tool: 'read_file',
          successRate: 0.95,
          reason: 'Highly reliable',
          sampleSize: 100
        },
        {
          tool: 'bash',
          successRate: 0.75,
          reason: 'Moderately reliable',
          sampleSize: 80
        }
      ];

      const guidance = llmClient.buildToolRecommendationsGuidance(recommendations, 'implementation');
      expect(guidance).toContain('STRONG RECOMMENDATION');
      expect(guidance).toContain('read_file');
    });

    it('should warn about poorly performing tools', () => {
      const recommendations = [
        {
          tool: 'read_file',
          successRate: 0.85,
          reason: 'Generally works',
          sampleSize: 100
        },
        {
          tool: 'bash',
          successRate: 0.25,
          reason: 'Often fails',
          sampleSize: 80
        }
      ];

      const guidance = llmClient.buildToolRecommendationsGuidance(recommendations, 'implementation');
      expect(guidance).toContain('AVOID');
      expect(guidance).toContain('bash');
    });
  });

  describe('buildEpisodesGuidance', () => {
    it('should return empty string for no episodes', () => {
      const guidance = llmClient.buildEpisodesGuidance([]);
      expect(guidance).toBe('');
    });

    it('should build guidance from relevant episodes', () => {
      const episodes = [
        {
          episode: {
            task: 'Add logging to auth module',
            strategy: 'incremental',
            tools_used: ['read_file', 'write_file', 'bash'],
            iterations: 5,
            summary: 'Used incremental testing approach'
          },
          score: 0.95
        }
      ];

      const guidance = llmClient.buildEpisodesGuidance(episodes);
      expect(guidance).toContain('Relevant Past Episodes');
      expect(guidance).toContain('Add logging to auth module');
      expect(guidance).toContain('Used incremental testing approach');
      expect(guidance).toContain('read_file, write_file, bash');
    });

    it('should handle episodes without summaries', () => {
      const episodes = [
        {
          episode: {
            task: 'Simple task',
            strategy: 'direct',
            tools_used: ['bash'],
            iterations: 2
          },
          score: 0.8
        }
      ];

      const guidance = llmClient.buildEpisodesGuidance(episodes);
      expect(guidance).toContain('Simple task');
      expect(guidance).toContain('bash');
    });
  });

  describe('formatPastLearnings', () => {
    it('should return empty string for no learnings', () => {
      const formatted = llmClient.formatPastLearnings([]);
      expect(formatted).toBe('');
    });

    it('should format past learnings with tool effectiveness and strategies', () => {
      const learnings = [
        {
          tools_used: ['read_file', 'write_file', 'bash'],
          iterations: 8,
          strategy: 'incremental testing'
        },
        {
          tools_used: ['bash', 'grep'],
          iterations: 5,
          strategy: 'search then modify'
        },
        {
          tools_used: ['read_file', 'bash'],
          iterations: 6,
          strategy: 'verify first'
        }
      ];

      const formatted = llmClient.formatPastLearnings(learnings);
      expect(formatted).toContain('Past Learnings');
      expect(formatted).toContain('3 successful sessions');
      expect(formatted).toContain('Effective tools');
      expect(formatted).toContain('Typical iterations needed');
      expect(formatted).toContain('Success strategies');
      expect(formatted).toContain('incremental testing');
    });
  });

  describe('buildReflectionPrompt', () => {
    it('should build a complete reflection prompt', () => {
      const state = { ...mockAgentState, iteration: 5, task: 'Test task' };
      const executor = {
        registry: {
          getToolSpecs: () => [
            { name: 'bash', description: 'Run bash command' },
            { name: 'read_file', description: 'Read file' }
          ]
        }
      };
      const guidance = {
        learningsText: 'Test learnings',
        preferencesText: 'Test preferences',
        episodesText: 'Test episodes',
        toolRecommendationsText: 'Test tool recommendations',
        pastFailures: [],
        reflectionAccuracy: [],
        planningFeedback: [],
        successPatterns: []
      };

      const prompt = llmClient.buildReflectionPrompt(state, executor, guidance);

      expect(prompt).toContain('Test task');
      expect(prompt).toContain('**Iteration**: 5');
      expect(prompt).toContain('Test learnings');
      expect(prompt).toContain('Test preferences');
    });

    it('should include history when available', () => {
      const state = {
        ...mockAgentState,
        history: [
          {
            iteration: 1,
            action: 'Run bash command',
            reasoning: 'Previous reasoning',
            assessment: 'continue',
            confidence: 0.8,
            progress: 25,
            result: 'Success',
            tools_used: ['bash']
          }
        ]
      };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };

      const prompt = llmClient.buildReflectionPrompt(state, executor, {});

      expect(prompt).toContain('Previous reasoning');
      expect(prompt).toContain('continue');
      expect(prompt).toContain('bash');
    });
  });

  describe('reflect', () => {
    it('should call LLM and return parsed reflection', async () => {
      const state = { ...mockAgentState };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };
      const selfEvaluator = null;
      const guidance = {};

      const reflection = await llmClient.reflect(state, executor, selfEvaluator, guidance);

      expect(reflection).toBeDefined();
      expect(reflection.assessment).toBeDefined();
      expect(reflection.next_action).toBeDefined();
      expect(mockLLM._mock.getCallCount()).toBe(1);
    });

    it('should calibrate confidence when self-evaluator is provided', async () => {
      const state = { ...mockAgentState };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };

      const selfEvaluator = {
        calibrateConfidence: vi.fn().mockReturnValue({
          calibrated: 0.65,
          adjustment: -0.15,
          reason: 'Historical overconfidence'
        })
      };

      const guidance = {};

      const reflection = await llmClient.reflect(state, executor, selfEvaluator, guidance);

      expect(selfEvaluator.calibrateConfidence).toHaveBeenCalled();
      expect(reflection).toBeDefined();
    });

    it('should handle LLM errors gracefully', async () => {
      const errorLLM = createMockLLMClient({
        customHandler: () => {
          throw new Error('LLM API error');
        }
      });

      const errorClient = new LLMClient(
        { chat: (params) => errorLLM.chat.completions.create(params) },
        'test-model',
        mockDiagnosticReflection
      );

      const state = { ...mockAgentState };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };

      const reflection = await errorClient.reflect(state, executor, null, {});

      // Should return fallback reflection instead of throwing
      expect(reflection).toBeDefined();
      expect(reflection.assessment).toBe('continue');
      expect(reflection.confidence).toBe(0.3);
      expect(reflection.reasoning).toContain('Failed to generate reflection');
    });
  });

  describe('runDiagnosticReflection', () => {
    it('should analyze errors using 5 Whys', async () => {
      const toolCall = {
        function: { name: 'bash' },
        args: { command: 'cat missing.txt' }
      };
      const error = new Error('cat: missing.txt: No such file or directory');
      const executor = {
        toolRegistry: new Map([['bash', {}]])
      };
      const context = {
        convId: 'test-conv',
        turnId: 'test-turn'
      };
      const state = {
        ...mockAgentState,
        history: [],
        iteration: 1
      };

      const result = await llmClient.runDiagnosticReflection(toolCall, error, executor, context, state);

      expect(mockDiagnosticReflection.runDiagnosticReflection).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.whyChain).toHaveLength(5);
      expect(result.rootCause).toBe('Test root cause');
      expect(result.recoveryStrategy).toBe('Test recovery strategy');
    });
  });

  describe('getTaskTypeGuidance', () => {
    it('should provide guidance for exploratory tasks', () => {
      const guidance = llmClient.getTaskTypeGuidance('exploratory');
      expect(guidance).toContain('Exploratory Search Guidance');
      expect(guidance).toContain('explore directory structure');
      expect(guidance.length).toBeGreaterThan(0);
    });

    it('should provide guidance for multi-step tasks', () => {
      const guidance = llmClient.getTaskTypeGuidance('multi-step');
      expect(guidance).toContain('Multi-Step Task Guidance');
      expect(guidance).toContain('Break task into sequential phases');
      expect(guidance.length).toBeGreaterThan(0);
    });

    it('should provide default guidance for unknown types', () => {
      const guidance = llmClient.getTaskTypeGuidance('unknown-type');
      expect(guidance).toContain('General Task Guidance');
      expect(guidance).toContain('Make one focused change');
    });
  });

  describe('edge cases', () => {
    it('should handle empty guidance gracefully', async () => {
      const state = { ...mockAgentState };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };

      const prompt = llmClient.buildReflectionPrompt(state, executor, {});
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
    });

    it('should handle empty state history', () => {
      const state = {
        ...mockAgentState,
        reflectionHistory: []
      };
      const executor = {
        registry: {
          getToolSpecs: () => []
        }
      };

      const prompt = llmClient.buildReflectionPrompt(state, executor, {});
      expect(prompt).toBeDefined();
    });

    it('should handle very long task descriptions', () => {
      const longTask = 'A'.repeat(10000);
      const taskType = llmClient.detectTaskType(longTask);
      expect(taskType).toBeDefined();
      expect(typeof taskType).toBe('string');
    });
  });
});
