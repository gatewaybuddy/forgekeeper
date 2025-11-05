/**
 * MIP (Metrics-Informed Prompting)
 *
 * Analyzes recent ContextLog events to detect continuation patterns and
 * injects helpful hints to reduce incomplete responses.
 *
 * Features:
 * - Analyzes continuation rate in recent time window
 * - Detects dominant continuation reasons (fence, punct, short, etc.)
 * - Generates specific hints based on continuation patterns
 * - Logs hint application to ContextLog
 * - Flag-gated for easy enable/disable
 *
 * Environment Variables:
 * - PROMPTING_HINTS_ENABLED=1     Enable MIP (default: 0)
 * - PROMPTING_HINTS_MINUTES=10    Analysis window in minutes (default: 10)
 * - PROMPTING_HINTS_THRESHOLD=0.15 Continuation rate threshold (default: 0.15)
 * - PROMPTING_HINTS_MIN_SAMPLES=5 Minimum events to analyze (default: 5)
 *
 * @module server.prompting-hints
 */

import { ulid } from 'ulid';

/**
 * Check if MIP is enabled
 */
export function isEnabled() {
  return String(process.env.PROMPTING_HINTS_ENABLED || '0') === '1';
}

/**
 * Get configuration
 */
export function getConfig() {
  return {
    enabled: isEnabled(),
    minutes: parseInt(String(process.env.PROMPTING_HINTS_MINUTES || '10'), 10) || 10,
    threshold: parseFloat(String(process.env.PROMPTING_HINTS_THRESHOLD || '0.15')) || 0.15,
    minSamples: parseInt(String(process.env.PROMPTING_HINTS_MIN_SAMPLES || '5'), 10) || 5,
  };
}

/**
 * Analyze recent ContextLog events for continuation patterns
 *
 * @param {Array} events - Recent ContextLog events
 * @returns {Object} Analysis results
 */
export function analyzeContinuations(events) {
  if (!events || events.length === 0) {
    return {
      totalEvents: 0,
      continuations: 0,
      continuationRate: 0,
      reasons: {},
      dominantReason: null,
      shouldInjectHint: false,
    };
  }

  // Filter for message events (assistant responses)
  const messageEvents = events.filter(e =>
    e.actor === 'assistant' &&
    (e.act === 'message' || e.act === 'response')
  );

  if (messageEvents.length === 0) {
    return {
      totalEvents: 0,
      continuations: 0,
      continuationRate: 0,
      reasons: {},
      dominantReason: null,
      shouldInjectHint: false,
    };
  }

  // Count continuations and reasons
  const continuations = messageEvents.filter(e => e.continued === true || e.continuation === true);
  const reasons = {};

  for (const event of continuations) {
    const reason = event.continuation_reason || event.finish_reason || 'unknown';
    reasons[reason] = (reasons[reason] || 0) + 1;
  }

  const continuationRate = continuations.length / messageEvents.length;

  // Find dominant reason
  let dominantReason = null;
  let maxCount = 0;
  for (const [reason, count] of Object.entries(reasons)) {
    if (count > maxCount) {
      maxCount = count;
      dominantReason = reason;
    }
  }

  const config = getConfig();
  const shouldInjectHint = continuationRate >= config.threshold && messageEvents.length >= config.minSamples;

  return {
    totalEvents: messageEvents.length,
    continuations: continuations.length,
    continuationRate,
    reasons,
    dominantReason,
    dominantReasonCount: maxCount,
    shouldInjectHint,
    threshold: config.threshold,
    minSamples: config.minSamples,
  };
}

/**
 * Generate hint based on continuation analysis
 *
 * @param {Object} analysis - Continuation analysis results
 * @returns {string|null} Hint text or null if no hint needed
 */
