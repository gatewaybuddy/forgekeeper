/**
 * ACE - Action Confidence Engine
 *
 * Graduated trust model for autonomous actions.
 * Scores actions on three axes and determines whether to:
 * - Act: Execute autonomously
 * - Deliberate: Run structured evaluation
 * - Escalate: Present to user
 *
 * Usage:
 *   import ace from './ace/index.js';
 *
 *   // Score an action
 *   const result = ace.scoreAction({
 *     class: 'git:commit:local',
 *     precedent: 0.5,
 *   });
 *
 *   if (result.tier === 'act') {
 *     // Execute autonomously
 *   } else if (result.tier === 'deliberate') {
 *     // Run deliberation protocol
 *   } else {
 *     // Escalate to user
 *   }
 *
 *   // Check bypass mode
 *   const bypass = ace.isBypassed('git:commit:local');
 *   if (bypass.bypassed) {
 *     // Log but don't gate
 *   }
 */

// Core scoring
export {
  TIERS,
  scoreAction,
  classifyAction,
  getTier,
  getCompositeScore,
  isAceEnabled,
  getConfig,
  getActThresholdFloor,
  getPrecedentCeiling,
} from './scorer.js';

// Action classes
export {
  HARD_CEILING_CLASSES,
  DELIBERATE_MINIMUM_CLASSES,
  parseActionClass,
  getParentClass,
  getSiblingClasses,
  matchesPattern,
  hasHardCeiling,
  requiresDeliberation,
  getDefaultReversibility,
  getDefaultBlastRadius,
  getAllActionClasses,
} from './action-classes.js';

// Bypass mode
export {
  BYPASS_MODES,
  getBypassMode,
  isBypassed,
  setTemporaryBypass,
  clearTemporaryBypass,
  getBypassStats,
  resetBypassStats,
  getRemainingBypassTime,
} from './bypass.js';

// Precedent memory
export {
  recordAction,
  recordOutcome,
  getPrecedent,
  decayScores,
  getAuditSummary,
  resetPrecedent,
  clearCache as clearPrecedentCache,
  getMemoryPath,
  getRawMemory,
  PRECEDENT_CEILING,
  PRECEDENT_FLOOR,
} from './precedent-memory.js';

// Trust source tagging
export {
  TRUST_LEVELS,
  SOURCE_TYPES,
  BLAST_RADIUS_MODIFIERS,
  tagContent,
  getDefaultTrustLevel,
  getTrustLevel,
  isHostile,
  isTrusted,
  detectHostilePatterns,
  tagAndScan,
  validateChain,
  applyTrustModifier,
  escalateOnHostile,
  mergeSources,
  createTelegramUserSource,
  createWebSource,
  createPluginSource,
  createInternalSource,
} from './trust-source.js';

// Deliberation protocol
export {
  DELIBERATION_OUTCOMES,
  checkContext,
  reviewPrecedent,
  auditSources,
  checkCounterfactual,
  confirmReversibility,
  deliberate,
  logDeliberation,
  shouldSkipDeliberation,
} from './deliberation.js';

// Trust audit
export {
  recordEscalationResponse,
  detectRubberStamp,
  resetRubberStampCounter,
  checkDriftRate,
  checkSelfModification,
  generateAudit,
  formatAuditReport,
  presentAudit,
  isAuditDue,
  getAuditState,
  resetAuditState,
  getAuditLogPath,
} from './trust-audit.js';

// Default export with all functions
import scorer from './scorer.js';
import actionClasses from './action-classes.js';
import bypass from './bypass.js';
import precedentMemory from './precedent-memory.js';
import trustSource from './trust-source.js';
import deliberation from './deliberation.js';
import trustAudit from './trust-audit.js';

export default {
  // Scorer
  ...scorer,

  // Action classes
  ...actionClasses,

  // Bypass
  ...bypass,

  // Precedent memory
  ...precedentMemory,

  // Trust source
  ...trustSource,

  // Deliberation
  ...deliberation,

  // Trust audit
  ...trustAudit,
};
