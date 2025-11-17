/**
 * User Preference Pattern Analysis & Adaptive Recommendations (Phase 8.3: T308-T309)
 *
 * Analyzes user decision patterns to learn preferences and improve recommendations.
 *
 * Features:
 * - Pattern detection from historical decisions
 * - Preference profile building
 * - Adaptive recommendation adjustments
 * - Confidence scoring based on user history
 *
 * @module server.preferences
 */

import { getCalibrationStats } from './server.confidence-calibration.mjs';
import { getFeedbackStats, getAllFeedback } from './server.feedback.mjs';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {Object} UserPreference
 * @property {string} category - Preference category (e.g., 'risk_tolerance', 'speed_vs_quality')
 * @property {string} value - Preference value
 * @property {number} confidence - Confidence in this preference (0.0-1.0)
 * @property {number} sampleSize - Number of samples supporting this preference
 * @property {string} lastUpdated - ISO timestamp
 */

/**
 * @typedef {Object} DecisionPattern
 * @property {string} pattern - Pattern description
 * @property {number} frequency - How often this pattern occurs (0.0-1.0)
 * @property {string[]} examples - Example decision IDs
 */

/**
 * @typedef {Object} UserProfile
 * @property {UserPreference[]} preferences - Detected preferences
 * @property {DecisionPattern[]} patterns - Decision patterns
 * @property {number} totalDecisions - Total decisions analyzed
 * @property {string} lastAnalyzed - ISO timestamp of last analysis
 */

/**
 * In-memory preference storage
 * @type {Map<string, UserProfile>}
 */
const userProfiles = new Map();

/**
 * Analyze user decisions to detect preferences
 *
 * @param {string} userId - User identifier (defaults to 'default')
 * @param {Object} [options] - Analysis options
 * @param {number} [options.minSamples=10] - Minimum samples for confidence
 * @returns {UserProfile} User preference profile
 */
export function analyzeUserPreferences(userId = 'default', options = {}) {
  const { minSamples = 10 } = options;

  // Get calibration data (user's decision history)
  const calibrationStats = getCalibrationStats();

  if (!calibrationStats.sufficient || calibrationStats.sampleSize < minSamples) {
    return {
      preferences: [],
      patterns: [],
      totalDecisions: calibrationStats.sampleSize || 0,
      lastAnalyzed: new Date().toISOString(),
      message: `Need at least ${minSamples} decisions for preference analysis`,
    };
  }

  // Get feedback data
  const feedbackStats = getFeedbackStats();
  const allFeedback = getAllFeedback({ limit: 1000 });

  const preferences = [];
  const patterns = [];

  // Analyze risk tolerance from recommendation acceptance
  const riskTolerance = analyzeRiskTolerance(calibrationStats, feedbackStats);
  if (riskTolerance) {
    preferences.push(riskTolerance);
  }

  // Analyze decision speed preference (quick vs deliberate)
  const speedPreference = analyzeDecisionSpeed(allFeedback);
  if (speedPreference) {
    preferences.push(speedPreference);
  }

  // Analyze feedback patterns
  const feedbackPattern = analyzeFeedbackPatterns(allFeedback);
  if (feedbackPattern) {
    patterns.push(feedbackPattern);
  }

  // Analyze recommendation alignment
  const alignmentPattern = analyzeRecommendationAlignment(calibrationStats);
  if (alignmentPattern) {
    patterns.push(alignmentPattern);
  }

  const profile = {
    preferences,
    patterns,
    totalDecisions: calibrationStats.sampleSize,
    lastAnalyzed: new Date().toISOString(),
  };

  // Store profile
  userProfiles.set(userId, profile);

  // Log to ContextLog
  appendEvent({
    actor: 'autonomous',
    act: 'preference_analysis',
    user_id: userId,
    preferences_count: preferences.length,
    patterns_count: patterns.length,
    total_decisions: calibrationStats.sampleSize,
  });

  return profile;
}

/**
 * Analyze risk tolerance from calibration data
 *
 * @param {Object} calibrationStats - Calibration statistics
 * @param {Object} feedbackStats - Feedback statistics
 * @returns {UserPreference | null} Risk tolerance preference
 */
