/**
 * ACE Core Scoring Engine
 *
 * Three-axis confidence scoring for autonomous actions:
 * - Reversibility (R): Can this action be undone?
 * - Precedent (P): Has this been done before, and how did it go?
 * - Blast Radius (B): How much can go wrong?
 *
 * Composite score determines action tier:
 * - Act (≥0.70): Execute autonomously
 * - Deliberate (0.40-0.69): Run structured evaluation
 * - Escalate (<0.40): Present to user
 */

import { config } from '../../config.js';
import {
  hasHardCeiling,
  requiresDeliberation,
  getDefaultReversibility,
  getDefaultBlastRadius,
} from './action-classes.js';

// Hard-coded floor - Act threshold can NEVER go below this
const ACT_THRESHOLD_FLOOR = 0.50;

// Precedent ceiling - never achieve full certainty
const PRECEDENT_CEILING = 0.95;

/**
 * Action tiers
 */
export const TIERS = {
  ACT: 'act',
  DELIBERATE: 'deliberate',
  ESCALATE: 'escalate',
};

/**
 * Get ACE configuration with defaults
 */
function getAceConfig() {
  const aceConfig = config.ace || {};

  const safeNum = (val, fallback) => {
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
  };

  return {
    enabled: aceConfig.enabled !== false,
    weights: {
      reversibility: safeNum(aceConfig.weights?.reversibility, 0.30),
      precedent: safeNum(aceConfig.weights?.precedent, 0.35),
      blastRadius: safeNum(aceConfig.weights?.blastRadius, 0.35),
    },
    thresholds: {
      act: Math.max(ACT_THRESHOLD_FLOOR, safeNum(aceConfig.thresholds?.act, 0.70)),
      escalate: safeNum(aceConfig.thresholds?.escalate, 0.40),
    },
  };
}

/**
 * Clamp a value between min and max.
 * Returns min if value is NaN to prevent NaN poisoning.
 */
