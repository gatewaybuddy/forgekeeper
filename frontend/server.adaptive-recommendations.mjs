/**
 * Adaptive Recommendation System (Phase 8.3: T309)
 *
 * Uses user feedback and preference patterns to provide personalized recommendations
 * and adjust confidence scores based on historical user choices.
 *
 * Features:
 * - Personalized recommendations based on user preferences
 * - Confidence adjustment using feedback history
 * - Recommendation scoring and ranking
 * - A/B testing framework for recommendation strategies
 * - ContextLog integration
 *
 * @module server.adaptive-recommendations
 */

import { ulid } from 'ulid';
import {
  getPreferenceProfile,
  hasPattern,
  getRecommendationAdjustment,
} from './server.preference-analysis.mjs';
import {
  getAllFeedback,
  getFeedbackStats,
} from './server.feedback.mjs';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {Object} RecommendationOption
 * @property {string} id - Option identifier
 * @property {string} label - Display label
 * @property {string} description - Option description
 * @property {string[]} [tags] - Associated tags
 * @property {string[]} [pros] - Advantages
 * @property {string[]} [cons] - Disadvantages
 * @property {string} [riskLevel] - Risk level (low/medium/high/critical)
 * @property {number} [baseScore] - Base score (0.0-1.0)
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ScoredRecommendation
 * @property {RecommendationOption} option - The option
 * @property {number} score - Adjusted score (0.0-1.0)
 * @property {number} confidence - Confidence in recommendation (0.0-1.0)
 * @property {string[]} reasons - Reasons for this score
 * @property {boolean} isRecommended - Whether this is the top recommendation
 * @property {Object} [adjustments] - Score adjustments applied
 */

/**
 * @typedef {Object} RecommendationResult
 * @property {string} id - Recommendation session ID
 * @property {ScoredRecommendation[]} options - Scored options
 * @property {string} topRecommendation - ID of top-scored option
 * @property {number} confidence - Overall confidence in recommendation
 * @property {string[]} reasonings - Summary of reasoning
 * @property {Object} metadata - Additional data
 * @property {string} timestamp - Generation timestamp
 */

/**
 * In-memory A/B test variants
 * @type {Map<string, Object>}
 */
const abTestVariants = new Map();

/**
 * Recommendation history for learning
 * @type {Array<Object>}
 */
const recommendationHistory = [];

/**
 * Configuration from environment
 */
function getConfig() {
  return {
    enabled: process.env.AUTONOMOUS_FEEDBACK_LEARNING !== '0', // Default enabled
    usePreferences: process.env.RECOMMENDATION_USE_PREFERENCES !== '0', // Default enabled
    confidenceBoost: parseFloat(process.env.RECOMMENDATION_CONFIDENCE_BOOST || '0.15'), // +15% confidence for preferred options
    historyWeight: parseFloat(process.env.RECOMMENDATION_HISTORY_WEIGHT || '0.3'), // 30% weight on history
    minConfidence: parseFloat(process.env.RECOMMENDATION_MIN_CONFIDENCE || '0.4'), // Minimum confidence to recommend
    enableABTesting: process.env.RECOMMENDATION_AB_TESTING === '1', // Default off
    maxHistorySize: parseInt(process.env.RECOMMENDATION_MAX_HISTORY || '1000', 10),
  };
}

/**
 * Calculate score adjustment based on user preference patterns
 *
 * @param {RecommendationOption} option - Option to score
 * @param {string} category - Decision category
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Score adjustment details
 */
