/**
 * Feedback Collection System (Phase 8.3: T307)
 *
 * Captures and stores user feedback on decisions, approvals, and system performance.
 *
 * Features:
 * - Structured feedback capture
 * - Rating system (1-5 stars)
 * - Categorized feedback (decision, approval, system)
 * - ContextLog integration
 * - Feedback retrieval and analysis
 *
 * @module server.feedback
 */

import { ulid } from 'ulid';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {'decision' | 'approval' | 'system' | 'checkpoint' | 'general'} FeedbackCategory
 */

/**
 * @typedef {Object} FeedbackEntry
 * @property {string} id - Unique feedback ID (ULID)
 * @property {FeedbackCategory} category - Feedback category
 * @property {number} [rating] - Rating 1-5 (optional)
 * @property {string} [reasoning] - User's reasoning/justification
 * @property {string} [suggestion] - Improvement suggestion
 * @property {string[]} [tags] - Tags for categorization
 * @property {Object} [context] - Associated context
 * @property {string} [context.decisionId] - Related decision/checkpoint ID
 * @property {string} [context.approvalId] - Related approval ID
 * @property {string} [context.convId] - Conversation ID
 * @property {string} [context.traceId] - Trace ID
 * @property {string} timestamp - ISO timestamp
 */

/**
 * In-memory feedback storage
 * @type {Map<string, FeedbackEntry>}
 */
const feedbackStore = new Map();

/**
 * Configuration from environment
 */
function getConfig() {
  return {
    enabled: process.env.AUTONOMOUS_ENABLE_FEEDBACK !== '0', // Default enabled
    maxFeedbackSize: parseInt(process.env.AUTONOMOUS_MAX_FEEDBACK_ENTRIES || '5000', 10),
    requireRating: process.env.AUTONOMOUS_REQUIRE_FEEDBACK_RATING === '1',
  };
}

/**
 * Submit feedback
 *
 * @param {FeedbackCategory} category - Feedback category
 * @param {Object} data - Feedback data
 * @param {number} [data.rating] - Rating 1-5
 * @param {string} [data.reasoning] - User's reasoning
 * @param {string} [data.suggestion] - Improvement suggestion
 * @param {string[]} [data.tags] - Tags
 * @param {Object} [data.context] - Associated context
 * @returns {Object} Result with feedback ID
 */