function clamp(value, min = 0, max = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Score an action on all three axes
 *
 * @param {Object} action - Action descriptor
 * @param {string} action.class - Action class (e.g., "git:commit:local")
 * @param {number} [action.reversibility] - Override reversibility score (0-1)
 * @param {number} [action.precedent] - Precedent score from memory (0-1)
 * @param {number} [action.blastRadius] - Override blast radius score (0-1)
 * @param {Object} [action.trustSource] - Trust source info for content
 * @param {string} [action.trustSource.level] - trusted|verified|untrusted|hostile
 * @param {boolean} [action.isFirstInClass] - True if first action in this class ever
 * @returns {{ R: number, P: number, B: number, composite: number, tier: string, reason: string }}
 */
export function scoreAction(action) {
  const aceConfig = getAceConfig();
  const actionClass = action.class || 'unknown:unknown:unknown';

  // Get base scores
  let R = action.reversibility ?? getDefaultReversibility(actionClass);
  let P = action.precedent ?? 0.0; // Default to no precedent
  let B = action.blastRadius ?? getDefaultBlastRadius(actionClass);

  // Apply precedent ceiling
  P = Math.min(P, PRECEDENT_CEILING);

  // Clamp all scores to 0-1
  R = clamp(R);
  P = clamp(P);
  B = clamp(B);

  // Trust source modifiers for blast radius
  if (action.trustSource) {
    switch (action.trustSource.level) {
      case 'hostile':
        B = Math.min(B, 0.1); // Cap at 0.1
        break;
      case 'untrusted':
        B = Math.max(0, B - 0.3); // Reduce by 0.3
        break;
      case 'verified':
        // No change
        break;
      case 'trusted':
        B = Math.min(1.0, B + 0.1); // Bonus of 0.1
        break;
    }
  }

  // Calculate composite score
  const { weights } = aceConfig;
  const composite = clamp(
    (R * weights.reversibility) +
    (P * weights.precedent) +
    (B * weights.blastRadius)
  );

  // Determine tier
  let tier;
  let reason = '';

  // Check hard ceiling first - always escalate
  if (hasHardCeiling(actionClass)) {
    tier = TIERS.ESCALATE;
    reason = `Hard ceiling: ${actionClass} always requires approval`;
  }
  // First action in class always escalates
  else if (action.isFirstInClass) {
    tier = TIERS.ESCALATE;
    reason = `First action in class ${actionClass} - no precedent`;
  }
  // Hostile source always escalates
  else if (action.trustSource?.level === 'hostile') {
    tier = TIERS.ESCALATE;
    reason = 'Content source tagged as hostile';
  }
  // Check deliberate minimum
  else if (requiresDeliberation(actionClass)) {
    // Can still escalate if score is very low
    if (composite < aceConfig.thresholds.escalate) {
      tier = TIERS.ESCALATE;
      reason = `Score ${composite.toFixed(2)} below escalate threshold`;
    } else {
      tier = TIERS.DELIBERATE;
      reason = `${actionClass} requires deliberation (minimum)`;
    }
  }
  // Normal tier assignment based on score
  else if (composite >= aceConfig.thresholds.act) {
    tier = TIERS.ACT;
    reason = `Score ${composite.toFixed(2)} ≥ act threshold ${aceConfig.thresholds.act}`;
  }
  else if (composite >= aceConfig.thresholds.escalate) {
    tier = TIERS.DELIBERATE;
    reason = `Score ${composite.toFixed(2)} in deliberate range`;
  }
  else {
    tier = TIERS.ESCALATE;
    reason = `Score ${composite.toFixed(2)} < escalate threshold ${aceConfig.thresholds.escalate}`;
  }

  return {
    R,
    P,
    B,
    composite,
    tier,
    reason,
    actionClass,
    weights: { ...weights },
    thresholds: { ...aceConfig.thresholds },
  };
}

/**
 * Classify an action by its class alone (without precedent)
 * Useful for quick checks before full scoring
 *
 * @param {string} actionClass - Action class string
 * @returns {{ hasHardCeiling: boolean, requiresDeliberation: boolean, defaultR: number, defaultB: number }}
 */
export function classifyAction(actionClass) {
  return {
    hasHardCeiling: hasHardCeiling(actionClass),
    requiresDeliberation: requiresDeliberation(actionClass),
    defaultR: getDefaultReversibility(actionClass),
    defaultB: getDefaultBlastRadius(actionClass),
  };
}

/**
 * Get the tier for a composite score
 *
 * @param {number} composite - Composite score (0-1)
 * @param {Object} [options] - Optional overrides
 * @param {boolean} [options.forceDeliberate] - Force at least deliberate tier
 * @param {boolean} [options.forceEscalate] - Force escalate tier
 * @returns {string} - Tier name
 */
export function getTier(composite, options = {}) {
  const aceConfig = getAceConfig();

  if (options.forceEscalate) {
    return TIERS.ESCALATE;
  }

  if (options.forceDeliberate) {
    if (composite < aceConfig.thresholds.escalate) {
      return TIERS.ESCALATE;
    }
    return TIERS.DELIBERATE;
  }

  if (composite >= aceConfig.thresholds.act) {
    return TIERS.ACT;
  }
  if (composite >= aceConfig.thresholds.escalate) {
    return TIERS.DELIBERATE;
  }
  return TIERS.ESCALATE;
}

/**
 * Get the composite score from individual axis scores
 *
 * @param {number} R - Reversibility score
 * @param {number} P - Precedent score
 * @param {number} B - Blast radius score
 * @returns {number} - Composite score
 */
export function getCompositeScore(R, P, B) {
  const aceConfig = getAceConfig();
  const { weights } = aceConfig;

  return clamp(
    (R * weights.reversibility) +
    (P * weights.precedent) +
    (B * weights.blastRadius)
  );
}

/**
 * Check if ACE is enabled
 * @returns {boolean}
 */
export function isAceEnabled() {
  return getAceConfig().enabled;
}

/**
 * Get current ACE configuration (read-only)
 * @returns {Object}
 */
export function getConfig() {
  return getAceConfig();
}

/**
 * Get the act threshold floor (constant)
 * @returns {number}
 */
export function getActThresholdFloor() {
  return ACT_THRESHOLD_FLOOR;
}

/**
 * Get the precedent ceiling (constant)
 * @returns {number}
 */
export function getPrecedentCeiling() {
  return PRECEDENT_CEILING;
}

export default {
  TIERS,
  scoreAction,
  classifyAction,
  getTier,
  getCompositeScore,
  isAceEnabled,
  getConfig,
  getActThresholdFloor,
  getPrecedentCeiling,
};