function calculatePreferenceAdjustment(option, category, userId = 'default') {
  const config = getConfig();

  if (!config.usePreferences) {
    return { adjustment: 0, reasons: [] };
  }

  const profile = getPreferenceProfile(userId);
  const reasons = [];
  let adjustment = 0;

  // Check if option matches any preference patterns
  for (const pattern of profile.patterns) {
    if (pattern.category !== category) continue;

    // Check if option matches pattern
    const optionText = `${option.id} ${option.label} ${option.tags?.join(' ')}`.toLowerCase();
    if (optionText.includes(pattern.pattern.toLowerCase())) {
      adjustment += pattern.confidence * config.confidenceBoost;
      reasons.push(`Matches preference pattern: ${pattern.pattern} (confidence: ${pattern.confidence.toFixed(2)})`);
    }
  }

  // Cap adjustment
  adjustment = Math.min(adjustment, 0.4); // Max +40% from preferences

  return { adjustment, reasons };
}

/**
 * Calculate score adjustment based on historical choices
 *
 * @param {RecommendationOption} option - Option to score
 * @param {string} category - Decision category
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Score adjustment details
 */
function calculateHistoryAdjustment(option, category, userId = 'default') {
  const config = getConfig();
  const reasons = [];
  let adjustment = 0;

  // Find similar past recommendations
  const similar = recommendationHistory.filter(
    (h) => h.userId === userId && h.category === category
  );

  if (similar.length === 0) {
    return { adjustment: 0, reasons };
  }

  // Calculate how often user chose this option or similar ones
  const optionChoices = similar.filter((h) => {
    if (h.userChoice === option.id) return true;
    // Also match by tags
    if (option.tags && h.userChoiceTags) {
      const commonTags = option.tags.filter((tag) => h.userChoiceTags.includes(tag));
      return commonTags.length > 0;
    }
    return false;
  });

  if (optionChoices.length > 0) {
    const choiceRate = optionChoices.length / similar.length;
    adjustment = choiceRate * config.historyWeight;
    reasons.push(
      `User chose similar option ${optionChoices.length}/${similar.length} times (${(choiceRate * 100).toFixed(0)}%)`
    );
  }

  return { adjustment, reasons };
}

/**
 * Calculate score adjustment based on risk preference
 *
 * @param {RecommendationOption} option - Option to score
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Score adjustment details
 */
function calculateRiskAdjustment(option, userId = 'default') {
  const reasons = [];
  let adjustment = 0;

  if (!option.riskLevel) {
    return { adjustment, reasons };
  }

  // Check user's risk tolerance pattern
  const highRiskPattern = hasPattern('risk_tolerance', 'high_risk_tolerance', userId);
  const moderateRiskPattern = hasPattern('risk_tolerance', 'moderate_risk_tolerance', userId);

  const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
  const optionRisk = riskLevels[option.riskLevel] || 1;

  if (highRiskPattern && optionRisk >= 2) {
    // User prefers high-risk options
    adjustment += 0.1;
    reasons.push('User has high risk tolerance');
  } else if (moderateRiskPattern && optionRisk === 1) {
    // User prefers moderate-risk options
    adjustment += 0.05;
    reasons.push('User has moderate risk tolerance');
  } else if (!highRiskPattern && !moderateRiskPattern && optionRisk === 0) {
    // No risk pattern, favor safe options
    adjustment += 0.05;
    reasons.push('Safe option (user risk tolerance unknown)');
  }

  return { adjustment, reasons };
}

/**
 * Generate personalized recommendations for a set of options
 *
 * @param {string} category - Decision category
 * @param {RecommendationOption[]} options - Available options
 * @param {Object} [context] - Additional context
 * @param {string} [context.userId='default'] - User identifier
 * @param {string} [context.convId] - Conversation ID
 * @param {string} [context.traceId] - Trace ID
 * @param {string} [context.description] - Decision description
 * @returns {RecommendationResult} Scored and ranked recommendations
 */