export function generateHint(analysis) {
  if (!analysis.shouldInjectHint) {
    return null;
  }

  const reason = analysis.dominantReason;
  const rate = (analysis.continuationRate * 100).toFixed(0);

  // Reason-specific hints
  const hints = {
    fence: `IMPORTANT: Close any open code fence (\`\`\`) before finishing your response. Recent telemetry shows ${rate}% of responses are incomplete due to unclosed code blocks.`,

    punct: `IMPORTANT: Finish your sentences with proper punctuation (period, exclamation point, or question mark). Recent telemetry shows ${rate}% of responses are incomplete due to missing punctuation.`,

    short: `IMPORTANT: Complete your full response before stopping. Recent telemetry shows ${rate}% of responses are being cut short. Ensure your answer is complete.`,

    length: `IMPORTANT: Your response is approaching the length limit. Prioritize completing your current thought over adding new information. Recent telemetry shows ${rate}% of responses are hitting length limits.`,

    stop: `IMPORTANT: Complete your current response fully before stopping. Recent telemetry shows ${rate}% of responses are incomplete.`,

    unknown: `IMPORTANT: Ensure your response is complete and properly formatted before finishing. Recent telemetry shows ${rate}% of responses are incomplete.`,
  };

  // Return specific hint or generic one
  return hints[reason] || hints.unknown;
}

/**
 * Generate hint from recent ContextLog events
 *
 * @param {Function} tailEventsFn - Function to get recent ContextLog events (from server.contextlog.mjs)
 * @param {Object} options - Options
 * @returns {Object} Hint information
 */
export function generateHintFromContextLog(tailEventsFn, options = {}) {
  const config = getConfig();
  const minutes = options.minutes || config.minutes;
  const convId = options.convId || null;

  // Get recent events
  const cutoffTime = Date.now() - (minutes * 60 * 1000);
  const allEvents = tailEventsFn(500, convId); // Get up to 500 recent events

  // Filter to time window
  const recentEvents = allEvents.filter(e => {
    if (!e.ts) return false;
    const eventTime = new Date(e.ts).getTime();
    return eventTime >= cutoffTime;
  });

  // Analyze continuations
  const analysis = analyzeContinuations(recentEvents);

  // Generate hint
  const hint = generateHint(analysis);

  return {
    hint,
    analysis,
    config,
    metadata: {
      hintId: hint ? ulid() : null,
      generatedAt: new Date().toISOString(),
      windowMinutes: minutes,
      eventsAnalyzed: analysis.totalEvents,
      convId,
    },
  };
}

/**
 * Inject hint into messages array (modifies in place)
 *
 * @param {Array} messages - Messages array
 * @param {string} hint - Hint text to inject
 * @param {Object} metadata - Metadata for logging
 * @returns {boolean} Whether hint was injected
 */
export function injectHint(messages, hint, metadata = {}) {
  if (!hint || !messages || messages.length === 0) {
    return false;
  }

  // Find system message or developer message
  let systemIndex = messages.findIndex(m => m.role === 'system');
  let developerIndex = messages.findIndex(m => m.role === 'developer');

  if (systemIndex >= 0) {
    // Append to existing system message
    messages[systemIndex].content += `\n\n${hint}`;
    console.log(`[MIP] Injected hint into system message (${metadata.hintId || 'unknown'})`);
    return true;
  } else if (developerIndex >= 0) {
    // Append to existing developer message
    messages[developerIndex].content += `\n\n${hint}`;
    console.log(`[MIP] Injected hint into developer message (${metadata.hintId || 'unknown'})`);
    return true;
  } else {
    // Add new system message at the beginning
    messages.unshift({
      role: 'system',
      content: hint,
    });
    console.log(`[MIP] Added new system message with hint (${metadata.hintId || 'unknown'})`);
    return true;
  }
}

/**
 * Log hint application to ContextLog
 *
 * @param {Function} appendEventFn - Function to append to ContextLog
 * @param {Object} hintInfo - Hint information from generateHintFromContextLog
 * @param {Object} context - Request context
 */
