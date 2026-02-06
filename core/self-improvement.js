/**
 * Self-Improvement Pipeline
 *
 * Autonomous self-modification with graduated validation:
 * 1. CLASSIFY — Map improvement type to ACE action class, determine risk tier
 * 2. VALIDATE — Branch, test, self-review based on tier
 * 3. TRIPWIRE — Rate-limit, digest, auto-pause on anomaly
 *
 * Entry point: processImprovement(improvement)
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { scoreAction, TIERS } from './ace/scorer.js';
import { recordAction, recordOutcome } from './ace/precedent-memory.js';
import { approvals } from './memory.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { safeAppendFileSync } from './atomic-write.js';
import { rotateIfNeeded, readLastN } from './jsonl-rotate.js';
import { query } from './claude.js';
import { spawn } from 'child_process';

// Paths
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_PATH = join(PERSONALITY_PATH, 'journal', 'self_improvement.jsonl');

// Action class mapping
const TYPE_TO_ACTION_CLASS = {
  reflection: 'self:improve:reflection',
  skill: 'self:improve:skill',
  plugin: 'self:improve:plugin',
  config: 'self:improve:config',
  core: 'self:improve:core',
};

// In-memory tripwire state
let tripwireState = {
  appliedThisHour: 0,
  appliedToday: 0,
  consecutiveFailures: 0,
  paused: false,
  pauseReason: null,
  hourResetAt: Date.now() + 3600000,
  dayResetAt: Date.now() + 86400000,
  lastDigestAt: null,
};

// Event listeners (same pattern as loop.js)
const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(callback);
}

function emit(event, data) {
  const callbacks = listeners.get(event) || [];
  for (const cb of callbacks) {
    try {
      cb(data);
    } catch (e) {
      console.error(`[SelfImprovement] Event listener error (${event}):`, e.message);
    }
  }
}

/**
 * Get self-improvement config with safe defaults
 */
function getConfig() {
  const si = config.selfImprovement || {};
  return {
    enabled: si.enabled || false,
    maxPerHour: si.maxPerHour || 3,
    maxPerDay: si.maxPerDay || 10,
    pauseOnConsecutiveFailures: si.pauseOnConsecutiveFailures || 3,
    testCommand: si.testCommand || 'node tests/run-all.js',
    testTimeoutMs: si.testTimeoutMs || 60000,
    digestIntervalDays: si.digestIntervalDays || 7,
  };
}

// ===== LAYER 1: CLASSIFICATION =====

/**
 * Map improvement type to ACE action class
 * @param {string} type - reflection|skill|plugin|config|core
 * @returns {string} ACE action class
 */
export function classifyImprovement(type) {
  return TYPE_TO_ACTION_CLASS[type] || 'self:improve:core';
}

// ===== LAYER 3: TRIPWIRES (checked before validation) =====

/**
 * Reset hourly/daily counters if window has passed
 */
function resetCountersIfNeeded() {
  const now = Date.now();
  if (now >= tripwireState.hourResetAt) {
    tripwireState.appliedThisHour = 0;
    tripwireState.hourResetAt = now + 3600000;
  }
  if (now >= tripwireState.dayResetAt) {
    tripwireState.appliedToday = 0;
    tripwireState.dayResetAt = now + 86400000;
  }
}

/**
 * Check tripwires: rate limiting + consecutive failure detection
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function checkTripwires() {
  const cfg = getConfig();
  resetCountersIfNeeded();

  if (tripwireState.paused) {
    return { ok: false, reason: `Paused: ${tripwireState.pauseReason}` };
  }

  if (tripwireState.appliedThisHour >= cfg.maxPerHour) {
    return { ok: false, reason: `Hourly limit reached (${cfg.maxPerHour}/hour)` };
  }

  if (tripwireState.appliedToday >= cfg.maxPerDay) {
    return { ok: false, reason: `Daily limit reached (${cfg.maxPerDay}/day)` };
  }

  return { ok: true, reason: null };
}

// ===== LAYER 2: VALIDATION PIPELINE =====

/**
 * Snapshot current file contents for rollback
 * @param {Array<{file: string}>} changes - Proposed changes with file paths
 * @returns {Map<string, string|null>} file path → original content (null if file didn't exist)
 */
export function snapshotState(changes) {
  const snapshot = new Map();
  for (const change of changes) {
    try {
      if (existsSync(change.file)) {
        snapshot.set(change.file, readFileSync(change.file, 'utf-8'));
      } else {
        snapshot.set(change.file, null);
      }
    } catch (err) {
      console.error(`[SelfImprovement] Snapshot failed for ${change.file}:`, err.message);
      snapshot.set(change.file, null);
    }
  }
  return snapshot;
}

/**
 * Rollback files to snapshot state
 * @param {Map<string, string|null>} snapshot
 */
