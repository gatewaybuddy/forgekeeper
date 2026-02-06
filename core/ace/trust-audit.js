/**
 * ACE Trust Audit & Drift Protection
 *
 * Periodic trust audits, rubber-stamp detection, and threshold drift protection.
 *
 * Features:
 * - Weekly audit reports summarizing autonomous actions
 * - Rubber-stamp detection after consecutive unmodified approvals
 * - Drift rate warning when trust expansion is too fast
 * - Self-modification prohibition enforcement
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';
import { getAuditSummary, getRawMemory } from './precedent-memory.js';
import { getBypassStats } from './bypass.js';
import { hasHardCeiling } from './action-classes.js';
import { TIERS } from './scorer.js';
import { getStats as getSelfImprovementStats } from '../self-improvement.js';

// Audit log path
const AUDIT_LOG_PATH = path.join(
  config.autonomous?.personalityPath || 'forgekeeper_personality',
  'memory',
  'ace_audit_log.jsonl'
);

// Audit state
let auditState = {
  consecutiveApprovals: 0,
  lastAuditDate: null,
  escalationHistory: [],
  driftHistory: [],
};

/**
 * Get audit configuration
 */
function getAuditConfig() {
  const aceConfig = config.ace || {};
  return {
    rubberStampThreshold: aceConfig.rubberStampThreshold || 10,
    auditIntervalDays: aceConfig.auditIntervalDays || 7,
    driftWarningRate: 0.20, // Warn if trust expands more than 20% per week
  };
}

/**
 * Record an escalation response from the user
 *
 * @param {Object} response - Escalation response
 * @param {string} response.actionClass - Action class that was escalated
 * @param {string} response.decision - 'approved' | 'denied' | 'modified'
 * @param {string} [response.modification] - What was modified (if decision is 'modified')
 * @returns {{ rubberStampWarning: boolean, consecutiveCount: number }}
 */
export function recordEscalationResponse(response) {
  const auditConfig = getAuditConfig();

  // Add to history
  auditState.escalationHistory.push({
    timestamp: new Date().toISOString(),
    actionClass: response.actionClass,
    decision: response.decision,
    modification: response.modification || null,
  });

  // Keep history manageable
  if (auditState.escalationHistory.length > 100) {
    auditState.escalationHistory = auditState.escalationHistory.slice(-100);
  }

  // Track consecutive approvals (unmodified)
  if (response.decision === 'approved') {
    auditState.consecutiveApprovals++;
  } else {
    auditState.consecutiveApprovals = 0;
  }

  // Check for rubber-stamping
  const rubberStampWarning = auditState.consecutiveApprovals >= auditConfig.rubberStampThreshold;

  return {
    rubberStampWarning,
    consecutiveCount: auditState.consecutiveApprovals,
  };
}

/**
 * Detect rubber-stamp approval pattern
 *
 * @returns {{ detected: boolean, count: number, threshold: number, message: string | null }}
 */
export function detectRubberStamp() {
  const auditConfig = getAuditConfig();
  const detected = auditState.consecutiveApprovals >= auditConfig.rubberStampThreshold;

  return {
    detected,
    count: auditState.consecutiveApprovals,
    threshold: auditConfig.rubberStampThreshold,
    message: detected
      ? `I've noticed you've approved my last ${auditState.consecutiveApprovals} escalated actions without changes. This might mean my escalation threshold is too conservative — or it might mean approvals are becoming automatic. Would you like to review and adjust, or should I continue at current sensitivity?`
      : null,
  };
}

/**
 * Reset the rubber-stamp counter
 * Call this after user acknowledges the warning
 */
export function resetRubberStampCounter() {
  auditState.consecutiveApprovals = 0;
}

/**
 * Calculate trust drift rate from precedent memory
 *
 * @param {number} [days=7] - Days to analyze
 * @returns {Promise<{ rate: number, expanding: string[], contracting: string[], warning: boolean }>}
 */
