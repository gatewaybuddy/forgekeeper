/**
 * Tests for Two-Phase Harmony Mode (Sprint 6)
 *
 * @module test/two-phase
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getTwoPhaseConfig,
  detectTwoPhaseMode,
  orchestratePhase1Analysis,
  orchestratePhase2Execution,
  orchestrateTwoPhase,
  isTwoPhaseEnabled,
  isAutoDetectEnabled,
} from '../server/orchestration/two-phase.mjs';

describe('Two-Phase Harmony Mode (Sprint 6)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should return default configuration', () => {
      const config = getTwoPhaseConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('autoDetect');
      expect(config).toHaveProperty('autoThreshold');
      expect(config).toHaveProperty('analysisMaxTokens');
      expect(config).toHaveProperty('executionMaxTokens');
      expect(config).toHaveProperty('allowPlanEditing');
    });

    it('should respect FRONTEND_ENABLE_TWO_PHASE env var', () => {
      process.env.FRONTEND_ENABLE_TWO_PHASE = '1';
      const config = getTwoPhaseConfig();
      expect(config.enabled).toBe(true);

      process.env.FRONTEND_ENABLE_TWO_PHASE = '0';
      const config2 = getTwoPhaseConfig();
      expect(config2.enabled).toBe(false);
    });

    it('should respect auto-detection threshold', () => {
      process.env.FRONTEND_AUTO_TWO_PHASE_THRESHOLD = '0.8';
      const config = getTwoPhaseConfig();
      expect(config.autoThreshold).toBe(0.8);
    });

    it('should use default token budgets', () => {
      const config = getTwoPhaseConfig();
      expect(config.analysisMaxTokens).toBe(4096);
      expect(config.executionMaxTokens).toBe(8192);
    });

    it('should allow plan editing by default', () => {
      const config = getTwoPhaseConfig();
      expect(config.allowPlanEditing).toBe(true);
    });
  });

  describe('Auto-Detection', () => {
    it('should detect high-stakes operations', () => {
      const result = detectTwoPhaseMode('Deploy to production');

      expect(result.shouldUse).toBe(false); // Default threshold is 0.6
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.matches.some(m => m.category === 'highStakes')).toBe(true);
    });

    it('should detect refactoring operations', () => {
      const result = detectTwoPhaseMode('Refactor the authentication module');

      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.matches.some(m => m.category === 'highStakes')).toBe(true);
    });

    it('should detect complex operations', () => {
      const result = detectTwoPhaseMode('Update multiple files across the codebase');

      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result.matches.some(m => m.category === 'complexity')).toBe(true);
    });

    it('should detect explicit plan requests', () => {
      const result = detectTwoPhaseMode('Show me a plan for implementing this feature');

      expect(result.shouldUse).toBe(false); // Default threshold is 0.6
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.matches.some(m => m.category === 'explicit')).toBe(true);
    });

    it('should combine multiple signals', () => {
      const result = detectTwoPhaseMode(
        'Show me a plan to refactor the production deployment scripts'
      );

      // Should have high confidence from multiple signals
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.shouldUse).toBe(true);
    });

    it('should not trigger on simple questions', () => {
      const result = detectTwoPhaseMode('What is React?');

      expect(result.shouldUse).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should factor in previous context', () => {
      const result = detectTwoPhaseMode('Continue', {
        previousIncomplete: true,
      });

      expect(result.confidence).toBeGreaterThanOrEqual(0.2);
      expect(result.matches.some(m => m.category === 'context')).toBe(true);
    });

    it('should handle null/undefined input', () => {
      const result1 = detectTwoPhaseMode(null);
      expect(result1.shouldUse).toBe(false);
      expect(result1.confidence).toBe(0.0);

      const result2 = detectTwoPhaseMode(undefined);
      expect(result2.shouldUse).toBe(false);
    });

    it('should respect custom threshold', () => {
      process.env.FRONTEND_AUTO_TWO_PHASE_THRESHOLD = '0.3';
      const result = detectTwoPhaseMode('Refactor the code'); // Confidence ~ 0.4

      expect(result.shouldUse).toBe(true); // Above 0.3 threshold
    });
  });

  describe('Phase 1: Analysis', () => {
    beforeEach(() => {
      // Mock fetch for orchestrator
      global.fetch = vi.fn();
    });

    it('should generate analysis with proper prompt structure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '**Understanding**: User wants to refactor...\n**Approach**: We will...',
            },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestratePhase1Analysis({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Refactor the auth module' }],
        tools: [],
        maxTokens: 4096,
      });

      expect(result.phase).toBe(1);
      expect(result.plan).toBeDefined();
      expect(result.status).toBe('awaiting_approval');
      expect(result.plan).toContain('Understanding');
    });

    it('should limit iterations in Phase 1', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Analysis plan here' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestratePhase1Analysis({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [{ type: 'function', function: { name: 'test_tool' } }],
        maxTokens: 4096,
      });

      // Phase 1 should limit iterations to prevent tool execution loops
      // (maxIterations is set to 2 in the implementation)
      expect(result.phase).toBe(1);
      expect(result.plan).toBeDefined();
    });

    it('should include analysis instruction in prompt', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Plan' },
            finish_reason: 'stop',
          }],
        }),
      });

      await orchestratePhase1Analysis({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Check that analysis instruction was added
      const hasAnalysisInstruction = body.messages.some(m =>
        m.content && m.content.includes('TWO-PHASE MODE')
      );
      expect(hasAnalysisInstruction).toBe(true);
    });
  });

  describe('Phase 2: Execution', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should execute with approved plan', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Execution completed successfully' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestratePhase2Execution({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        originalMessages: [{ role: 'user', content: 'Refactor code' }],
        approvedPlan: 'Step 1: Analyze\nStep 2: Refactor\nStep 3: Test',
        tools: [],
        maxTokens: 8192,
      });

      expect(result.phase).toBe(2);
      expect(result.content).toBeDefined();
      expect(result.status).toBe('completed');
    });

    it('should include approved plan in prompt', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Done' },
            finish_reason: 'stop',
          }],
        }),
      });

      const approvedPlan = 'My approved plan with steps';

      await orchestratePhase2Execution({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        originalMessages: [{ role: 'user', content: 'Test' }],
        approvedPlan,
      });

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Check that approved plan was included
      const hasPlan = body.messages.some(m =>
        m.content && m.content.includes(approvedPlan)
      );
      expect(hasPlan).toBe(true);
    });

    it('should handle plan edits', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Done with edits' },
            finish_reason: 'stop',
          }],
        }),
      });

      const originalPlan = 'Original plan';
      const editedPlan = 'Edited plan with changes';

      await orchestratePhase2Execution({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        originalMessages: [{ role: 'user', content: 'Test' }],
        approvedPlan: originalPlan,
        planEdits: editedPlan,
      });

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Should use edited plan, not original
      const hasEditedPlan = body.messages.some(m =>
        m.content && m.content.includes(editedPlan)
      );
      expect(hasEditedPlan).toBe(true);
    });

    it('should have access to tools in Phase 2', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Done' },
            finish_reason: 'stop',
          }],
        }),
      });

      const tools = [{ type: 'function', function: { name: 'test_tool' } }];

      await orchestratePhase2Execution({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        originalMessages: [{ role: 'user', content: 'Test' }],
        approvedPlan: 'Plan',
        tools,
      });

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      // Phase 2 should have tools
      expect(body.tools).toBeDefined();
      expect(body.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Combined Orchestration', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should execute Phase 1 by default', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Phase 1 plan' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestrateTwoPhase({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.phase).toBe(1);
      expect(result.status).toBe('awaiting_approval');
    });

    it('should require approved plan for Phase 2', async () => {
      await expect(async () => {
        await orchestrateTwoPhase({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
          phase: 2,
          // Missing approvedPlan
        });
      }).rejects.toThrow('Phase 2 requires an approved plan');
    });

    it('should reject invalid phase', async () => {
      await expect(async () => {
        await orchestrateTwoPhase({
          baseUrl: 'http://localhost:8001/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
          phase: 3, // Invalid
        });
      }).rejects.toThrow('Invalid phase');
    });

    it('should track elapsed time', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Plan' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestrateTwoPhase({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.elapsed_ms).toBe('number');
    });
  });

  describe('Feature Flags', () => {
    it('should check if two-phase is enabled', () => {
      process.env.FRONTEND_ENABLE_TWO_PHASE = '1';
      expect(isTwoPhaseEnabled()).toBe(true);

      process.env.FRONTEND_ENABLE_TWO_PHASE = '0';
      expect(isTwoPhaseEnabled()).toBe(false);
    });

    it('should check if auto-detect is enabled', () => {
      process.env.FRONTEND_AUTO_TWO_PHASE = '1';
      expect(isAutoDetectEnabled()).toBe(true);

      process.env.FRONTEND_AUTO_TWO_PHASE = '0';
      expect(isAutoDetectEnabled()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty plan', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestratePhase1Analysis({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.plan).toBe('');
      expect(result.status).toBe('awaiting_approval');
    });

    it('should handle missing reasoning', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Plan without reasoning' },
            finish_reason: 'stop',
          }],
        }),
      });

      const result = await orchestratePhase1Analysis({
        baseUrl: 'http://localhost:8001/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.reasoning).toBeNull();
    });
  });
});