export function rollback(snapshot) {
  for (const [filePath, content] of snapshot) {
    try {
      if (content === null) {
        // File didn't exist before — remove it
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } else {
        atomicWriteFileSync(filePath, content);
      }
    } catch (err) {
      console.error(`[SelfImprovement] Rollback failed for ${filePath}:`, err.message);
    }
  }
}

/**
 * Apply proposed file changes
 * @param {Array<{file: string, content: string}>} changes
 */
function applyChanges(changes) {
  for (const change of changes) {
    atomicWriteFileSync(change.file, change.content);
  }
}

/**
 * Run the test gate — spawn test runner and check exit code
 * @returns {Promise<{passed: boolean, output: string}>}
 */
export function runTestGate() {
  const cfg = getConfig();
  const parts = cfg.testCommand.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      timeout: cfg.testTimeoutMs,
    });

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, cfg.testTimeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ passed: false, output: output + '\n[TIMEOUT]' });
      } else {
        resolve({ passed: code === 0, output });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ passed: false, output: `Spawn error: ${err.message}` });
    });
  });
}

/**
 * Self-review a diff using Claude
 * @param {Object} improvement
 * @returns {Promise<{concerns: string[], approved: boolean}>}
 */
async function selfReviewDiff(improvement) {
  try {
    const diffSummary = improvement.changes
      .map(c => `File: ${c.file}\n${c.content.slice(0, 500)}`)
      .join('\n---\n');

    const result = await query(
      `Review this self-improvement change. Flag any concerns about safety, correctness, or unintended side effects.\n\nType: ${improvement.type}\nReason: ${improvement.reason}\n\nChanges:\n${diffSummary}\n\nRespond with a JSON object: { "concerns": ["..."], "approved": true/false }`,
      { timeout: 30000 }
    );

    if (result.success && result.output) {
      // Try to extract JSON from output
      const jsonMatch = result.output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0]);
        return {
          concerns: Array.isArray(review.concerns) ? review.concerns : [],
          approved: review.approved !== false,
        };
      }
    }
  } catch (err) {
    console.error('[SelfImprovement] Self-review failed:', err.message);
  }

  // Default: approve with no concerns if review fails
  return { concerns: [], approved: true };
}

/**
 * Record an improvement to the journal
 */
function recordToJournal(entry) {
  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };
  safeAppendFileSync(JOURNAL_PATH, JSON.stringify(record) + '\n');
  rotateIfNeeded(JOURNAL_PATH);
}

/**
 * Tier-dependent validation and application
 * @param {Object} improvement
 * @param {string} tier - ACE tier (act|deliberate|escalate)
 * @returns {Promise<{applied: boolean, reason: string, outcome: string}>}
 */
