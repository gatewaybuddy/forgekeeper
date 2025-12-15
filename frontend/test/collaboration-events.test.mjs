/**
 * Tests for ContextLog Integration for Collaboration Events (T310)
 *
 * @module test/collaboration-events
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  COLLABORATION_EVENT_TYPES,
  getCollaborationEventTypes,
  isCollaborationEvent,
  queryCollaborationEvents,
  getApprovalEvents,
  getRecommendationEvents,
  getCollaborationTimeline,
  getCollaborationAnalytics,
  exportCollaborationEvents,
  getCollaborationStats,
  logCollaborationEvent,
} from '../server/telemetry/collaboration-events.mjs';
import { appendEvent } from '../server/telemetry/contextlog.mjs';

describe('Collaboration Events (ContextLog Integration)', () => {
  beforeEach(() => {
    // Note: ContextLog events persist across tests by design
    // In production, this would use a test database
  });

  describe('Event Type Constants', () => {
    it('should define all collaboration event types', () => {
      expect(COLLABORATION_EVENT_TYPES).toBeDefined();
      expect(COLLABORATION_EVENT_TYPES.APPROVAL_REQUEST).toBe('approval_request');
      expect(COLLABORATION_EVENT_TYPES.FEEDBACK_SUBMITTED).toBe('feedback_submitted');
      expect(COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED).toBe('recommendation_generated');
    });

    it('should return array of event types', () => {
      const types = getCollaborationEventTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('approval_request');
      expect(types).toContain('feedback_submitted');
    });
  });

  describe('isCollaborationEvent', () => {
    it('should identify collaboration events', () => {
      const collaborationEvent = {
        act: 'approval_request',
        ts: new Date().toISOString(),
      };

      expect(isCollaborationEvent(collaborationEvent)).toBe(true);
    });

    it('should reject non-collaboration events', () => {
      const otherEvent = {
        act: 'tool_call',
        ts: new Date().toISOString(),
      };

      expect(isCollaborationEvent(otherEvent)).toBe(false);
    });
  });

  describe('queryCollaborationEvents', () => {
    it('should query all collaboration events', () => {
      // Add some test events
      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        request_id: 'test-req-1',
        operation: 'test_op',
      });

      const events = queryCollaborationEvents({ limit: 10 });

      expect(Array.isArray(events)).toBe(true);
      // Events may exist from previous tests, so just check it's an array
    });

    it('should filter by event types', () => {
      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        request_id: 'test-req-2',
      });

      appendEvent({
        actor: 'user',
        act: 'feedback_submitted',
        feedback_id: 'test-fb-1',
      });

      const approvalEvents = queryCollaborationEvents({
        eventTypes: ['approval_request'],
        limit: 100,
      });

      // All returned events should be approval_request type
      const approvalOnly = approvalEvents.every((e) => e.act === 'approval_request');
      expect(approvalOnly).toBe(true);
    });

    it('should filter by conversation ID', () => {
      const testConvId = `test-conv-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        conv_id: testConvId,
        request_id: 'test-req-3',
      });

      const events = queryCollaborationEvents({
        convId: testConvId,
        limit: 100,
      });

      const allMatch = events.every((e) => e.conv_id === testConvId);
      expect(allMatch).toBe(true);
    });

    it('should filter by user ID', () => {
      const testUserId = `test-user-${Date.now()}`;

      appendEvent({
        actor: 'user',
        act: 'feedback_submitted',
        user_id: testUserId,
        feedback_id: 'test-fb-2',
      });

      const events = queryCollaborationEvents({
        userId: testUserId,
        limit: 100,
      });

      const allMatch = events.every((e) => e.user_id === testUserId);
      expect(allMatch).toBe(true);
    });

    it('should filter by actor', () => {
      appendEvent({
        actor: 'system',
        act: 'preference_profile_updated',
        user_id: 'test-user',
      });

      const events = queryCollaborationEvents({
        actor: 'system',
        limit: 100,
      });

      const allMatch = events.every((e) => e.actor === 'system');
      expect(allMatch).toBe(true);
    });

    it('should respect limit parameter', () => {
      const events = queryCollaborationEvents({ limit: 5 });

      expect(events.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getApprovalEvents', () => {
    it('should get events for specific approval request', () => {
      const requestId = `test-approval-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        request_id: requestId,
      });

      appendEvent({
        actor: 'user',
        act: 'approval_response',
        request_id: requestId,
        decision: 'approve',
      });

      const events = getApprovalEvents(requestId);

      expect(events.length).toBeGreaterThanOrEqual(2);
      const allMatch = events.every((e) => e.request_id === requestId);
      expect(allMatch).toBe(true);
    });
  });

  describe('getRecommendationEvents', () => {
    it('should get events for specific recommendation', () => {
      const recommendationId = `test-rec-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'recommendation_generated',
        recommendation_id: recommendationId,
      });

      appendEvent({
        actor: 'user',
        act: 'recommendation_choice',
        recommendation_id: recommendationId,
        chosen_option: 'option1',
      });

      const events = getRecommendationEvents(recommendationId);

      expect(events.length).toBeGreaterThanOrEqual(2);
      const allMatch = events.every((e) => e.recommendation_id === recommendationId);
      expect(allMatch).toBe(true);
    });
  });

  describe('getCollaborationTimeline', () => {
    it('should create timeline for conversation', () => {
      const convId = `test-timeline-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        conv_id: convId,
        request_id: 'timeline-req-1',
      });

      appendEvent({
        actor: 'user',
        act: 'feedback_submitted',
        conv_id: convId,
        feedback_id: 'timeline-fb-1',
      });

      const timeline = getCollaborationTimeline(convId);

      expect(timeline.convId).toBe(convId);
      expect(timeline.eventCount).toBeGreaterThanOrEqual(2);
      expect(timeline.eventsByType).toBeDefined();
      expect(timeline.chronological).toBeDefined();
      expect(Array.isArray(timeline.chronological)).toBe(true);
    });

    it('should group events by type', () => {
      const convId = `test-grouped-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        conv_id: convId,
      });

      const timeline = getCollaborationTimeline(convId);

      expect(timeline.eventsByType).toBeDefined();
      expect(typeof timeline.eventsByType).toBe('object');
    });
  });

  describe('getCollaborationAnalytics', () => {
    it('should generate analytics for user', () => {
      const userId = `analytics-user-${Date.now()}`;

      // Add some test events
      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        user_id: userId,
      });

      appendEvent({
        actor: 'user',
        act: 'approval_response',
        user_id: userId,
        decision: 'approve',
        elapsed_ms: 5000,
      });

      appendEvent({
        actor: 'user',
        act: 'feedback_submitted',
        user_id: userId,
        rating: 5,
        has_reasoning: true,
      });

      const analytics = getCollaborationAnalytics(userId, { days: 1 });

      expect(analytics.userId).toBe(userId);
      expect(analytics.period).toBeDefined();
      expect(analytics.totalEvents).toBeGreaterThanOrEqual(3);
      expect(analytics.approvals).toBeDefined();
      expect(analytics.feedback).toBeDefined();
      expect(analytics.recommendations).toBeDefined();
      expect(analytics.preferences).toBeDefined();
    });

    it('should calculate approval statistics', () => {
      const userId = `approval-stats-${Date.now()}`;

      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        user_id: userId,
      });

      appendEvent({
        actor: 'user',
        act: 'approval_response',
        user_id: userId,
        decision: 'approve',
        elapsed_ms: 10000,
      });

      const analytics = getCollaborationAnalytics(userId, { days: 1 });

      expect(analytics.approvals.total).toBeGreaterThanOrEqual(1);
      expect(analytics.approvals.approved).toBeGreaterThanOrEqual(1);
    });

    it('should calculate feedback statistics', () => {
      const userId = `feedback-stats-${Date.now()}`;

      appendEvent({
        actor: 'user',
        act: 'feedback_submitted',
        user_id: userId,
        rating: 4,
        has_reasoning: true,
        has_suggestion: false,
      });

      const analytics = getCollaborationAnalytics(userId, { days: 1 });

      expect(analytics.feedback.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('exportCollaborationEvents', () => {
    it('should export events as JSON', () => {
      const json = exportCollaborationEvents({ limit: 5 });

      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.exported).toBeDefined();
      expect(parsed.count).toBeDefined();
      expect(parsed.events).toBeDefined();
      expect(Array.isArray(parsed.events)).toBe(true);
    });

    it('should include filter options in export', () => {
      const convId = 'test-export-conv';
      const json = exportCollaborationEvents({ convId, limit: 5 });

      const parsed = JSON.parse(json);
      expect(parsed.filters.convId).toBe(convId);
    });
  });

  describe('getCollaborationStats', () => {
    it('should generate statistics', () => {
      appendEvent({
        actor: 'autonomous',
        act: 'approval_request',
        conv_id: `stats-conv-${Date.now()}`,
      });

      const stats = getCollaborationStats({ days: 1 });

      expect(stats.period).toBeDefined();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(0);
      expect(stats.eventTypes).toBeDefined();
      expect(stats.actors).toBeDefined();
      expect(typeof stats.uniqueConversations).toBe('number');
      expect(typeof stats.uniqueUsers).toBe('number');
    });

    it('should count events by type', () => {
      const stats = getCollaborationStats({ days: 7 });

      expect(stats.eventTypes).toBeDefined();
      expect(typeof stats.eventTypes).toBe('object');
    });
  });

  describe('logCollaborationEvent', () => {
    it('should log valid collaboration event', () => {
      const result = logCollaborationEvent('approval_request', {
        actor: 'autonomous',
        request_id: 'test-log-1',
      });

      expect(result).toBe(true);
    });

    it('should reject invalid event type', () => {
      const result = logCollaborationEvent('invalid_event_type', {
        actor: 'test',
      });

      expect(result).toBe(false);
    });
  });
});
