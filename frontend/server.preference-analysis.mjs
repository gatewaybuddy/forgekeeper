/**
 * User Preference Pattern Analysis (Phase 8.3: T308)
 *
 * Analyzes user feedback and decision patterns to learn preferences and improve recommendations.
 *
 * Features:
 * - User preference detection from feedback history
 * - Decision pattern recognition
 * - Preference profile building
 * - Recommendation adjustment based on patterns
 * - ContextLog integration
 *
 * @module server.preference-analysis
 */

import { ulid } from 'ulid';
import {
  getAllFeedback,
  getFeedbackStats,
  getFeedbackForDecision,
  getFeedbackForApproval,
} from './server.feedback.mjs';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {Object} PreferencePattern
 * @property {string} id - Pattern ID
 * @property {string} category - Pattern category (e.g., 'tool_choice', 'risk_tolerance', 'code_style')
 * @property {string} pattern - Pattern description
 * @property {number} frequency - How often this pattern appears (0.0-1.0)
 * @property {number} confidence - Confidence in this pattern (0.0-1.0)
 * @property {string[]} examples - Example feedback IDs supporting this pattern
 * @property {Object} metadata - Additional pattern metadata
 * @property {string} timestamp - When pattern was detected
 */

/**
 * @typedef {Object} UserPreferenceProfile
 * @property {string} userId - User identifier (default: 'default')
 * @property {PreferencePattern[]} patterns - Detected patterns
 * @property {Object} preferences - Specific preferences by category
 * @property {Object} statistics - Usage statistics
 * @property {string} lastUpdated - Last profile update timestamp
 */

/**
 * In-memory preference profiles
 * @type {Map<string, UserPreferenceProfile>}
 */
const preferenceProfiles = new Map();

/**
 * Configuration from environment
 */
function getConfig() {
  return {
    enabled: process.env.AUTONOMOUS_FEEDBACK_LEARNING !== '0', // Default enabled
    minSampleSize: parseInt(process.env.PREFERENCE_MIN_SAMPLES || '5', 10), // Min feedback entries to detect pattern
    confidenceThreshold: parseFloat(process.env.PREFERENCE_CONFIDENCE_THRESHOLD || '0.6'), // Min confidence to use pattern
    patternFrequencyThreshold: parseFloat(process.env.PREFERENCE_FREQUENCY_THRESHOLD || '0.5'), // Min frequency (50%)
    maxPatternsPerCategory: parseInt(process.env.PREFERENCE_MAX_PATTERNS_PER_CATEGORY || '10', 10),
  };
}

/**
 * Analyze feedback to detect decision patterns
 *
 * @param {Object[]} feedbackEntries - Feedback entries to analyze
 * @returns {PreferencePattern[]} Detected patterns
 */
