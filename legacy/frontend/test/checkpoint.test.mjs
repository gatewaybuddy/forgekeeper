/**
 * Unit Tests for Decision Checkpoint System (T304)
 *
 * Tests checkpoint creation, resolution, triggering, and queue management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCheckpoint,
  resolveCheckpoint,
  getWaitingCheckpoints,
  getCheckpoint,
  cancelCheckpoint,
  getCheckpointStats,
  shouldTriggerCheckpoint,
  createStrategyCheckpoint,
  cleanupOldCheckpoints,
} from '../server/collaborative/checkpoint.mjs';

describe('Decision Checkpoint System (T304)', () => {
  beforeEach(() => {
    // Enable checkpoints for tests
    process.env.AUTONOMOUS_ENABLE_CHECKPOINTS = '1';
    process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD = '0.7';
  });

  describe('Checkpoint Creation', () => {
    it('should create a checkpoint and wait for resolution', async () => {
      const options = [
        {
          id: 'opt-1',
          label: 'Option 1',
          description: 'First option',
          pros: ['Pro 1', 'Pro 2'],
          cons: ['Con 1'],
          riskLevel: 'low',
        },
        {
          id: 'opt-2',
          label: 'Option 2',
          description: 'Second option',
          pros: ['Pro 3'],
          cons: ['Con 2', 'Con 3'],
          riskLevel: 'medium',
        },
      ];

      // Create checkpoint (returns a promise)
      const checkpointPromise = createCheckpoint(
        'strategy',
        'Choose Approach',
        'Select the preferred approach for this task',
        options,
        'opt-1',
        0.8,
        { convId: 'test-conv', traceId: 'test-trace' }
      );

      // Check it's in waiting queue
      const waiting = getWaitingCheckpoints({ convId: 'test-conv' });
      expect(waiting.length).toBe(1);
      expect(waiting[0].status).toBe('waiting');
      expect(waiting[0].type).toBe('strategy');

      // Resolve it
      const success = resolveCheckpoint(waiting[0].id, 'opt-2', 'Prefer option 2');
      expect(success).toBe(true);

      // Wait for promise to resolve
      const selectedOption = await checkpointPromise;
      expect(selectedOption.id).toBe('opt-2');
      expect(selectedOption.label).toBe('Option 2');
    });

    it('should validate checkpoint options count', async () => {
      const options = [
        { id: 'opt-1', label: 'Only Option', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      await expect(
        createCheckpoint('strategy', 'Invalid', 'Invalid checkpoint', options, 'opt-1', 0.8)
      ).rejects.toThrow('at least 2 options');
    });

    it('should validate recommendation is in options', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      await expect(
        createCheckpoint('strategy', 'Invalid', 'Invalid recommendation', options, 'opt-999', 0.8)
      ).rejects.toThrow('must be one of the provided options');
    });

    it('should auto-select recommendation when checkpoints disabled', async () => {
      process.env.AUTONOMOUS_ENABLE_CHECKPOINTS = '0';

      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const selected = await createCheckpoint(
        'strategy',
        'Auto-Select',
        'Should auto-select',
        options,
        'opt-2',
        0.5
      );

      expect(selected.id).toBe('opt-2'); // Recommendation auto-selected
    });
  });

  describe('Checkpoint Resolution', () => {
    it('should resolve checkpoint with user selection', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
      ];

      const checkpointPromise = createCheckpoint(
        'parameter',
        'Choose Parameter',
        'desc',
        options,
        'opt-1',
        0.6
      );

      const waiting = getWaitingCheckpoints();
      const success = resolveCheckpoint(waiting[0].id, 'opt-1', 'Matches recommendation');
      expect(success).toBe(true);

      const selected = await checkpointPromise;
      expect(selected.id).toBe('opt-1');
    });

    it('should reject resolution of non-existent checkpoint', () => {
      const success = resolveCheckpoint('non-existent-id', 'opt-1');
      expect(success).toBe(false);
    });

    it('should reject resolution with invalid option', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint('plan', 'Choose', 'desc', options, 'opt-1', 0.5);

      const waiting = getWaitingCheckpoints();
      const success = resolveCheckpoint(waiting[0].id, 'invalid-option');
      expect(success).toBe(false);

      // Cancel to avoid hanging promise
      cancelCheckpoint(waiting[0].id);
      await checkpointPromise;
    });

    it('should not allow double-resolution', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint('strategy', 'Choose', 'desc', options, 'opt-1', 0.6);

      const waiting = getWaitingCheckpoints();
      const checkpointId = waiting[0].id;

      // First resolution
      const first = resolveCheckpoint(checkpointId, 'opt-1');
      expect(first).toBe(true);

      await checkpointPromise;

      // Second resolution should fail
      const second = resolveCheckpoint(checkpointId, 'opt-2');
      expect(second).toBe(false);
    });
  });

  describe('Checkpoint Cancellation', () => {
    it('should cancel checkpoint and auto-select recommendation', async () => {
      const options = [
        { id: 'opt-1', label: 'Recommended', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Alternative', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
      ];

      const checkpointPromise = createCheckpoint('plan', 'Choose', 'desc', options, 'opt-1', 0.5);

      const waiting = getWaitingCheckpoints();
      const success = cancelCheckpoint(waiting[0].id);
      expect(success).toBe(true);

      // Should auto-select recommendation
      const selected = await checkpointPromise;
      expect(selected.id).toBe('opt-1'); // Recommendation
    });

    it('should not cancel non-existent checkpoint', () => {
      const success = cancelCheckpoint('non-existent-id');
      expect(success).toBe(false);
    });

    it('should not cancel already-resolved checkpoint', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint('strategy', 'Choose', 'desc', options, 'opt-1', 0.6);

      const waiting = getWaitingCheckpoints();
      const checkpointId = waiting[0].id;

      // Resolve it
      resolveCheckpoint(checkpointId, 'opt-1');
      await checkpointPromise;

      // Try to cancel - should fail
      const success = cancelCheckpoint(checkpointId);
      expect(success).toBe(false);
    });
  });

  describe('Queue Management', () => {
    it('should get waiting checkpoints', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      // Create multiple checkpoints
      const cp1 = createCheckpoint('plan', 'CP1', 'desc', options, 'opt-1', 0.5, { convId: 'conv-a' });
      const cp2 = createCheckpoint('strategy', 'CP2', 'desc', options, 'opt-1', 0.6, { convId: 'conv-a' });
      const cp3 = createCheckpoint('parameter', 'CP3', 'desc', options, 'opt-1', 0.7, { convId: 'conv-b' });

      // Get all waiting
      const allWaiting = getWaitingCheckpoints();
      expect(allWaiting.length).toBe(3);

      // Get by convId
      const convAWaiting = getWaitingCheckpoints({ convId: 'conv-a' });
      expect(convAWaiting.length).toBe(2);

      // Get by type
      const planWaiting = getWaitingCheckpoints({ type: 'plan' });
      expect(planWaiting.length).toBe(1);
      expect(planWaiting[0].type).toBe('plan');

      // Cleanup - cancel all
      for (const cp of allWaiting) {
        cancelCheckpoint(cp.id);
      }
      await Promise.all([cp1, cp2, cp3]);
    });

    it('should get checkpoint by ID', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const checkpointPromise = createCheckpoint('execution', 'Test', 'desc', options, 'opt-1', 0.8);

      const waiting = getWaitingCheckpoints();
      const checkpointId = waiting[0].id;

      const cp = getCheckpoint(checkpointId);
      expect(cp).toBeDefined();
      expect(cp.id).toBe(checkpointId);
      expect(cp.type).toBe('execution');

      // Cleanup
      cancelCheckpoint(checkpointId);
      await checkpointPromise;
    });
  });

  describe('Confidence-Based Triggering', () => {
    it('should trigger checkpoint for low confidence', () => {
      expect(shouldTriggerCheckpoint(0.5, 'strategy')).toBe(true);
      expect(shouldTriggerCheckpoint(0.6, 'plan')).toBe(true);
    });

    it('should not trigger checkpoint for high confidence', () => {
      expect(shouldTriggerCheckpoint(0.8, 'strategy')).toBe(false);
      expect(shouldTriggerCheckpoint(0.9, 'plan')).toBe(false);
    });

    it('should respect confidence threshold from env', () => {
      process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD = '0.5';

      expect(shouldTriggerCheckpoint(0.4, 'strategy')).toBe(true);
      expect(shouldTriggerCheckpoint(0.6, 'strategy')).toBe(false);
    });

    it('should trigger for execution type even with high confidence', () => {
      expect(shouldTriggerCheckpoint(0.85, 'execution')).toBe(true);
      expect(shouldTriggerCheckpoint(0.95, 'execution')).toBe(false); // > 0.9 threshold
    });

    it('should not trigger when checkpoints disabled', () => {
      process.env.AUTONOMOUS_ENABLE_CHECKPOINTS = '0';

      expect(shouldTriggerCheckpoint(0.3, 'strategy')).toBe(false);
      expect(shouldTriggerCheckpoint(0.5, 'plan')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track checkpoint statistics', async () => {
      const options = [
        { id: 'opt-1', label: 'Recommended', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Alternative', description: 'desc', pros: [], cons: [], riskLevel: 'medium' },
      ];

      const initialStats = getCheckpointStats();

      // Create and resolve - match recommendation
      const cp1 = createCheckpoint('plan', 'CP1', 'desc', options, 'opt-1', 0.6);
      let waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-1'); // Match recommendation
      await cp1;

      // Create and resolve - different from recommendation
      const cp2 = createCheckpoint('strategy', 'CP2', 'desc', options, 'opt-1', 0.5);
      waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-2'); // Different from recommendation
      await cp2;

      const finalStats = getCheckpointStats();
      expect(finalStats.resolved).toBeGreaterThan(initialStats.resolved);
      expect(finalStats.recommendationAcceptanceRate).toBeGreaterThan(0);
      expect(finalStats.enabled).toBe(true);
    });

    it('should group stats by type', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      const cp1 = createCheckpoint('plan', 'Plan CP', 'desc', options, 'opt-1', 0.6);
      const cp2 = createCheckpoint('strategy', 'Strategy CP', 'desc', options, 'opt-1', 0.5);
      const cp3 = createCheckpoint('parameter', 'Param CP', 'desc', options, 'opt-1', 0.7);

      const stats = getCheckpointStats();
      expect(stats.byType.plan).toBeGreaterThan(0);
      expect(stats.byType.strategy).toBeGreaterThan(0);
      expect(stats.byType.parameter).toBeGreaterThan(0);

      // Cleanup
      const waiting = getWaitingCheckpoints();
      for (const cp of waiting) {
        cancelCheckpoint(cp.id);
      }
      await Promise.all([cp1, cp2, cp3]);
    });
  });

  describe('Helper Functions', () => {
    it('createStrategyCheckpoint should work correctly', async () => {
      const strategies = [
        {
          label: 'Approach A',
          description: 'Use approach A',
          pros: ['Fast', 'Simple'],
          cons: ['Limited'],
          risk: 'low',
          effort: '1 hour',
        },
        {
          label: 'Approach B',
          description: 'Use approach B',
          pros: ['Comprehensive'],
          cons: ['Complex', 'Slow'],
          risk: 'medium',
          effort: '3 hours',
        },
      ];

      const checkpointPromise = createStrategyCheckpoint(
        'Build Feature X',
        strategies,
        0, // Recommend first strategy
        0.65
      );

      const waiting = getWaitingCheckpoints();
      expect(waiting.length).toBe(1);
      expect(waiting[0].type).toBe('strategy');
      expect(waiting[0].options[0].label).toBe('Approach A');
      expect(waiting[0].options[0].estimatedEffort).toBe('1 hour');

      // Resolve
      resolveCheckpoint(waiting[0].id, 'strategy-1');
      const selected = await checkpointPromise;
      expect(selected.label).toBe('Approach B');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old resolved checkpoints', async () => {
      const options = [
        { id: 'opt-1', label: 'Opt 1', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'opt-2', label: 'Opt 2', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
      ];

      // Create and immediately resolve
      const checkpointPromise = createCheckpoint('plan', 'Old CP', 'desc', options, 'opt-1', 0.6);
      const waiting = getWaitingCheckpoints();
      resolveCheckpoint(waiting[0].id, 'opt-1');
      await checkpointPromise;

      // Cleanup with 0ms age (all resolved)
      const cleared = cleanupOldCheckpoints(0);
      expect(cleared).toBeGreaterThan(0);

      // Checkpoint should be gone
      const cp = getCheckpoint(waiting[0].id);
      expect(cp).toBeUndefined();
    });
  });
});