export async function checkDriftRate(days = 7) {
  const auditConfig = getAuditConfig();
  const summary = await getAuditSummary({ days });

  // Calculate average score change
  let totalChange = 0;
  const expanding = [];
  const contracting = [];

  for (const change of summary.scoreChanges) {
    totalChange += change.change;
    if (change.change > 0.05) {
      expanding.push(`${change.class}: ${change.from.toFixed(2)} → ${change.to.toFixed(2)}`);
    } else if (change.change < -0.05) {
      contracting.push(`${change.class}: ${change.from.toFixed(2)} → ${change.to.toFixed(2)}`);
    }
  }

  const rate = summary.scoreChanges.length > 0
    ? totalChange / summary.scoreChanges.length
    : 0;

  const warning = rate > auditConfig.driftWarningRate;

  // Record drift history
  auditState.driftHistory.push({
    timestamp: new Date().toISOString(),
    rate,
    expanding: expanding.length,
    contracting: contracting.length,
  });

  // Keep history manageable
  if (auditState.driftHistory.length > 52) {
    auditState.driftHistory = auditState.driftHistory.slice(-52);
  }

  return {
    rate,
    expanding,
    contracting,
    warning,
    message: warning
      ? `Trust expansion rate is ${(rate * 100).toFixed(0)}% this week, above the ${(auditConfig.driftWarningRate * 100).toFixed(0)}% threshold. Consider reviewing whether autonomous actions are being scrutinized.`
      : null,
  };
}

/**
 * Check if an action would modify ACE thresholds (always blocked)
 *
 * @param {string} actionClass - Action class to check
 * @returns {{ blocked: boolean, reason: string | null }}
 */
export function checkSelfModification(actionClass) {
  // These action classes can NEVER be taken autonomously
  const selfModifyPatterns = [
    'self:modify:ace-thresholds',
    'self:modify:ace-config',
    'self:modify:ace-weights',
  ];

  for (const pattern of selfModifyPatterns) {
    if (actionClass === pattern || actionClass.startsWith(pattern.replace('*', ''))) {
      return {
        blocked: true,
        reason: `Action class "${actionClass}" is permanently blocked. ACE cannot modify its own thresholds or configuration.`,
      };
    }
  }

  // Also check hard ceilings
  if (hasHardCeiling(actionClass)) {
    return {
      blocked: true,
      reason: `Action class "${actionClass}" has a hard ceiling and always requires escalation.`,
    };
  }

  return {
    blocked: false,
    reason: null,
  };
}

/**
 * Get self-improvement stats for audit report (safe — returns defaults if SI is disabled)
 */
function getSelfImprovementStatsForAudit() {
  try {
    const stats = getSelfImprovementStats();
    return {
      enabled: stats.enabled,
      appliedThisHour: stats.appliedThisHour,
      appliedToday: stats.appliedToday,
      consecutiveFailures: stats.consecutiveFailures,
      paused: stats.paused,
      pauseReason: stats.pauseReason,
    };
  } catch {
    return { enabled: false, appliedThisHour: 0, appliedToday: 0, consecutiveFailures: 0, paused: false, pauseReason: null };
  }
}

/**
 * Generate a full trust audit report
 *
 * @param {Object} [options] - Options
 * @param {number} [options.days=7] - Days to analyze
 * @returns {Promise<Object>} - Audit report
 */