export function generateRecommendations(category, options, context = {}) {
  const config = getConfig();
  const userId = context.userId || 'default';
  const sessionId = ulid();

  if (!config.enabled) {
    // Return options with base scores only
    const scored = options.map((opt) => ({
      option: opt,
      score: opt.baseScore || 0.5,
      confidence: 0.5,
      reasons: ['Adaptive recommendations disabled'],
      isRecommended: false,
    }));

    // Mark highest base score as recommended
    const top = scored.reduce((max, curr) => (curr.score > max.score ? curr : max), scored[0]);
    if (top) top.isRecommended = true;

    return {
      id: sessionId,
      options: scored,
      topRecommendation: top?.option.id || options[0]?.id,
      confidence: 0.5,
      reasonings: ['Recommendations not personalized (disabled)'],
      metadata: { userId, category },
      timestamp: new Date().toISOString(),
    };
  }

  // Score each option
  const scoredOptions = options.map((option) => {
    const baseScore = option.baseScore || 0.5;
    const reasons = [`Base score: ${baseScore.toFixed(2)}`];
    let totalAdjustment = 0;

    // Apply preference adjustment
    const prefAdj = calculatePreferenceAdjustment(option, category, userId);
    totalAdjustment += prefAdj.adjustment;
    reasons.push(...prefAdj.reasons);

    // Apply history adjustment
    const histAdj = calculateHistoryAdjustment(option, category, userId);
    totalAdjustment += histAdj.adjustment;
    reasons.push(...histAdj.reasons);

    // Apply risk adjustment
    const riskAdj = calculateRiskAdjustment(option, userId);
    totalAdjustment += riskAdj.adjustment;
    reasons.push(...riskAdj.reasons);

    // Calculate final score (capped at 1.0)
    const finalScore = Math.min(1.0, Math.max(0.0, baseScore + totalAdjustment));

    // Calculate confidence based on pattern strength and history
    const profile = getPreferenceProfile(userId);
    const patternCount = profile.patterns.filter((p) => p.category === category).length;
    const historyCount = recommendationHistory.filter((h) => h.userId === userId && h.category === category).length;

    const confidence = Math.min(
      1.0,
      config.minConfidence + (patternCount * 0.1) + (Math.min(historyCount, 10) * 0.02)
    );

    return {
      option,
      score: finalScore,
      confidence,
      reasons,
      isRecommended: false,
      adjustments: {
        preference: prefAdj.adjustment,
        history: histAdj.adjustment,
        risk: riskAdj.adjustment,
        total: totalAdjustment,
      },
    };
  });

  // Sort by score (descending)
  scoredOptions.sort((a, b) => b.score - a.score);

  // Mark top recommendation
  if (scoredOptions.length > 0) {
    scoredOptions[0].isRecommended = true;
  }

  const topRec = scoredOptions[0];
  const overallConfidence = topRec ? topRec.confidence : config.minConfidence;

  const result = {
    id: sessionId,
    options: scoredOptions,
    topRecommendation: topRec?.option.id || null,
    confidence: overallConfidence,
    reasonings: topRec?.reasons || [],
    metadata: {
      userId,
      category,
      description: context.description,
      convId: context.convId,
      traceId: context.traceId,
      optionCount: options.length,
    },
    timestamp: new Date().toISOString(),
  };

  // Log to ContextLog
  appendEvent({
    actor: 'autonomous',
    act: 'recommendation_generated',
    conv_id: context.convId,
    trace_id: context.traceId,
    recommendation_id: sessionId,
    category,
    user_id: userId,
    options_count: options.length,
    top_recommendation: topRec?.option.id,
    confidence: overallConfidence,
    adjustments: topRec?.adjustments,
  });

  return result;
}

/**
 * Record user's choice for a recommendation (for learning)
 *
 * @param {string} recommendationId - Recommendation session ID
 * @param {string} chosenOptionId - ID of option user chose
 * @param {Object} [metadata] - Additional metadata
 * @returns {boolean} Success
 */