async function validateAndApply(improvement, tier) {
  const actionClass = classifyImprovement(improvement.type);

  // ---- ACT tier: apply directly, log ----
  if (tier === TIERS.ACT) {
    applyChanges(improvement.changes);
    tripwireState.appliedThisHour++;
    tripwireState.appliedToday++;
    tripwireState.consecutiveFailures = 0;

    recordToJournal({
      type: improvement.type,
      description: improvement.description,
      tier: 'act',
      outcome: 'applied',
      origin: improvement.origin,
    });

    await recordAction({ class: actionClass, description: improvement.description });
    await recordOutcome({ class: actionClass, success: true, severity: 0 });

    emit('self-improvement:applied', { improvement, tier: 'act' });
    return { applied: true, reason: 'ACT tier — applied directly', outcome: 'applied' };
  }

  // ---- DELIBERATE tier: snapshot → apply → test → self-review → commit or rollback ----
  if (tier === TIERS.DELIBERATE) {
    const snapshot = snapshotState(improvement.changes);

    applyChanges(improvement.changes);

    // Run tests
    const testResult = await runTestGate();

    if (!testResult.passed) {
      // Rollback
      rollback(snapshot);
      tripwireState.consecutiveFailures++;

      // Check if we should pause
      const cfg = getConfig();
      if (tripwireState.consecutiveFailures >= cfg.pauseOnConsecutiveFailures) {
        tripwireState.paused = true;
        tripwireState.pauseReason = `${tripwireState.consecutiveFailures} consecutive test failures`;
        emit('self-improvement:paused', { reason: tripwireState.pauseReason });
      }

      recordToJournal({
        type: improvement.type,
        description: improvement.description,
        tier: 'deliberate',
        outcome: 'rolled_back',
        testOutput: testResult.output.slice(0, 500),
        origin: improvement.origin,
      });

      await recordAction({ class: actionClass, description: improvement.description });
      await recordOutcome({ class: actionClass, success: false, severity: 1 });

      emit('self-improvement:rolled-back', { improvement, testOutput: testResult.output });
      return { applied: false, reason: 'Tests failed — rolled back', outcome: 'rolled_back' };
    }

    // Self-review the diff
    const review = await selfReviewDiff(improvement);

    if (!review.approved) {
      // Rollback on self-review rejection
      rollback(snapshot);
      tripwireState.consecutiveFailures++;

      recordToJournal({
        type: improvement.type,
        description: improvement.description,
        tier: 'deliberate',
        outcome: 'review_rejected',
        concerns: review.concerns,
        origin: improvement.origin,
      });

      await recordAction({ class: actionClass, description: improvement.description });
      await recordOutcome({ class: actionClass, success: false, severity: 1 });

      emit('self-improvement:review-rejected', { improvement, concerns: review.concerns });
      return { applied: false, reason: 'Self-review rejected — rolled back', outcome: 'review_rejected' };
    }

    // Tests passed + review approved — commit
    tripwireState.appliedThisHour++;
    tripwireState.appliedToday++;
    tripwireState.consecutiveFailures = 0;

    recordToJournal({
      type: improvement.type,
      description: improvement.description,
      tier: 'deliberate',
      outcome: 'applied',
      concerns: review.concerns,
      origin: improvement.origin,
    });

    await recordAction({ class: actionClass, description: improvement.description });
    await recordOutcome({ class: actionClass, success: true, severity: 0 });

    emit('self-improvement:applied', { improvement, tier: 'deliberate', review });
    return { applied: true, reason: 'DELIBERATE — tests passed, review approved', outcome: 'applied' };
  }

  // ---- ESCALATE tier: format digest, request approval, wait ----
  if (tier === TIERS.ESCALATE) {
    const diffSummary = improvement.changes
      .map(c => `**${c.file}**\n\`\`\`\n${c.content.slice(0, 1000)}\n\`\`\``)
      .join('\n\n');

    const approvalRecord = approvals.request({
      type: 'self_improvement',
      improvementType: improvement.type,
      description: improvement.description,
      reason: improvement.reason,
      origin: improvement.origin,
      diff: diffSummary,
      actionClass,
    });

    recordToJournal({
      type: improvement.type,
      description: improvement.description,
      tier: 'escalate',
      outcome: 'awaiting_approval',
      approvalId: approvalRecord.id,
      origin: improvement.origin,
    });

    emit('self-improvement:needs-approval', { improvement, approvalId: approvalRecord.id });
    return { applied: false, reason: 'ESCALATE — awaiting user approval', outcome: 'awaiting_approval', approvalId: approvalRecord.id };
  }

  return { applied: false, reason: `Unknown tier: ${tier}`, outcome: 'error' };
}

// ===== MAIN ENTRY POINT =====

/**
 * Process a self-improvement proposal through the full pipeline.
 *
 * @param {Object} improvement
 * @param {string} improvement.type - reflection|skill|plugin|config|core
 * @param {string} improvement.description - What this improvement does
 * @param {Array<{file: string, content: string}>} improvement.changes - Proposed file changes
 * @param {string} improvement.reason - Why this improvement helps
 * @param {string} improvement.origin - reflection|user|autonomous
 * @returns {Promise<{applied: boolean, reason: string, outcome: string, tier: string}>}
 */
export async function processImprovement(improvement) {
  const cfg = getConfig();

  if (!cfg.enabled) {
    return { applied: false, reason: 'Self-improvement is disabled', outcome: 'disabled', tier: null };
  }

  // Validate input
  if (!improvement || !improvement.type || !improvement.changes || !Array.isArray(improvement.changes)) {
    return { applied: false, reason: 'Invalid improvement descriptor', outcome: 'invalid', tier: null };
  }

  // Layer 1: Classify
  const actionClass = classifyImprovement(improvement.type);
  console.log(`[SelfImprovement] Processing: ${improvement.type} → ${actionClass}`);

  // Layer 3: Check tripwires first (before spending compute on scoring)
  const tripwireCheck = checkTripwires();
  if (!tripwireCheck.ok) {
    recordToJournal({
      type: improvement.type,
      description: improvement.description,
      outcome: 'rate_limited',
      reason: tripwireCheck.reason,
      origin: improvement.origin,
    });
    emit('self-improvement:rate-limited', { improvement, reason: tripwireCheck.reason });
    return { applied: false, reason: tripwireCheck.reason, outcome: 'rate_limited', tier: null };
  }

  // Layer 1 (cont.): Score via ACE
  const score = scoreAction({
    class: actionClass,
    precedent: 0.0, // Self-improvement starts with no precedent
  });

  console.log(`[SelfImprovement] ACE score: ${score.composite.toFixed(2)} → tier: ${score.tier}`);

  // Layer 2: Validate and apply (tier-dependent)
  const result = await validateAndApply(improvement, score.tier);
  return { ...result, tier: score.tier };
}