export async function logHintApplication(appendEventFn, hintInfo, context = {}) {
  if (!hintInfo.hint) {
    return; // No hint to log
  }

  const event = {
    id: hintInfo.metadata.hintId || ulid(),
    ts: hintInfo.metadata.generatedAt || new Date().toISOString(),
    actor: 'system',
    act: 'hint_applied',
    conv_id: context.convId || hintInfo.metadata.convId || null,
    turn_id: context.turnId || null,
    hint_type: 'prompting_hint',
    continuation_rate: hintInfo.analysis.continuationRate,
    dominant_reason: hintInfo.analysis.dominantReason,
    events_analyzed: hintInfo.analysis.totalEvents,
    continuations_detected: hintInfo.analysis.continuations,
    window_minutes: hintInfo.metadata.windowMinutes,
    threshold: hintInfo.analysis.threshold,
    hint_preview: hintInfo.hint.substring(0, 100) + '...',
  };

  try {
    await appendEventFn(event);
    console.log(`[MIP] Logged hint application: ${event.id}`);
  } catch (error) {
    console.warn('[MIP] Failed to log hint application:', error.message);
  }
}

/**
 * Get statistics about hint usage
 *
 * @param {Function} tailEventsFn - Function to get recent ContextLog events
 * @param {Object} options - Options
 * @returns {Object} Statistics
 */
export function getHintStats(tailEventsFn, options = {}) {
  const hours = options.hours || 24;
  const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

  // Get recent hint events
  const allEvents = tailEventsFn(1000, null);
  const hintEvents = allEvents.filter(e => {
    if (e.act !== 'hint_applied') return false;
    if (!e.ts) return false;
    const eventTime = new Date(e.ts).getTime();
    return eventTime >= cutoffTime;
  });

  // Count by dominant reason
  const reasonCounts = {};
  for (const event of hintEvents) {
    const reason = event.dominant_reason || 'unknown';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  // Calculate average continuation rate
  let totalRate = 0;
  let rateCount = 0;
  for (const event of hintEvents) {
    if (typeof event.continuation_rate === 'number') {
      totalRate += event.continuation_rate;
      rateCount++;
    }
  }

  const avgContinuationRate = rateCount > 0 ? totalRate / rateCount : 0;

  return {
    totalHints: hintEvents.length,
    hours,
    reasonCounts,
    mostCommonReason: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    avgContinuationRate,
    config: getConfig(),
  };
}

/**
 * Main function: Analyze and apply hint if needed
 *
 * @param {Array} messages - Messages array to potentially modify
 * @param {Function} tailEventsFn - Function to get recent ContextLog events
 * @param {Function} appendEventFn - Function to append to ContextLog
 * @param {Object} context - Request context
 * @returns {Object} Result with hint info and whether it was applied
 */
export async function applyHintIfNeeded(messages, tailEventsFn, appendEventFn, context = {}) {
  // Check if enabled
  if (!isEnabled()) {
    return {
      applied: false,
      reason: 'disabled',
      config: getConfig(),
    };
  }

  // Generate hint from recent telemetry
  const hintInfo = generateHintFromContextLog(tailEventsFn, {
    convId: context.convId,
  });

  // If no hint needed, return early
  if (!hintInfo.hint) {
    return {
      applied: false,
      reason: 'no_hint_needed',
      analysis: hintInfo.analysis,
      config: hintInfo.config,
    };
  }

  // Inject hint into messages
  const injected = injectHint(messages, hintInfo.hint, hintInfo.metadata);

  if (!injected) {
    return {
      applied: false,
      reason: 'injection_failed',
      analysis: hintInfo.analysis,
      config: hintInfo.config,
    };
  }

  // Log to ContextLog
  await logHintApplication(appendEventFn, hintInfo, context);

  return {
    applied: true,
    hintInfo,
    analysis: hintInfo.analysis,
    config: hintInfo.config,
  };
}

export default {
  isEnabled,
  getConfig,
  analyzeContinuations,
  generateHint,
  generateHintFromContextLog,
  injectHint,
  logHintApplication,
  getHintStats,
  applyHintIfNeeded,
};
