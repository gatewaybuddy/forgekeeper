/**
 * Unit Tests for User Preference Analysis & Adaptive Recommendations (T308-T309)
 *
 * Tests preference detection, pattern analysis, and adaptive recommendations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeUserPreferences,
  getAdaptiveRecommendation,
  getUserProfile,
  clearUserProfiles,
  getUserProfileCount,
} from '../server/collaborative/preferences.mjs';
import {
  recordCalibration,
  clearCalibrationHistory,
} from '../server/collaborative/confidence-calibration.mjs';
import {
  submitFeedback,
  clearAllFeedback,
} from '../server/collaborative/feedback.mjs';

describe('User Preference Analysis & Adaptive Recommendations (T308-T309)', () => {
  beforeEach(() => {
    clearUserProfiles();
    clearCalibrationHistory();
    clearAllFeedback();
    process.env.AUTONOMOUS_ENABLE_FEEDBACK = '1';
  });

  describe('Preference Analysis (T308)', () => {
    it('should require minimum samples for preference analysis', () => {
      // Create only 5 calibration records (less than min 10)
      for (let i = 0; i < 5; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      const profile = analyzeUserPreferences('user1');

      expect(profile.preferences.length).toBe(0);
      expect(profile.message).toContain('at least 10 decisions');
    });

    it('should detect conservative risk tolerance (high acceptance rate)', () => {
      // User accepts 90% of recommendations
      for (let i = 0; i < 9; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec'); // Accept
      }
      recordCalibration('plan', 0.7, 'rec', 'alt'); // Reject

      const profile = analyzeUserPreferences('user1');

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('conservative');
      expect(riskPref.confidence).toBeGreaterThan(0.8);
      expect(riskPref.sampleSize).toBe(10);
    });

    it('should detect moderate risk tolerance (balanced acceptance)', () => {
      // User accepts 70% of recommendations
      for (let i = 0; i < 14; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'rec'); // Accept
      }
      for (let i = 0; i < 6; i++) {
        recordCalibration('strategy', 0.7, 'rec', 'alt'); // Reject
      }

      const profile = analyzeUserPreferences('user2');

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('moderate');
      expect(riskPref.confidence).toBeCloseTo(0.75, 1);
    });

    it('should detect exploratory risk tolerance (frequent alternatives)', () => {
      // User accepts 50% of recommendations
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', i % 2 === 0 ? 'rec' : 'alt');
      }

      const profile = analyzeUserPreferences('user3');

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('exploratory');
    });

    it('should detect aggressive risk tolerance (low acceptance rate)', () => {
      // User accepts only 20% of recommendations
      for (let i = 0; i < 4; i++) {
        recordCalibration('execution', 0.9, 'rec', 'rec'); // Accept
      }
      for (let i = 0; i < 16; i++) {
        recordCalibration('execution', 0.9, 'rec', 'alt'); // Reject
      }

      const profile = analyzeUserPreferences('user4');

      const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');
      expect(riskPref).toBeDefined();
      expect(riskPref.value).toBe('aggressive');
      expect(riskPref.confidence).toBeGreaterThan(0.7);
    });

    it('should detect deliberate decision speed (provides reasoning)', () => {
      // User provides detailed reasoning 80% of the time
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      for (let i = 0; i < 8; i++) {
        submitFeedback('decision', { rating: 5, reasoning: 'Detailed reasoning here' });
      }
      for (let i = 0; i < 2; i++) {
        submitFeedback('decision', { rating: 5 }); // No reasoning
      }

      const profile = analyzeUserPreferences('user5');

      const speedPref = profile.preferences.find((p) => p.category === 'decision_speed');
      expect(speedPref).toBeDefined();
      expect(speedPref.value).toBe('deliberate');
      expect(speedPref.confidence).toBeGreaterThan(0.7);
    });

    it('should detect quick decision speed (rarely provides reasoning)', () => {
      // User provides reasoning only 20% of the time
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      for (let i = 0; i < 2; i++) {
        submitFeedback('decision', { rating: 5, reasoning: 'Quick note' });
      }
      for (let i = 0; i < 8; i++) {
        submitFeedback('decision', { rating: 5 }); // No reasoning
      }

      const profile = analyzeUserPreferences('user6');

      const speedPref = profile.preferences.find((p) => p.category === 'decision_speed');
      expect(speedPref).toBeDefined();
      expect(speedPref.value).toBe('quick');
    });

    it('should detect proactive feedback pattern', () => {
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      // User frequently provides suggestions
      for (let i = 0; i < 5; i++) {
        submitFeedback('system', { rating: 4, suggestion: 'Improvement suggestion' });
      }

      const profile = analyzeUserPreferences('user7');

      const pattern = profile.patterns.find((p) => p.pattern === 'proactive_feedback');
      expect(pattern).toBeDefined();
      expect(pattern.frequency).toBeGreaterThan(0.3);
    });

    it('should store and retrieve user profiles', () => {
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      analyzeUserPreferences('user-abc');

      const profile = getUserProfile('user-abc');

      expect(profile).toBeDefined();
      expect(profile.preferences.length).toBeGreaterThan(0);
      expect(profile.totalDecisions).toBe(15);
    });

    it('should track multiple user profiles', () => {
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      analyzeUserPreferences('user1');
      analyzeUserPreferences('user2');

      expect(getUserProfileCount()).toBe(2);
    });
  });

  describe('Adaptive Recommendations (T309)', () => {
    const options = [
      {
        id: 'low-risk',
        label: 'Safe Option',
        description: 'Low risk',
        pros: ['Safe'],
        cons: [],
        riskLevel: 'low',
      },
      {
        id: 'medium-risk',
        label: 'Balanced Option',
        description: 'Medium risk',
        pros: ['Balanced'],
        cons: [],
        riskLevel: 'medium',
      },
      {
        id: 'high-risk',
        label: 'Aggressive Option',
        description: 'High risk',
        pros: ['High reward'],
        cons: [],
        riskLevel: 'high',
      },
    ];

    it('should provide default recommendation with no user history', () => {
      const rec = getAdaptiveRecommendation(options, 'new-user');

      expect(rec.recommendedId).toBe('low-risk'); // First option by default
      expect(rec.confidence).toBe(0.5); // Neutral confidence
      expect(rec.reasoning).toContain('Insufficient user history');
    });

    it('should recommend low-risk for conservative users', () => {
      // Create conservative user (90% acceptance)
      for (let i = 0; i < 18; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 2; i++) {
        recordCalibration('plan', 0.7, 'rec', 'alt');
      }

      const rec = getAdaptiveRecommendation(options, 'conservative-user');

      expect(rec.recommendedId).toBe('low-risk');
      expect(rec.confidence).toBeGreaterThanOrEqual(0.7);
      expect(rec.reasoning).toContain('conservative risk tolerance');
    });

    it('should recommend medium-risk for moderate users', () => {
      // Create moderate user (70% acceptance)
      for (let i = 0; i < 14; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 6; i++) {
        recordCalibration('plan', 0.7, 'rec', 'alt');
      }

      const rec = getAdaptiveRecommendation(options, 'moderate-user');

      expect(rec.recommendedId).toBe('medium-risk');
      expect(rec.confidence).toBeGreaterThan(0.5);
      expect(rec.reasoning).toContain('moderate risk tolerance');
    });

    it('should recommend higher-risk for exploratory users', () => {
      // Create exploratory user (50% acceptance)
      for (let i = 0; i < 10; i++) {
        recordCalibration('plan', 0.7, 'rec', i % 2 === 0 ? 'rec' : 'alt');
      }

      const rec = getAdaptiveRecommendation(options, 'exploratory-user');

      expect(['medium-risk', 'high-risk']).toContain(rec.recommendedId);
      expect(rec.reasoning).toContain('exploratory risk tolerance');
    });

    it('should recommend high-risk for aggressive users', () => {
      // Create aggressive user (20% acceptance)
      for (let i = 0; i < 4; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 16; i++) {
        recordCalibration('plan', 0.7, 'rec', 'alt');
      }

      const rec = getAdaptiveRecommendation(options, 'aggressive-user');

      expect(rec.recommendedId).toBe('high-risk');
      expect(rec.reasoning).toContain('aggressive risk tolerance');
    });

    it('should adjust confidence based on user profile confidence', () => {
      // Create user with strong pattern (95% acceptance)
      for (let i = 0; i < 19; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      recordCalibration('plan', 0.7, 'rec', 'alt');

      const rec = getAdaptiveRecommendation(options, 'strong-pattern-user');

      // High acceptance rate (conservative) with high confidence
      expect(rec.confidence).toBeGreaterThan(0.7);
      expect(rec.userProfile).toBeDefined();
      expect(rec.userProfile.totalDecisions).toBe(20);
    });

    it('should handle empty options gracefully', () => {
      const rec = getAdaptiveRecommendation([], 'any-user');

      expect(rec.recommendedId).toBeNull();
      expect(rec.confidence).toBe(0);
      expect(rec.reasoning).toContain('No options available');
    });

    it('should fall back to first option when risk level not found', () => {
      const optionsWithoutMedium = [
        { id: 'low', label: 'Low', description: 'desc', pros: [], cons: [], riskLevel: 'low' },
        { id: 'high', label: 'High', description: 'desc', pros: [], cons: [], riskLevel: 'high' },
      ];

      // Create moderate user (would prefer medium-risk)
      for (let i = 0; i < 14; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }
      for (let i = 0; i < 6; i++) {
        recordCalibration('plan', 0.7, 'rec', 'alt');
      }

      const rec = getAdaptiveRecommendation(optionsWithoutMedium, 'moderate-user');

      // Should fall back to 'low' since 'medium' not available
      expect(rec.recommendedId).toBe('low');
    });

    it('should include user profile in recommendation', () => {
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      const rec = getAdaptiveRecommendation(options, 'test-user');

      expect(rec.userProfile).toBeDefined();
      expect(rec.userProfile.preferences).toBeDefined();
      expect(rec.userProfile.totalDecisions).toBe(15);
    });
  });

  describe('Profile Management', () => {
    it('should clear all user profiles', () => {
      for (let i = 0; i < 15; i++) {
        recordCalibration('plan', 0.7, 'rec', 'rec');
      }

      analyzeUserPreferences('user1');
      analyzeUserPreferences('user2');

      expect(getUserProfileCount()).toBe(2);

      clearUserProfiles();

      expect(getUserProfileCount()).toBe(0);
    });

    it('should return null for non-existent user profile', () => {
      const profile = getUserProfile('non-existent-user');

      expect(profile).toBeNull();
    });
  });
});
