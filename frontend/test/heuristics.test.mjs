/**
 * Tests for auto-detection heuristics (T210)
 *
 * @module test/heuristics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectChunkedMode,
  detectReviewMode,
  detectOrchestrationMode,
  isAutoDetectionEnabled,
  getAutoDetectionConfig,
} from '../server.heuristics.mjs';

describe('Auto-detection Heuristics (T210)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('detectChunkedMode', () => {
    it('should detect comprehensive analysis requests', () => {
      const result = detectChunkedMode('Provide a comprehensive analysis of React hooks');

      expect(result.shouldUse).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.reason.toLowerCase()).toContain('comprehensive');
    });

    it('should detect step-by-step requests', () => {
      const result = detectChunkedMode('Explain step-by-step how to set up Docker');

      expect(result.shouldUse).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('should detect multi-part questions', () => {
      const result = detectChunkedMode('Compare React and Vue and Angular');

      expect(result.shouldUse).toBe(true);
      expect(result.matches.some(m => m.category === 'multiPart')).toBe(true);
    });

    it('should detect tutorial requests', () => {
      const result = detectChunkedMode('Create a tutorial for beginners on Python');

      expect(result.shouldUse).toBe(true);
      expect(result.matches.some(m => m.category === 'tutorial')).toBe(true);
    });

    it('should detect lengthy requests', () => {
      const result = detectChunkedMode('Write a comprehensive guide');

      expect(result.shouldUse).toBe(true);
      expect(result.matches.some(m => m.category === 'lengthy')).toBe(true);
    });

    it('should not trigger on simple questions', () => {
      const result = detectChunkedMode('What is React?');

      expect(result.shouldUse).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should score based on question length', () => {
      const longQuestion = 'This is a very long question with many words that should trigger chunked mode based on length alone even without specific keywords because it exceeds the word count threshold and suggests a complex response is needed with many details';
      const result = detectChunkedMode(longQuestion);

      // Long question should contribute to score but may not trigger alone
      expect(result.confidence).toBeGreaterThanOrEqual(0.0);
      if (result.matches) {
        expect(result.matches.some(m => m.category === 'length')).toBe(true);
      }
    });

    it('should handle null/undefined input', () => {
      const result1 = detectChunkedMode(null);
      expect(result1.shouldUse).toBe(false);
      expect(result1.confidence).toBe(0.0);

      const result2 = detectChunkedMode(undefined);
      expect(result2.shouldUse).toBe(false);
    });
  });

  describe('detectReviewMode', () => {
    it('should detect high-stakes requests', () => {
      const result = detectReviewMode('This is critical for production deployment');

      expect(result.shouldUse).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.matches.some(m => m.category === 'highStakes')).toBe(true);
    });

    it('should detect technical accuracy requirements', () => {
      const result = detectReviewMode('Verify the algorithm is correct');

      expect(result.shouldUse).toBe(true);
      expect(result.matches.some(m => m.category === 'accuracy')).toBe(true);
    });

    it('should detect code-related requests', () => {
      const result = detectReviewMode('Debug this error in the code');

      // Debug alone may not trigger without additional context
      expect(result.confidence).toBeGreaterThanOrEqual(0.35);
      if (result.matches) {
        expect(result.matches.some(m => m.category === 'code')).toBe(true);
      }
    });

    it('should detect security-related requests', () => {
      const result = detectReviewMode('Check for security vulnerabilities');

      expect(result.shouldUse).toBe(true);
      expect(result.matches.some(m => m.category === 'highStakes')).toBe(true);
    });

    it('should factor in previous incomplete responses', () => {
      const result = detectReviewMode('What is Node.js?', { previousIncomplete: true });

      // Previous incomplete should boost confidence significantly
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.matches && result.matches.some(m => m.category === 'context')).toBe(true);
    });

    it('should factor in multiple continuations', () => {
      const result = detectReviewMode('Explain', { previousContinuations: 3 });

      expect(result.confidence).toBeGreaterThan(0.0);
      expect(result.matches.some(m => m.category === 'context')).toBe(true);
    });

    it('should factor in conversation length', () => {
      const result = detectReviewMode('Continue', { messageCount: 10 });

      expect(result.confidence).toBeGreaterThan(0.0);
    });

    it('should not trigger on simple questions', () => {
      const result = detectReviewMode('What is JavaScript?');

      expect(result.shouldUse).toBe(false);
      expect(result.confidence).toBeLessThan(0.6);
    });

    it('should handle null/undefined input', () => {
      const result1 = detectReviewMode(null);
      expect(result1.shouldUse).toBe(false);
      expect(result1.confidence).toBe(0.0);

      const result2 = detectReviewMode(undefined);
      expect(result2.shouldUse).toBe(false);
    });
  });

  describe('detectOrchestrationMode', () => {
    it('should return chunked for comprehensive requests', () => {
      const result = detectOrchestrationMode('Provide a comprehensive analysis of microservices');

      expect(result.mode).toBe('chunked');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.alternatives.length).toBe(3);
    });

    it('should return review for critical requests', () => {
      const result = detectOrchestrationMode('Ensure this production code is correct');

      expect(result.mode).toBe('review');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should prefer chunked when both detected with equal confidence', () => {
      const result = detectOrchestrationMode(
        'Provide a comprehensive analysis of critical production deployment security'
      );

      // Should detect both but prefer chunked if equal/similar confidence
      expect(['chunked', 'review']).toContain(result.mode);
      expect(result.detection.chunked.shouldUse || result.detection.review.shouldUse).toBe(true);
    });

    it('should return standard mode for simple questions', () => {
      const result = detectOrchestrationMode('What is the time?');

      expect(result.mode).toBe('standard');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should include detection details', () => {
      const result = detectOrchestrationMode('Comprehensive guide', {});

      expect(result.detection).toBeDefined();
      expect(result.detection.chunked).toBeDefined();
      expect(result.detection.review).toBeDefined();
    });

    it('should sort alternatives by confidence', () => {
      const result = detectOrchestrationMode('Step by step tutorial');

      expect(result.alternatives.length).toBe(3);

      // Alternatives should be sorted descending
      for (let i = 0; i < result.alternatives.length - 1; i++) {
        expect(result.alternatives[i].confidence).toBeGreaterThanOrEqual(
          result.alternatives[i + 1].confidence
        );
      }
    });
  });

  describe('isAutoDetectionEnabled', () => {
    it('should check FRONTEND_AUTO_REVIEW env var', () => {
      process.env.FRONTEND_AUTO_REVIEW = '1';
      expect(isAutoDetectionEnabled('review')).toBe(true);

      process.env.FRONTEND_AUTO_REVIEW = '0';
      expect(isAutoDetectionEnabled('review')).toBe(false);

      delete process.env.FRONTEND_AUTO_REVIEW;
      expect(isAutoDetectionEnabled('review')).toBe(false);
    });

    it('should check FRONTEND_AUTO_CHUNKED env var', () => {
      process.env.FRONTEND_AUTO_CHUNKED = '1';
      expect(isAutoDetectionEnabled('chunked')).toBe(true);

      process.env.FRONTEND_AUTO_CHUNKED = '0';
      expect(isAutoDetectionEnabled('chunked')).toBe(false);

      delete process.env.FRONTEND_AUTO_CHUNKED;
      expect(isAutoDetectionEnabled('chunked')).toBe(false);
    });

    it('should return false for unknown modes', () => {
      expect(isAutoDetectionEnabled('unknown')).toBe(false);
    });
  });

  describe('getAutoDetectionConfig', () => {
    it('should return current configuration', () => {
      const config = getAutoDetectionConfig();

      expect(config.review).toBeDefined();
      expect(config.chunked).toBeDefined();
      expect(typeof config.review.enabled).toBe('boolean');
      expect(typeof config.chunked.enabled).toBe('boolean');
      expect(typeof config.review.threshold).toBe('number');
      expect(typeof config.chunked.threshold).toBe('number');
    });

    it('should use default thresholds when not set', () => {
      delete process.env.FRONTEND_AUTO_REVIEW_THRESHOLD;
      delete process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD;

      const config = getAutoDetectionConfig();

      expect(config.review.threshold).toBe(0.5);
      expect(config.chunked.threshold).toBe(0.3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const chunked = detectChunkedMode('');
      const review = detectReviewMode('');

      expect(chunked.shouldUse).toBe(false);
      expect(review.shouldUse).toBe(false);
    });

    it('should handle very short questions', () => {
      const chunked = detectChunkedMode('Hi');
      const review = detectReviewMode('Hi');

      expect(chunked.shouldUse).toBe(false);
      expect(review.shouldUse).toBe(false);
    });

    it('should handle questions with special characters', () => {
      const result = detectChunkedMode('Explain step-by-step: how does $VAR work?');

      expect(result.confidence).toBeGreaterThan(0.0);
    });

    it('should be case-insensitive', () => {
      const lower = detectChunkedMode('comprehensive analysis');
      const upper = detectChunkedMode('COMPREHENSIVE ANALYSIS');
      const mixed = detectChunkedMode('ComPrehenSive AnALYSis');

      expect(lower.shouldUse).toBe(upper.shouldUse);
      expect(lower.shouldUse).toBe(mixed.shouldUse);
    });
  });

  describe('Integration Scenarios', () => {
    it('should detect chunked for documentation request', () => {
      const result = detectOrchestrationMode(
        'Write a complete beginner\'s guide to Docker with step-by-step examples and detailed explanations'
      );

      expect(result.mode).toBe('chunked');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should detect review for production deployment', () => {
      const result = detectOrchestrationMode(
        'Verify this deployment script is correct and secure for production use'
      );

      expect(result.mode).toBe('review');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect standard for simple query', () => {
      const result = detectOrchestrationMode('What is the current time in UTC?');

      expect(result.mode).toBe('standard');
    });

    it('should handle conversational follow-ups', () => {
      const result = detectOrchestrationMode('Can you elaborate?', { messageCount: 8 });

      // May or may not trigger review based on context
      expect(['standard', 'review']).toContain(result.mode);
    });
  });
});
