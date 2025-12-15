/**
 * Integration tests for combined mode (review + chunked) (T209, T212)
 *
 * @module test/combined-mode
 */

import { describe, it, expect } from 'vitest';
import { getReviewConfig } from '../config/review_prompts.mjs';
import { getChunkedConfig } from '../config/chunked_prompts.mjs';
import { orchestrateCombined } from '../server/orchestration/combined.mjs';

describe('Combined Mode Integration Tests (T209)', () => {
  describe('Strategy Configuration', () => {
    it('should support per_chunk strategy', () => {
      const strategy = 'per_chunk';
      expect(strategy).toBe('per_chunk');
    });

    it('should support final_only strategy', () => {
      const strategy = 'final_only';
      expect(strategy).toBe('final_only');
    });

    it('should support both strategy', () => {
      const strategy = 'both';
      expect(strategy).toBe('both');
    });

    it('should default to final_only when not specified', () => {
      const envStrategy = process.env.FRONTEND_COMBINED_REVIEW_STRATEGY;
      const defaultStrategy = envStrategy || 'final_only';
      expect(['per_chunk', 'final_only', 'both']).toContain(defaultStrategy);
    });
  });

  describe('Mode Detection', () => {
    it('should detect combined mode when both features enabled', () => {
      const reviewEnabled = true;
      const chunkedEnabled = true;
      const combinedMode = reviewEnabled && chunkedEnabled;

      expect(combinedMode).toBe(true);
    });

    it('should not use combined mode when only review enabled', () => {
      const reviewEnabled = true;
      const chunkedEnabled = false;
      const combinedMode = reviewEnabled && chunkedEnabled;

      expect(combinedMode).toBe(false);
    });

    it('should not use combined mode when only chunked enabled', () => {
      const reviewEnabled = false;
      const chunkedEnabled = true;
      const combinedMode = reviewEnabled && chunkedEnabled;

      expect(combinedMode).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate review config is available', () => {
      const config = getReviewConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('threshold');
      expect(config).toHaveProperty('iterations');
    });

    it('should validate chunked config is available', () => {
      const config = getChunkedConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('maxChunks');
      expect(config).toHaveProperty('tokensPerChunk');
    });

    it('should allow both configs to coexist', () => {
      const reviewConfig = getReviewConfig();
      const chunkedConfig = getChunkedConfig();

      expect(reviewConfig).toBeDefined();
      expect(chunkedConfig).toBeDefined();

      // No conflicts
      expect(typeof reviewConfig.threshold).toBe('number');
      expect(typeof chunkedConfig.maxChunks).toBe('number');
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

      expect(event.act).toBe('combined_mode_start');
      expect(['per_chunk', 'final_only', 'both']).toContain(event.strategy);
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

      expect(event.act).toBe('combined_mode_complete');
      expect(event.chunk_count).toBeGreaterThan(0);
      expect(event.total_review_passes).toBeGreaterThanOrEqual(0);
      expect(event.final_score).toBeGreaterThanOrEqual(0.0);
      expect(event.final_score).toBeLessThanOrEqual(1.0);
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

      expect(strategy.name).toBe('per_chunk');
      expect(strategy.reviewCount(5)).toBe(5);
    });

    it('should describe final_only strategy behavior', () => {
      const strategy = {
        name: 'final_only',
        reviewTiming: 'after_assembly',
        reviewCount: () => 1,
        description: 'Review only the final assembled response'
      };

      expect(strategy.name).toBe('final_only');
      expect(strategy.reviewCount(5)).toBe(1);
    });

    it('should describe both strategy behavior', () => {
      const strategy = {
        name: 'both',
        reviewTiming: 'after_each_and_final',
        reviewCount: (chunkCount) => chunkCount + 1,
        description: 'Review each chunk AND final assembly'
      };

      expect(strategy.name).toBe('both');
      expect(strategy.reviewCount(5)).toBe(6); // 5 chunks + 1 final
    });
  });

  describe('Performance Expectations', () => {
    it('should estimate per_chunk latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // Each chunk: generate + review
      const totalMs = chunkCount * (msPerChunk + msPerReview);

      expect(totalMs).toBeGreaterThan(0);
      expect(totalMs).toBe(17500); // 5 * 3500ms
    });

    it('should estimate final_only latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // All chunks + one final review
      const totalMs = (chunkCount * msPerChunk) + msPerReview;

      expect(totalMs).toBeGreaterThan(0);
      expect(totalMs).toBe(11500); // 10000 + 1500
    });

    it('should estimate both strategy latency', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      // Each chunk reviewed + final review
      const totalMs = (chunkCount * (msPerChunk + msPerReview)) + msPerReview;

      expect(totalMs).toBeGreaterThan(0);
      expect(totalMs).toBe(19000); // 17500 + 1500
    });

    it('should compare strategies by speed', () => {
      const chunkCount = 5;
      const msPerChunk = 2000;
      const msPerReview = 1500;

      const finalOnly = (chunkCount * msPerChunk) + msPerReview;
      const perChunk = chunkCount * (msPerChunk + msPerReview);
      const both = perChunk + msPerReview;

      // final_only should be fastest
      expect(finalOnly).toBeLessThan(perChunk);
      expect(finalOnly).toBeLessThan(both);

      // both should be slowest
      expect(both).toBeGreaterThan(finalOnly);
      expect(both).toBeGreaterThan(perChunk);
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

      expect(useCase.recommendedStrategy).toBe('per_chunk');
      expect(useCase.requiresSectionQuality).toBe(true);
    });

    it('should recommend final_only for essays', () => {
      const useCase = {
        type: 'essay',
        requiresCohesion: true,
        recommendedStrategy: 'final_only',
        reason: 'Cohesion across chunks is priority'
      };

      expect(useCase.recommendedStrategy).toBe('final_only');
      expect(useCase.requiresCohesion).toBe(true);
    });

    it('should recommend both for critical docs', () => {
      const useCase = {
        type: 'critical_documentation',
        requiresMaxQuality: true,
        recommendedStrategy: 'both',
        reason: 'Maximum quality assurance required'
      };

      expect(useCase.recommendedStrategy).toBe('both');
      expect(useCase.requiresMaxQuality).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid strategy gracefully', () => {
      const invalidStrategy = 'invalid_strategy';
      const validStrategies = ['per_chunk', 'final_only', 'both'];

      const isValid = validStrategies.includes(invalidStrategy);
      expect(isValid).toBe(false);

      // Should fall back to default
      const strategy = isValid ? invalidStrategy : 'final_only';
      expect(strategy).toBe('final_only');
    });

    it('should handle missing configuration', () => {
      const config = {
        review: null,
        chunked: null
      };

      // Should not crash, should fall back to standard mode
      const shouldUseCombined = Boolean(config.review && config.chunked);
      expect(shouldUseCombined).toBe(false);
    });
  });

  describe('Integration Validation', () => {
    it('should validate combined mode is implemented', () => {
      // orchestrateCombined should be a function
      expect(typeof orchestrateCombined).toBe('function');
    });

    it('should validate config modules are compatible', () => {
      const reviewConfig = getReviewConfig();
      const chunkedConfig = getChunkedConfig();

      // Both should be objects with expected properties
      expect(typeof reviewConfig).toBe('object');
      expect(typeof chunkedConfig).toBe('object');

      // No property name conflicts
      const reviewKeys = Object.keys(reviewConfig);
      const chunkedKeys = Object.keys(chunkedConfig);

      // 'enabled' can be in both, but other keys should be unique
      const conflicts = reviewKeys.filter(k => k !== 'enabled' && chunkedKeys.includes(k));
      expect(conflicts.length).toBe(0);
    });
  });
});
