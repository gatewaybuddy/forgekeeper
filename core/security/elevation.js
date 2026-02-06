/**
 * Elevated Mode with Approval Gates for Forgekeeper
 *
 * Allows forgekeeper to temporarily access restricted capabilities
 * (dangerous commands, sensitive files, external services) with
 * explicit user approval.
 *
 * Elevation Levels:
 * - standard: normal operation, guardrails enforced
 * - elevated: approved for specific dangerous operation
 * - maintenance: full access for self-update/repair (time-limited)
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { config } from '../../config.js';
import { rotateIfNeeded } from '../jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const ELEVATION_LOG_PATH = join(JOURNAL_DIR, 'elevation_events.jsonl');

// Settings
const ENABLED = config.elevation?.enabled ?? true;
const DEFAULT_TIMEOUT = config.elevation?.timeoutMs ?? 300000; // 5 minutes
const MAX_PENDING_REQUESTS = 10;

// Elevation levels
export const ELEVATION_LEVELS = {
  STANDARD: 'standard',
  ELEVATED: 'elevated',
  MAINTENANCE: 'maintenance',
};

// Active elevations (scoped by request)
const activeElevations = new Map();
// Pending requests awaiting approval
const pendingRequests = new Map();
// Event listeners for elevation events
const eventListeners = [];

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Log elevation event
 */
function logElevationEvent(event) {
  ensureJournalDir();

  try {
    appendFileSync(ELEVATION_LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    }) + '\n');
    rotateIfNeeded(ELEVATION_LOG_PATH);
  } catch (err) {
    console.error('[Elevation] Failed to log event:', err.message);
  }
}

/**
 * Emit event to listeners
 */
function emitEvent(type, data) {
  for (const listener of eventListeners) {
    try {
      listener({ type, ...data });
    } catch (err) {
      console.error('[Elevation] Listener error:', err.message);
    }
  }
}

/**
 * Generate elevation request ID
 */
function generateRequestId() {
  return `elev-${randomUUID().slice(0, 8)}`;
}

/**
 * Check if elevation is enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Get current elevation status
 *
 * @returns {Object} Current elevation status
 */
export function getElevationStatus() {
  const now = Date.now();

  // Clean expired elevations
  for (const [id, elev] of activeElevations.entries()) {
    if (elev.expiresAt && elev.expiresAt < now) {
      activeElevations.delete(id);
      logElevationEvent({
        event: 'expired',
        requestId: id,
        scope: elev.scope,
      });
    }
  }

  const active = Array.from(activeElevations.entries()).map(([id, elev]) => ({
    requestId: id,
    level: elev.level,
    scope: elev.scope,
    reason: elev.reason,
    grantedAt: elev.grantedAt,
    expiresAt: elev.expiresAt ? new Date(elev.expiresAt).toISOString() : null,
    remainingMs: elev.expiresAt ? elev.expiresAt - now : null,
  }));

  const pending = Array.from(pendingRequests.entries()).map(([id, req]) => ({
    requestId: id,
    level: req.level,
    scope: req.scope,
    reason: req.reason,
    requestedAt: req.requestedAt,
  }));

  return {
    enabled: ENABLED,
    activeCount: activeElevations.size,
    pendingCount: pendingRequests.size,
    active,
    pending,
  };
}

/**
 * Check if currently elevated for a specific scope
 *
 * @param {string} scope - The operation scope to check
 * @returns {boolean} True if elevated for this scope
 */
export function isElevated(scope) {
  if (!ENABLED) {
    return false;
  }

  const now = Date.now();

  for (const [id, elev] of activeElevations.entries()) {
    // Check expiration
    if (elev.expiresAt && elev.expiresAt < now) {
      activeElevations.delete(id);
      continue;
    }

    // Check scope match
    if (scopeMatches(elev.scope, scope)) {
      return true;
    }

    // Maintenance level is elevated for everything
    if (elev.level === ELEVATION_LEVELS.MAINTENANCE) {
      return true;
    }
  }

  return false;
}

/**
 * Check if scope A includes scope B
 * E.g., "file:*" includes "file:/tmp/test.txt"
 */
function scopeMatches(approvedScope, requestedScope) {
  // Exact match
  if (approvedScope === requestedScope) {
    return true;
  }

  // Wildcard match
  if (approvedScope.endsWith('*')) {
    const prefix = approvedScope.slice(0, -1);
    return requestedScope.startsWith(prefix);
  }

  return false;
}

