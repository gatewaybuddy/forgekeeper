/**
 * ACE Deliberation Protocol
 *
 * Structured evaluation process for actions in the Deliberate tier (0.40-0.69).
 *
 * Five deliberation steps:
 * 1. Context check - Why is this action being considered?
 * 2. Precedent review - What's the history for this action class?
 * 3. Source audit - Is the motivation chain fully trusted?
 * 4. Counterfactual - What happens if we don't act?
 * 5. Reversibility confirmation - Verify current state matches expected reversibility
 *
 * Deliberation can:
 * - Promote to Act (confidence increased above 0.70)
 * - Maintain Deliberate (act with enhanced logging)
 * - Demote to Escalate (concerns revealed)
 */

import { config } from '../../config.js';
import { TIERS, scoreAction, getConfig as getAceConfig } from './scorer.js';
import { getPrecedent } from './precedent-memory.js';
import { validateChain, getTrustLevel, TRUST_LEVELS } from './trust-source.js';
import { hasHardCeiling, requiresDeliberation } from './action-classes.js';

/**
 * Deliberation outcomes
 */
export const DELIBERATION_OUTCOMES = {
  PROMOTE: 'promote',      // Move to Act tier
  MAINTAIN: 'maintain',    // Stay at Deliberate, proceed with logging
  DEMOTE: 'demote',        // Move to Escalate tier
};

/**
 * Deliberation step results
 */
