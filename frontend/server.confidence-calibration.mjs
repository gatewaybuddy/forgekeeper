/**
 * Confidence Calibration System (Phase 8.2: T306)
 *
 * Calculates confidence scores for decisions and tracks calibration accuracy.
 *
 * Features:
 * - Multi-factor confidence scoring
 * - Calibration tracking (predicted vs actual)
 * - Adaptive threshold tuning
 * - Per-type confidence profiles
 * - Historical accuracy analysis
 *
 * @module server.confidence-calibration
 */

import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {'plan' | 'strategy' | 'parameter' | 'execution'} DecisionType
 */

/**
 * @typedef {Object} ConfidenceFactors
 * @property {number} optionClarity - How clear/distinct options are (0.0-1.0)
 * @property {number} historicalSuccess - Past success with similar decisions (0.0-1.0)
 * @property {number} riskAlignment - Risk levels aligned with user preferences (0.0-1.0)
 * @property {number} effortCertainty - Confidence in effort estimates (0.0-1.0)
 * @property {number} contextCompleteness - How much context is available (0.0-1.0)
 */

/**
 * @typedef {Object} ConfidenceScore
 * @property {number} score - Overall confidence (0.0-1.0)
 * @property {ConfidenceFactors} factors - Individual factor scores
 * @property {string[]} strengths - Positive contributors
 * @property {string[]} weaknesses - Negative contributors
 */

/**
 * @typedef {Object} CalibrationRecord
 * @property {string} id - Record ID
 * @property {DecisionType} type - Decision type
 * @property {number} predictedConfidence - Agent's confidence in recommendation
 * @property {boolean} userAccepted - Whether user accepted recommendation
 * @property {number} timestamp - Unix timestamp
 * @property {string} [convId] - Conversation ID
 */

/**
 * Calibration history (in-memory)
 * @type {Map<string, CalibrationRecord>}
 */
const calibrationHistory = new Map();

/**
 * Per-type confidence thresholds
 */
const DEFAULT_THRESHOLDS = {
  plan: 0.7,
  strategy: 0.7,
  parameter: 0.75,
  execution: 0.9,
};

/**
 * Get per-type thresholds (with env overrides)
 */
function getThresholds() {
  const base = parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD || '0.7');

  return {
    plan: parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_PLAN || base),
    strategy: parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_STRATEGY || base),
    parameter: parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_PARAMETER || '0.75'),
    execution: parseFloat(process.env.AUTONOMOUS_CHECKPOINT_THRESHOLD_EXECUTION || '0.9'),
  };
}

/**
 * Calculate confidence score for a decision
 *
 * @param {DecisionType} type - Decision type
 * @param {Object} factors - Confidence factors
 * @param {number} [factors.optionClarity=0.5] - How clear/distinct options are
 * @param {number} [factors.historicalSuccess=0.5] - Past success rate
 * @param {number} [factors.riskAlignment=0.5] - Risk alignment with preferences
 * @param {number} [factors.effortCertainty=0.5] - Effort estimate confidence
 * @param {number} [factors.contextCompleteness=0.5] - Context availability
 * @returns {ConfidenceScore} Confidence score with breakdown
 */