export async function generateAudit(options = {}) {
  const days = options.days || 7;
  const auditConfig = getAuditConfig();

  // Get precedent summary
  const precedentSummary = await getAuditSummary({ days });

  // Get bypass stats
  const bypassStats = getBypassStats();

  // Get drift rate
  const drift = await checkDriftRate(days);

  // Get rubber-stamp status
  const rubberStamp = detectRubberStamp();

  // Analyze escalation history
  const recentEscalations = auditState.escalationHistory.filter(e => {
    const ts = new Date(e.timestamp);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return ts >= cutoff;
  });

  const escalationBreakdown = {
    approved: recentEscalations.filter(e => e.decision === 'approved').length,
    denied: recentEscalations.filter(e => e.decision === 'denied').length,
    modified: recentEscalations.filter(e => e.decision === 'modified').length,
  };

  const report = {
    type: 'ace:trust-audit',
    generatedAt: new Date().toISOString(),
    period: {
      days,
      from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    },

    // Activity summary
    activity: {
      totalActions: precedentSummary.recentActivity.actions,
      positive: precedentSummary.recentActivity.positive,
      negative: precedentSummary.recentActivity.negative,
      escalations: recentEscalations.length,
      escalationBreakdown,
    },

    // Precedent changes
    precedent: {
      classesActive: precedentSummary.totals.classes,
      scoreChanges: precedentSummary.scoreChanges,
      topClasses: precedentSummary.topClasses,
      bottomClasses: precedentSummary.bottomClasses,
    },

    // Trust drift
    drift: {
      rate: drift.rate,
      ratePercent: (drift.rate * 100).toFixed(1),
      warning: drift.warning,
      expanding: drift.expanding,
      contracting: drift.contracting,
    },

    // Rubber-stamp detection
    rubberStamp: {
      consecutiveApprovals: rubberStamp.count,
      threshold: rubberStamp.threshold,
      warning: rubberStamp.detected,
    },

    // Bypass usage
    bypass: {
      temporaryBypassCount: bypassStats.temporaryBypassCount,
      actionsWhileBypassed: bypassStats.actionsWhileBypassed,
      hardCeilingBlocked: bypassStats.hardCeilingBlockedDuringBypass,
      lastBypassAt: bypassStats.lastBypassAt,
    },

    // Self-improvement stats
    selfImprovement: getSelfImprovementStatsForAudit(),

    // Warnings
    warnings: [],
  };

  // Compile warnings
  if (drift.warning) {
    report.warnings.push({
      type: 'drift',
      severity: 'medium',
      message: drift.message,
    });
  }

  if (rubberStamp.detected) {
    report.warnings.push({
      type: 'rubber-stamp',
      severity: 'high',
      message: rubberStamp.message,
    });
  }

  if (precedentSummary.recentActivity.negative > precedentSummary.recentActivity.positive) {
    report.warnings.push({
      type: 'negative-trend',
      severity: 'medium',
      message: `More negative outcomes (${precedentSummary.recentActivity.negative}) than positive (${precedentSummary.recentActivity.positive}) this period.`,
    });
  }

  if (bypassStats.actionsWhileBypassed > 10) {
    report.warnings.push({
      type: 'bypass-usage',
      severity: 'low',
      message: `${bypassStats.actionsWhileBypassed} actions taken while ACE was bypassed.`,
    });
  }

  return report;
}

/**
 * Format audit report as human-readable text
 *
 * @param {Object} report - Audit report from generateAudit()
 * @returns {string} - Formatted text
 */
