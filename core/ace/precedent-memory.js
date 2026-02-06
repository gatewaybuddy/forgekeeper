/**
 * ACE Precedent Memory
 *
 * Persistent storage for action history, outcomes, and precedent scoring.
 *
 * Key features:
 * - Asymmetric learning: negative outcomes weigh more than positive
 * - Time-based decay toward baseline
 * - Related-class penalty propagation
 * - Precedent ceiling at 0.95 (never full certainty)
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';
import { getParentClass, getSiblingClasses, getAllActionClasses } from './action-classes.js';
import { atomicWriteFile } from '../atomic-write.js';

// Constants (exported for tests)
export const PRECEDENT_CEILING = 0.95;
export const PRECEDENT_FLOOR = 0.0;
const DEFAULT_BASELINE = 0.20;
const DEFAULT_DECAY_LAMBDA = 0.01; // ~50% decay over 70 days

// Score adjustments
const POSITIVE_INCREMENT = 0.15;
const NEGATIVE_MULTIPLIERS = {
  1: 0.20, // Minor correction
  2: 0.40, // Meaningful error
  3: 0.60, // Serious problem
};
const PARENT_PENALTY_MULTIPLIER = 0.10;
const SIBLING_PENALTY_MULTIPLIER = 0.05;

// Memory file path
const MEMORY_PATH = path.join(
  config.autonomous?.personalityPath || 'forgekeeper_personality',
  'memory',
  'ace_precedent.json'
);

/**
 * Default memory structure
 */
function createDefaultMemory() {
  return {
    version: 1,
    classes: {},
    metadata: {
      createdAt: new Date().toISOString(),
      lastUpdated: null,
      totalActions: 0,
      totalPositive: 0,
      totalNegative: 0,
    },
  };
}

/**
 * Default class entry
 */
function createDefaultClassEntry(actionClass) {
  return {
    instances: [],
    score: PRECEDENT_FLOOR,
    scoreHistory: [PRECEDENT_FLOOR],
    lastPositive: null,
    lastNegative: null,
    approved: 0,
    corrected: 0,
    decayAnchor: new Date().toISOString(),
  };
}

// In-memory cache
let memoryCache = null;
let memoryCacheDirty = false;

/**
 * Load precedent memory from disk
 * @returns {Promise<Object>}
 */
async function loadMemory() {
  if (memoryCache) {
    return memoryCache;
  }

  try {
    const data = await fs.readFile(MEMORY_PATH, 'utf-8');
    memoryCache = JSON.parse(data);
    return memoryCache;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, create default
      memoryCache = createDefaultMemory();
      return memoryCache;
    }
    throw err;
  }
}

/**
 * Save precedent memory to disk
 * @returns {Promise<void>}
 */
async function saveMemory() {
  if (!memoryCache || !memoryCacheDirty) {
    return;
  }

  memoryCache.metadata.lastUpdated = new Date().toISOString();

  // Ensure directory exists
  const dir = path.dirname(MEMORY_PATH);
  await fs.mkdir(dir, { recursive: true });

  await atomicWriteFile(MEMORY_PATH, JSON.stringify(memoryCache, null, 2), 'utf-8');
  memoryCacheDirty = false;
}

/**
 * Get decay configuration
 */
function getDecayConfig() {
  const aceConfig = config.ace || {};
  return {
    lambda: aceConfig.decay?.lambda ?? DEFAULT_DECAY_LAMBDA,
    baseline: aceConfig.decay?.baseline ?? DEFAULT_BASELINE,
  };
}

/**
 * Apply time-based decay to a score
 * @param {number} score - Current score
 * @param {string} lastActivityDate - ISO date string of last activity
 * @returns {number} - Decayed score
 */
function applyDecay(score, lastActivityDate) {
  if (!lastActivityDate) return score;

  const { lambda, baseline } = getDecayConfig();
  const daysSince = (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince <= 0) return score;

  // Exponential decay toward baseline
  // decayed = baseline + (score - baseline) * e^(-lambda * days)
  const decayed = baseline + (score - baseline) * Math.exp(-lambda * daysSince);

  return Math.max(PRECEDENT_FLOOR, Math.min(PRECEDENT_CEILING, decayed));
}

/**
 * Clamp score to valid range
 */
function clampScore(score) {
  return Math.max(PRECEDENT_FLOOR, Math.min(PRECEDENT_CEILING, score));
}

/**
 * Record an action being taken
 *
 * @param {Object} action - Action details
 * @param {string} action.class - Action class
 * @param {string} action.details - Description of the action
 * @param {string} action.tier - Tier at decision time (act/deliberate/escalate)
 * @returns {Promise<{ success: boolean, precedent: number }>}
 */