function analyzeRiskTolerance(calibrationStats, feedbackStats) {
  // acceptanceRate is already a decimal (0.0-1.0) from getCalibrationStats
  const acceptanceRate = calibrationStats.acceptanceRate || 0;

  if (calibrationStats.sampleSize < 10) {
    return null;
  }

  let riskTolerance;
  let confidence;

  if (acceptanceRate >= 0.8) {
    riskTolerance = 'conservative'; // Accepts most recommendations, prefers safe choices
    confidence = Math.min(0.95, 0.7 + acceptanceRate * 0.2);
  } else if (acceptanceRate >= 0.6) {
    riskTolerance = 'moderate'; // Balanced approach
    confidence = 0.75;
  } else if (acceptanceRate >= 0.4) {
    riskTolerance = 'exploratory'; // Frequently chooses alternatives
    confidence = 0.75;
  } else {
    riskTolerance = 'aggressive'; // Rarely accepts recommendations, takes risks
    confidence = Math.min(0.95, 0.7 + (1 - acceptanceRate) * 0.2);
  }

  return {
    category: 'risk_tolerance',
    value: riskTolerance,
    confidence,
    sampleSize: calibrationStats.sampleSize,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Analyze decision speed from feedback timestamps
 *
 * @param {Array} allFeedback - All feedback entries
 * @returns {UserPreference | null} Decision speed preference
 */
function analyzeDecisionSpeed(allFeedback) {
  if (allFeedback.length < 5) {
    return null;
  }

  // Analyze feedback with reasoning (indicates deliberate decisions)
  const withReasoning = allFeedback.filter((f) => f.reasoning);
  const reasoningRate = withReasoning.length / allFeedback.length;

  let speedPreference;
  let confidence;

  if (reasoningRate > 0.7) {
    speedPreference = 'deliberate'; // Provides detailed reasoning
    confidence = Math.min(0.9, reasoningRate);
  } else if (reasoningRate > 0.3) {
    speedPreference = 'balanced'; // Sometimes provides reasoning
    confidence = 0.7;
  } else {
    speedPreference = 'quick'; // Rarely provides reasoning
    confidence = Math.min(0.9, 1 - reasoningRate);
  }

  return {
    category: 'decision_speed',
    value: speedPreference,
    confidence,
    sampleSize: allFeedback.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Analyze feedback patterns
 *
 * @param {Array} allFeedback - All feedback entries
 * @returns {DecisionPattern | null} Feedback pattern
 */
function analyzeFeedbackPatterns(allFeedback) {
  if (allFeedback.length < 5) {
    return null;
  }

  const withSuggestions = allFeedback.filter((f) => f.suggestion);
  const suggestionRate = withSuggestions.length / allFeedback.length;

  if (suggestionRate > 0.3) {
    return {
      pattern: 'proactive_feedback',
      frequency: suggestionRate,
      examples: withSuggestions.slice(0, 3).map((f) => f.id),
    };
  }

  return {
    pattern: 'passive_feedback',
    frequency: 1 - suggestionRate,
    examples: allFeedback.slice(0, 3).map((f) => f.id),
  };
}

/**
 * Analyze recommendation alignment
 *
 * @param {Object} calibrationStats - Calibration statistics
 * @returns {DecisionPattern | null} Alignment pattern
 */
function analyzeRecommendationAlignment(calibrationStats) {
  // acceptanceRate is already a decimal (0.0-1.0) from getCalibrationStats
  const acceptanceRate = calibrationStats.acceptanceRate || 0;

  if (calibrationStats.sampleSize < 5) {
    return null;
  }

  if (acceptanceRate >= 0.8) {
    return {
      pattern: 'high_alignment',
      frequency: acceptanceRate,
      examples: [],
    };
  } else if (acceptanceRate < 0.4) {
    return {
      pattern: 'low_alignment',
      frequency: 1 - acceptanceRate,
      examples: [],
    };
  }

  return {
    pattern: 'moderate_alignment',
    frequency: 0.6,
    examples: [],
  };
}

/**
 * Get adaptive recommendation based on user profile
 *
 * @param {Array} options - Available options
 * @param {string} [userId='default'] - User identifier
 * @returns {Object} Recommendation with adjusted confidence
 */
export function getAdaptiveRecommendation(options, userId = 'default') {
  if (!options || options.length === 0) {
    return {
      recommendedId: null,
      confidence: 0,
      reasoning: 'No options available',
    };
  }

  // Get user profile
  const profile = userProfiles.get(userId) || analyzeUserPreferences(userId);

  if (profile.preferences.length === 0) {
    // No preferences yet, return first option with neutral confidence
    return {
      recommendedId: options[0].id,
      confidence: 0.5,
      reasoning: 'Insufficient user history for personalized recommendation',
    };
  }

  // Find risk tolerance preference
  const riskPref = profile.preferences.find((p) => p.category === 'risk_tolerance');

  if (!riskPref) {
    return {
      recommendedId: options[0].id,
      confidence: 0.6,
      reasoning: 'Default recommendation (no risk preference detected)',
    };
  }

  // Adjust recommendation based on risk tolerance
  let recommendedOption;
  let baseConfidence = 0.7;

  switch (riskPref.value) {
    case 'conservative':
      // Prefer low-risk options
      recommendedOption =
        options.find((opt) => opt.riskLevel === 'low') || options[0];
      baseConfidence = 0.8;
      break;

    case 'moderate':
      // Prefer medium-risk options
      recommendedOption =
        options.find((opt) => opt.riskLevel === 'medium') ||
        options.find((opt) => opt.riskLevel === 'low') ||
        options[0];
      baseConfidence = 0.75;
      break;

    case 'exploratory':
      // Prefer higher-risk options with better rewards
      recommendedOption =
        options.find((opt) => opt.riskLevel === 'medium') ||
        options.find((opt) => opt.riskLevel === 'high') ||
        options[0];
      baseConfidence = 0.7;
      break;

    case 'aggressive':
      // Prefer high-risk options
      recommendedOption =
        options.find((opt) => opt.riskLevel === 'high') ||
        options.find((opt) => opt.riskLevel === 'medium') ||
        options[0];
      baseConfidence = 0.65;
      break;

    default:
      recommendedOption = options[0];
  }

  // Adjust confidence based on user preference confidence
  const adjustedConfidence = baseConfidence * riskPref.confidence;

  return {
    recommendedId: recommendedOption.id,
    confidence: parseFloat(adjustedConfidence.toFixed(2)),
    reasoning: `Recommendation based on ${riskPref.value} risk tolerance (${(riskPref.confidence * 100).toFixed(0)}% confidence from ${riskPref.sampleSize} decisions)`,
    userProfile: profile,
  };
}

/**
 * Get user profile
 *
 * @param {string} [userId='default'] - User identifier
 * @returns {UserProfile | null} User profile or null if not found
 */
export function getUserProfile(userId = 'default') {
  return userProfiles.get(userId) || null;
}

/**
 * Clear all user profiles (for testing)
 */
export function clearUserProfiles() {
  userProfiles.clear();
}

/**
 * Get number of user profiles
 */
export function getUserProfileCount() {
  return userProfiles.size;
}