export function calculateConfidence(type, factors = {}) {
  // Default values
  const f = {
    optionClarity: factors.optionClarity ?? 0.5,
    historicalSuccess: factors.historicalSuccess ?? 0.5,
    riskAlignment: factors.riskAlignment ?? 0.5,
    effortCertainty: factors.effortCertainty ?? 0.5,
    contextCompleteness: factors.contextCompleteness ?? 0.5,
  };

  // Validate ranges
  Object.keys(f).forEach((key) => {
    f[key] = Math.max(0, Math.min(1, f[key]));
  });

  // Weighted calculation (weights based on decision type)
  let weights;
  switch (type) {
    case 'plan':
      weights = {
        optionClarity: 0.25,
        historicalSuccess: 0.15,
        riskAlignment: 0.2,
        effortCertainty: 0.25,
        contextCompleteness: 0.15,
      };
      break;
    case 'strategy':
      weights = {
        optionClarity: 0.3,
        historicalSuccess: 0.25,
        riskAlignment: 0.2,
        effortCertainty: 0.15,
        contextCompleteness: 0.1,
      };
      break;
    case 'parameter':
      weights = {
        optionClarity: 0.2,
        historicalSuccess: 0.3,
        riskAlignment: 0.15,
        effortCertainty: 0.1,
        contextCompleteness: 0.25,
      };
      break;
    case 'execution':
      weights = {
        optionClarity: 0.15,
        historicalSuccess: 0.25,
        riskAlignment: 0.35,
        effortCertainty: 0.15,
        contextCompleteness: 0.1,
      };
      break;
    default:
      // Equal weights
      weights = {
        optionClarity: 0.2,
        historicalSuccess: 0.2,
        riskAlignment: 0.2,
        effortCertainty: 0.2,
        contextCompleteness: 0.2,
      };
  }

  // Calculate weighted score
  const score =
    f.optionClarity * weights.optionClarity +
    f.historicalSuccess * weights.historicalSuccess +
    f.riskAlignment * weights.riskAlignment +
    f.effortCertainty * weights.effortCertainty +
    f.contextCompleteness * weights.contextCompleteness;

  // Identify strengths and weaknesses
  const strengths = [];
  const weaknesses = [];

  if (f.optionClarity >= 0.8) strengths.push('Clear option differentiation');
  else if (f.optionClarity < 0.4) weaknesses.push('Options not well differentiated');

  if (f.historicalSuccess >= 0.8) strengths.push('Strong historical track record');
  else if (f.historicalSuccess < 0.4) weaknesses.push('Limited historical success');

  if (f.riskAlignment >= 0.8) strengths.push('Risks aligned with user preferences');
  else if (f.riskAlignment < 0.4) weaknesses.push('Risk levels may not match preferences');

  if (f.effortCertainty >= 0.8) strengths.push('High confidence in effort estimates');
  else if (f.effortCertainty < 0.4) weaknesses.push('Uncertain effort estimates');

  if (f.contextCompleteness >= 0.8) strengths.push('Complete context available');
  else if (f.contextCompleteness < 0.4) weaknesses.push('Incomplete context');

  return {
    score,
    factors: f,
    strengths,
    weaknesses,
  };
}

/**
 * Check if checkpoint should be triggered based on confidence
 * (Enhanced version with per-type thresholds)
 *
 * @param {number} confidence - Confidence score (0.0-1.0)
 * @param {DecisionType} type - Decision type
 * @returns {boolean} True if checkpoint should be triggered
 */
export function shouldTriggerCheckpoint(confidence, type) {
  const thresholds = getThresholds();
  return confidence < thresholds[type];
}

/**
 * Record a calibration data point
 *
 * @param {DecisionType} type - Decision type
 * @param {number} predictedConfidence - Agent's confidence in recommendation
 * @param {string} recommendation - Recommended option ID
 * @param {string} userSelection - User's selected option ID
 * @param {Object} [metadata] - Optional metadata
 * @param {string} [metadata.convId] - Conversation ID
 * @param {string} [metadata.checkpointId] - Checkpoint ID
 */
