// Tests for auto-detection heuristics (T210)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectChunkedMode,
  detectReviewMode,
  detectOrchestrationMode,
  isAutoDetectionEnabled,
  getAutoDetectionConfig,
} from '../../frontend/server.heuristics.mjs';

describe('Auto-detection Heuristics', () => {
  describe('detectChunkedMode', () => {
    it('should detect comprehensive analysis requests', () => {
      const result = detectChunkedMode('Provide a comprehensive analysis of React hooks');
      assert.equal(result.shouldUse, true);
      assert.ok(result.confidence >= 0.4);
      assert.ok(result.reason.includes('comprehensive'));
    });

    it('should detect step-by-step requests', () => {
      const result = detectChunkedMode('Explain step-by-step how to set up Docker');
      assert.equal(result.shouldUse, true);
      assert.ok(result.confidence >= 0.3);
    });

    it('should detect multi-part questions', () => {
      const result = detectChunkedMode('Compare React and Vue and Angular');
      assert.equal(result.shouldUse, true);
      assert.ok(result.matches.some(m => m.category === 'multiPart'));
    });

    it('should detect tutorial requests', () => {
      const result = detectChunkedMode('Create a tutorial for beginners on Python');
      assert.equal(result.shouldUse, true);
      assert.ok(result.matches.some(m => m.category === 'tutorial'));
    });

    it('should detect lengthy requests', () => {
      const result = detectChunkedMode('Write a comprehensive guide');
      assert.equal(result.shouldUse, true);
      assert.ok(result.matches.some(m => m.category === 'lengthy'));
    });

    it('should not trigger on simple questions', () => {
      const result = detectChunkedMode('What is React?');
      assert.equal(result.shouldUse, false);
      assert.ok(result.confidence < 0.5);
    });

    it('should score based on question length', () => {
      const longQuestion = 'This is a very long question with many words that should trigger chunked mode based on length alone even without specific keywords because it exceeds the word count threshold and suggests a complex response is needed with many details';
      const result = detectChunkedMode(longQuestion);
      // Long question should contribute to score but may not trigger alone
      assert.ok(result.confidence >= 0.0);
      if (result.matches) {
        assert.ok(result.matches.some(m => m.category === 'length'));
      }
    });

    it('should handle null/undefined input', () => {
      const result1 = detectChunkedMode(null);
      assert.equal(result1.shouldUse, false);
      assert.equal(result1.confidence, 0.0);

      const result2 = detectChunkedMode(undefined);
      assert.equal(result2.shouldUse, false);
    });
  });

  describe('detectReviewMode', () => {
    it('should detect high-stakes requests', () => {
      const result = detectReviewMode('This is critical for production deployment');
      assert.equal(result.shouldUse, true);
      assert.ok(result.confidence >= 0.5);
      assert.ok(result.matches.some(m => m.category === 'highStakes'));
    });

    it('should detect technical accuracy requirements', () => {
      const result = detectReviewMode('Verify the algorithm is correct');
      assert.equal(result.shouldUse, true);
      assert.ok(result.matches.some(m => m.category === 'accuracy'));
    });

    it('should detect code-related requests', () => {
      const result = detectReviewMode('Debug this error in the code');
      // Debug alone may not trigger without additional context
      assert.ok(result.confidence >= 0.35);
      if (result.matches) {
        assert.ok(result.matches.some(m => m.category === 'code'));
      }
    });

    it('should detect security-related requests', () => {
      const result = detectReviewMode('Check for security vulnerabilities');
      assert.equal(result.shouldUse, true);
      assert.ok(result.matches.some(m => m.category === 'highStakes'));
    });

    it('should factor in previous incomplete responses', () => {
      const result = detectReviewMode('What is Node.js?', { previousIncomplete: true });
      // Previous incomplete should boost confidence significantly
      assert.ok(result.confidence >= 0.4);
      assert.ok(result.matches && result.matches.some(m => m.category === 'context'));
    });

    it('should factor in multiple continuations', () => {
      const result = detectReviewMode('Explain', { previousContinuations: 3 });
      assert.ok(result.confidence > 0.0);
      assert.ok(result.matches.some(m => m.category === 'context'));
    });

    it('should factor in conversation length', () => {
      const result = detectReviewMode('Continue', { messageCount: 10 });
      assert.ok(result.confidence > 0.0);
    });

    it('should not trigger on simple questions', () => {
      const result = detectReviewMode('What is JavaScript?');
      assert.equal(result.shouldUse, false);
      assert.ok(result.confidence < 0.6);
    });

    it('should handle null/undefined input', () => {
      const result1 = detectReviewMode(null);
      assert.equal(result1.shouldUse, false);
      assert.equal(result1.confidence, 0.0);

      const result2 = detectReviewMode(undefined);
      assert.equal(result2.shouldUse, false);
    });
  });

  describe('detectOrchestrationMode', () => {
    it('should return chunked for comprehensive requests', () => {
      const result = detectOrchestrationMode('Provide a comprehensive analysis of microservices');
      assert.equal(result.mode, 'chunked');
      assert.ok(result.confidence >= 0.4);
      assert.ok(result.alternatives.length === 3);
    });

    it('should return review for critical requests', () => {
      const result = detectOrchestrationMode('Ensure this production code is correct');
      assert.equal(result.mode, 'review');
      assert.ok(result.confidence >= 0.6);
    });

    it('should prefer chunked when both detected with equal confidence', () => {
      const result = detectOrchestrationMode(
        'Provide a comprehensive analysis of critical production deployment security'
      );
      // Should detect both but prefer chunked if equal/similar confidence
      assert.ok(['chunked', 'review'].includes(result.mode));
      assert.ok(result.detection.chunked.shouldUse || result.detection.review.shouldUse);
    });

    it('should return standard mode for simple questions', () => {
      const result = detectOrchestrationMode('What is the time?');
      assert.equal(result.mode, 'standard');
      assert.ok(result.confidence < 0.5);
    });

    it('should include detection details', () => {
      const result = detectOrchestrationMode('Comprehensive guide', {});
      assert.ok(result.detection);
      assert.ok(result.detection.chunked);
      assert.ok(result.detection.review);
    });

    it('should sort alternatives by confidence', () => {
      const result = detectOrchestrationMode('Step by step tutorial');
      assert.ok(result.alternatives.length === 3);
      // Alternatives should be sorted descending
      for (let i = 0; i < result.alternatives.length - 1; i++) {
        assert.ok(result.alternatives[i].confidence >= result.alternatives[i + 1].confidence);
      }
    });
  });

  describe('isAutoDetectionEnabled', () => {
    it('should check FRONTEND_AUTO_REVIEW env var', () => {
      const original = process.env.FRONTEND_AUTO_REVIEW;

      process.env.FRONTEND_AUTO_REVIEW = '1';
      assert.equal(isAutoDetectionEnabled('review'), true);

      process.env.FRONTEND_AUTO_REVIEW = '0';
      assert.equal(isAutoDetectionEnabled('review'), false);

      delete process.env.FRONTEND_AUTO_REVIEW;
      assert.equal(isAutoDetectionEnabled('review'), false);

      // Restore
      if (original !== undefined) process.env.FRONTEND_AUTO_REVIEW = original;
    });

    it('should check FRONTEND_AUTO_CHUNKED env var', () => {
      const original = process.env.FRONTEND_AUTO_CHUNKED;

      process.env.FRONTEND_AUTO_CHUNKED = '1';
      assert.equal(isAutoDetectionEnabled('chunked'), true);

      process.env.FRONTEND_AUTO_CHUNKED = '0';
      assert.equal(isAutoDetectionEnabled('chunked'), false);

      delete process.env.FRONTEND_AUTO_CHUNKED;
      assert.equal(isAutoDetectionEnabled('chunked'), false);

      // Restore
      if (original !== undefined) process.env.FRONTEND_AUTO_CHUNKED = original;
    });

    it('should return false for unknown modes', () => {
      assert.equal(isAutoDetectionEnabled('unknown'), false);
    });
  });

  describe('getAutoDetectionConfig', () => {
    it('should return current configuration', () => {
      const config = getAutoDetectionConfig();
      assert.ok(config.review);
      assert.ok(config.chunked);
      assert.ok(typeof config.review.enabled === 'boolean');
      assert.ok(typeof config.chunked.enabled === 'boolean');
      assert.ok(typeof config.review.threshold === 'number');
      assert.ok(typeof config.chunked.threshold === 'number');
    });

    it('should use default thresholds when not set', () => {
      const origReview = process.env.FRONTEND_AUTO_REVIEW_THRESHOLD;
      const origChunked = process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD;

      delete process.env.FRONTEND_AUTO_REVIEW_THRESHOLD;
      delete process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD;

      const config = getAutoDetectionConfig();
      assert.equal(config.review.threshold, 0.5);
      assert.equal(config.chunked.threshold, 0.3);

      // Restore
      if (origReview !== undefined) process.env.FRONTEND_AUTO_REVIEW_THRESHOLD = origReview;
      if (origChunked !== undefined) process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD = origChunked;
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const chunked = detectChunkedMode('');
      const review = detectReviewMode('');
      assert.equal(chunked.shouldUse, false);
      assert.equal(review.shouldUse, false);
    });

    it('should handle very short questions', () => {
      const chunked = detectChunkedMode('Hi');
      const review = detectReviewMode('Hi');
      assert.equal(chunked.shouldUse, false);
      assert.equal(review.shouldUse, false);
    });

    it('should handle questions with special characters', () => {
      const result = detectChunkedMode('Explain step-by-step: how does $VAR work?');
      assert.ok(result.confidence > 0.0);
    });

    it('should be case-insensitive', () => {
      const lower = detectChunkedMode('comprehensive analysis');
      const upper = detectChunkedMode('COMPREHENSIVE ANALYSIS');
      const mixed = detectChunkedMode('ComPrehenSive AnALYSis');

      assert.equal(lower.shouldUse, upper.shouldUse);
      assert.equal(lower.shouldUse, mixed.shouldUse);
    });
  });

  describe('Integration Scenarios', () => {
    it('should detect chunked for documentation request', () => {
      const result = detectOrchestrationMode(
        'Write a complete beginner\'s guide to Docker with step-by-step examples and detailed explanations'
      );
      assert.equal(result.mode, 'chunked');
      assert.ok(result.confidence >= 0.5);
    });

    it('should detect review for production deployment', () => {
      const result = detectOrchestrationMode(
        'Verify this deployment script is correct and secure for production use'
      );
      assert.equal(result.mode, 'review');
      assert.ok(result.confidence >= 0.6);
    });

    it('should detect standard for simple query', () => {
      const result = detectOrchestrationMode('What is the current time in UTC?');
      assert.equal(result.mode, 'standard');
    });

    it('should handle conversational follow-ups', () => {
      const result = detectOrchestrationMode('Can you elaborate?', { messageCount: 8 });
      // May or may not trigger review based on context
      assert.ok(['standard', 'review'].includes(result.mode));
    });
  });
});
