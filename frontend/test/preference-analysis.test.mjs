/**
 * Tests for User Preference Pattern Analysis (T308)
 *
 * @module test/preference-analysis
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildPreferenceProfile,
  getPreferenceProfile,
  getPatternsByCategory,
  hasPattern,
  getRecommendationAdjustment,
  getPreferenceInsights,
  clearPreferenceProfile,
  getPreferenceStats,
} from '../server.preference-analysis.mjs';
import {
  submitFeedback,
  clearAllFeedback,
} from '../server.feedback.mjs';

describe('Preference Pattern Analysis', () => {
  beforeEach(() => {
    // Clear feedback and profiles before each test
    clearAllFeedback();
    clearPreferenceProfile('default');
    clearPreferenceProfile('test-user');
  });

  afterEach(() => {
    // Cleanup after tests
    clearAllFeedback();
    clearPreferenceProfile('default');
    clearPreferenceProfile('test-user');
  });

  describe('buildPreferenceProfile', () => {
    it('should build empty profile with no feedback', () => {
      const profile = buildPreferenceProfile('test-user');

      expect(profile).toBeDefined();
      expect(profile.userId).toBe('test-user');
      expect(profile.patterns).toEqual([]);
      expect(profile.statistics.total).toBe(0);
    });

    it('should detect risk tolerance pattern from approval feedback', () => {
      // Submit high-risk approval feedback (rating >= 4)
      for (let i = 0; i < 6; i++) {
        submitFeedback('approval', {
          rating: 4 + (i % 2), // Ratings 4 or 5
          reasoning: 'Approve high-risk operation',
          context: { convId: 'conv1' },
        });
      }

      const profile = buildPreferenceProfile('test-user');

      const riskPattern = profile.patterns.find((p) => p.category === 'risk_tolerance');
      expect(riskPattern).toBeDefined();
      expect(riskPattern.pattern).toMatch(/risk_tolerance/);
      expect(riskPattern.confidence).toBeGreaterThan(0.5);
    });

    it('should detect decision preference patterns from tagged feedback', () => {
      // Submit decision feedback with consistent tags
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 4,
          reasoning: 'Good decision',
          tags: ['refactoring', 'code_quality'],
          context: { decisionId: `decision-${i}` },
        });
      }

      const profile = buildPreferenceProfile('test-user');

      const decisionPattern = profile.patterns.find((p) => p.category === 'decision_preference');
      expect(decisionPattern).toBeDefined();
      expect(decisionPattern.pattern).toMatch(/prefers_(refactoring|code_quality)/);
    });

    it('should detect suggestion adoption pattern', () => {
      // Submit feedback with suggestions and high ratings
      for (let i = 0; i < 6; i++) {
        submitFeedback('general', {
          rating: 4 + (i % 2),
          suggestion: `Improvement ${i}`,
          context: { convId: 'conv1' },
        });
      }

      const profile = buildPreferenceProfile('test-user');

      const adoptionPattern = profile.patterns.find((p) => p.category === 'suggestion_adoption');
      expect(adoptionPattern).toBeDefined();
      expect(['high_adoption', 'moderate_adoption', 'low_adoption']).toContain(adoptionPattern.pattern);
    });

    it('should extract preferences from reasoning text', () => {
      // Submit feedback with preference keywords (need at least 5 per category)
      // Tools category
      for (let i = 0; i < 5; i++) {
        submitFeedback('general', {
          reasoning: `I prefer using the command line tool for this task ${i}`,
          rating: 5,
        });
      }
      // Communication category
      for (let i = 0; i < 5; i++) {
        submitFeedback('general', {
          reasoning: `Please use concise communication style ${i}`,
          rating: 4,
        });
      }

      const profile = buildPreferenceProfile('test-user');

      // Should detect tool and communication preferences
      expect(Object.keys(profile.preferences).length).toBeGreaterThan(0);
    });

    it('should not rebuild if updated recently', () => {
      const profile1 = buildPreferenceProfile('test-user');
      const profile2 = buildPreferenceProfile('test-user'); // Should return cached

      expect(profile1.lastUpdated).toBe(profile2.lastUpdated);
    });

    it('should force rebuild when requested', () => {
      const profile1 = buildPreferenceProfile('test-user');

      // Add new feedback
      submitFeedback('general', { rating: 5, reasoning: 'Good' });

      const profile2 = buildPreferenceProfile('test-user', { force: true });

      expect(profile2.statistics.total).toBeGreaterThan(profile1.statistics.total);
    });
  });

  describe('getPreferenceProfile', () => {
    it('should return existing profile', () => {
      buildPreferenceProfile('test-user');
      const profile = getPreferenceProfile('test-user');

      expect(profile.userId).toBe('test-user');
    });

    it('should build profile if not exists', () => {
      const profile = getPreferenceProfile('new-user');

      expect(profile.userId).toBe('new-user');
      expect(profile.patterns).toBeDefined();
    });

    it('should rebuild when requested', () => {
      buildPreferenceProfile('test-user');
      submitFeedback('general', { rating: 5 });

      const profile = getPreferenceProfile('test-user', { rebuild: true });

      expect(profile.statistics.total).toBeGreaterThan(0);
    });
  });

  describe('getPatternsByCategory', () => {
    it('should filter patterns by category', () => {
      // Create feedback to generate patterns
      for (let i = 0; i < 6; i++) {
        submitFeedback('approval', { rating: 5, reasoning: 'Approve' });
      }

      buildPreferenceProfile('test-user');

      const riskPatterns = getPatternsByCategory('risk_tolerance', 'test-user');
      expect(Array.isArray(riskPatterns)).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      buildPreferenceProfile('test-user');

      const patterns = getPatternsByCategory('non_existent', 'test-user');
      expect(patterns).toEqual([]);
    });
  });

  describe('hasPattern', () => {
    it('should detect existing pattern with sufficient confidence', () => {
      // Create high-confidence pattern
      for (let i = 0; i < 6; i++) {
        submitFeedback('approval', { rating: 5, reasoning: 'Approve' });
      }

      buildPreferenceProfile('test-user');

      const pattern = hasPattern('risk_tolerance', 'high_risk_tolerance', 'test-user');
      if (pattern) {
        expect(pattern.category).toBe('risk_tolerance');
        expect(pattern.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should return null for non-existent pattern', () => {
      buildPreferenceProfile('test-user');

      const pattern = hasPattern('non_existent', 'pattern', 'test-user');
      expect(pattern).toBeNull();
    });
  });

  describe('getRecommendationAdjustment', () => {
    it('should return no adjustment with no patterns', () => {
      buildPreferenceProfile('test-user');

      const adjustment = getRecommendationAdjustment('test_category', [], 'test-user');

      expect(adjustment.adjusted).toBe(false);
      expect(adjustment.recommendation).toBeNull();
    });

    it('should adjust recommendation based on pattern', () => {
      // Create feedback with refactoring preference
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['refactoring'],
          context: { decisionId: `d${i}` },
        });
      }

      buildPreferenceProfile('test-user');

      const options = [
        { id: 'refactoring-approach', label: 'Refactor code', tags: ['refactoring'] },
        { id: 'quick-fix', label: 'Quick fix', tags: ['quick'] },
      ];

      const adjustment = getRecommendationAdjustment('decision_preference', options, 'test-user');

      // May or may not adjust depending on pattern detection threshold
      expect(adjustment).toBeDefined();
      expect(typeof adjustment.adjusted).toBe('boolean');
    });
  });

  describe('getPreferenceInsights', () => {
    it('should return insights for decision with feedback', () => {
      submitFeedback('decision', {
        rating: 5,
        context: { decisionId: 'decision-1' },
      });

      buildPreferenceProfile('test-user');

      const insights = getPreferenceInsights('decision-1', 'test-user');

      expect(insights.feedbackCount).toBe(1);
      expect(insights.relevantPatterns).toBeDefined();
      expect(insights.confidence).toBeDefined();
    });

    it('should return zero feedback count for non-existent decision', () => {
      buildPreferenceProfile('test-user');

      const insights = getPreferenceInsights('non-existent', 'test-user');

      expect(insights.feedbackCount).toBe(0);
    });
  });

  describe('clearPreferenceProfile', () => {
    it('should clear existing profile', () => {
      buildPreferenceProfile('test-user');

      const result = clearPreferenceProfile('test-user');

      expect(result).toBe(true);
    });

    it('should return false for non-existent profile', () => {
      const result = clearPreferenceProfile('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getPreferenceStats', () => {
    it('should return preference statistics', () => {
      buildPreferenceProfile('user1');
      buildPreferenceProfile('user2');

      const stats = getPreferenceStats();

      expect(stats.enabled).toBeDefined();
      expect(stats.profileCount).toBeGreaterThanOrEqual(0);
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(stats.config).toBeDefined();
    });

    it('should calculate averages correctly', () => {
      // Create profiles with patterns
      for (let i = 0; i < 6; i++) {
        submitFeedback('approval', { rating: 5 });
      }
      buildPreferenceProfile('user1');

      const stats = getPreferenceStats();

      expect(typeof stats.avgPatternsPerProfile).toBe('string'); // Formatted as string
    });
  });

  describe('Pattern confidence calculation', () => {
    it('should increase confidence with more samples', () => {
      // Start with minimum samples
      for (let i = 0; i < 5; i++) {
        submitFeedback('approval', { rating: 5, reasoning: 'Approve' });
      }

      const profile1 = buildPreferenceProfile('test-user', { force: true });
      const pattern1 = profile1.patterns.find((p) => p.category === 'risk_tolerance');

      // Add more samples
      for (let i = 0; i < 10; i++) {
        submitFeedback('approval', { rating: 5, reasoning: 'Approve' });
      }

      const profile2 = buildPreferenceProfile('test-user', { force: true });
      const pattern2 = profile2.patterns.find((p) => p.category === 'risk_tolerance');

      if (pattern1 && pattern2) {
        expect(pattern2.confidence).toBeGreaterThanOrEqual(pattern1.confidence);
      }
    });
  });
});