function createStepResult(step, passed, details, concerns = []) {
  return {
    step,
    passed,
    details,
    concerns,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Step 1: Context Check
 * Why is this action being considered?
 *
 * @param {Object} action - Action descriptor
 * @returns {Object} - Step result
 */
export function checkContext(action) {
  const concerns = [];
  let passed = true;
  const details = {};

  // Check if action has a clear motivation
  if (!action.motivation) {
    concerns.push('No motivation provided for action');
  } else {
    details.motivation = action.motivation;
  }

  // Check motivation source
  if (action.motivationSource) {
    details.motivationSource = action.motivationSource;

    // External motivation gets more scrutiny
    if (action.motivationSource === 'external') {
      concerns.push('Action motivated by external content');
    }
  }

  // Check if part of a goal
  if (action.goalId) {
    details.goalId = action.goalId;
    details.partOfGoal = true;
  }

  // Check if reactive or proactive
  details.isReactive = !!action.triggerEvent;
  if (action.triggerEvent) {
    details.triggerEvent = action.triggerEvent;
  }

  // Any concerns reduce confidence
  if (concerns.length > 0) {
    passed = concerns.length < 2; // Allow 1 concern
  }

  return createStepResult('context', passed, details, concerns);
}

/**
 * Step 2: Precedent Review
 * What's the history for this action class?
 *
 * @param {Object} action - Action descriptor
 * @returns {Promise<Object>} - Step result
 */
export async function reviewPrecedent(action) {
  const concerns = [];
  const details = {};

  const precedent = await getPrecedent(action.class, { applyDecay: true });

  details.score = precedent.score;
  details.isFirstAction = precedent.isFirstAction;

  if (precedent.history) {
    details.instances = precedent.history.instances;
    details.approved = precedent.history.approved;
    details.corrected = precedent.history.corrected;
    details.lastPositive = precedent.history.lastPositive;
    details.lastNegative = precedent.history.lastNegative;
  }

  // First action always a concern
  if (precedent.isFirstAction) {
    concerns.push('First action in this class - no precedent');
  }

  // Recent correction is a concern
  if (precedent.history?.lastNegative) {
    const lastNeg = new Date(precedent.history.lastNegative);
    const daysSince = (Date.now() - lastNeg.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince < 7) {
      concerns.push(`Recent correction ${daysSince.toFixed(1)} days ago`);
    }
  }

  // Low precedent score is a concern
  if (precedent.score < 0.3) {
    concerns.push(`Low precedent score: ${precedent.score.toFixed(2)}`);
  }

  // High correction rate
  if (precedent.history && precedent.history.instances > 3) {
    const correctionRate = precedent.history.corrected / precedent.history.instances;
    if (correctionRate > 0.2) {
      concerns.push(`High correction rate: ${(correctionRate * 100).toFixed(0)}%`);
    }
  }

  const passed = concerns.length === 0;

  return createStepResult('precedent', passed, details, concerns);
}

/**
 * Step 3: Source Audit
 * Is the motivation chain fully trusted?
 *
 * @param {Object} action - Action descriptor
 * @returns {Object} - Step result
 */
export function auditSources(action) {
  const concerns = [];
  const details = {};

  // Check trust source if provided
  if (action.trustSource) {
    const level = getTrustLevel(action.trustSource);
    details.trustLevel = level;

    if (level === TRUST_LEVELS.HOSTILE) {
      concerns.push('Content source tagged as hostile');
    } else if (level === TRUST_LEVELS.UNTRUSTED) {
      concerns.push('Content source is untrusted');
    }

    // Validate chain of custody
    if (action.trustSource.chain) {
      const chainResult = validateChain(action.trustSource);
      details.chainValid = chainResult.valid;
      details.chainLowestLevel = chainResult.lowestLevel;
      details.untrustedLinks = chainResult.untrustedLinks;

      if (chainResult.untrustedLinks.length > 0) {
        concerns.push(`Chain includes ${chainResult.untrustedLinks.length} untrusted link(s)`);
      }

      // Check if chain is degraded from original level
      if (chainResult.lowestLevel !== level && level !== TRUST_LEVELS.HOSTILE) {
        concerns.push(`Chain degrades trust: ${level} → ${chainResult.lowestLevel}`);
      }
    }
  } else {
    details.trustLevel = 'unknown';
    concerns.push('No trust source information provided');
  }

  const passed = concerns.length === 0;

  return createStepResult('sources', passed, details, concerns);
}

/**
 * Step 4: Counterfactual Analysis
 * What happens if we don't act?
 *
 * @param {Object} action - Action descriptor
 * @returns {Object} - Step result
 */
export function checkCounterfactual(action) {
  const concerns = [];
  const details = {};

  // Check urgency
  details.hasDeadline = !!action.deadline;
  if (action.deadline) {
    const deadline = new Date(action.deadline);
    const remaining = deadline - Date.now();
    details.timeRemaining = remaining;
    details.isUrgent = remaining < 60 * 60 * 1000; // Less than 1 hour

    if (details.isUrgent) {
      concerns.push('Time-sensitive action');
    }
  }

  // Check if opportunity is lost by waiting
  details.opportunityLost = action.opportunityLost || false;
  if (action.opportunityLost) {
    concerns.push('Opportunity may be lost if not acted upon');
  }

  // Check if user is available
  details.userAvailable = action.userAvailable !== false;
  if (!details.userAvailable && !details.isUrgent) {
    // Not urgent and user not available - can wait
    details.canWait = true;
  } else {
    details.canWait = !details.isUrgent && !action.opportunityLost;
  }

  // If it can wait, that's good (no pressure to act)
  const passed = details.canWait || concerns.length === 0;

  return createStepResult('counterfactual', passed, details, concerns);
}

/**
 * Step 5: Reversibility Confirmation
 * Verify current state matches expected reversibility
 *
 * @param {Object} action - Action descriptor
 * @returns {Object} - Step result
 */
export function confirmReversibility(action) {
  const concerns = [];
  const details = {};

  details.expectedReversibility = action.reversibility || 0.5;

  // Check for backup if action involves deletion or overwrite
  if (action.class?.includes('delete') || action.class?.includes('overwrite')) {
    details.requiresBackup = true;

    if (!action.backupExists) {
      concerns.push('Destructive action but no backup confirmed');
    } else {
      details.backupExists = true;
    }
  }

  // Check for dependencies
  if (action.dependencies?.length > 0) {
    details.dependencies = action.dependencies;

    // Unmet dependencies reduce reversibility
    const unmet = action.dependencies.filter(d => !d.met);
    if (unmet.length > 0) {
      concerns.push(`${unmet.length} unmet dependencies`);
    }
  }

  // Check if action affects external systems
  if (action.affectsExternal) {
    details.affectsExternal = true;
    concerns.push('Action affects external systems - harder to reverse');
  }

  const passed = concerns.length === 0;

  return createStepResult('reversibility', passed, details, concerns);
}

/**
 * Run full deliberation protocol
 *
 * @param {Object} action - Action descriptor
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose] - Include all step details
 * @returns {Promise<Object>} - Deliberation result
 */
export async function deliberate(action, options = {}) {
  const startTime = Date.now();

  // Run all steps
  const contextResult = checkContext(action);
  const precedentResult = await reviewPrecedent(action);
  const sourceResult = auditSources(action);
  const counterfactualResult = checkCounterfactual(action);
  const reversibilityResult = confirmReversibility(action);

  const steps = [
    contextResult,
    precedentResult,
    sourceResult,
    counterfactualResult,
    reversibilityResult,
  ];

  // Count concerns and failures
  const totalConcerns = steps.reduce((sum, s) => sum + s.concerns.length, 0);
  const failedSteps = steps.filter(s => !s.passed).length;

  // Calculate confidence adjustment
  // Each failed step reduces confidence, each concern slightly reduces
  let confidenceAdjustment = 0;
  confidenceAdjustment -= failedSteps * 0.1;
  confidenceAdjustment -= totalConcerns * 0.03;

  // Get original score
  const originalScore = scoreAction(action);
  const adjustedComposite = Math.max(0, Math.min(1,
    originalScore.composite + confidenceAdjustment
  ));

  // Determine outcome
  let outcome;
  let reason;

  const aceConfig = getAceConfig();

  // Check for hard failures
  if (sourceResult.concerns.some(c => c.includes('hostile'))) {
    outcome = DELIBERATION_OUTCOMES.DEMOTE;
    reason = 'Source tagged as hostile';
  }
  // Check if adjusted score moves to Act tier
  else if (adjustedComposite >= aceConfig.thresholds.act && failedSteps === 0) {
    outcome = DELIBERATION_OUTCOMES.PROMOTE;
    reason = `Adjusted score ${adjustedComposite.toFixed(2)} ≥ ${aceConfig.thresholds.act} with no failed steps`;
  }
  // Check if adjusted score drops to Escalate tier
  else if (adjustedComposite < aceConfig.thresholds.escalate || failedSteps >= 3) {
    outcome = DELIBERATION_OUTCOMES.DEMOTE;
    reason = failedSteps >= 3
      ? `${failedSteps} failed deliberation steps`
      : `Adjusted score ${adjustedComposite.toFixed(2)} < ${aceConfig.thresholds.escalate}`;
  }
  // Stay in Deliberate tier
  else {
    outcome = DELIBERATION_OUTCOMES.MAINTAIN;
    reason = `Adjusted score ${adjustedComposite.toFixed(2)} in deliberate range, ${totalConcerns} concern(s)`;
  }

  // Map outcome to tier
  const finalTier = outcome === DELIBERATION_OUTCOMES.PROMOTE ? TIERS.ACT
    : outcome === DELIBERATION_OUTCOMES.DEMOTE ? TIERS.ESCALATE
    : TIERS.DELIBERATE;

  const result = {
    event: 'ace:deliberation',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    actionClass: action.class,
    initialScores: {
      R: originalScore.R,
      P: originalScore.P,
      B: originalScore.B,
    },
    initialComposite: originalScore.composite,
    initialTier: originalScore.tier,
    confidenceAdjustment,
    adjustedComposite,
    steps: options.verbose ? steps : steps.map(s => ({
      step: s.step,
      passed: s.passed,
      concernCount: s.concerns.length,
    })),
    totalConcerns,
    failedSteps,
    outcome,
    finalTier,
    reason,
  };

  return result;
}

/**
 * Log a deliberation result
 * Integrates with T420 event hook system if available
 *
 * @param {Object} deliberationResult - Result from deliberate()
 * @returns {void}
 */
export function logDeliberation(deliberationResult) {
  // Simple console logging for now
  // TODO: Integrate with T420 hooks system when available
  console.log(`[ACE Deliberation] ${deliberationResult.actionClass}: ${deliberationResult.outcome} (${deliberationResult.reason})`);

  if (deliberationResult.failedSteps > 0) {
    console.log(`  Failed steps: ${deliberationResult.failedSteps}`);
  }
  if (deliberationResult.totalConcerns > 0) {
    console.log(`  Total concerns: ${deliberationResult.totalConcerns}`);
  }
}

/**
 * Quick check if action should skip deliberation
 * (Used for optimizing obvious cases)
 *
 * @param {Object} action - Action descriptor
 * @returns {{ skip: boolean, reason: string, tier: string }}
 */
export function shouldSkipDeliberation(action) {
  // Hard ceilings always escalate
  if (hasHardCeiling(action.class)) {
    return {
      skip: true,
      reason: 'Hard ceiling class',
      tier: TIERS.ESCALATE,
    };
  }

  // Hostile source always escalates
  if (action.trustSource?.level === TRUST_LEVELS.HOSTILE) {
    return {
      skip: true,
      reason: 'Hostile source',
      tier: TIERS.ESCALATE,
    };
  }

  // First action always escalates
  if (action.isFirstInClass) {
    return {
      skip: true,
      reason: 'First action in class',
      tier: TIERS.ESCALATE,
    };
  }

  return { skip: false, reason: null, tier: null };
}

export default {
  DELIBERATION_OUTCOMES,
  checkContext,
  reviewPrecedent,
  auditSources,
  checkCounterfactual,
  confirmReversibility,
  deliberate,
  logDeliberation,
  shouldSkipDeliberation,
};