function detectDecisionPatterns(feedbackEntries) {
  if (feedbackEntries.length === 0) return [];

  const config = getConfig();
  const patterns = [];

  // Pattern 1: Risk tolerance - analyze approval decisions
  const approvalFeedback = feedbackEntries.filter((f) => f.category === 'approval');
  if (approvalFeedback.length >= config.minSampleSize) {
    const avgRating = approvalFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / approvalFeedback.length;
    const highRiskApproved = approvalFeedback.filter((f) =>
      f.reasoning?.toLowerCase().includes('approve') || f.rating >= 4
    ).length;

    const frequency = highRiskApproved / approvalFeedback.length;
    if (frequency >= config.patternFrequencyThreshold) {
      patterns.push({
        id: ulid(),
        category: 'risk_tolerance',
        pattern: frequency > 0.75 ? 'high_risk_tolerance' : 'moderate_risk_tolerance',
        frequency,
        confidence: Math.min(0.95, 0.5 + (approvalFeedback.length / 20)), // Confidence increases with samples
        examples: approvalFeedback.slice(0, 5).map((f) => f.id),
        metadata: { avgRating, sampleSize: approvalFeedback.length },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Pattern 2: Decision preference - analyze decision feedback
  const decisionFeedback = feedbackEntries.filter((f) => f.category === 'decision');
  if (decisionFeedback.length >= config.minSampleSize) {
    // Group by tags to find common decision types
    const tagCounts = {};
    decisionFeedback.forEach((f) => {
      f.tags?.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Find frequently tagged decisions
    Object.entries(tagCounts).forEach(([tag, count]) => {
      const frequency = count / decisionFeedback.length;
      if (frequency >= config.patternFrequencyThreshold) {
        const relatedFeedback = decisionFeedback.filter((f) => f.tags?.includes(tag));
        const avgRating = relatedFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / relatedFeedback.length;

        if (avgRating >= 3.5) { // Positive preference
          patterns.push({
            id: ulid(),
            category: 'decision_preference',
            pattern: `prefers_${tag}`,
            frequency,
            confidence: Math.min(0.95, 0.6 + (count / 15)),
            examples: relatedFeedback.slice(0, 5).map((f) => f.id),
            metadata: { tag, avgRating, sampleSize: count },
            timestamp: new Date().toISOString(),
          });
        }
      }
    });
  }

  // Pattern 3: Suggestion adoption - analyze suggestions vs decisions
  const feedbackWithSuggestions = feedbackEntries.filter((f) => f.suggestion);
  if (feedbackWithSuggestions.length >= config.minSampleSize) {
    const adoptionRate = feedbackWithSuggestions.filter((f) => f.rating >= 4).length / feedbackWithSuggestions.length;

    patterns.push({
      id: ulid(),
      category: 'suggestion_adoption',
      pattern: adoptionRate > 0.7 ? 'high_adoption' : adoptionRate > 0.4 ? 'moderate_adoption' : 'low_adoption',
      frequency: adoptionRate,
      confidence: Math.min(0.9, 0.5 + (feedbackWithSuggestions.length / 25)),
      examples: feedbackWithSuggestions.slice(0, 5).map((f) => f.id),
      metadata: { adoptionRate, sampleSize: feedbackWithSuggestions.length },
      timestamp: new Date().toISOString(),
    });
  }

  return patterns;
}

/**
 * Analyze feedback to detect tool/approach preferences
 *
 * @param {Object[]} feedbackEntries - Feedback entries to analyze
 * @returns {Object} Preferences by category
 */
function extractPreferences(feedbackEntries) {
  const preferences = {};
  const config = getConfig();

  // Extract preferences from reasoning text
  const reasoningTexts = feedbackEntries
    .filter((f) => f.reasoning)
    .map((f) => f.reasoning.toLowerCase());

  // Common preference keywords
  const preferenceKeywords = {
    tools: ['prefer', 'like', 'use', 'tool', 'command'],
    style: ['style', 'format', 'convention', 'pattern'],
    approach: ['approach', 'method', 'strategy', 'way'],
    communication: ['verbose', 'concise', 'detailed', 'brief', 'explain'],
  };

  Object.entries(preferenceKeywords).forEach(([category, keywords]) => {
    const matchingFeedback = reasoningTexts.filter((text) =>
      keywords.some((keyword) => text.includes(keyword))
    );

    if (matchingFeedback.length >= config.minSampleSize) {
      preferences[category] = {
        count: matchingFeedback.length,
        confidence: Math.min(0.9, matchingFeedback.length / reasoningTexts.length),
        examples: matchingFeedback.slice(0, 3),
      };
    }
  });

  return preferences;
}

/**
 * Build or update user preference profile
 *
 * @param {string} [userId='default'] - User identifier
 * @param {Object} [options] - Options
 * @param {boolean} [options.force=false] - Force rebuild even if recent
 * @returns {UserPreferenceProfile} Updated preference profile
 */
export function buildPreferenceProfile(userId = 'default', options = {}) {
  const config = getConfig();

  if (!config.enabled) {
    return {
      userId,
      patterns: [],
      preferences: {},
      statistics: { total: 0, analyzed: 0 },
      lastUpdated: new Date().toISOString(),
    };
  }

  // Get existing profile
  const existingProfile = preferenceProfiles.get(userId);

  // Check if rebuild needed
  if (!options.force && existingProfile) {
    const lastUpdate = new Date(existingProfile.lastUpdated);
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

    // Don't rebuild if updated within last hour
    if (hoursSinceUpdate < 1) {
      return existingProfile;
    }
  }

  // Get all feedback (in production, filter by userId)
  const allFeedback = getAllFeedback({ limit: 1000 });

  // Detect patterns
  const patterns = detectDecisionPatterns(allFeedback);

  // Extract preferences
  const preferences = extractPreferences(allFeedback);

  // Calculate statistics
  const stats = getFeedbackStats();

  // Build profile
  const profile = {
    userId,
    patterns: patterns.filter((p) => p.confidence >= config.confidenceThreshold),
    preferences,
    statistics: {
      total: stats.total,
      analyzed: allFeedback.length,
      patternCount: patterns.length,
      highConfidencePatterns: patterns.filter((p) => p.confidence >= 0.8).length,
    },
    lastUpdated: new Date().toISOString(),
  };

  // Store profile
  preferenceProfiles.set(userId, profile);

  // Log to ContextLog
  appendEvent({
    actor: 'system',
    act: 'preference_profile_updated',
    user_id: userId,
    pattern_count: profile.patterns.length,
    preference_categories: Object.keys(preferences).length,
    analyzed_feedback: allFeedback.length,
  });

  return profile;
}

/**
 * Get user preference profile
 *
 * @param {string} [userId='default'] - User identifier
 * @param {Object} [options] - Options
 * @param {boolean} [options.rebuild=false] - Force rebuild profile
 * @returns {UserPreferenceProfile} Preference profile
 */
export function getPreferenceProfile(userId = 'default', options = {}) {
  if (options.rebuild) {
    return buildPreferenceProfile(userId, { force: true });
  }

  let profile = preferenceProfiles.get(userId);

  if (!profile) {
    profile = buildPreferenceProfile(userId);
  }

  return profile;
}

/**
 * Get patterns for a specific category
 *
 * @param {string} category - Pattern category
 * @param {string} [userId='default'] - User identifier
 * @returns {PreferencePattern[]} Patterns in category
 */
export function getPatternsByCategory(category, userId = 'default') {
  const profile = getPreferenceProfile(userId);
  return profile.patterns.filter((p) => p.category === category);
}

/**
 * Check if user has a specific preference pattern
 *
 * @param {string} category - Pattern category
 * @param {string} pattern - Pattern name
 * @param {string} [userId='default'] - User identifier
 * @returns {PreferencePattern | null} Pattern if found with sufficient confidence
 */
export function hasPattern(category, pattern, userId = 'default') {
  const config = getConfig();
  const profile = getPreferenceProfile(userId);

  const found = profile.patterns.find(
    (p) => p.category === category && p.pattern === pattern && p.confidence >= config.confidenceThreshold
  );

  return found || null;
}

/**
 * Get recommendation adjustment based on user preferences
 *
 * @param {string} decisionCategory - Category of decision being made
 * @param {Object[]} options - Available options
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Recommendation adjustment with confidence
 */
export function getRecommendationAdjustment(decisionCategory, options, userId = 'default') {
  const config = getConfig();

  if (!config.enabled) {
    return { adjusted: false, recommendation: null, confidence: 0 };
  }

  const profile = getPreferenceProfile(userId);

  // Find relevant patterns
  const relevantPatterns = profile.patterns.filter((p) =>
    p.category === decisionCategory && p.confidence >= config.confidenceThreshold
  );

  if (relevantPatterns.length === 0) {
    return { adjusted: false, recommendation: null, confidence: 0, reason: 'No relevant patterns found' };
  }

  // Use highest confidence pattern
  const bestPattern = relevantPatterns.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );

  // Try to match pattern to options
  const matchedOption = options.find((opt) =>
    opt.id?.toLowerCase().includes(bestPattern.pattern) ||
    opt.label?.toLowerCase().includes(bestPattern.pattern) ||
    opt.tags?.some((tag) => bestPattern.pattern.includes(tag.toLowerCase()))
  );

  if (matchedOption) {
    return {
      adjusted: true,
      recommendation: matchedOption.id,
      confidence: bestPattern.confidence,
      reason: `Based on pattern: ${bestPattern.pattern} (${(bestPattern.frequency * 100).toFixed(0)}% frequency)`,
      pattern: bestPattern,
    };
  }

  return {
    adjusted: false,
    recommendation: null,
    confidence: bestPattern.confidence,
    reason: 'Pattern detected but no matching option',
    pattern: bestPattern,
  };
}

/**
 * Get preference insights for a specific decision
 *
 * @param {string} decisionId - Decision ID
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Preference insights
 */
export function getPreferenceInsights(decisionId, userId = 'default') {
  const profile = getPreferenceProfile(userId);
  const decisionFeedback = getFeedbackForDecision(decisionId);

  return {
    feedbackCount: decisionFeedback.length,
    relevantPatterns: profile.patterns.filter((p) =>
      decisionFeedback.some((f) => p.examples.includes(f.id))
    ),
    preferences: profile.preferences,
    confidence: decisionFeedback.length >= 3 ? 0.8 : decisionFeedback.length * 0.25,
  };
}

/**
 * Clear preference profile (for testing or reset)
 *
 * @param {string} [userId='default'] - User identifier
 * @returns {boolean} Success
 */
export function clearPreferenceProfile(userId = 'default') {
  const deleted = preferenceProfiles.delete(userId);

  if (deleted) {
    appendEvent({
      actor: 'system',
      act: 'preference_profile_cleared',
      user_id: userId,
    });
  }

  return deleted;
}

/**
 * Get all preference profiles (for admin/debugging)
 *
 * @returns {Map<string, UserPreferenceProfile>} All profiles
 */
export function getAllPreferenceProfiles() {
  return new Map(preferenceProfiles);
}

/**
 * Get preference analysis statistics
 *
 * @returns {Object} Statistics
 */
export function getPreferenceStats() {
  const config = getConfig();
  const allProfiles = Array.from(preferenceProfiles.values());

  return {
    enabled: config.enabled,
    profileCount: allProfiles.length,
    totalPatterns: allProfiles.reduce((sum, p) => sum + p.patterns.length, 0),
    avgPatternsPerProfile: allProfiles.length > 0
      ? (allProfiles.reduce((sum, p) => sum + p.patterns.length, 0) / allProfiles.length).toFixed(2)
      : 0,
    highConfidencePatterns: allProfiles.reduce(
      (sum, p) => sum + p.patterns.filter((pat) => pat.confidence >= 0.8).length,
      0
    ),
    config,
  };
}

// Auto-rebuild profiles periodically (every 30 minutes)
setInterval(() => {
  const config = getConfig();
  if (!config.enabled) return;

  for (const userId of preferenceProfiles.keys()) {
    buildPreferenceProfile(userId);
  }
}, 1800000); // 30 minutes
