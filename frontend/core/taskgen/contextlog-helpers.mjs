/**
 * ContextLog Query Helpers
 *
 * Utilities for querying and analyzing ContextLog events
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Load ContextLog events from directory
 *
 * @param {string} logDir - ContextLog directory
 * @param {Object} options - Query options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {string} options.convId - Filter by conversation ID
 * @returns {Promise<Array>} Array of events
 */
export async function loadContextLog(logDir, options = {}) {
  const { windowMs = 3600000, convId } = options; // Default: 60 minutes
  const now = Date.now();
  const fromTime = now - windowMs;

  try {
    const files = await fs.readdir(logDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse();

    const events = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(logDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const eventTime = new Date(event.ts).getTime();

          // Skip events outside time window
          if (eventTime < fromTime) continue;

          // Filter by conversation ID if specified
          if (convId && event.conv_id !== convId) continue;

          events.push(event);
        } catch (err) {
          // Skip malformed lines
          console.warn('[ContextLog] Skipping malformed line:', err.message);
        }
      }

      // Stop reading older files if we have events older than window
      if (events.length > 0) {
        const oldestEvent = events[events.length - 1];
        if (new Date(oldestEvent.ts).getTime() < fromTime) {
          break;
        }
      }
    }

    return events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  } catch (err) {
    console.error('[ContextLog] Error loading events:', err);
    return [];
  }
}

/**
 * Filter events by criteria
 *
 * @param {Array} events - Events to filter
 * @param {Object} criteria - Filter criteria
 * @returns {Array} Filtered events
 */
export function filterEvents(events, criteria) {
  let filtered = events;

  if (criteria.act) {
    const acts = Array.isArray(criteria.act) ? criteria.act : [criteria.act];
    filtered = filtered.filter(e => acts.includes(e.act));
  }

  if (criteria.actor) {
    const actors = Array.isArray(criteria.actor) ? criteria.actor : [criteria.actor];
    filtered = filtered.filter(e => actors.includes(e.actor));
  }

  if (criteria.status) {
    filtered = filtered.filter(e => e.status === criteria.status);
  }

  if (criteria.name) {
    filtered = filtered.filter(e => e.name === criteria.name);
  }

  if (criteria.convId) {
    filtered = filtered.filter(e => e.conv_id === criteria.convId);
  }

  return filtered;
}

/**
 * Get assistant responses with finish reasons
 *
 * @param {Array} events - ContextLog events
 * @returns {Array} Assistant response events
 */
export function getAssistantResponses(events) {
  return filterEvents(events, { act: 'assistant_response' }).map(e => ({
    ...e,
    finishReason: e.metadata?.finish_reason || 'unknown',
    continuation: e.metadata?.continuation || false,
  }));
}

/**
 * Get tool execution events
 *
 * @param {Array} events - ContextLog events
 * @returns {Array} Tool execution events
 */
export function getToolExecutions(events) {
  return filterEvents(events, { act: 'tool_call' });
}

/**
 * Get error events
 *
 * @param {Array} events - ContextLog events
 * @returns {Array} Error events
 */
export function getErrors(events) {
  return events.filter(e => e.status === 'error' || e.act === 'error');
}

/**
 * Group events by field
 *
 * @param {Array} events - Events to group
 * @param {string} field - Field to group by
 * @returns {Object} Grouped events { value: [events] }
 */
export function groupBy(events, field) {
  const grouped = {};
  for (const event of events) {
    const key = event[field];
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(event);
  }
  return grouped;
}

/**
 * Calculate historical baseline from older events
 *
 * @param {string} logDir - ContextLog directory
 * @param {string} metric - Metric to calculate (e.g., 'errors_per_hour')
 * @param {Object} options - Options
 * @param {string} options.window - Window size (e.g., '7d', '24h')
 * @returns {Promise<number>} Baseline value
 */
export async function calculateBaseline(logDir, metric, options = {}) {
  const { window = '7d' } = options;

  // Parse window size
  const windowMs = parseTimeWindow(window);
  const now = Date.now();
  const fromTime = now - windowMs;

  try {
    const files = await fs.readdir(logDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse();

    let events = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(logDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const eventTime = new Date(event.ts).getTime();

          if (eventTime >= fromTime && eventTime < now) {
            events.push(event);
          }
        } catch (err) {
          // Skip malformed lines
        }
      }
    }

    // Calculate metric based on type
    if (metric === 'errors_per_hour') {
      const errors = getErrors(events);
      const hours = windowMs / 3600000;
      return errors.length / hours;
    }

    if (metric === 'continuation_ratio') {
      const responses = getAssistantResponses(events);
      const continuations = responses.filter(r => r.continuation || r.finishReason === 'length');
      return continuations.length / responses.length;
    }

    if (metric === 'avg_latency_ms') {
      const validEvents = events.filter(e => e.elapsed_ms !== undefined);
      if (validEvents.length === 0) return 0;
      return validEvents.reduce((sum, e) => sum + e.elapsed_ms, 0) / validEvents.length;
    }

    return 0;
  } catch (err) {
    console.error('[ContextLog] Error calculating baseline:', err);
    return 0;
  }
}

/**
 * Parse time window string to milliseconds
 *
 * @param {string} window - Time window (e.g., '7d', '24h', '60m')
 * @returns {number} Milliseconds
 */
function parseTimeWindow(window) {
  const match = window.match(/^(\d+)([dhms])$/);
  if (!match) return 3600000; // Default: 1 hour

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 'd':
      return num * 24 * 3600000;
    case 'h':
      return num * 3600000;
    case 'm':
      return num * 60000;
    case 's':
      return num * 1000;
    default:
      return 3600000;
  }
}

/**
 * Get top N events by field
 *
 * @param {Array} events - Events
 * @param {string} field - Field to extract
 * @param {number} n - Number of top items
 * @returns {Array} Top N events
 */
export function getTopN(events, field, n = 5) {
  const counts = {};

  for (const event of events) {
    const value = event[field];
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

/**
 * Calculate percentile for numeric field
 *
 * @param {Array} events - Events
 * @param {string} field - Field name
 * @param {number} percentile - Percentile (0-100)
 * @returns {number|null} Percentile value
 */
export function calculatePercentile(events, field, percentile) {
  const values = events
    .map(e => e[field])
    .filter(v => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const index = Math.ceil((percentile / 100) * values.length) - 1;
  return values[Math.max(0, index)];
}

/**
 * Get sample events for evidence
 *
 * @param {Array} events - Events
 * @param {number} n - Number of samples
 * @returns {Array} Sample events
 */
export function getSamples(events, n = 3) {
  return events.slice(0, n).map(e => ({
    ts: e.ts,
    act: e.act,
    name: e.name,
    status: e.status,
    preview: e.result_preview || e.args_preview,
    elapsed_ms: e.elapsed_ms,
  }));
}

export default {
  loadContextLog,
  filterEvents,
  getAssistantResponses,
  getToolExecutions,
  getErrors,
  groupBy,
  calculateBaseline,
  getTopN,
  calculatePercentile,
  getSamples,
};