/**
 * Request elevation for a specific operation
 *
 * @param {Object} options - Request options
 * @param {string} options.scope - Operation scope (e.g., "file:/tmp/*", "command:rm")
 * @param {string} options.reason - Why elevation is needed
 * @param {string} options.level - Elevation level (elevated or maintenance)
 * @param {number} options.timeout - Custom timeout in ms
 * @returns {Object} Request result
 */
export function requestElevation(options) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Elevation is disabled',
    };
  }

  if (!options.scope) {
    return {
      success: false,
      error: 'Scope is required',
    };
  }

  if (!options.reason) {
    return {
      success: false,
      error: 'Reason is required',
    };
  }

  // Check if already elevated for this scope
  if (isElevated(options.scope)) {
    return {
      success: true,
      alreadyElevated: true,
      message: 'Already elevated for this scope',
    };
  }

  // Check pending limit
  if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
    return {
      success: false,
      error: 'Too many pending elevation requests',
    };
  }

  const requestId = generateRequestId();
  const level = options.level || ELEVATION_LEVELS.ELEVATED;
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  const request = {
    requestId,
    scope: options.scope,
    reason: options.reason,
    level,
    timeout,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };

  pendingRequests.set(requestId, request);

  // Log request
  logElevationEvent({
    event: 'requested',
    requestId,
    scope: options.scope,
    reason: options.reason,
    level,
  });

  console.log(`[Elevation] Request ${requestId}: ${options.reason} (scope: ${options.scope})`);

  // Emit event for notification systems
  emitEvent('elevation_requested', {
    requestId,
    scope: options.scope,
    reason: options.reason,
    level,
  });

  return {
    success: true,
    requestId,
    status: 'pending',
    message: `Elevation request created. Awaiting approval for: ${options.reason}`,
  };
}

/**
 * Approve an elevation request
 *
 * @param {string} requestId - The request ID to approve
 * @param {Object} options - Approval options
 * @returns {Object} Approval result
 */
export function approveElevation(requestId, options = {}) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Elevation is disabled',
    };
  }

  const request = pendingRequests.get(requestId);

  if (!request) {
    return {
      success: false,
      error: 'Request not found or already processed',
    };
  }

  const timeout = options.timeout || request.timeout || DEFAULT_TIMEOUT;
  const now = Date.now();

  const elevation = {
    requestId,
    scope: request.scope,
    reason: request.reason,
    level: request.level,
    grantedAt: new Date().toISOString(),
    expiresAt: now + timeout,
    singleUse: options.singleUse ?? false,
  };

  // Move from pending to active
  pendingRequests.delete(requestId);
  activeElevations.set(requestId, elevation);

  // Log approval
  logElevationEvent({
    event: 'approved',
    requestId,
    scope: request.scope,
    level: request.level,
    timeout,
  });

  console.log(`[Elevation] Approved ${requestId} for ${timeout}ms`);

  // Emit event
  emitEvent('elevation_approved', {
    requestId,
    scope: request.scope,
    level: request.level,
    expiresAt: new Date(elevation.expiresAt).toISOString(),
  });

  return {
    success: true,
    requestId,
    status: 'approved',
    expiresAt: new Date(elevation.expiresAt).toISOString(),
    message: `Elevation granted for: ${request.reason}`,
  };
}

/**
 * Deny an elevation request
 *
 * @param {string} requestId - The request ID to deny
 * @param {string} reason - Reason for denial
 * @returns {Object} Denial result
 */
export function denyElevation(requestId, reason = 'User denied') {
  const request = pendingRequests.get(requestId);

  if (!request) {
    return {
      success: false,
      error: 'Request not found or already processed',
    };
  }

  pendingRequests.delete(requestId);

  // Log denial
  logElevationEvent({
    event: 'denied',
    requestId,
    scope: request.scope,
    reason,
  });

  console.log(`[Elevation] Denied ${requestId}: ${reason}`);

  // Emit event
  emitEvent('elevation_denied', {
    requestId,
    scope: request.scope,
    denialReason: reason,
  });

  return {
    success: true,
    requestId,
    status: 'denied',
    message: `Elevation denied: ${reason}`,
  };
}

/**
 * Execute an operation with elevation check
 *
 * @param {string} scope - Operation scope
 * @param {Function} operation - The operation to execute
 * @returns {Promise<Object>} Execution result
 */