export function recordCalibration(
  type,
  predictedConfidence,
  recommendation,
  userSelection,
  metadata = {}
) {
  const userAccepted = recommendation === userSelection;
  const timestamp = Date.now();

  const record = {
    id: `cal-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    predictedConfidence,
    userAccepted,
    timestamp,
    convId: metadata.convId,
    checkpointId: metadata.checkpointId,
  };

  calibrationHistory.set(record.id, record);

  // Log to ContextLog
  appendEvent({
    actor: 'autonomous',
    act: 'confidence_calibration_record',
    conv_id: metadata.convId,
    calibration_id: record.id,
    decision_type: type,
    predicted_confidence: predictedConfidence,
    user_accepted: userAccepted,
    checkpoint_id: metadata.checkpointId,
  });

  // Cleanup old records (keep last 1000)
  if (calibrationHistory.size > 1000) {
    const sorted = Array.from(calibrationHistory.values()).sort((a, b) => b.timestamp - a.timestamp);
    calibrationHistory.clear();
    sorted.slice(0, 1000).forEach((r) => calibrationHistory.set(r.id, r));
  }
}

/**
 * Get calibration statistics
 *
 * @param {Object} [options] - Filter options
 * @param {DecisionType} [options.type] - Filter by type
 * @param {number} [options.minSamples=10] - Minimum samples for stats
 * @returns {Object} Calibration statistics
 */
export function getCalibrationStats(options = {}) {
  const { type, minSamples = 10 } = options;

  let records = Array.from(calibrationHistory.values());

  if (type) {
    records = records.filter((r) => r.type === type);
  }

  if (records.length < minSamples) {
    return {
      sampleSize: records.length,
      sufficient: false,
      message: `Need at least ${minSamples} samples (have ${records.length})`,
    };
  }

  // Group by confidence bins (0-20%, 20-40%, etc.)
  const bins = {
    '0-20': { predicted: [], actual: [] },
    '20-40': { predicted: [], actual: [] },
    '40-60': { predicted: [], actual: [] },
    '60-80': { predicted: [], actual: [] },
    '80-100': { predicted: [], actual: [] },
  };

  records.forEach((r) => {
    const binKey =
      r.predictedConfidence < 0.2
        ? '0-20'
        : r.predictedConfidence < 0.4
          ? '20-40'
          : r.predictedConfidence < 0.6
            ? '40-60'
            : r.predictedConfidence < 0.8
              ? '60-80'
              : '80-100';

    bins[binKey].predicted.push(r.predictedConfidence);
    bins[binKey].actual.push(r.userAccepted ? 1 : 0);
  });

  // Calculate calibration per bin
  const calibration = {};
  Object.keys(bins).forEach((binKey) => {
    const { predicted, actual } = bins[binKey];

    if (predicted.length === 0) {
      calibration[binKey] = null;
    } else {
      const avgPredicted = predicted.reduce((sum, val) => sum + val, 0) / predicted.length;
      const avgActual = actual.reduce((sum, val) => sum + val, 0) / actual.length;
      const error = Math.abs(avgPredicted - avgActual);

      calibration[binKey] = {
        count: predicted.length,
        avgPredicted: parseFloat(avgPredicted.toFixed(3)),
        avgActual: parseFloat(avgActual.toFixed(3)),
        error: parseFloat(error.toFixed(3)),
      };
    }
  });

  // Overall accuracy
  const totalAccepted = records.filter((r) => r.userAccepted).length;
  const acceptanceRate = totalAccepted / records.length;

  // Overall calibration error (Expected Calibration Error)
  const nonNullBins = Object.values(calibration).filter((b) => b !== null);
  const ece =
    nonNullBins.reduce((sum, bin) => sum + (bin.count / records.length) * bin.error, 0);

  return {
    sampleSize: records.length,
    sufficient: true,
    acceptanceRate: parseFloat(acceptanceRate.toFixed(3)),
    calibration,
    expectedCalibrationError: parseFloat(ece.toFixed(3)),
    recommendation:
      ece < 0.1
        ? 'Well calibrated'
        : ece < 0.2
          ? 'Moderately calibrated'
          : 'Poorly calibrated - consider threshold adjustment',
  };
}

/**
 * Suggest threshold adjustments based on calibration data
 *
 * @param {DecisionType} [type] - Decision type (or all if not specified)
 * @returns {Object} Threshold suggestions
 */
export function suggestThresholdAdjustments(type) {
  const stats = getCalibrationStats({ type, minSamples: 20 });

  if (!stats.sufficient) {
    return {
      sufficient: false,
      message: stats.message,
    };
  }

  const currentThreshold = getThresholds()[type] || 0.7;

  // If acceptance rate is very high, we can raise threshold (trigger less)
  // If acceptance rate is low, we should lower threshold (trigger more)
  let suggestedThreshold = currentThreshold;
  let reasoning = '';

  if (stats.acceptanceRate > 0.9) {
    // User almost always accepts recommendation - can be more confident
    suggestedThreshold = Math.min(0.9, currentThreshold + 0.05);
    reasoning = `High acceptance rate (${(stats.acceptanceRate * 100).toFixed(0)}%) suggests checkpoints could be triggered less frequently`;
  } else if (stats.acceptanceRate < 0.6) {
    // User frequently rejects recommendation - need to be more cautious
    suggestedThreshold = Math.max(0.5, currentThreshold - 0.05);
    reasoning = `Low acceptance rate (${(stats.acceptanceRate * 100).toFixed(0)}%) suggests more caution needed`;
  } else {
    reasoning = `Acceptance rate (${(stats.acceptanceRate * 100).toFixed(0)}%) is balanced`;
  }

  // Check calibration error
  if (stats.expectedCalibrationError > 0.15) {
    reasoning += '. Poor calibration suggests confidence scoring needs adjustment.';
  }

  return {
    sufficient: true,
    currentThreshold: parseFloat(currentThreshold.toFixed(2)),
    suggestedThreshold: parseFloat(suggestedThreshold.toFixed(2)),
    change: parseFloat((suggestedThreshold - currentThreshold).toFixed(2)),
    reasoning,
    calibrationQuality: stats.recommendation,
  };
}

/**
 * Clear calibration history (for testing)
 */
export function clearCalibrationHistory() {
  calibrationHistory.clear();
}

/**
 * Get calibration history size
 */
export function getCalibrationHistorySize() {
  return calibrationHistory.size;
}