export function formatAuditReport(report) {
  const lines = [];

  lines.push(`📊 **ACE Trust Audit — Week of ${new Date(report.period.from).toLocaleDateString()}**`);
  lines.push('');

  // Activity
  lines.push('**Activity Summary**');
  lines.push(`• Total actions recorded: ${report.activity.totalActions}`);
  lines.push(`• Positive outcomes: ${report.activity.positive}`);
  lines.push(`• Negative outcomes: ${report.activity.negative}`);
  lines.push(`• Escalations: ${report.activity.escalations}`);
  if (report.activity.escalations > 0) {
    lines.push(`  - Approved: ${report.activity.escalationBreakdown.approved}`);
    lines.push(`  - Denied: ${report.activity.escalationBreakdown.denied}`);
    lines.push(`  - Modified: ${report.activity.escalationBreakdown.modified}`);
  }
  lines.push('');

  // Precedent changes
  if (report.precedent.scoreChanges.length > 0) {
    lines.push('**Precedent Changes**');
    for (const change of report.precedent.scoreChanges.slice(0, 5)) {
      const arrow = change.change > 0 ? '↑' : '↓';
      lines.push(`• ${change.class}: ${change.from.toFixed(2)} → ${change.to.toFixed(2)} ${arrow}`);
    }
    lines.push('');
  }

  // Drift
  lines.push('**Trust Drift**');
  lines.push(`• Expansion rate: ${report.drift.ratePercent}%/week`);
  if (report.drift.warning) {
    lines.push(`• ⚠️ Above ${(0.20 * 100).toFixed(0)}% threshold`);
  }
  lines.push('');

  // Warnings
  if (report.warnings.length > 0) {
    lines.push('**⚠️ Warnings**');
    for (const warning of report.warnings) {
      const icon = warning.severity === 'high' ? '🔴' : warning.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`${icon} ${warning.message}`);
    }
    lines.push('');
  }

  // Self-Improvement
  if (report.selfImprovement) {
    const si = report.selfImprovement;
    lines.push('**Self-Improvement**');
    lines.push(`• Enabled: ${si.enabled ? 'Yes' : 'No'}`);
    if (si.enabled) {
      lines.push(`• Applied today: ${si.appliedToday}`);
      lines.push(`• Consecutive failures: ${si.consecutiveFailures}`);
      if (si.paused) {
        lines.push(`• ⚠️ PAUSED: ${si.pauseReason}`);
      }
    }
    lines.push('');
  }

  // Bypass
  if (report.bypass.temporaryBypassCount > 0 || report.bypass.actionsWhileBypassed > 0) {
    lines.push('**Bypass Usage**');
    lines.push(`• Temporary bypasses: ${report.bypass.temporaryBypassCount}`);
    lines.push(`• Actions while bypassed: ${report.bypass.actionsWhileBypassed}`);
    lines.push(`• Hard ceiling blocks: ${report.bypass.hardCeilingBlocked}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Present audit to user (via callback or return)
 *
 * @param {Object} [options] - Options
 * @param {Function} [options.sendMessage] - Callback to send message (e.g., Telegram)
 * @returns {Promise<{ report: Object, formatted: string, sent: boolean }>}
 */
export async function presentAudit(options = {}) {
  const report = await generateAudit();
  const formatted = formatAuditReport(report);

  let sent = false;

  if (options.sendMessage && typeof options.sendMessage === 'function') {
    try {
      await options.sendMessage(formatted);
      sent = true;
    } catch (err) {
      console.error('[ACE Audit] Failed to send audit:', err.message);
    }
  }

  // Log the audit
  await logAudit(report);

  // Update last audit date
  auditState.lastAuditDate = new Date().toISOString();

  return {
    report,
    formatted,
    sent,
  };
}

/**
 * Log audit to persistent storage
 *
 * @param {Object} report - Audit report
 */
async function logAudit(report) {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    await fs.mkdir(dir, { recursive: true });

    const line = JSON.stringify(report) + '\n';
    await fs.appendFile(AUDIT_LOG_PATH, line, 'utf-8');
  } catch (err) {
    console.error('[ACE Audit] Failed to log audit:', err.message);
  }
}

/**
 * Check if audit is due
 *
 * @returns {{ due: boolean, daysSinceLast: number | null }}
 */
export function isAuditDue() {
  const auditConfig = getAuditConfig();

  if (!auditState.lastAuditDate) {
    return { due: true, daysSinceLast: null };
  }

  const lastAudit = new Date(auditState.lastAuditDate);
  const daysSince = (Date.now() - lastAudit.getTime()) / (1000 * 60 * 60 * 24);

  return {
    due: daysSince >= auditConfig.auditIntervalDays,
    daysSinceLast: daysSince,
  };
}

/**
 * Get audit state (for testing/debugging)
 */
export function getAuditState() {
  return { ...auditState };
}

/**
 * Reset audit state (for testing)
 */
export function resetAuditState() {
  auditState = {
    consecutiveApprovals: 0,
    lastAuditDate: null,
    escalationHistory: [],
    driftHistory: [],
  };
}

/**
 * Get audit log path
 */
export function getAuditLogPath() {
  return AUDIT_LOG_PATH;
}

export default {
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
};