export async function executeElevated(scope, operation) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Elevation is disabled',
    };
  }

  if (!isElevated(scope)) {
    return {
      success: false,
      error: 'Not elevated for this scope',
      scope,
    };
  }

  // Find the matching elevation
  let matchingElevation = null;
  let matchingId = null;

  for (const [id, elev] of activeElevations.entries()) {
    if (scopeMatches(elev.scope, scope) || elev.level === ELEVATION_LEVELS.MAINTENANCE) {
      matchingElevation = elev;
      matchingId = id;
      break;
    }
  }

  if (!matchingElevation) {
    return {
      success: false,
      error: 'Elevation expired or not found',
    };
  }

  // Log execution start
  logElevationEvent({
    event: 'execute_start',
    requestId: matchingId,
    scope,
  });

  try {
    const result = await operation();

    // Log success
    logElevationEvent({
      event: 'execute_success',
      requestId: matchingId,
      scope,
    });

    // Handle single-use elevation
    if (matchingElevation.singleUse) {
      activeElevations.delete(matchingId);
      logElevationEvent({
        event: 'consumed',
        requestId: matchingId,
        scope,
      });
    }

    return {
      success: true,
      result,
      usedElevation: matchingId,
    };

  } catch (err) {
    // Log failure
    logElevationEvent({
      event: 'execute_failed',
      requestId: matchingId,
      scope,
      error: err.message,
    });

    return {
      success: false,
      error: err.message,
      usedElevation: matchingId,
    };
  }
}

/**
 * Revoke a specific elevation
 *
 * @param {string} requestId - The elevation to revoke
 * @returns {Object} Revoke result
 */
export function revokeElevation(requestId) {
  if (activeElevations.has(requestId)) {
    const elev = activeElevations.get(requestId);
    activeElevations.delete(requestId);

    logElevationEvent({
      event: 'revoked',
      requestId,
      scope: elev.scope,
    });

    console.log(`[Elevation] Revoked ${requestId}`);

    emitEvent('elevation_revoked', {
      requestId,
      scope: elev.scope,
    });

    return {
      success: true,
      requestId,
      message: 'Elevation revoked',
    };
  }

  // Also check pending requests
  if (pendingRequests.has(requestId)) {
    pendingRequests.delete(requestId);

    logElevationEvent({
      event: 'cancelled',
      requestId,
    });

    return {
      success: true,
      requestId,
      message: 'Pending request cancelled',
    };
  }

  return {
    success: false,
    error: 'Elevation not found',
  };
}

/**
 * Revoke all active elevations (emergency)
 *
 * @returns {Object} Revoke result
 */
export function revokeAllElevations() {
  const revokedCount = activeElevations.size;
  const cancelledCount = pendingRequests.size;

  for (const [id, elev] of activeElevations.entries()) {
    logElevationEvent({
      event: 'revoked_all',
      requestId: id,
      scope: elev.scope,
    });
  }

  activeElevations.clear();
  pendingRequests.clear();

  console.log(`[Elevation] Emergency revoke: ${revokedCount} active, ${cancelledCount} pending`);

  emitEvent('all_elevations_revoked', {
    revokedCount,
    cancelledCount,
  });

  return {
    success: true,
    revokedCount,
    cancelledCount,
    message: 'All elevations revoked',
  };
}

/**
 * Register an event listener
 */
export function onElevationEvent(callback) {
  eventListeners.push(callback);
}

/**
 * Remove an event listener
 */
export function offElevationEvent(callback) {
  const index = eventListeners.indexOf(callback);
  if (index >= 0) {
    eventListeners.splice(index, 1);
  }
}

/**
 * Get module statistics
 */
export function getStats() {
  return {
    enabled: ENABLED,
    defaultTimeout: DEFAULT_TIMEOUT,
    maxPendingRequests: MAX_PENDING_REQUESTS,
    activeCount: activeElevations.size,
    pendingCount: pendingRequests.size,
    listenerCount: eventListeners.length,
  };
}

/**
 * Clean up expired elevations
 */
export function cleanupExpired() {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, elev] of activeElevations.entries()) {
    if (elev.expiresAt && elev.expiresAt < now) {
      activeElevations.delete(id);
      logElevationEvent({
        event: 'expired',
        requestId: id,
        scope: elev.scope,
      });
      cleaned++;
    }
  }

  return cleaned;
}

export default {
  ELEVATION_LEVELS,
  isEnabled,
  getElevationStatus,
  isElevated,
  requestElevation,
  approveElevation,
  denyElevation,
  executeElevated,
  revokeElevation,
  revokeAllElevations,
  onElevationEvent,
  offElevationEvent,
  getStats,
  cleanupExpired,
};
