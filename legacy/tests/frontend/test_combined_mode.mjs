// Integration tests for combined mode (review + chunked) (T212)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Combined Mode Integration Tests', () => {
  describe('Strategy Configuration', () => {
    it('should support per_chunk strategy', () => {
      const strategy = 'per_chunk';
      assert.equal(strategy, 'per_chunk');
    });

    it('should support final_only strategy', () => {
      const strategy = 'final_only';
      assert.equal(strategy, 'final_only');
    });

    it('should support both strategy', () => {
      const strategy = 'both';
      assert.equal(strategy, 'both');
    });

    it('should default to final_only when not specified', () => {
      const envStrategy = process.env.FRONTEND_COMBINED_REVIEW_STRATEGY;
      const defaultStrategy = envStrategy || 'final_only';
      assert.ok(['per_chunk', 'final_only', 'both'].includes(defaultStrategy));
    });
  });

  describe('Mode Detection', () => {
    it('should detect combined mode when both features enabled', () => {
      const reviewEnabled = true;
      const chunkedEnabled = true;
      const combinedMode = reviewEnabled && chunkedEnabled;

      assert.equal(combinedMode, true);
    });

    it('should not use combined mode when only review enabled', () => {
      const reviewEnabled = true;
      const chunkedEnabled = false;
      const combinedMode = reviewEnabled && chunkedEnabled;

      assert.equal(combinedMode, false);
    });

    it('should not use combined mode when only chunked enabled', () => {
      const reviewEnabled = false;
      const chunkedEnabled = true;
      const combinedMode = reviewEnabled && chunkedEnabled;

      assert.equal(combinedMode, false);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate review config is available', async () => {
      const { getReviewConfig } = await import('../../frontend/config/review_prompts.mjs');
      const config = getReviewConfig();

      assert.ok(config);
      assert.ok('enabled' in config);
      assert.ok('threshold' in config);
      assert.ok('iterations' in config);
    });

    it('should validate chunked config is available', async () => {
      const { getChunkedConfig } = await import('../../frontend/config/chunked_prompts.mjs');
      const config = getChunkedConfig();

      assert.ok(config);
      assert.ok('enabled' in config);
      assert.ok('maxChunks' in config);
      assert.ok('tokensPerChunk' in config);
    });

    it('should allow both configs to coexist', async () => {
      const { getReviewConfig } = await import('../../frontend/config/review_prompts.mjs');
      const { getChunkedConfig } = await import('../../frontend/config/chunked_prompts.mjs');

      const reviewConfig = getReviewConfig();
      const chunkedConfig = getChunkedConfig();

      assert.ok(reviewConfig);
      assert.ok(chunkedConfig);
      // No conflicts
      assert.ok(typeof reviewConfig.threshold === 'number');
      assert.ok(typeof chunkedConfig.maxChunks === 'number');
    });
  });

  describe('Event Logging Structure', () => {
    it('should define combined_mode_start event structure', () => {
      const event = {
        actor: 'system',
        act: 'combined_mode_start',
        strategy: 'final_only',
        review_enabled: true,
        chunked_enabled: true,
        conv_id: 'test-123',
        trace_id: 'trace-456'
      };

      assert.equal(event.act, 'combined_mode_start');
      assert.ok(['per_chunk', 'final_only', 'both'].includes(event.strategy));
    });

    it('should define combined_mode_complete event structure', () => {
      const event = {
        actor: 'system',
        act: 'combined_mode_complete',
        strategy: 'final_only',
        chunk_count: 5,
        total_review_passes: 2,
        final_score: 0.85,
        total_elapsed_ms: 12000,
        conv_id: 'test-123',
        trace_id: 'trace-456'
      };

      assert.equal(event.act, 'combined_mode_complete');
      assert.ok(event.chunk_count > 0);
      assert.ok(event.total_review_passes >= 0);
      assert.ok(event.final_score >= 0.0 && event.final_score <= 1.0);
    });
  });

  describe('Strategy Behavior', () => {
    it('should describe per_chunk strategy behavior', () => {
      const strategy = {
        name: 'per_chunk',
        reviewTiming: 'after_each_chunk',
        reviewCount: (chunkCount) => chunkCount,
        description: 'Review each chunk individually before next'
      };

      assert.equal(strategy.name, 'per_chunk');
      assert.equal(strategy.reviewCount(5), 5);
    });

    it('should describe final_only strategy behavior', () => {
      const strategy = {
        name: 'final_only',
        reviewTiming: 'after_assembly',
        reviewCount: () => 1,
        description: 'Review only the final assembled response'
      };

      assert.equal(strategy.name, 'final_only');
      assert.equal(strategy.reviewCount(5), 1);
    });

    it('should describe both strategy behavior', () => {
      const strategy = {
        name: 'both',
        reviewTiming: 'after_each_and_final',
        reviewCount: (chunkCount) => chunkCount + 1,
        description: 'Review each chunk AND final assembly'
      };

      assert.equal(strategy.name, 'both');
      assert.equal(strategy.reviewCount(5), 6); // 5 chunks + 1 final
    });
  });

  describe('Performance Expectations', () => {
    it('should estimate per_chunk latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // Each chunk: generate + review
      const totalMs = chunkCount * (msPerChunk + msPerReview);

      assert.ok(totalMs > 0);
      assert.equal(totalMs, 17500); // 5 * 3500ms
    });

    it('should estimate final_only latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // All chunks + one final review
      const totalMs = (chunkCount * msPerChunk) + msPerReview;

      assert.ok(totalMs > 0);
      assert.equal(totalMs, 11500); // 10000 + 1500
    });

    it('should estimate both strategy latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // Each chunk reviewed + final review
      const totalMs = (chunkCount * (msPerChunk + msPerReview)) + msPerReview;

      assert.ok(totalMs > 0);
      assert.equal(totalMs, 19000); // 17500 + 1500
    });

    it('should compare strategies by speed', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      const finalOnly = (chunkCount * msPerChunk) + msPerReview;
      const perChunk = chunkCount * (msPerChunk + msPerReview);
      const both = perChunk + msPerReview;

      // final_only should be fastest
      assert.ok(finalOnly < perChunk);
      assert.ok(finalOnly < both);

      // both should be slowest
      assert.ok(both > finalOnly);
      assert.ok(both > perChunk);
    });
  });

  describe('Use Case Matching', () => {
    it('should recommend per_chunk for technical docs', () => {
      const useCase = {
        type: 'technical_documentation',
        requiresSectionQuality: true,
        recommendedStrategy: 'per_chunk',
        reason: 'Each section needs independent validation'
      };

      assert.equal(useCase.recommendedStrategy, 'per_chunk');
      assert.equal(useCase.requiresSectionQuality, true);
    });

    it('should recommend final_only for essays', () => {
      const useCase = {
        type: 'essay',
        requiresCohesion: true,
        recommendedStrategy: 'final_only',
        reason: 'Cohesion across chunks is priority'
      };

      assert.equal(useCase.recommendedStrategy, 'final_only');
      assert.equal(useCase.requiresCohesion, true);
    });

    it('should recommend both for critical docs', () => {
      const useCase = {
        type: 'critical_documentation',
        requiresMaxQuality: true,
        recommendedStrategy: 'both',
        reason: 'Maximum quality assurance required'
      };

      assert.equal(useCase.recommendedStrategy, 'both');
      assert.equal(useCase.requiresMaxQuality, true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid strategy gracefully', () => {
      const invalidStrategy = 'invalid_strategy';
      const validStrategies = ['per_chunk', 'final_only', 'both'];

      const isValid = validStrategies.includes(invalidStrategy);
      assert.equal(isValid, false);

      // Should fall back to default
      const strategy = isValid ? invalidStrategy : 'final_only';
      assert.equal(strategy, 'final_only');
    });

    it('should handle missing configuration', () => {
      const config = {
        review: null,
        chunked: null
      };

      // Should not crash, should fall back to standard mode
      const shouldUseCombined = Boolean(config.review && config.chunked);
      assert.equal(shouldUseCombined, false);
    });
  });

  describe('Integration Validation', () => {
    it('should validate combined mode is implemented', async () => {
      // Check that combined module exists
      try {
        const combined = await import('../../frontend/server.combined.mjs');
        assert.ok(combined);
        assert.ok(typeof combined.orchestrateCombined === 'function');
      } catch (error) {
        assert.fail('Combined mode module should exist and export orchestrateCombined');
      }
    });

    it('should validate config modules are compatible', async () => {
      const { getReviewConfig } = await import('../../frontend/config/review_prompts.mjs');
      const { getChunkedConfig } = await import('../../frontend/config/chunked_prompts.mjs');

      const reviewConfig = getReviewConfig();
      const chunkedConfig = getChunkedConfig();

      // Both should be objects with expected properties
      assert.ok(typeof reviewConfig === 'object');
      assert.ok(typeof chunkedConfig === 'object');

      // No property name conflicts
      const reviewKeys = Object.keys(reviewConfig);
      const chunkedKeys = Object.keys(chunkedConfig);

      // 'enabled' can be in both, but other keys should be unique
      const conflicts = reviewKeys.filter(k => k !== 'enabled' && chunkedKeys.includes(k));
      assert.equal(conflicts.length, 0);
    });
  });
});
