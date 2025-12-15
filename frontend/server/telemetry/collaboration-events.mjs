/**
 * ContextLog Integration for Collaboration Events (Phase 8.4: T310)
 *
 * Unified access to collaboration-related ContextLog events including approvals,
 * feedback, decision checkpoints, preferences, and recommendations.
 *
 * Features:
 * - Standardized event schemas
 * - Query endpoints for collaboration events
 * - Event filtering and aggregation
 * - Timeline and analytics
 * - Export capabilities
 *
 * @module server.collaboration-events
 */

import { tailEvents, appendEvent } from './contextlog.mjs';

/**
 * Event types in the collaboration system
 */
export const COLLABORATION_EVENT_TYPES = {
  // Approval events
  APPROVAL_REQUEST: 'approval_request',
  APPROVAL_RESPONSE: 'approval_response',
  APPROVAL_TIMEOUT: 'approval_timeout',
  APPROVAL_CANCELLED: 'approval_cancelled',

  // Decision checkpoint events
  DECISION_CHECKPOINT: 'decision_checkpoint',
  CHECKPOINT_RESOLVED: 'checkpoint_resolved',
  PLAN_REVIEW: 'plan_review',
  PLAN_MODIFIED: 'plan_modified',

  // Feedback events
  FEEDBACK_SUBMITTED: 'feedback_submitted',

  // Preference events
  PREFERENCE_PROFILE_UPDATED: 'preference_profile_updated',
  PREFERENCE_PROFILE_CLEARED: 'preference_profile_cleared',

  // Recommendation events
  RECOMMENDATION_GENERATED: 'recommendation_generated',
  RECOMMENDATION_CHOICE: 'recommendation_choice',
  AB_TEST_CREATED: 'ab_test_created',

  // Confidence events
  CONFIDENCE_CALIBRATED: 'confidence_calibrated',
  CONFIDENCE_THRESHOLD_TRIGGERED: 'confidence_threshold_triggered',
};

/**
 * Get all collaboration event types as array
 *
 * @returns {string[]} Array of event type names
 */
export function getCollaborationEventTypes() {
  return Object.values(COLLABORATION_EVENT_TYPES);
}

/**
 * Check if an event is a collaboration event
 *
 * @param {Object} event - Event object
 * @returns {boolean} True if collaboration event
 */
export function isCollaborationEvent(event) {
  return getCollaborationEventTypes().includes(event.act);
}

/**
 * Query collaboration events from ContextLog
 *
 * @param {Object} [options] - Query options
 * @param {string[]} [options.eventTypes] - Filter by event types
 * @param {string} [options.convId] - Filter by conversation ID
 * @param {string} [options.traceId] - Filter by trace ID
 * @param {string} [options.userId] - Filter by user ID
 * @param {string} [options.actor] - Filter by actor (user/autonomous/system)
 * @param {Date|string} [options.startTime] - Start timestamp
 * @param {Date|string} [options.endTime] - End timestamp
 * @param {number} [options.limit=100] - Maximum events to return
 * @returns {Object[]} Array of matching events
 */
export function queryCollaborationEvents(options = {}) {
  const {
    eventTypes,
    convId,
    traceId,
    userId,
    actor,
    startTime,
    endTime,
    limit = 100,
  } = options;

  // Get recent events from ContextLog
  const events = tailEvents(limit * 2); // Get more to account for filtering

  // Filter events
  let filtered = events.filter(isCollaborationEvent);

  // Apply filters
  if (eventTypes && eventTypes.length > 0) {
    filtered = filtered.filter((e) => eventTypes.includes(e.act));
  }

  if (convId) {
    filtered = filtered.filter((e) => e.conv_id === convId);
  }

  if (traceId) {
    filtered = filtered.filter((e) => e.trace_id === traceId);
  }

  if (userId) {
    filtered = filtered.filter((e) => e.user_id === userId);
  }

  if (actor) {
    filtered = filtered.filter((e) => e.actor === actor);
  }

  if (startTime) {
    const start = new Date(startTime);
    filtered = filtered.filter((e) => new Date(e.ts) >= start);
  }

  if (endTime) {
    const end = new Date(endTime);
    filtered = filtered.filter((e) => new Date(e.ts) <= end);
  }

  // Limit results
  return filtered.slice(0, limit);
}

