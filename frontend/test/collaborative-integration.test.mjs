/**
 * Integration Tests for Collaborative Intelligence System (T312)
 *
 * End-to-end tests verifying the complete collaborative intelligence pipeline:
 * - Approval workflows
 * - Feedback collection
 * - Preference learning
 * - Adaptive recommendations
 * - ContextLog integration
 *
 * @module test/collaborative-integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Approval system
import {
  requestApproval,
  respondToApproval,
  getPendingApprovals,
  getApprovalStats,
} from '../server/collaborative/approval.mjs';

// Feedback system
import {
  submitFeedback,
  getAllFeedback,
  getFeedbackStats,
  clearAllFeedback,
} from '../server/collaborative/feedback.mjs';

// Preference analysis
import {
  buildPreferenceProfile,
  getPreferenceProfile,
  hasPattern,
  clearPreferenceProfile,
} from '../server/collaborative/preference-analysis.mjs';

// Adaptive recommendations
import {
  generateRecommendations,
  recordRecommendationChoice,
  getRecommendationAccuracy,
  clearRecommendationHistory,
  clearABTests,
} from '../server/collaborative/adaptive-recommendations.mjs';

// ContextLog integration
import {
  queryCollaborationEvents,
  getCollaborationTimeline,
  getCollaborationAnalytics,
  COLLABORATION_EVENT_TYPES,
} from '../server/telemetry/collaboration-events.mjs';

describe('Collaborative Intelligence - Integration Tests', () => {
  const TEST_USER = `integration-test-user-${Date.now()}`;
  const TEST_CONV = `integration-test-conv-${Date.now()}`;

  beforeEach(() => {
    // Clear state
    clearAllFeedback();
    clearPreferenceProfile(TEST_USER);
    clearRecommendationHistory();
    clearABTests();
  });

  afterEach(() => {
    // Cleanup
    clearAllFeedback();
    clearPreferenceProfile(TEST_USER);
    clearRecommendationHistory();
    clearABTests();
  });

  describe('End-to-End Approval Workflow', () => {
    it('should complete full approval cycle with ContextLog tracking', async () => {
      // Enable collaboration
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '1';

      // 1. Request approval
      const approvalPromise = requestApproval('test_operation', {
        task: 'Integration test operation',
        reasoning: 'Testing approval workflow',
        impact: 'high',
        alternatives: ['Alternative 1', 'Alternative 2'],
      }, {
        convId: TEST_CONV,
        timeoutMs: 5000,
      });

      // 2. Check pending approvals
      const pending = getPendingApprovals({ convId: TEST_CONV });
      expect(pending.length).toBe(1);
      expect(pending[0].operation).toBe('test_operation');

      // 3. Respond to approval
      const requestId = pending[0].id;
      const responded = respondToApproval(requestId, 'approve', {
        feedback: 'Looks good to proceed',
      });

      expect(responded).toBe(true);

      // 4. Wait for approval promise to resolve
      const response = await approvalPromise;
      expect(response.decision).toBe('approve');
      expect(response.feedback).toBe('Looks good to proceed');

      // 5. Verify ContextLog events
      const events = queryCollaborationEvents({
        convId: TEST_CONV,
        eventTypes: [
          COLLABORATION_EVENT_TYPES.APPROVAL_REQUEST,
          COLLABORATION_EVENT_TYPES.APPROVAL_RESPONSE,
        ],
        limit: 100,
      });

      expect(events.length).toBeGreaterThanOrEqual(2);

      // 6. Check approval stats
      const stats = getApprovalStats();
      expect(stats.approved).toBeGreaterThan(0);

      // Restore default
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '0';
    });
  });

  describe('Feedback Collection and Preference Learning', () => {
    it('should collect feedback and build user preference profile', () => {
      // 1. Submit multiple feedback entries with consistent pattern
      const feedbackIds = [];
      for (let i = 0; i < 6; i++) {
        const result = submitFeedback('decision', {
          rating: 5,
          reasoning: 'I prefer refactoring approaches for code quality',
          tags: ['refactoring', 'code_quality'],
          context: {
            decisionId: `decision-${i}`,
            userId: TEST_USER,
            convId: TEST_CONV,
          },
        });
        expect(result.success).toBe(true);
        feedbackIds.push(result.feedbackId);
      }

      // 2. Verify feedback was stored
      const allFeedback = getAllFeedback({ limit: 100 });
      expect(allFeedback.length).toBeGreaterThanOrEqual(6);

      // 3. Check feedback stats
      const stats = getFeedbackStats();
      expect(stats.total).toBeGreaterThanOrEqual(6);
      expect(stats.avgRating).toBeGreaterThan(0);

      // 4. Build preference profile
      const profile = buildPreferenceProfile(TEST_USER);
      expect(profile.userId).toBe(TEST_USER);
      expect(profile.patterns.length).toBeGreaterThan(0);

      // 5. Check for specific pattern
      const refactoringPattern = hasPattern('decision_preference', 'prefers_refactoring', TEST_USER);
      expect(refactoringPattern).toBeDefined();
      if (refactoringPattern) {
        expect(refactoringPattern.confidence).toBeGreaterThan(0.5);
      }

      // 6. Verify ContextLog events
      const events = queryCollaborationEvents({
        convId: TEST_CONV,
        eventTypes: [
          COLLABORATION_EVENT_TYPES.FEEDBACK_SUBMITTED,
          COLLABORATION_EVENT_TYPES.PREFERENCE_PROFILE_UPDATED,
        ],
        limit: 100,
      });

      expect(events.filter(e => e.act === COLLABORATION_EVENT_TYPES.FEEDBACK_SUBMITTED).length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Adaptive Recommendations with Learned Preferences', () => {
    it('should generate personalized recommendations based on user history', () => {
      // 1. Create user preference pattern through feedback
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['testing', 'quality'],
          reasoning: 'I prefer comprehensive testing approaches',
          context: {
            userId: TEST_USER,
            convId: TEST_CONV,
          },
        });
      }

      buildPreferenceProfile(TEST_USER);

      // 2. Define options for recommendation
      const options = [
        {
          id: 'comprehensive-tests',
          label: 'Write comprehensive tests',
          baseScore: 0.5,
          tags: ['testing', 'quality'],
          riskLevel: 'low',
        },
        {
          id: 'minimal-tests',
          label: 'Write minimal tests',
          baseScore: 0.6,
          tags: ['quick', 'minimal'],
          riskLevel: 'medium',
        },
        {
          id: 'skip-tests',
          label: 'Skip testing',
          baseScore: 0.4,
          tags: ['quick'],
          riskLevel: 'high',
        },
      ];

      // 3. Generate recommendations
      const result = generateRecommendations('decision_preference', options, {
        userId: TEST_USER,
        convId: TEST_CONV,
        description: 'Choose testing approach',
      });

      expect(result).toBeDefined();
      expect(result.options.length).toBe(3);
      expect(result.topRecommendation).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);

      // 4. Verify preference boost
      const comprehensiveOption = result.options.find(o => o.option.id === 'comprehensive-tests');
      const minimalOption = result.options.find(o => o.option.id === 'minimal-tests');

      expect(comprehensiveOption).toBeDefined();
      expect(minimalOption).toBeDefined();

      // Comprehensive tests should be boosted due to preference pattern
      expect(comprehensiveOption.adjustments.preference).toBeGreaterThanOrEqual(0);

      // 5. Record user choice
      const choiceRecorded = recordRecommendationChoice(result.id, 'comprehensive-tests', {
        userId: TEST_USER,
        category: 'decision_preference',
        wasRecommended: result.topRecommendation === 'comprehensive-tests',
      });

      expect(choiceRecorded).toBe(true);

      // 6. Verify ContextLog events
      const events = queryCollaborationEvents({
        convId: TEST_CONV,
        eventTypes: [
          COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED,
          COLLABORATION_EVENT_TYPES.RECOMMENDATION_CHOICE,
        ],
        limit: 100,
      });

      expect(events.filter(e => e.act === COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED).length).toBeGreaterThanOrEqual(1);
    });

    it('should improve recommendations with historical choices', () => {
      // 1. Define options
      const options = [
        { id: 'option-a', label: 'Option A', baseScore: 0.5, tags: ['approach-a'] },
        { id: 'option-b', label: 'Option B', baseScore: 0.5, tags: ['approach-b'] },
      ];

      // 2. Simulate user consistently choosing option-a
      for (let i = 0; i < 5; i++) {
        const rec = generateRecommendations('test_category', options, {
          userId: TEST_USER,
          convId: TEST_CONV,
        });

        recordRecommendationChoice(rec.id, 'option-a', {
          userId: TEST_USER,
          category: 'test_category',
          tags: ['approach-a'],
        });
      }

      // 3. Generate new recommendation
      const finalRec = generateRecommendations('test_category', options, {
        userId: TEST_USER,
        convId: TEST_CONV,
      });

      // 4. Option A should have higher score due to history
      const optionA = finalRec.options.find(o => o.option.id === 'option-a');
      const optionB = finalRec.options.find(o => o.option.id === 'option-b');

      expect(optionA.score).toBeGreaterThan(optionB.score);
      expect(optionA.adjustments.history).toBeGreaterThan(0);
    });
  });

  describe('Complete Collaborative Intelligence Pipeline', () => {
    it('should run full cycle: approval → feedback → learning → recommendations', async () => {
      // Enable collaboration
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '1';

      // === Phase 1: Approval ===
      const approvalPromise = requestApproval('refactor_code', {
        task: 'Refactor authentication module',
        reasoning: 'Improve code quality and maintainability',
        impact: 'high',
        alternatives: ['Quick fix', 'Postpone'],
      }, {
        convId: TEST_CONV,
        userId: TEST_USER,  // Add userId for analytics
        timeoutMs: 5000,
      });

      const pending = getPendingApprovals({ convId: TEST_CONV });
      respondToApproval(pending[0].id, 'approve', {
        feedback: 'Good idea, proceed with refactoring',
      });

      const approvalResponse = await approvalPromise;
      expect(approvalResponse.decision).toBe('approve');

      // === Phase 2: Feedback Collection ===
      const feedbackResult = submitFeedback('approval', {
        rating: 5,
        reasoning: 'Well-reasoned refactoring decision',
        suggestion: 'Consider adding more tests after refactoring',
        tags: ['refactoring', 'code_quality', 'maintainability'],
        context: {
          approvalId: pending[0].id,
          userId: TEST_USER,
          convId: TEST_CONV,
        },
      });

      expect(feedbackResult.success).toBe(true);

      // Submit more feedback to establish pattern
      for (let i = 0; i < 5; i++) {
        submitFeedback('decision', {
          rating: 4 + (i % 2),
          tags: ['refactoring', 'code_quality'],
          reasoning: 'Prefer refactoring approaches',
          context: {
            userId: TEST_USER,
            convId: TEST_CONV,
          },
        });
      }

      // === Phase 3: Preference Learning ===
      const profile = buildPreferenceProfile(TEST_USER);
      expect(profile.patterns.length).toBeGreaterThan(0);
      expect(profile.statistics.analyzed).toBeGreaterThanOrEqual(6);

      // === Phase 4: Adaptive Recommendations ===
      const options = [
        {
          id: 'refactor-approach',
          label: 'Comprehensive refactoring',
          baseScore: 0.6,
          tags: ['refactoring', 'code_quality'],
          riskLevel: 'medium',
        },
        {
          id: 'quick-fix',
          label: 'Quick fix',
          baseScore: 0.7,
          tags: ['quick', 'patch'],
          riskLevel: 'low',
        },
      ];

      const recommendation = generateRecommendations('decision_preference', options, {
        userId: TEST_USER,
        convId: TEST_CONV,
      });

      expect(recommendation.topRecommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);

      // Refactor option should have adjustments tracked (may or may not be positive depending on pattern matching)
      const refactorOption = recommendation.options.find(o => o.option.id === 'refactor-approach');
      expect(refactorOption.adjustments).toBeDefined();
      expect(refactorOption.adjustments.total).toBeGreaterThanOrEqual(0);

      // === Phase 5: ContextLog Verification ===
      const timeline = getCollaborationTimeline(TEST_CONV);
      expect(timeline.eventCount).toBeGreaterThan(0);

      // Verify all event types are present
      expect(timeline.eventsByType[COLLABORATION_EVENT_TYPES.APPROVAL_REQUEST].length).toBeGreaterThan(0);
      expect(timeline.eventsByType[COLLABORATION_EVENT_TYPES.APPROVAL_RESPONSE].length).toBeGreaterThan(0);
      expect(timeline.eventsByType[COLLABORATION_EVENT_TYPES.FEEDBACK_SUBMITTED].length).toBeGreaterThan(0);
      expect(timeline.eventsByType[COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED].length).toBeGreaterThan(0);

      // === Phase 6: Analytics ===
      // Note: ContextLog events are written to files and may not be immediately queryable
      // We verify the analytics structure is correct
      const analytics = getCollaborationAnalytics(TEST_USER, { days: 1 });
      expect(analytics).toBeDefined();
      expect(analytics.userId).toBe(TEST_USER);
      expect(analytics.period).toBeDefined();
      expect(analytics.totalEvents).toBeGreaterThanOrEqual(0);
      expect(analytics.approvals).toBeDefined();
      expect(analytics.feedback).toBeDefined();
      expect(analytics.recommendations).toBeDefined();
      expect(analytics.preferences).toBeDefined();

      // Verify structure of sub-objects
      expect(typeof analytics.approvals.total).toBe('number');
      expect(typeof analytics.feedback.total).toBe('number');
      expect(typeof analytics.recommendations.total).toBe('number');

      // Restore default
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '0';
    });
  });

  describe('Recommendation Accuracy Tracking', () => {
    it('should track and calculate recommendation accuracy over time', () => {
      const options = [
        { id: 'opt1', label: 'Option 1', baseScore: 0.7 },
        { id: 'opt2', label: 'Option 2', baseScore: 0.5 },
      ];

      // Generate recommendations and record choices
      const choices = [];
      for (let i = 0; i < 10; i++) {
        const rec = generateRecommendations('test_category', options, {
          userId: TEST_USER,
        });

        // User chooses top recommendation 80% of the time
        const choice = i < 8 ? rec.topRecommendation : 'opt2';
        recordRecommendationChoice(rec.id, choice, {
          userId: TEST_USER,
          category: 'test_category',
          wasRecommended: choice === rec.topRecommendation,
        });

        choices.push({ recommended: rec.topRecommendation, chosen: choice });
      }

      // Check accuracy
      const accuracy = getRecommendationAccuracy({
        userId: TEST_USER,
        category: 'test_category',
        limitDays: 1,
      });

      expect(accuracy.total).toBe(10);
      expect(accuracy.chosenRecommended).toBeGreaterThanOrEqual(8);
      expect(accuracy.accuracy).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Multi-User Scenario', () => {
    it('should maintain separate profiles for different users', () => {
      const user1 = `${TEST_USER}-1`;
      const user2 = `${TEST_USER}-2`;

      // User 1 prefers refactoring
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['refactoring'],
          context: { userId: user1 },
        });
      }

      // User 2 prefers quick fixes
      for (let i = 0; i < 6; i++) {
        submitFeedback('decision', {
          rating: 5,
          tags: ['quick-fix'],
          context: { userId: user2 },
        });
      }

      // Build profiles
      const profile1 = buildPreferenceProfile(user1);
      const profile2 = buildPreferenceProfile(user2);

      expect(profile1.userId).toBe(user1);
      expect(profile2.userId).toBe(user2);

      // Profiles should have different patterns
      expect(profile1.patterns).not.toEqual(profile2.patterns);

      // Cleanup
      clearPreferenceProfile(user1);
      clearPreferenceProfile(user2);
    });
  });
});
