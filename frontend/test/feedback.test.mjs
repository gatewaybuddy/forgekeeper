/**
 * Unit Tests for Feedback Collection System (T307)
 *
 * Tests feedback submission, retrieval, filtering, and statistics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitFeedback,
  getFeedback,
  getAllFeedback,
  getFeedbackStats,
  getRecentFeedback,
  getFeedbackForDecision,
  getFeedbackForApproval,
  clearAllFeedback,
  getFeedbackCount,
} from '../server.feedback.mjs';

describe('Feedback Collection System (T307)', () => {
  beforeEach(() => {
    clearAllFeedback();
    process.env.AUTONOMOUS_ENABLE_FEEDBACK = '1';
    process.env.AUTONOMOUS_REQUIRE_FEEDBACK_RATING = '0';
  });

  describe('Feedback Submission', () => {
    it('should submit feedback with rating and reasoning', () => {
      const result = submitFeedback('decision', {
        rating: 5,
        reasoning: 'Excellent recommendation, saved time',
        context: { convId: 'conv-123', decisionId: 'dec-456' },
      });

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBeDefined();

      const feedback = getFeedback(result.feedbackId);
      expect(feedback.category).toBe('decision');
      expect(feedback.rating).toBe(5);
      expect(feedback.reasoning).toBe('Excellent recommendation, saved time');
    });

    it('should submit feedback with suggestion only', () => {
      const result = submitFeedback('system', {
        suggestion: 'Add more detailed explanations for recommendations',
      });

      expect(result.success).toBe(true);

      const feedback = getFeedback(result.feedbackId);
      expect(feedback.suggestion).toBe('Add more detailed explanations for recommendations');
    });

    it('should submit feedback with tags', () => {
      const result = submitFeedback('checkpoint', {
        rating: 4,
        tags: ['helpful', 'clear', 'accurate'],
        context: { checkpointId: 'cp-789' },
      });

      expect(result.success).toBe(true);

      const feedback = getFeedback(result.feedbackId);
      expect(feedback.tags).toEqual(['helpful', 'clear', 'accurate']);
    });

    it('should validate rating range (1-5)', () => {
      const tooLow = submitFeedback('decision', { rating: 0 });
      expect(tooLow.success).toBe(false);
      expect(tooLow.error).toContain('between 1 and 5');

      const tooHigh = submitFeedback('decision', { rating: 6 });
      expect(tooHigh.success).toBe(false);
      expect(tooHigh.error).toContain('between 1 and 5');

      const valid = submitFeedback('decision', { rating: 3 });
      expect(valid.success).toBe(true);
    });

    it('should require at least one of rating, reasoning, or suggestion', () => {
      const result = submitFeedback('general', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('rating, reasoning, or suggestion');
    });

    it('should validate category', () => {
      const result = submitFeedback('invalid-category', { rating: 5 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid category');
    });

    it('should require rating when configured', () => {
      process.env.AUTONOMOUS_REQUIRE_FEEDBACK_RATING = '1';

      const withoutRating = submitFeedback('decision', {
        reasoning: 'Good decision',
      });

      expect(withoutRating.success).toBe(false);
      expect(withoutRating.error).toContain('Rating is required');

      const withRating = submitFeedback('decision', {
        rating: 4,
        reasoning: 'Good decision',
      });

      expect(withRating.success).toBe(true);
    });

    it('should respect enabled/disabled state', () => {
      process.env.AUTONOMOUS_ENABLE_FEEDBACK = '0';

      const result = submitFeedback('decision', { rating: 5 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('Feedback Retrieval', () => {
    it('should retrieve feedback by ID', () => {
      const result = submitFeedback('approval', {
        rating: 3,
        reasoning: 'Approval was reasonable',
      });

      const feedback = getFeedback(result.feedbackId);

      expect(feedback).toBeDefined();
      expect(feedback.id).toBe(result.feedbackId);
      expect(feedback.rating).toBe(3);
    });

    it('should return undefined for non-existent feedback', () => {
      const feedback = getFeedback('non-existent-id');

      expect(feedback).toBeUndefined();
    });
  });

  describe('Feedback Filtering', () => {
    beforeEach(() => {
      // Create sample feedback
      submitFeedback('decision', {
        rating: 5,
        context: { convId: 'conv-a' },
      });
      submitFeedback('decision', {
        rating: 2,
        context: { convId: 'conv-a' },
      });
      submitFeedback('approval', {
        rating: 4,
        context: { convId: 'conv-b' },
      });
      submitFeedback('checkpoint', {
        rating: 3,
        tags: ['helpful'],
      });
      submitFeedback('system', {
        rating: 5,
        tags: ['feature-request'],
      });
    });

    it('should filter by category', () => {
      const decisionFeedback = getAllFeedback({ category: 'decision' });

      expect(decisionFeedback.length).toBe(2);
      expect(decisionFeedback.every((f) => f.category === 'decision')).toBe(true);
    });

    it('should filter by minimum rating', () => {
      const highRated = getAllFeedback({ minRating: 4 });

      expect(highRated.length).toBe(3); // 5, 4, 5
      expect(highRated.every((f) => f.rating >= 4)).toBe(true);
    });

    it('should filter by maximum rating', () => {
      const lowRated = getAllFeedback({ maxRating: 3 });

      expect(lowRated.length).toBe(2); // 2, 3
      expect(lowRated.every((f) => f.rating <= 3)).toBe(true);
    });

    it('should filter by conversation ID', () => {
      const convAFeedback = getAllFeedback({ convId: 'conv-a' });

      expect(convAFeedback.length).toBe(2);
      expect(convAFeedback.every((f) => f.context.convId === 'conv-a')).toBe(true);
    });

    it('should filter by tag', () => {
      const helpfulFeedback = getAllFeedback({ tag: 'helpful' });

      expect(helpfulFeedback.length).toBe(1);
      expect(helpfulFeedback[0].tags).toContain('helpful');
    });

    it('should support pagination', () => {
      const page1 = getAllFeedback({ limit: 2, offset: 0 });
      const page2 = getAllFeedback({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should combine multiple filters', () => {
      const filtered = getAllFeedback({
        category: 'decision',
        minRating: 4,
        convId: 'conv-a',
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].rating).toBe(5);
      expect(filtered[0].category).toBe('decision');
    });
  });

  describe('Feedback Statistics', () => {
    beforeEach(() => {
      // Create diverse feedback
      submitFeedback('decision', { rating: 5, reasoning: 'Great!' });
      submitFeedback('decision', { rating: 4, reasoning: 'Good' });
      submitFeedback('decision', { rating: 1 });
      submitFeedback('approval', { rating: 3, suggestion: 'Improve X' });
      submitFeedback('checkpoint', { rating: 5 });
    });

    it('should calculate average rating', () => {
      const stats = getFeedbackStats();

      expect(stats.avgRating).toBeDefined();
      expect(stats.avgRating).toBeCloseTo(3.6, 1); // (5+4+1+3+5)/5 = 3.6
    });

    it('should provide rating distribution', () => {
      const stats = getFeedbackStats();

      expect(stats.ratingDistribution[1]).toBe(1);
      expect(stats.ratingDistribution[3]).toBe(1);
      expect(stats.ratingDistribution[4]).toBe(1);
      expect(stats.ratingDistribution[5]).toBe(2);
    });

    it('should count by category', () => {
      const stats = getFeedbackStats();

      expect(stats.byCategory.decision).toBe(3);
      expect(stats.byCategory.approval).toBe(1);
      expect(stats.byCategory.checkpoint).toBe(1);
    });

    it('should count feedback with reasoning and suggestions', () => {
      const stats = getFeedbackStats();

      expect(stats.withReasoning).toBe(2);
      expect(stats.withSuggestions).toBe(1);
      expect(stats.percentWithReasoning).toBeCloseTo(40, 0); // 2/5 = 40%
      expect(stats.percentWithSuggestions).toBeCloseTo(20, 0); // 1/5 = 20%
    });

    it('should filter stats by category', () => {
      const decisionStats = getFeedbackStats({ category: 'decision' });

      expect(decisionStats.total).toBe(3);
      expect(decisionStats.byCategory.decision).toBe(3);
    });

    it('should handle empty feedback gracefully', () => {
      clearAllFeedback();

      const stats = getFeedbackStats();

      expect(stats.total).toBe(0);
      expect(stats.avgRating).toBe(0);
      expect(stats.withReasoning).toBe(0);
    });
  });

  describe('Recent Feedback', () => {
    it('should get recent feedback', () => {
      for (let i = 0; i < 15; i++) {
        submitFeedback('system', { rating: 3 + (i % 3) });
      }

      const recent = getRecentFeedback(5);

      expect(recent.length).toBe(5);
      // Should be sorted by timestamp (newest first)
      expect(new Date(recent[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(recent[4].timestamp).getTime()
      );
    });

    it('should filter recent feedback by category', () => {
      submitFeedback('decision', { rating: 5 });
      submitFeedback('approval', { rating: 4 });
      submitFeedback('decision', { rating: 3 });

      const recentDecisions = getRecentFeedback(10, 'decision');

      expect(recentDecisions.length).toBe(2);
      expect(recentDecisions.every((f) => f.category === 'decision')).toBe(true);
    });
  });

  describe('Feedback by Context', () => {
    it('should get feedback for specific decision', () => {
      submitFeedback('decision', {
        rating: 5,
        context: { decisionId: 'dec-123' },
      });
      submitFeedback('decision', {
        rating: 4,
        context: { decisionId: 'dec-123' },
      });
      submitFeedback('decision', {
        rating: 3,
        context: { decisionId: 'dec-456' },
      });

      const feedbackForDec123 = getFeedbackForDecision('dec-123');

      expect(feedbackForDec123.length).toBe(2);
      expect(feedbackForDec123.every((f) => f.context.decisionId === 'dec-123')).toBe(true);
    });

    it('should get feedback for specific approval', () => {
      submitFeedback('approval', {
        rating: 4,
        context: { approvalId: 'apr-789' },
      });
      submitFeedback('approval', {
        rating: 2,
        context: { approvalId: 'apr-999' },
      });

      const feedbackForApr789 = getFeedbackForApproval('apr-789');

      expect(feedbackForApr789.length).toBe(1);
      expect(feedbackForApr789[0].context.approvalId).toBe('apr-789');
    });
  });

  describe('Storage Management', () => {
    it('should track feedback count', () => {
      expect(getFeedbackCount()).toBe(0);

      submitFeedback('decision', { rating: 5 });
      submitFeedback('approval', { rating: 4 });

      expect(getFeedbackCount()).toBe(2);
    });

    it('should clear all feedback', () => {
      submitFeedback('decision', { rating: 5 });
      submitFeedback('approval', { rating: 4 });

      expect(getFeedbackCount()).toBe(2);

      clearAllFeedback();

      expect(getFeedbackCount()).toBe(0);
    });

    it('should limit feedback storage size', () => {
      process.env.AUTONOMOUS_MAX_FEEDBACK_ENTRIES = '100';

      // Submit 150 feedback entries
      for (let i = 0; i < 150; i++) {
        submitFeedback('system', { rating: 3 });
      }

      // Should keep only 100 most recent
      expect(getFeedbackCount()).toBe(100);
    });
  });

  describe('ContextLog Integration', () => {
    it('should include context in feedback', () => {
      const result = submitFeedback('checkpoint', {
        rating: 5,
        context: {
          convId: 'conv-abc',
          traceId: 'trace-xyz',
          checkpointId: 'cp-123',
        },
      });

      const feedback = getFeedback(result.feedbackId);

      expect(feedback.context.convId).toBe('conv-abc');
      expect(feedback.context.traceId).toBe('trace-xyz');
      expect(feedback.context.checkpointId).toBe('cp-123');
    });
  });
});