export async function recordAction(action) {
  const memory = await loadMemory();
  const actionClass = action.class;

  // Initialize class if needed
  if (!memory.classes[actionClass]) {
    memory.classes[actionClass] = createDefaultClassEntry(actionClass);
  }

  const classEntry = memory.classes[actionClass];

  // Create instance record
  const instance = {
    ts: new Date().toISOString(),
    detail: action.details || '',
    tier: action.tier || 'unknown',
    operatorResponse: null, // Will be updated by recordOutcome
    outcome: 'pending',
    note: null,
  };

  classEntry.instances.push(instance);

  // Keep only last 100 instances per class
  if (classEntry.instances.length > 100) {
    classEntry.instances = classEntry.instances.slice(-100);
  }

  // Update metadata
  memory.metadata.totalActions++;

  memoryCacheDirty = true;
  await saveMemory();

  return {
    success: true,
    precedent: classEntry.score,
    instanceIndex: classEntry.instances.length - 1,
  };
}

/**
 * Record the outcome of an action
 *
 * @param {Object} outcome - Outcome details
 * @param {string} outcome.class - Action class
 * @param {number} [outcome.instanceIndex] - Index of instance (default: last)
 * @param {string} outcome.result - 'positive' | 'negative'
 * @param {number} [outcome.severity] - For negative: 1 (minor), 2 (medium), 3 (severe)
 * @param {string} [outcome.operatorResponse] - 'approved' | 'corrected' | 'denied'
 * @param {string} [outcome.note] - Operator note or correction
 * @returns {Promise<{ success: boolean, oldScore: number, newScore: number, propagated: string[] }>}
 */
export async function recordOutcome(outcome) {
  const memory = await loadMemory();
  const actionClass = outcome.class;

  if (!memory.classes[actionClass]) {
    return {
      success: false,
      error: `No recorded actions for class: ${actionClass}`,
    };
  }

  const classEntry = memory.classes[actionClass];
  const instanceIndex = outcome.instanceIndex ?? classEntry.instances.length - 1;

  if (instanceIndex < 0 || instanceIndex >= classEntry.instances.length) {
    return {
      success: false,
      error: `Invalid instance index: ${instanceIndex}`,
    };
  }

  // Update instance
  const instance = classEntry.instances[instanceIndex];
  instance.operatorResponse = outcome.operatorResponse || null;
  instance.outcome = outcome.result;
  instance.note = outcome.note || null;

  const oldScore = classEntry.score;
  let newScore = oldScore;
  const propagated = [];

  if (outcome.result === 'positive') {
    // Positive outcome: increment score
    newScore = clampScore(oldScore + POSITIVE_INCREMENT);
    classEntry.approved++;
    classEntry.lastPositive = new Date().toISOString();
    memory.metadata.totalPositive++;
  } else if (outcome.result === 'negative') {
    // Negative outcome: decrement based on severity
    const severity = outcome.severity || 1;
    const decrement = NEGATIVE_MULTIPLIERS[severity] || NEGATIVE_MULTIPLIERS[1];

    newScore = clampScore(oldScore - decrement);
    classEntry.corrected++;
    classEntry.lastNegative = new Date().toISOString();
    memory.metadata.totalNegative++;

    // Propagate to related classes
    const parentClass = getParentClass(actionClass);
    if (parentClass && memory.classes[parentClass]) {
      const parentDecrement = PARENT_PENALTY_MULTIPLIER * severity;
      memory.classes[parentClass].score = clampScore(
        memory.classes[parentClass].score - parentDecrement
      );
      propagated.push(`${parentClass}: -${parentDecrement.toFixed(2)}`);
    }

    const siblings = getSiblingClasses(actionClass, Object.keys(memory.classes));
    for (const sibling of siblings) {
      if (memory.classes[sibling]) {
        const siblingDecrement = SIBLING_PENALTY_MULTIPLIER * severity;
        memory.classes[sibling].score = clampScore(
          memory.classes[sibling].score - siblingDecrement
        );
        propagated.push(`${sibling}: -${siblingDecrement.toFixed(2)}`);
      }
    }
  }

  // Update score and history
  classEntry.score = newScore;
  classEntry.scoreHistory.push(newScore);
  classEntry.decayAnchor = new Date().toISOString();

  // Keep score history manageable
  if (classEntry.scoreHistory.length > 50) {
    classEntry.scoreHistory = classEntry.scoreHistory.slice(-50);
  }

  memoryCacheDirty = true;
  await saveMemory();

  return {
    success: true,
    oldScore,
    newScore,
    propagated,
  };
}

/**
 * Get precedent score for an action class
 *
 * @param {string} actionClass - Action class
 * @param {Object} [options] - Options
 * @param {boolean} [options.applyDecay] - Apply time-based decay (default: true)
 * @returns {Promise<{ score: number, isFirstAction: boolean, history: Object }>}
 */
export async function getPrecedent(actionClass, options = {}) {
  const memory = await loadMemory();
  const applyDecayOption = options.applyDecay !== false;

  if (!memory.classes[actionClass]) {
    return {
      score: PRECEDENT_FLOOR,
      isFirstAction: true,
      history: null,
    };
  }

  const classEntry = memory.classes[actionClass];
  let score = classEntry.score;

  // Apply decay if requested
  if (applyDecayOption && classEntry.decayAnchor) {
    score = applyDecay(score, classEntry.decayAnchor);
  }

  return {
    score,
    isFirstAction: false,
    history: {
      instances: classEntry.instances.length,
      approved: classEntry.approved,
      corrected: classEntry.corrected,
      lastPositive: classEntry.lastPositive,
      lastNegative: classEntry.lastNegative,
      scoreHistory: classEntry.scoreHistory.slice(-10),
    },
  };
}

