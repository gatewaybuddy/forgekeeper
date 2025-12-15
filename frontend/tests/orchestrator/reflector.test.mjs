/**
 * Unit tests for Reflector orchestrator module
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Reflector } from '../../core/agent/orchestrator/reflector.mjs';
import { mockAgentState, mockReflection } from '../utils/fixtures.mjs';

describe('Reflector', () => {
  let reflector;

  beforeEach(() => {
    reflector = new Reflector({
      maxIterations: 20,
      errorThreshold: 3,
      interactiveMode: false
    });
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(reflector.maxIterations).toBe(20);
      expect(reflector.errorThreshold).toBe(3);
      expect(reflector.interactiveMode).toBe(false);
    });

    it('should use defaults for missing config', () => {
      const defaultReflector = new Reflector({});

      expect(defaultReflector.maxIterations).toBe(50);
      expect(defaultReflector.errorThreshold).toBe(5);
      expect(defaultReflector.interactiveMode).toBe(false);
    });
  });

  describe('scoreReflectionAccuracy', () => {
    it('should score accurate predictions', () => {
      const previousReflection = {
        progress_percent: 50,
        confidence: 0.8,
        assessment: 'continue'
      };
      const actualOutcome = {
        progress_percent: 52,
        result: 'Success',
        assessment: 'continue'
      };

      const scores = reflector.scoreReflectionAccuracy(previousReflection, actualOutcome);

      expect(scores.progress_error).toBe(2);
      expect(scores.assessment_correct).toBe(true);
      expect(scores.overall_accuracy).toBeGreaterThan(80);
    });

    it('should detect overconfidence', () => {
      const previousReflection = {
        progress_percent: 80,
        confidence: 0.9,
        assessment: 'continue'
      };
      const actualOutcome = {
        progress_percent: 30,
        result: 'ERROR: Failed',
        assessment: 'error'
      };

      const scores = reflector.scoreReflectionAccuracy(previousReflection, actualOutcome);

      expect(scores.progress_error).toBe(50);
      expect(scores.confidence_error).toBe(0.8); // Overconfident
      expect(scores.assessment_correct).toBe(false);
      expect(scores.overall_accuracy).toBeLessThan(50);
    });

    it('should detect underconfidence', () => {
      const previousReflection = {
        progress_percent: 50,
        confidence: 0.3,
        assessment: 'continue'
      };
      const actualOutcome = {
        progress_percent: 55,
        result: 'Success',
        assessment: 'continue'
      };

      const scores = reflector.scoreReflectionAccuracy(previousReflection, actualOutcome);

      expect(scores.confidence_error).toBe(0.3); // Underconfident
    });

    it('should handle null inputs', () => {
      const scores = reflector.scoreReflectionAccuracy(null, null);

      expect(scores.progress_error).toBe(0);
      expect(scores.confidence_error).toBe(0);
      expect(scores.assessment_correct).toBe(false);
      expect(scores.overall_accuracy).toBe(0);
    });
  });

  describe('metaReflect', () => {
    it('should generate critique for poor prediction', () => {
      const previousReflection = {
        progress_percent: 80,
        confidence: 0.9,
        assessment: 'continue',
        reasoning: 'This should be easy'
      };
      const actualOutcome = {
        progress_percent: 20,
        result: 'ERROR: Failed',
        assessment: 'error'
      };
      const accuracyScores = {
        progress_error: 60,
        confidence_error: 0.8,
        assessment_correct: false,
        overall_accuracy: 20
      };

      const critique = reflector.metaReflect(previousReflection, actualOutcome, accuracyScores);

      expect(critique).toContain('Meta-Reflection');
      expect(critique).toContain('SIGNIFICANT ERROR');
      expect(critique).toContain('OVERCONFIDENT');
      expect(critique).toContain('This should be easy');
    });

    it('should praise accurate predictions', () => {
      const previousReflection = {
        progress_percent: 50,
        confidence: 0.7,
        assessment: 'continue',
        reasoning: 'Steady progress'
      };
      const actualOutcome = {
        progress_percent: 52,
        result: 'Success',
        assessment: 'continue'
      };
      const accuracyScores = {
        progress_error: 2,
        confidence_error: 0.1,
        assessment_correct: true,
        overall_accuracy: 95
      };

      const critique = reflector.metaReflect(previousReflection, actualOutcome, accuracyScores);

      expect(critique).toContain('Good estimate');
      expect(critique).toContain('Well calibrated');
      expect(critique).toContain('95%');
    });

    it('should handle null inputs', () => {
      const critique = reflector.metaReflect(null, null, {});

      expect(critique).toBe('');
    });
  });

  describe('buildMetaReflectionGuidance', () => {
    it('should build guidance from accuracy history', () => {
      const reflectionAccuracy = [
        { iteration: 1, overall_accuracy: 85, progress_error: 10, confidence_error: 0.1 },
        { iteration: 2, overall_accuracy: 90, progress_error: 5, confidence_error: 0.1 },
        { iteration: 3, overall_accuracy: 92, progress_error: 3, confidence_error: 0.1 }
      ];

      const guidance = reflector.buildMetaReflectionGuidance(reflectionAccuracy);

      expect(guidance).toContain('Prediction Accuracy Track Record');
      expect(guidance).toContain('Iteration 1: 85%');
      expect(guidance).toContain('Average Accuracy: 89%');
      expect(guidance).toContain('GOOD ACCURACY');
    });

    it('should warn about low accuracy', () => {
      const reflectionAccuracy = [
        { iteration: 1, overall_accuracy: 30, progress_error: 40, confidence_error: 0.7 },
        { iteration: 2, overall_accuracy: 35, progress_error: 45, confidence_error: 0.6 },
        { iteration: 3, overall_accuracy: 40, progress_error: 35, confidence_error: 0.5 }
      ];

      const guidance = reflector.buildMetaReflectionGuidance(reflectionAccuracy);

      expect(guidance).toContain('LOW ACCURACY');
      expect(guidance).toContain('Be more careful');
    });

    it('should handle empty array', () => {
      const guidance = reflector.buildMetaReflectionGuidance([]);

      expect(guidance).toBe('');
    });
  });

  describe('scorePlanningAccuracy', () => {
    it('should score successful plan execution', () => {
      const instructionPlan = {
        steps: [
          { tool: 'bash' },
          { tool: 'read_file' }
        ],
        overallConfidence: 0.8
      };
      const executionResult = {
        tools_used: ['bash', 'read_file'],
        summary: 'Success'
      };

      const feedback = reflector.scorePlanningAccuracy(instructionPlan, executionResult);

      expect(feedback.planSucceeded).toBe(true);
      expect(feedback.toolsMatchedPlan).toBe(2);
      expect(feedback.confidenceCalibration).toBe(1.0);
      expect(feedback.analysis).toContain('accurate');
    });

    it('should detect overconfident planning', () => {
      const instructionPlan = {
        steps: [
          { tool: 'bash' },
          { tool: 'read_file' }
        ],
        overallConfidence: 0.9
      };
      const executionResult = {
        tools_used: ['read_dir', 'grep'],
        summary: 'ERROR: Failed'
      };

      const feedback = reflector.scorePlanningAccuracy(instructionPlan, executionResult);

      expect(feedback.planSucceeded).toBe(false);
      expect(feedback.toolsMatchedPlan).toBe(0);
      expect(feedback.confidenceCalibration).toBe(0.2);
      expect(feedback.analysis).toContain('overconfident');
    });

    it('should detect underconfident planning', () => {
      const instructionPlan = {
        steps: [
          { tool: 'bash' }
        ],
        overallConfidence: 0.4
      };
      const executionResult = {
        tools_used: ['bash'],
        summary: 'Success'
      };

      const feedback = reflector.scorePlanningAccuracy(instructionPlan, executionResult);

      expect(feedback.planSucceeded).toBe(true);
      expect(feedback.confidenceCalibration).toBe(0.5);
    });
  });

  describe('buildPlanningFeedbackGuidance', () => {
    it('should build guidance from planning feedback', () => {
      const planningFeedback = [
        {
          iteration: 1,
          planSucceeded: true,
          planConfidence: 0.8,
          toolsMatchedPlan: 3,
          stepsPlanned: 3,
          confidenceCalibration: 1.0,
          analysis: 'Plan was accurate'
        },
        {
          iteration: 2,
          planSucceeded: true,
          planConfidence: 0.7,
          toolsMatchedPlan: 2,
          stepsPlanned: 2,
          confidenceCalibration: 1.0,
          analysis: 'Plan worked well'
        }
      ];

      const guidance = reflector.buildPlanningFeedbackGuidance(planningFeedback);

      expect(guidance).toContain('Task Planner Track Record');
      expect(guidance).toContain('SUCCESS');
      expect(guidance).toContain('Success Rate: 100%');
      expect(guidance).toContain('GOOD CALIBRATION');
    });

    it('should warn about poor calibration', () => {
      const planningFeedback = [
        {
          iteration: 1,
          planSucceeded: false,
          planConfidence: 0.9,
          toolsMatchedPlan: 0,
          stepsPlanned: 2,
          confidenceCalibration: 0.2,
          analysis: 'Overconfident'
        }
      ];

      const guidance = reflector.buildPlanningFeedbackGuidance(planningFeedback);

      expect(guidance).toContain('POOR CALIBRATION');
    });

    it('should handle empty array', () => {
      const guidance = reflector.buildPlanningFeedbackGuidance([]);

      expect(guidance).toBe('');
    });
  });

  describe('shouldStop', () => {
    it('should stop at max iterations', () => {
      const state = { ...mockAgentState, iteration: 20 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('max_iterations');
    });

    it('should stop at error threshold', () => {
      const state = { ...mockAgentState, errors: 3 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('too_many_errors');
    });

    it('should stop when task complete with high confidence', () => {
      const state = { ...mockAgentState, taskComplete: true, confidence: 0.95 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('task_complete');
      expect(decision.confidence).toBe(0.95);
    });

    it('should not stop when task complete but low confidence', () => {
      const state = { ...mockAgentState, taskComplete: true, confidence: 0.6 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(false);
    });

    it('should stop on repetitive action detection', () => {
      const state = { ...mockAgentState, repetitiveActionDetected: true };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('repetitive_actions');
    });

    it('should request clarification in interactive mode for repetitive actions', () => {
      const interactiveReflector = new Reflector({
        maxIterations: 20,
        errorThreshold: 3,
        interactiveMode: true
      });

      const state = { ...mockAgentState, repetitiveActionDetected: true };

      const decision = interactiveReflector.shouldStop(state, false);

      expect(decision.stop).toBe(false);
      expect(decision.needsClarification).toBe(true);
      expect(decision.reason).toBe('repetitive_actions');
    });

    it('should stop on stuck loop (same action 3 times)', () => {
      const state = {
        ...mockAgentState,
        actionHistory: ['read_file config.json', 'read_file config.json', 'read_file config.json']
      };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('stuck_loop');
    });

    it('should stop on no progress', () => {
      const state = { ...mockAgentState, noProgressCount: 3 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('no_progress');
    });

    it('should continue when all conditions are normal', () => {
      const state = {
        ...mockAgentState,
        iteration: 5,
        errors: 0,
        taskComplete: false,
        noProgressCount: 0
      };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(false);
    });
  });

  describe('buildResult', () => {
    it('should build result for completed task', () => {
      const state = {
        ...mockAgentState,
        iteration: 10,
        confidence: 0.95,
        history: [{ iteration: 1, action: 'test' }],
        artifacts: [{ type: 'file', path: 'test.txt' }],
        lastProgressPercent: 100,
        errors: 0,
        reflections: []
      };

      const result = reflector.buildResult(state, 'task_complete');

      expect(result.completed).toBe(true);
      expect(result.reason).toBe('task_complete');
      expect(result.iterations).toBe(10);
      expect(result.confidence).toBe(0.95);
      expect(result.history).toHaveLength(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.summary).toContain('Autonomous Session Summary');
    });

    it('should build result for failed task', () => {
      const state = {
        ...mockAgentState,
        iteration: 20,
        confidence: 0.4,
        history: [],
        artifacts: [],
        lastProgressPercent: 30,
        errors: 3,
        reflections: []
      };

      const result = reflector.buildResult(state, 'too_many_errors');

      expect(result.completed).toBe(false);
      expect(result.reason).toBe('too_many_errors');
      expect(result.summary).toContain('too_many_errors');
    });
  });

  describe('generateSummary', () => {
    it('should generate comprehensive summary', () => {
      const state = {
        task: 'Test task',
        iteration: 10,
        lastProgressPercent: 85,
        confidence: 0.9,
        artifacts: [
          { type: 'file', path: 'test1.txt' },
          { type: 'file', path: 'test2.txt' }
        ],
        history: [
          { iteration: 6, action: 'Action 1', tools_used: ['bash'] },
          { iteration: 7, action: 'Action 2', tools_used: ['read_file'] },
          { iteration: 8, action: 'Action 3', tools_used: ['write_file'] },
          { iteration: 9, action: 'Action 4', tools_used: ['bash'] },
          { iteration: 10, action: 'Action 5', tools_used: ['read_file'] }
        ],
        reflections: [
          { reasoning: 'Task completed successfully' }
        ]
      };

      const summary = reflector.generateSummary(state, 'task_complete');

      expect(summary).toContain('Autonomous Session Summary');
      expect(summary).toContain('Test task');
      expect(summary).toContain('task_complete');
      expect(summary).toContain('Iterations: 10');
      expect(summary).toContain('Progress: 85%');
      expect(summary).toContain('Confidence: 90%');
      expect(summary).toContain('Artifacts Created (2)');
      expect(summary).toContain('test1.txt');
      expect(summary).toContain('Actions Taken');
      expect(summary).toContain('Final Assessment');
      expect(summary).toContain('Task completed successfully');
    });

    it('should handle minimal state', () => {
      const state = {
        task: 'Simple task',
        iteration: 1,
        lastProgressPercent: 0,
        confidence: 0.5,
        artifacts: [],
        history: [],
        reflections: []
      };

      const summary = reflector.generateSummary(state, 'max_iterations');

      expect(summary).toContain('Simple task');
      expect(summary).toContain('max_iterations');
      expect(summary).not.toContain('Artifacts Created');
      expect(summary).not.toContain('Final Assessment');
    });
  });

  describe('getProgressSummary', () => {
    it('should return progress summary', () => {
      const state = {
        iteration: 5,
        lastProgressPercent: 50,
        artifacts: [{ type: 'file', path: 'test.txt' }],
        errors: 1,
        noProgressCount: 0,
        history: [{ iteration: 1, action: 'test' }],
        recentFailures: []
      };

      const summary = reflector.getProgressSummary(state);

      expect(summary.iteration).toBe(5);
      expect(summary.max_iterations).toBe(20);
      expect(summary.progress_percent).toBe(50);
      expect(summary.artifacts_created).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.stuck_count).toBe(0);
    });

    it('should handle state without artifacts', () => {
      const state = {
        iteration: 2,
        lastProgressPercent: 20,
        errors: 0,
        noProgressCount: 0,
        history: []
      };

      const summary = reflector.getProgressSummary(state);

      expect(summary.artifacts_created).toBe(0);
    });
  });

  describe('buildSuccessPatternsGuidance', () => {
    it('should build guidance from success patterns', () => {
      const successPatterns = [
        { insight: '✓ Using grep before sed works well' },
        { insight: '✓ Incremental testing prevents errors' },
        { insight: '✓ Read file before modifying' }
      ];

      const guidance = reflector.buildSuccessPatternsGuidance(successPatterns);

      expect(guidance).toContain('What Has Worked in This Session');
      expect(guidance).toContain('Using grep before sed works well');
      expect(guidance).toContain('Incremental testing prevents errors');
      expect(guidance).toContain('LEARN FROM SUCCESS');
    });

    it('should handle empty array', () => {
      const guidance = reflector.buildSuccessPatternsGuidance([]);

      expect(guidance).toBe('');
    });

    it('should handle null input', () => {
      const guidance = reflector.buildSuccessPatternsGuidance(null);

      expect(guidance).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle very high iteration count', () => {
      const state = { ...mockAgentState, iteration: 1000 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.reason).toBe('max_iterations');
    });

    it('should handle negative confidence', () => {
      const state = { ...mockAgentState, taskComplete: true, confidence: -0.5 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(false); // Negative confidence < 0.9
    });

    it('should handle confidence > 1', () => {
      const state = { ...mockAgentState, taskComplete: true, confidence: 1.5 };

      const decision = reflector.shouldStop(state);

      expect(decision.stop).toBe(true);
      expect(decision.confidence).toBe(1.5);
    });
  });
});
