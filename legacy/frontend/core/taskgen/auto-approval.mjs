/**
 * Auto-Approval Module - Intelligent automatic approval of high-confidence tasks
 *
 * Automatically approves tasks that meet strict criteria:
 * - High confidence score (≥ 0.9 by default)
 * - From trusted analyzers only
 * - Rate-limited for safety
 * - Full audit logging
 *
 * Safety: Default OFF, must explicitly enable via TASKGEN_AUTO_APPROVE=1
 */

import { loadTasks } from './task-store.mjs';

// Configuration from environment
const AUTO_APPROVE_ENABLED = process.env.TASKGEN_AUTO_APPROVE === '1';
const AUTO_APPROVE_CONFIDENCE = parseFloat(process.env.TASKGEN_AUTO_APPROVE_CONFIDENCE || '0.9');
const AUTO_APPROVE_ANALYZERS = process.env.TASKGEN_AUTO_APPROVE_ANALYZERS || 'continuation,error_spike';
const AUTO_APPROVE_MAX_PER_HOUR = parseInt(process.env.TASKGEN_AUTO_APPROVE_MAX_PER_HOUR || '5');

// Rate limiting state (in-memory for simplicity)
let autoApprovalHistory = [];

/**
 * Clean up old auto-approval history (older than 1 hour)
 */
function cleanupHistory() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  autoApprovalHistory = autoApprovalHistory.filter(timestamp => timestamp > oneHourAgo);
}

/**
 * Check if auto-approval is allowed based on rate limit
 *
 * @returns {boolean} True if rate limit not exceeded
 */
function checkRateLimit() {
  cleanupHistory();
  return autoApprovalHistory.length < AUTO_APPROVE_MAX_PER_HOUR;
}

/**
 * Record an auto-approval for rate limiting
 */
function recordAutoApproval() {
  autoApprovalHistory.push(Date.now());
}

/**
 * Calculate historical approval rate for an analyzer
 *
 * @param {string} analyzer - Analyzer name
 * @returns {Promise<number>} Approval rate (0-1)
 */
async function getHistoricalApprovalRate(analyzer) {
  try {
    const tasks = await loadTasks();
    const analyzerTasks = tasks.filter(t => t.analyzer === analyzer);

    if (analyzerTasks.length === 0) {
      return 0;
    }

    const approved = analyzerTasks.filter(t => t.status === 'approved' || t.status === 'completed');
    return approved.length / analyzerTasks.length;
  } catch (err) {
    console.error('[AutoApproval] Error calculating historical approval rate:', err);
    return 0;
  }
}

/**
 * Check if a task should be auto-approved
 *
 * @param {Object} task - Task to evaluate
 * @param {Object} options - Override options
 * @returns {Promise<Object>} Result with eligibility and reason
 */
export async function shouldAutoApprove(task, options = {}) {
  const result = {
    eligible: false,
    reason: '',
    checks: {
      enabled: false,
      confidence: false,
      analyzer: false,
      historicalRate: false,
      rateLimit: false,
      taskType: false,
    },
  };

  // Check 1: Is auto-approval enabled?
  const enabled = options.enabled !== undefined ? options.enabled : AUTO_APPROVE_ENABLED;
  result.checks.enabled = enabled;

  if (!enabled) {
    result.reason = 'Auto-approval is disabled (set TASKGEN_AUTO_APPROVE=1 to enable)';
    return result;
  }

  // Check 2: Confidence threshold
  const minConfidence = options.minConfidence !== undefined ? options.minConfidence : AUTO_APPROVE_CONFIDENCE;
  result.checks.confidence = task.confidence >= minConfidence;

  if (!result.checks.confidence) {
    result.reason = `Confidence ${task.confidence.toFixed(2)} below threshold ${minConfidence}`;
    return result;
  }

  // Check 3: Trusted analyzer
  const trustedAnalyzers = (options.trustedAnalyzers || AUTO_APPROVE_ANALYZERS).split(',').map(a => a.trim());
  result.checks.analyzer = trustedAnalyzers.includes(task.analyzer);

  if (!result.checks.analyzer) {
    result.reason = `Analyzer "${task.analyzer}" not in trusted list: ${trustedAnalyzers.join(', ')}`;
    return result;
  }

  // Check 4: Historical approval rate (minimum 80%)
  const historicalRate = await getHistoricalApprovalRate(task.analyzer);
  result.checks.historicalRate = historicalRate >= 0.8 || historicalRate === 0; // Allow if no history

  if (!result.checks.historicalRate) {
    result.reason = `Historical approval rate ${(historicalRate * 100).toFixed(1)}% below 80% threshold`;
    return result;
  }

  // Check 5: Rate limiting
  result.checks.rateLimit = checkRateLimit();

  if (!result.checks.rateLimit) {
    result.reason = `Rate limit exceeded (max ${AUTO_APPROVE_MAX_PER_HOUR} per hour)`;
    return result;
  }

  // Check 6: Task type is supported for auto-approval
  // For now, all task types are supported, but this can be extended
  result.checks.taskType = true;

  // All checks passed
  result.eligible = true;
  result.reason = 'All auto-approval criteria met';

  return result;
}

/**
 * Auto-approve a task if eligible
 *
 * @param {Object} task - Task to potentially auto-approve
 * @param {Function} approveCallback - Callback to actually approve the task
 * @returns {Promise<Object>} Result with approval status
 */
export async function tryAutoApprove(task, approveCallback) {
  const eligibility = await shouldAutoApprove(task);

  if (!eligibility.eligible) {
    return {
      approved: false,
      reason: eligibility.reason,
      checks: eligibility.checks,
    };
  }

  try {
    // Record this auto-approval for rate limiting
    recordAutoApproval();

    // Execute approval
    await approveCallback(task.id);

    // Log successful auto-approval
    console.log(`[AutoApproval] Auto-approved task ${task.id}: ${task.title}`);
    console.log(`[AutoApproval] Analyzer: ${task.analyzer}, Confidence: ${task.confidence.toFixed(2)}`);

    return {
      approved: true,
      reason: 'Task auto-approved based on high confidence and trusted analyzer',
      checks: eligibility.checks,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AutoApproval] Error during auto-approval:', err);
    return {
      approved: false,
      reason: `Auto-approval failed: ${err.message}`,
      checks: eligibility.checks,
    };
  }
}

/**
 * Get auto-approval configuration and statistics
 *
 * @returns {Object} Configuration and stats
 */
export function getAutoApprovalStats() {
  cleanupHistory();

  return {
    config: {
      enabled: AUTO_APPROVE_ENABLED,
      minConfidence: AUTO_APPROVE_CONFIDENCE,
      trustedAnalyzers: AUTO_APPROVE_ANALYZERS.split(',').map(a => a.trim()),
      maxPerHour: AUTO_APPROVE_MAX_PER_HOUR,
    },
    stats: {
      approvalsThisHour: autoApprovalHistory.length,
      remainingQuota: Math.max(0, AUTO_APPROVE_MAX_PER_HOUR - autoApprovalHistory.length),
      rateLimitReset: autoApprovalHistory.length > 0
        ? new Date(Math.min(...autoApprovalHistory) + 60 * 60 * 1000).toISOString()
        : null,
    },
  };
}

/**
 * Reset auto-approval history (for testing)
 */
export function resetAutoApprovalHistory() {
  autoApprovalHistory = [];
}

export default {
  shouldAutoApprove,
  tryAutoApprove,
  getAutoApprovalStats,
  resetAutoApprovalHistory,
};