/**
 * Apply decay to all scores (run periodically)
 *
 * @returns {Promise<{ updated: number, decayed: { class: string, oldScore: number, newScore: number }[] }>}
 */
export async function decayScores() {
  const memory = await loadMemory();
  const decayed = [];
  let updated = 0;

  for (const [actionClass, entry] of Object.entries(memory.classes)) {
    if (!entry.decayAnchor) continue;

    const oldScore = entry.score;
    const newScore = applyDecay(oldScore, entry.decayAnchor);

    // Only update if there's a meaningful change
    if (Math.abs(newScore - oldScore) > 0.001) {
      entry.score = newScore;
      decayed.push({ class: actionClass, oldScore, newScore });
      updated++;
    }
  }

  if (updated > 0) {
    memoryCacheDirty = true;
    await saveMemory();
  }

  return { updated, decayed };
}

/**
 * Get audit summary for reporting
 *
 * @param {Object} [options] - Options
 * @param {number} [options.days] - Days to look back (default: 7)
 * @returns {Promise<Object>}
 */
export async function getAuditSummary(options = {}) {
  const memory = await loadMemory();
  const days = options.days || 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const summary = {
    period: {
      days,
      from: cutoff.toISOString(),
      to: new Date().toISOString(),
    },
    totals: {
      classes: Object.keys(memory.classes).length,
      totalActions: memory.metadata.totalActions,
      totalPositive: memory.metadata.totalPositive,
      totalNegative: memory.metadata.totalNegative,
    },
    recentActivity: {
      actions: 0,
      positive: 0,
      negative: 0,
    },
    scoreChanges: [],
    topClasses: [],
    bottomClasses: [],
  };

  // Analyze recent activity
  for (const [actionClass, entry] of Object.entries(memory.classes)) {
    const recentInstances = entry.instances.filter(
      i => new Date(i.ts) >= cutoff
    );

    if (recentInstances.length > 0) {
      summary.recentActivity.actions += recentInstances.length;
      summary.recentActivity.positive += recentInstances.filter(
        i => i.outcome === 'positive'
      ).length;
      summary.recentActivity.negative += recentInstances.filter(
        i => i.outcome === 'negative'
      ).length;
    }

    // Track score changes
    if (entry.scoreHistory.length >= 2) {
      const history = entry.scoreHistory;
      const oldestInPeriod = history[Math.max(0, history.length - days)];
      const current = history[history.length - 1];
      const change = current - oldestInPeriod;

      if (Math.abs(change) > 0.01) {
        summary.scoreChanges.push({
          class: actionClass,
          from: oldestInPeriod,
          to: current,
          change,
        });
      }
    }
  }

  // Sort score changes by magnitude
  summary.scoreChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  summary.scoreChanges = summary.scoreChanges.slice(0, 10);

  // Top and bottom classes by score
  const classesByScore = Object.entries(memory.classes)
    .map(([cls, entry]) => ({ class: cls, score: entry.score }))
    .sort((a, b) => b.score - a.score);

  summary.topClasses = classesByScore.slice(0, 5);
  summary.bottomClasses = classesByScore.slice(-5).reverse();

  return summary;
}

/**
 * Reset precedent for an action class
 *
 * @param {string} actionClass - Action class to reset
 * @returns {Promise<{ success: boolean, oldScore: number }>}
 */
export async function resetPrecedent(actionClass) {
  const memory = await loadMemory();

  if (!memory.classes[actionClass]) {
    return {
      success: false,
      error: `No recorded actions for class: ${actionClass}`,
    };
  }

  const oldScore = memory.classes[actionClass].score;
  memory.classes[actionClass].score = PRECEDENT_FLOOR;
  memory.classes[actionClass].scoreHistory.push(PRECEDENT_FLOOR);
  memory.classes[actionClass].decayAnchor = new Date().toISOString();

  memoryCacheDirty = true;
  await saveMemory();

  return {
    success: true,
    oldScore,
  };
}

/**
 * Clear in-memory cache (for testing)
 */
export function clearCache() {
  memoryCache = null;
  memoryCacheDirty = false;
}

/**
 * Get memory file path (for testing/debugging)
 */
export function getMemoryPath() {
  return MEMORY_PATH;
}

/**
 * Get raw memory data (for debugging)
 */
export async function getRawMemory() {
  return await loadMemory();
}

export default {
  recordAction,
  recordOutcome,
  getPrecedent,
  decayScores,
  getAuditSummary,
  resetPrecedent,
  clearCache,
  getMemoryPath,
  getRawMemory,
  PRECEDENT_CEILING,
  PRECEDENT_FLOOR,
};