/**
 * Get approval events for a specific request
 *
 * @param {string} requestId - Approval request ID
 * @returns {Object[]} Related approval events
 */
export function getApprovalEvents(requestId) {
  const events = queryCollaborationEvents({
    eventTypes: [
      COLLABORATION_EVENT_TYPES.APPROVAL_REQUEST,
      COLLABORATION_EVENT_TYPES.APPROVAL_RESPONSE,
      COLLABORATION_EVENT_TYPES.APPROVAL_TIMEOUT,
      COLLABORATION_EVENT_TYPES.APPROVAL_CANCELLED,
    ],
    limit: 1000,
  });

  return events.filter((e) => e.request_id === requestId);
}

/**
 * Get recommendation events for a specific recommendation
 *
 * @param {string} recommendationId - Recommendation ID
 * @returns {Object[]} Related recommendation events
 */
export function getRecommendationEvents(recommendationId) {
  const events = queryCollaborationEvents({
    eventTypes: [
      COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED,
      COLLABORATION_EVENT_TYPES.RECOMMENDATION_CHOICE,
    ],
    limit: 1000,
  });

  return events.filter((e) => e.recommendation_id === recommendationId);
}

/**
 * Get collaboration timeline for a conversation
 *
 * @param {string} convId - Conversation ID
 * @param {Object} [options] - Options
 * @param {number} [options.limit=100] - Max events
 * @returns {Object} Timeline with events grouped by type
 */
export function getCollaborationTimeline(convId, options = {}) {
  const { limit = 100 } = options;

  const events = queryCollaborationEvents({
    convId,
    limit,
  });

  // Group by event type
  const timeline = {
    convId,
    eventCount: events.length,
    eventsByType: {},
    chronological: events,
  };

  for (const eventType of getCollaborationEventTypes()) {
    timeline.eventsByType[eventType] = events.filter((e) => e.act === eventType);
  }

  return timeline;
}

/**
 * Get collaboration analytics for a user
 *
 * @param {string} [userId='default'] - User identifier
 * @param {Object} [options] - Options
 * @param {number} [options.days=30] - Days to analyze
 * @returns {Object} Analytics summary
 */