export function submitFeedback(category, data = {}) {
  const config = getConfig();

  if (!config.enabled) {
    return {
      success: false,
      error: 'Feedback collection is disabled',
    };
  }

  // Validate category
  const validCategories = ['decision', 'approval', 'system', 'checkpoint', 'general'];
  if (!validCategories.includes(category)) {
    return {
      success: false,
      error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
    };
  }

  // Validate rating if provided
  if (data.rating !== undefined) {
    if (typeof data.rating !== 'number' || data.rating < 1 || data.rating > 5) {
      return {
        success: false,
        error: 'Rating must be a number between 1 and 5',
      };
    }
  } else if (config.requireRating) {
    return {
      success: false,
      error: 'Rating is required',
    };
  }

  // Validate content (at least one of reasoning, suggestion, or rating)
  if (!data.rating && !data.reasoning && !data.suggestion) {
    return {
      success: false,
      error: 'Feedback must include rating, reasoning, or suggestion',
    };
  }

  const feedbackId = ulid();
  const timestamp = new Date().toISOString();

  /** @type {FeedbackEntry} */
  const feedback = {
    id: feedbackId,
    category,
    rating: data.rating,
    reasoning: data.reasoning,
    suggestion: data.suggestion,
    tags: data.tags || [],
    context: data.context || {},
    timestamp,
  };

  // Store feedback
  feedbackStore.set(feedbackId, feedback);

  // Log to ContextLog
  appendEvent({
    actor: 'user',
    act: 'feedback_submitted',
    conv_id: data.context?.convId,
    trace_id: data.context?.traceId,
    feedback_id: feedbackId,
    feedback_category: category,
    rating: data.rating,
    has_reasoning: !!data.reasoning,
    has_suggestion: !!data.suggestion,
    tags: data.tags,
    decision_id: data.context?.decisionId,
    approval_id: data.context?.approvalId,
  });

  // Cleanup if over limit
  if (feedbackStore.size > config.maxFeedbackSize) {
    const sorted = Array.from(feedbackStore.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    feedbackStore.clear();
    sorted.slice(0, config.maxFeedbackSize).forEach((f) => feedbackStore.set(f.id, f));
  }

  return {
    success: true,
    feedbackId,
  };
}

/**
 * Get feedback by ID
 *
 * @param {string} feedbackId - Feedback ID
 * @returns {FeedbackEntry | undefined} Feedback entry or undefined
 */
export function getFeedback(feedbackId) {
  return feedbackStore.get(feedbackId);
}

/**
 * Get all feedback with optional filters
 *
 * @param {Object} [options] - Filter options
 * @param {FeedbackCategory} [options.category] - Filter by category
 * @param {number} [options.minRating] - Minimum rating
 * @param {number} [options.maxRating] - Maximum rating
 * @param {string} [options.convId] - Filter by conversation ID
 * @param {string} [options.tag] - Filter by tag
 * @param {number} [options.limit=100] - Maximum results
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {FeedbackEntry[]} Array of feedback entries
 */
export function getAllFeedback(options = {}) {
  const {
    category,
    minRating,
    maxRating,
    convId,
    tag,
    limit = 100,
    offset = 0,
  } = options;

  let feedback = Array.from(feedbackStore.values());

  // Apply filters
  if (category) {
    feedback = feedback.filter((f) => f.category === category);
  }

  if (minRating !== undefined) {
    feedback = feedback.filter((f) => f.rating !== undefined && f.rating >= minRating);
  }

  if (maxRating !== undefined) {
    feedback = feedback.filter((f) => f.rating !== undefined && f.rating <= maxRating);
  }

  if (convId) {
    feedback = feedback.filter((f) => f.context?.convId === convId);
  }

  if (tag) {
    feedback = feedback.filter((f) => f.tags && f.tags.includes(tag));
  }

  // Sort by timestamp (newest first)
  feedback.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Pagination
  return feedback.slice(offset, offset + limit);
}

/**
 * Get feedback statistics
 *
 * @param {Object} [options] - Filter options
 * @param {FeedbackCategory} [options.category] - Filter by category
 * @param {string} [options.convId] - Filter by conversation ID
 * @returns {Object} Feedback statistics
 */
export function getFeedbackStats(options = {}) {
  const { category, convId } = options;

  let feedback = Array.from(feedbackStore.values());

  if (category) {
    feedback = feedback.filter((f) => f.category === category);
  }

  if (convId) {
    feedback = feedback.filter((f) => f.context?.convId === convId);
  }

  const total = feedback.length;

  if (total === 0) {
    return {
      total: 0,
      avgRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byCategory: {},
      withReasoning: 0,
      withSuggestions: 0,
    };
  }

  // Calculate rating statistics
  const rated = feedback.filter((f) => f.rating !== undefined);
  const avgRating =
    rated.length > 0
      ? rated.reduce((sum, f) => sum + f.rating, 0) / rated.length
      : 0;

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rated.forEach((f) => {
    ratingDistribution[f.rating] = (ratingDistribution[f.rating] || 0) + 1;
  });

  // Count by category
  const byCategory = {};
  feedback.forEach((f) => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  });

  // Count with reasoning/suggestions
  const withReasoning = feedback.filter((f) => f.reasoning).length;
  const withSuggestions = feedback.filter((f) => f.suggestion).length;

  return {
    total,
    avgRating: parseFloat(avgRating.toFixed(2)),
    ratingDistribution,
    byCategory,
    withReasoning,
    withSuggestions,
    percentWithRating: parseFloat(((rated.length / total) * 100).toFixed(1)),
    percentWithReasoning: parseFloat(((withReasoning / total) * 100).toFixed(1)),
    percentWithSuggestions: parseFloat(((withSuggestions / total) * 100).toFixed(1)),
  };
}

/**
 * Get recent feedback
 *
 * @param {number} [count=10] - Number of recent entries
 * @param {FeedbackCategory} [category] - Optional category filter
 * @returns {FeedbackEntry[]} Recent feedback entries
 */
export function getRecentFeedback(count = 10, category) {
  return getAllFeedback({ category, limit: count, offset: 0 });
}

/**
 * Get feedback by decision/checkpoint ID
 *
 * @param {string} decisionId - Decision or checkpoint ID
 * @returns {FeedbackEntry[]} Feedback for the decision
 */
export function getFeedbackForDecision(decisionId) {
  return Array.from(feedbackStore.values()).filter(
    (f) => f.context?.decisionId === decisionId || f.context?.checkpointId === decisionId
  );
}

/**
 * Get feedback by approval ID
 *
 * @param {string} approvalId - Approval request ID
 * @returns {FeedbackEntry[]} Feedback for the approval
 */
export function getFeedbackForApproval(approvalId) {
  return Array.from(feedbackStore.values()).filter(
    (f) => f.context?.approvalId === approvalId
  );
}

/**
 * Clear all feedback (for testing)
 */
export function clearAllFeedback() {
  feedbackStore.clear();
}

/**
 * Get feedback store size
 */
export function getFeedbackCount() {
  return feedbackStore.size;
}
