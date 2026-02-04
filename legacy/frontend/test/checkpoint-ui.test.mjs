/**
 * Integration Tests for Checkpoint UI (T305)
 *
 * Tests checkpoint UI integration and user interaction flows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCheckpoint,
  resolveCheckpoint,
  getWaitingCheckpoints,
  cancelCheckpoint,
  getCheckpointStats,
} from '../server/collaborative/checkpoint.mjs';

describe('Checkpoint UI Integration (T305)', () => {
  beforeEach(() => {
    // Enable checkpoints for tests
    process.env.AUTONOMOUS_ENABLE_CHECKPOINTS = '1';
    process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD = '0.7';
  });

  describe('User Selection Flow', () => {
    it('should allow user to select different option from recommendation', async () => {
      const options = [
        {
          id: 'opt-1',
          label: 'Recommended Approach',
          description: 'Fast but limited',
          pros: ['Fast'],
          cons: ['Limited'],
          riskLevel: 'low',
        },
        {
          id: 'opt-2',
          label: 'Alternative Approach',
          description: 'Comprehensive but slow',
          pros: ['Comprehensive'],
          cons: ['Slow'],
          riskLevel: 'medium',
        },
      ];

      // Create checkpoint with opt-1 recommended
      const checkpointPromise = createCheckpoint(
        'strategy',
        'Choose Approach',
        'Select your preferred approach',
        options,
        'opt-1', // Recommended
        0.65
      );

      const waiting = getWaitingCheckpoints();
      expect(waiting.length).toBe(1);

      // User selects opt-2 (different from recommendation)
      const success = resolveCheckpoint(waiting[0].id, 'opt-2', 'I prefer comprehensive approach');
      expect(success).toBe(true);

      const selected = await checkpointPromise;
      expect(selected.id).toBe('opt-2');
      expect(selected.label).toBe('Alternative Approach');
    });

    it('should capture user reasoning for selection', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint(
        'plan',
        'Choose Plan',
        'desc',
        options,
        'opt-1',
        0.6
      );

      const waiting = getWaitingCheckpoints();
      const userReasoning = 'This option aligns better with project goals';

      resolveCheckpoint(waiting[0].id, 'opt-2', userReasoning);

      await checkpointPromise;

      // Verify reasoning was captured (check internal state)
      const checkpoint = waiting[0];
      expect(checkpoint.reasoning).toBeDefined();
    });

    it('should track recommendation acceptance rate', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const initialStats = getCheckpointStats();
      const initialRate = initialStats.recommendationAcceptanceRate;

      // Create and accept recommendation
      const cp1 = createCheckpoint('plan', 'CP1', 'desc', options, 'opt-1', 0.6);
      let waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-1'); // Accept
      await cp1;

      // Create and reject recommendation
      const cp2 = createCheckpoint('strategy', 'CP2', 'desc', options, 'opt-1', 0.5);
      waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-2'); // Reject
      await cp2;

      const finalStats = getCheckpointStats();
      expect(finalStats.recommendationAcceptanceRate).toBeDefined();
      expect(finalStats.recommendationAcceptanceRate).toBeGreaterThanOrEqual(0);
      expect(finalStats.recommendationAcceptanceRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Plan Modification', () => {
    it('should allow modification of plan parameters', async () => {
      const options = [
        {
          id: 'param-default',
          label: 'Default Value',
          description: 'Use default configuration',
          pros: ['Safe', 'Tested'],
          cons: ['May not be optimal'],
          riskLevel: 'low',
        },
        {
          id: 'param-custom',
          label: 'Custom Value',
          description: 'Use custom configuration',
          pros: ['Optimized for use case'],
          cons: ['Needs testing'],
          riskLevel: 'medium',
        },
      ];

      const checkpointPromise = createCheckpoint(
        'parameter',
        'Configure Parameter',
        'Choose parameter value',
        options,
        'param-default',
        0.7
      );

      const waiting = getWaitingCheckpoints();
      expect(waiting[0].type).toBe('parameter');

      // User modifies to custom value
      resolveCheckpoint(waiting[0].id, 'param-custom', 'Custom value suits our needs better');

      const selected = await checkpointPromise;
      expect(selected.id).toBe('param-custom');
    });

    it('should support plan validation through options', async () => {
      const options = [
        {
          id: 'plan-a',
          label: 'Plan A',
          description: 'Quick implementation',
          pros: ['Fast', 'Simple'],
          cons: ['Limited features'],
          riskLevel: 'low',
          estimatedEffort: '1 day',
        },
        {
          id: 'plan-b',
          label: 'Plan B',
          description: 'Comprehensive implementation',
          pros: ['Full featured', 'Scalable'],
          cons: ['Time consuming'],
          riskLevel: 'medium',
          estimatedEffort: '3 days',
        },
      ];

      const checkpointPromise = createCheckpoint(
        'plan',
        'Validate Plan',
        'Review and select implementation plan',
        options,
        'plan-a',
        0.65
      );

      const waiting = getWaitingCheckpoints();
      const checkpoint = waiting[0];

      // Verify plan options include validation metadata
      expect(checkpoint.options[0].estimatedEffort).toBe('1 day');
      expect(checkpoint.options[0].pros.length).toBeGreaterThan(0);
      expect(checkpoint.options[0].cons.length).toBeGreaterThan(0);
      expect(checkpoint.options[0].riskLevel).toBeDefined();

      // User validates and selects plan
      resolveCheckpoint(checkpoint.id, 'plan-b', 'Prefer comprehensive approach');

      const selected = await checkpointPromise;
      expect(selected.estimatedEffort).toBe('3 days');
    });
  });

  describe('Alternative Generation', () => {
    it('should present multiple alternatives for strategy decisions', async () => {
      const strategies = [
        {
          id: 'strat-1',
          label: 'Strategy 1',
          description: 'Approach A',
          pros: ['Pro A1', 'Pro A2'],
          cons: ['Con A1'],
          riskLevel: 'low',
          estimatedEffort: '2 hours',
        },
        {
          id: 'strat-2',
          label: 'Strategy 2',
          description: 'Approach B',
          pros: ['Pro B1'],
          cons: ['Con B1', 'Con B2'],
          riskLevel: 'medium',
          estimatedEffort: '4 hours',
        },
        {
          id: 'strat-3',
          label: 'Strategy 3',
          description: 'Approach C',
          pros: ['Pro C1', 'Pro C2', 'Pro C3'],
          cons: ['Con C1'],
          riskLevel: 'high',
          estimatedEffort: '8 hours',
        },
      ];

      const checkpointPromise = createCheckpoint(
        'strategy',
        'Choose Implementation Strategy',
        'Multiple valid approaches exist',
        strategies,
        'strat-1',
        0.6
      );

      const waiting = getWaitingCheckpoints();
      const checkpoint = waiting[0];

      // Verify multiple alternatives presented
      expect(checkpoint.options.length).toBe(3);
      expect(checkpoint.recommendation).toBe('strat-1');

      // User can review all alternatives
      checkpoint.options.forEach((opt) => {
        expect(opt.pros.length).toBeGreaterThan(0);
        expect(opt.estimatedEffort).toBeDefined();
      });

      // User selects alternative
      resolveCheckpoint(checkpoint.id, 'strat-2', 'Balanced approach');

      const selected = await checkpointPromise;
      expect(selected.id).toBe('strat-2');
    });

    it('should enforce minimum 2 options for alternatives', async () => {
      const singleOption = [
        { id: 'only', label: 'Only Choice', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      await expect(
        createCheckpoint('strategy', 'Invalid', 'desc', singleOption, 'only', 0.6)
      ).rejects.toThrow('at least 2 options');
    });

    it('should support up to 5 alternatives (configurable)', async () => {
      process.env.AUTONOMOUS_MAX_CHECKPOINT_OPTIONS = '5';

      const fiveOptions = Array.from({ length: 5 }, (_, i) => ({
        id: `opt-${i}`,
        label: `Option ${i}`,
        description: `Description ${i}`,
        pros: [`Pro ${i}`],
        cons: [`Con ${i}`],
        riskLevel: 'low',
      }));

      const checkpointPromise = createCheckpoint(
        'strategy',
        'Choose from Many',
        'desc',
        fiveOptions,
        'opt-0',
        0.5
      );

      const waiting = getWaitingCheckpoints();
      expect(waiting[0].options.length).toBe(5);

      // User can select from all 5
      resolveCheckpoint(waiting[0].id, 'opt-3');

      const selected = await checkpointPromise;
      expect(selected.id).toBe('opt-3');
    });
  });

  describe('Interactive Planning', () => {
    it('should pause execution until user makes decision', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      let resolved = false;

      const checkpointPromise = createCheckpoint(
        'plan',
        'Interactive Decision',
        'desc',
        options,
        'opt-1',
        0.6
      );

      checkpointPromise.then(() => {
        resolved = true;
      });

      // Wait a bit - should not resolve automatically
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(resolved).toBe(false);

      // User makes decision
      const waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-2');

      // Now it should resolve
      await checkpointPromise;
      expect(resolved).toBe(true);
    });

    it('should support cancellation with auto-select recommendation', async () => {
      const options = [
        { id: 'rec', label: 'Recommended', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'alt', label: 'Alternative', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
      ];

      const checkpointPromise = createCheckpoint('plan', 'Test Cancel', 'desc', options, 'rec', 0.5);

      const waiting = getWaitingCheckpoints();
      const success = cancelCheckpoint(waiting[0].id);
      expect(success).toBe(true);

      // Should auto-select recommendation
      const selected = await checkpointPromise;
      expect(selected.id).toBe('rec');
    });

    it('should filter checkpoints by conversation ID', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      // Create checkpoints for different conversations
      const cp1 = createCheckpoint('plan', 'CP1', 'desc', options, 'opt-1', 0.6, { convId: 'conv-a' });
      const cp2 = createCheckpoint('strategy', 'CP2', 'desc', options, 'opt-1', 0.5, { convId: 'conv-b' });
      const cp3 = createCheckpoint('parameter', 'CP3', 'desc', options, 'opt-1', 0.7, { convId: 'conv-a' });

      // Filter by convId
      const convACheckpoints = getWaitingCheckpoints({ convId: 'conv-a' });
      expect(convACheckpoints.length).toBe(2);
      expect(convACheckpoints.every((cp) => cp.convId === 'conv-a')).toBe(true);

      // Cleanup
      const all = getWaitingCheckpoints();
      for (const cp of all) {
        cancelCheckpoint(cp.id);
      }
      await Promise.all([cp1, cp2, cp3]);
    });

    it('should filter checkpoints by type', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      // Create checkpoints of different types
      const cp1 = createCheckpoint('plan', 'Plan CP', 'desc', options, 'opt-1', 0.6);
      const cp2 = createCheckpoint('strategy', 'Strategy CP', 'desc', options, 'opt-1', 0.5);
      const cp3 = createCheckpoint('plan', 'Another Plan', 'desc', options, 'opt-1', 0.7);

      // Filter by type
      const planCheckpoints = getWaitingCheckpoints({ type: 'plan' });
      expect(planCheckpoints.length).toBe(2);
      expect(planCheckpoints.every((cp) => cp.type === 'plan')).toBe(true);

      // Cleanup
      const all = getWaitingCheckpoints();
      for (const cp of all) {
        cancelCheckpoint(cp.id);
      }
      await Promise.all([cp1, cp2, cp3]);
    });
  });

  describe('Confidence Display', () => {
    it('should display confidence level with checkpoint', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint(
        'strategy',
        'Low Confidence Decision',
        'desc',
        options,
        'opt-1',
        0.45 // Low confidence
      );

      const waiting = getWaitingCheckpoints();
      const checkpoint = waiting[0];

      expect(checkpoint.confidence).toBe(0.45);
      expect(checkpoint.recommendation).toBe('opt-1');

      // Cleanup
      cancelCheckpoint(checkpoint.id);
      await checkpointPromise;
    });

    it('should show confidence per option if available', async () => {
      const options = [
        {
          id: 'opt-1',
          label: 'High Confidence Opt',
          description: 'desc',
          pros: ['Pro 1'],
          cons: [],
          riskLevel: 'low',
          confidence: 0.85,
        },
        {
          id: 'opt-2',
          label: 'Low Confidence Opt',
          description: 'desc',
          pros: ['Pro 2'],
          cons: ['Con 2'],
          riskLevel: 'medium',
          confidence: 0.55,
        },
      ];

      const checkpointPromise = createCheckpoint(
        'strategy',
        'Per-Option Confidence',
        'desc',
        options,
        'opt-1',
        0.85
      );

      const waiting = getWaitingCheckpoints();
      const checkpoint = waiting[0];

      expect(checkpoint.options[0].confidence).toBe(0.85);
      expect(checkpoint.options[1].confidence).toBe(0.55);

      // Cleanup
      cancelCheckpoint(checkpoint.id);
      await checkpointPromise;
    });
  });
});