// ===== DIGEST =====

/**
 * Generate a summary digest of recent self-improvements
 * @param {number} [days=7] - Number of days to cover
 * @returns {Object} digest
 */
export function generateDigest(days = 7) {
  const entries = readLastN(JOURNAL_PATH, 200);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  const recent = entries.filter(e => e.ts && new Date(e.ts).getTime() >= cutoff);

  const byOutcome = { applied: 0, rolled_back: 0, review_rejected: 0, awaiting_approval: 0, rate_limited: 0 };
  const byType = {};

  for (const entry of recent) {
    if (entry.outcome && entry.outcome in byOutcome) {
      byOutcome[entry.outcome]++;
    }
    if (entry.type) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }
  }

  return {
    period: { days, from: new Date(cutoff).toISOString(), to: new Date().toISOString() },
    total: recent.length,
    byOutcome,
    byType,
    paused: tripwireState.paused,
    pauseReason: tripwireState.pauseReason,
    consecutiveFailures: tripwireState.consecutiveFailures,
    entries: recent.slice(-20), // Last 20 for detail
  };
}

/**
 * Format digest as human-readable text
 * @param {Object} digest
 * @returns {string}
 */
export function formatDigest(digest) {
  const lines = [];
  lines.push(`**Self-Improvement Digest — Last ${digest.period.days} days**`);
  lines.push('');
  lines.push(`Total improvements processed: ${digest.total}`);
  lines.push(`  Applied: ${digest.byOutcome.applied}`);
  lines.push(`  Rolled back: ${digest.byOutcome.rolled_back}`);
  lines.push(`  Review rejected: ${digest.byOutcome.review_rejected}`);
  lines.push(`  Awaiting approval: ${digest.byOutcome.awaiting_approval}`);
  lines.push(`  Rate limited: ${digest.byOutcome.rate_limited}`);
  lines.push('');

  if (Object.keys(digest.byType).length > 0) {
    lines.push('By type:');
    for (const [type, count] of Object.entries(digest.byType)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');
  }

  if (digest.paused) {
    lines.push(`**PAUSED**: ${digest.pauseReason}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a digest is due and emit it
 * @returns {{ due: boolean, digest: Object|null }}
 */
export function checkDigestDue() {
  const cfg = getConfig();
  const intervalMs = cfg.digestIntervalDays * 24 * 60 * 60 * 1000;

  if (!tripwireState.lastDigestAt) {
    // First run — schedule but don't emit immediately
    tripwireState.lastDigestAt = Date.now();
    return { due: false, digest: null };
  }

  if (Date.now() - tripwireState.lastDigestAt >= intervalMs) {
    const digest = generateDigest(cfg.digestIntervalDays);
    tripwireState.lastDigestAt = Date.now();
    emit('self-improvement:digest', { digest, formatted: formatDigest(digest) });
    return { due: true, digest };
  }

  return { due: false, digest: null };
}

// ===== CONTROL =====

/**
 * Get current tripwire/pipeline stats
 */
export function getStats() {
  resetCountersIfNeeded();
  return {
    enabled: getConfig().enabled,
    appliedThisHour: tripwireState.appliedThisHour,
    appliedToday: tripwireState.appliedToday,
    consecutiveFailures: tripwireState.consecutiveFailures,
    paused: tripwireState.paused,
    pauseReason: tripwireState.pauseReason,
    config: getConfig(),
  };
}

/**
 * Pause the self-improvement pipeline
 * @param {string} reason
 */
export function pause(reason) {
  tripwireState.paused = true;
  tripwireState.pauseReason = reason || 'Manually paused';
  emit('self-improvement:paused', { reason: tripwireState.pauseReason });
}

/**
 * Resume the self-improvement pipeline
 */
export function resume() {
  tripwireState.paused = false;
  tripwireState.pauseReason = null;
  tripwireState.consecutiveFailures = 0;
  emit('self-improvement:resumed', {});
}

/**
 * Reset tripwire state (for testing)
 */
export function resetState() {
  tripwireState = {
    appliedThisHour: 0,
    appliedToday: 0,
    consecutiveFailures: 0,
    paused: false,
    pauseReason: null,
    hourResetAt: Date.now() + 3600000,
    dayResetAt: Date.now() + 86400000,
    lastDigestAt: null,
  };
}

/**
 * Get journal path (for testing/external access)
 */
export function getJournalPath() {
  return JOURNAL_PATH;
}

export default {
  processImprovement,
  classifyImprovement,
  checkTripwires,
  snapshotState,
  rollback,
  runTestGate,
  generateDigest,
  formatDigest,
  checkDigestDue,
  getStats,
  pause,
  resume,
  resetState,
  getJournalPath,
  on,
};