export function getCollaborationAnalytics(userId = 'default', options = {}) {
  const { days = 30 } = options;

  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = queryCollaborationEvents({
    userId,
    startTime,
    limit: 10000,
  });

  // Calculate analytics
  const analytics = {
    userId,
    period: { days, startTime: startTime.toISOString() },
    totalEvents: events.length,
    byType: {},
    approvals: {
      total: 0,
      approved: 0,
      rejected: 0,
      modified: 0,
      timeout: 0,
      avgResponseTimeMs: 0,
    },
    feedback: {
      total: 0,
      avgRating: 0,
      withReasoning: 0,
      withSuggestions: 0,
    },
    recommendations: {
      total: 0,
      accurateChoices: 0,
      accuracy: 0,
    },
    preferences: {
      profileUpdates: 0,
      patternCount: 0,
    },
  };

  // Count by type
  for (const eventType of getCollaborationEventTypes()) {
    analytics.byType[eventType] = events.filter((e) => e.act === eventType).length;
  }

  // Approval analytics
  const approvalRequests = events.filter((e) => e.act === COLLABORATION_EVENT_TYPES.APPROVAL_REQUEST);
  const approvalResponses = events.filter((e) => e.act === COLLABORATION_EVENT_TYPES.APPROVAL_RESPONSE);

  analytics.approvals.total = approvalRequests.length;
  analytics.approvals.approved = approvalResponses.filter((e) => e.decision === 'approve').length;
  analytics.approvals.rejected = approvalResponses.filter((e) => e.decision === 'reject').length;
  analytics.approvals.modified = approvalResponses.filter((e) => e.decision === 'modify').length;
  analytics.approvals.timeout = events.filter((e) => e.act === COLLABORATION_EVENT_TYPES.APPROVAL_TIMEOUT).length;

  if (approvalResponses.length > 0) {
    const totalResponseTime = approvalResponses.reduce((sum, e) => sum + (e.elapsed_ms || 0), 0);
    analytics.approvals.avgResponseTimeMs = Math.round(totalResponseTime / approvalResponses.length);
  }

  // Feedback analytics
  const feedbackEvents = events.filter((e) => e.act === COLLABORATION_EVENT_TYPES.FEEDBACK_SUBMITTED);
  analytics.feedback.total = feedbackEvents.length;

  if (feedbackEvents.length > 0) {
    const ratedFeedback = feedbackEvents.filter((e) => e.rating);
    if (ratedFeedback.length > 0) {
      analytics.feedback.avgRating = parseFloat(
        (ratedFeedback.reduce((sum, e) => sum + e.rating, 0) / ratedFeedback.length).toFixed(2)
      );
    }
    analytics.feedback.withReasoning = feedbackEvents.filter((e) => e.has_reasoning).length;
    analytics.feedback.withSuggestions = feedbackEvents.filter((e) => e.has_suggestion).length;
  }

  // Recommendation analytics
  const recommendationChoices = events.filter((e) => e.act === COLLABORATION_EVENT_TYPES.RECOMMENDATION_CHOICE);
  analytics.recommendations.total = events.filter(
    (e) => e.act === COLLABORATION_EVENT_TYPES.RECOMMENDATION_GENERATED
  ).length;
  analytics.recommendations.accurateChoices = recommendationChoices.filter((e) => e.was_recommended).length;

  if (recommendationChoices.length > 0) {
    analytics.recommendations.accuracy = parseFloat(
      (analytics.recommendations.accurateChoices / recommendationChoices.length).toFixed(2)
    );
  }

  // Preference analytics
  analytics.preferences.profileUpdates = events.filter(
    (e) => e.act === COLLABORATION_EVENT_TYPES.PREFERENCE_PROFILE_UPDATED
  ).length;

  const latestProfile = events
    .filter((e) => e.act === COLLABORATION_EVENT_TYPES.PREFERENCE_PROFILE_UPDATED)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];

  if (latestProfile) {
    analytics.preferences.patternCount = latestProfile.pattern_count || 0;
  }

  return analytics;
}

/**
 * Export collaboration events to JSON
 *
 * @param {Object} [options] - Query options (same as queryCollaborationEvents)
 * @returns {string} JSON string of events
 */
export function exportCollaborationEvents(options = {}) {
  const events = queryCollaborationEvents(options);

  return JSON.stringify(
    {
      exported: new Date().toISOString(),
      count: events.length,
      filters: options,
      events,
    },
    null,
    2
  );
}

/**
 * Get collaboration event statistics
 *
 * @param {Object} [options] - Options
 * @param {number} [options.days=7] - Days to analyze
 * @returns {Object} Statistics
 */
export function getCollaborationStats(options = {}) {
  const { days = 7 } = options;

  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = queryCollaborationEvents({
    startTime,
    limit: 10000,
  });

  const stats = {
    period: { days, startTime: startTime.toISOString() },
    totalEvents: events.length,
    eventTypes: {},
    actors: {},
    conversations: new Set(),
    users: new Set(),
  };

  // Count by type and actor
  for (const event of events) {
    stats.eventTypes[event.act] = (stats.eventTypes[event.act] || 0) + 1;
    stats.actors[event.actor] = (stats.actors[event.actor] || 0) + 1;

    if (event.conv_id) stats.conversations.add(event.conv_id);
    if (event.user_id) stats.users.add(event.user_id);
  }

  stats.uniqueConversations = stats.conversations.size;
  stats.uniqueUsers = stats.users.size;

  // Convert Sets to counts only (for JSON serialization)
  delete stats.conversations;
  delete stats.users;

  return stats;
}

/**
 * Log a custom collaboration event
 *
 * @param {string} eventType - Event type (from COLLABORATION_EVENT_TYPES)
 * @param {Object} data - Event data
 * @returns {boolean} Success
 */
export function logCollaborationEvent(eventType, data) {
  if (!getCollaborationEventTypes().includes(eventType)) {
    console.error(`[CollaborationEvents] Invalid event type: ${eventType}`);
    return false;
  }

  appendEvent({
    act: eventType,
    ...data,
  });

  return true;
}