export function recordRecommendationChoice(recommendationId, chosenOptionId, metadata = {}) {
  const config = getConfig();

  // Find the recommendation in recent history (would typically store in DB)
  // For now, just record the choice

  const record = {
    id: ulid(),
    recommendationId,
    userChoice: chosenOptionId,
    userChoiceTags: metadata.tags || [],
    userId: metadata.userId || 'default',
    category: metadata.category || 'unknown',
    timestamp: new Date().toISOString(),
    wasRecommended: metadata.wasRecommended || false,
  };

  recommendationHistory.push(record);

  // Trim history if too large
  if (recommendationHistory.length > config.maxHistorySize) {
    recommendationHistory.shift();
  }

  // Log to ContextLog
  appendEvent({
    actor: 'user',
    act: 'recommendation_choice',
    recommendation_id: recommendationId,
    chosen_option: chosenOptionId,
    was_recommended: record.wasRecommended,
    user_id: record.userId,
    category: record.category,
  });

  return true;
}

/**
 * Get recommendation accuracy metrics
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.userId] - Filter by user
 * @param {string} [options.category] - Filter by category
 * @param {number} [options.limitDays=30] - Only consider last N days
 * @returns {Object} Accuracy metrics
 */
export function getRecommendationAccuracy(options = {}) {
  const { userId, category, limitDays = 30 } = options;

  let history = [...recommendationHistory];

  // Apply filters
  if (userId) {
    history = history.filter((h) => h.userId === userId);
  }
  if (category) {
    history = history.filter((h) => h.category === category);
  }

  // Filter by date
  const cutoffDate = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);
  history = history.filter((h) => new Date(h.timestamp) >= cutoffDate);

  const total = history.length;
  const chosenRecommended = history.filter((h) => h.wasRecommended).length;

  return {
    total,
    chosenRecommended,
    accuracy: total > 0 ? chosenRecommended / total : 0,
    accuracyPercent: total > 0 ? ((chosenRecommended / total) * 100).toFixed(1) : '0.0',
    sampleSize: total,
    filters: { userId, category, limitDays },
  };
}

/**
 * A/B Testing: Create a test variant
 *
 * @param {string} testName - Test name
 * @param {Object} variantA - Variant A configuration
 * @param {Object} variantB - Variant B configuration
 * @returns {Object} Test configuration
 */
export function createABTest(testName, variantA, variantB) {
  const config = getConfig();

  if (!config.enableABTesting) {
    return { enabled: false, error: 'A/B testing disabled' };
  }

  const test = {
    id: ulid(),
    name: testName,
    variants: {
      A: { ...variantA, results: [] },
      B: { ...variantB, results: [] },
    },
    active: true,
    createdAt: new Date().toISOString(),
  };

  abTestVariants.set(testName, test);

  appendEvent({
    actor: 'system',
    act: 'ab_test_created',
    test_name: testName,
    test_id: test.id,
  });

  return test;
}

/**
 * A/B Testing: Get variant for user
 *
 * @param {string} testName - Test name
 * @param {string} [userId='default'] - User identifier
 * @returns {string} Variant name ('A' or 'B')
 */
export function getABTestVariant(testName, userId = 'default') {
  const test = abTestVariants.get(testName);

  if (!test || !test.active) {
    return 'A'; // Default variant
  }

  // Simple hash-based assignment for consistency
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? 'A' : 'B';
}

/**
 * Clear recommendation history (for testing)
 *
 * @returns {number} Number of records cleared
 */
export function clearRecommendationHistory() {
  const count = recommendationHistory.length;
  recommendationHistory.length = 0;
  return count;
}

/**
 * Clear A/B tests (for testing)
 *
 * @returns {number} Number of tests cleared
 */
export function clearABTests() {
  const count = abTestVariants.size;
  abTestVariants.clear();
  return count;
}

/**
 * Get recommendation statistics
 *
 * @returns {Object} Statistics
 */
export function getRecommendationStats() {
  const config = getConfig();

  return {
    enabled: config.enabled,
    historySize: recommendationHistory.length,
    abTestsActive: Array.from(abTestVariants.values()).filter((t) => t.active).length,
    config,
  };
}
