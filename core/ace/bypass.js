/**
 * ACE Bypass Mode
 *
 * Provides operator-controlled bypass for ACE when it becomes too onerous.
 *
 * Bypass modes:
 * - off: Normal ACE operation (default)
 * - log-only: Score actions but don't gate them, log everything
 * - disabled: Skip ACE entirely (with warning)
 *
 * IMPORTANT: Hard ceiling actions (credentials, self-modify) NEVER bypass.
 * These always escalate regardless of bypass mode.
 */

import { config } from '../../config.js';
import { hasHardCeiling } from './action-classes.js';

/**
 * Bypass mode values
 */
export const BYPASS_MODES = {
  OFF: 'off',
  LOG_ONLY: 'log-only',
  DISABLED: 'disabled',
};

// In-memory temporary bypass state
let temporaryBypass = {
  active: false,
  mode: BYPASS_MODES.OFF,
  expiresAt: null,
  reason: null,
  setBy: null,
};

// Bypass usage statistics for audit
let bypassStats = {
  temporaryBypassCount: 0,
  actionsWhileBypassed: 0,
  hardCeilingBlockedDuringBypass: 0,
  lastBypassAt: null,
  lastBypassDuration: null,
};

/**
 * Get the configured bypass mode from environment/config
 * @returns {string}
 */
function getConfiguredBypassMode() {
  const aceConfig = config.ace || {};
  const bypassMode = aceConfig.bypassMode ||
    process.env.FK_ACE_BYPASS_MODE ||
    BYPASS_MODES.OFF;

  // Validate
  if (!Object.values(BYPASS_MODES).includes(bypassMode)) {
    console.warn(`[ACE Bypass] Invalid bypass mode "${bypassMode}", defaulting to "off"`);
    return BYPASS_MODES.OFF;
  }

  return bypassMode;
}

/**
 * Check if ACE is enabled (not fully disabled)
 * @returns {boolean}
 */
function isAceEnabled() {
  const aceConfig = config.ace || {};
  const enabled = aceConfig.enabled !== false &&
    process.env.FK_ACE_ENABLED !== '0' &&
    process.env.FK_ACE_ENABLED !== 'false';
  return enabled;
}

/**
 * Get current effective bypass mode
 * Considers both config and temporary bypass
 *
 * @returns {{ mode: string, isTemporary: boolean, expiresAt: Date|null, reason: string|null }}
 */
export function getBypassMode() {
  // Check if temporary bypass is active and not expired
  if (temporaryBypass.active) {
    const now = new Date();
    if (temporaryBypass.expiresAt && now < temporaryBypass.expiresAt) {
      return {
        mode: temporaryBypass.mode,
        isTemporary: true,
        expiresAt: temporaryBypass.expiresAt,
        reason: temporaryBypass.reason,
      };
    } else {
      // Expired, clear it
      clearTemporaryBypass();
    }
  }

  // Check if ACE is disabled entirely
  if (!isAceEnabled()) {
    return {
      mode: BYPASS_MODES.DISABLED,
      isTemporary: false,
      expiresAt: null,
      reason: 'ACE disabled via FK_ACE_ENABLED=0',
    };
  }

  // Return configured mode
  return {
    mode: getConfiguredBypassMode(),
    isTemporary: false,
    expiresAt: null,
    reason: null,
  };
}

/**
 * Check if ACE is currently bypassed (log-only or disabled)
 *
 * @param {string} [actionClass] - If provided, checks if this specific action can be bypassed
 * @returns {{ bypassed: boolean, mode: string, hardCeilingBlocked: boolean, reason: string }}
 */
export function isBypassed(actionClass = null) {
  const bypassState = getBypassMode();

  // Check if this is a hard ceiling action that cannot be bypassed
  if (actionClass && hasHardCeiling(actionClass)) {
    if (bypassState.mode !== BYPASS_MODES.OFF) {
      bypassStats.hardCeilingBlockedDuringBypass++;
    }
    return {
      bypassed: false,
      mode: bypassState.mode,
      hardCeilingBlocked: true,
      reason: `Hard ceiling action "${actionClass}" cannot be bypassed`,
    };
  }

  // Check bypass modes
  if (bypassState.mode === BYPASS_MODES.DISABLED) {
    bypassStats.actionsWhileBypassed++;
    return {
      bypassed: true,
      mode: BYPASS_MODES.DISABLED,
      hardCeilingBlocked: false,
      reason: bypassState.reason || 'ACE disabled',
    };
  }

  if (bypassState.mode === BYPASS_MODES.LOG_ONLY) {
    bypassStats.actionsWhileBypassed++;
    return {
      bypassed: true,
      mode: BYPASS_MODES.LOG_ONLY,
      hardCeilingBlocked: false,
      reason: bypassState.reason || 'ACE in log-only mode',
    };
  }

  return {
    bypassed: false,
    mode: BYPASS_MODES.OFF,
    hardCeilingBlocked: false,
    reason: null,
  };
}

/**
 * Parse duration string to milliseconds
 * Supports: 30s, 5m, 1h, 2d
 *
 * @param {string} duration - Duration string
 * @returns {number|null} - Milliseconds or null if invalid
 */
function parseDuration(duration) {
  const match = duration.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

/**
 * Set a temporary bypass for a duration
 *
 * @param {string} duration - Duration string (e.g., "1h", "30m", "2d")
 * @param {Object} [options] - Options
 * @param {string} [options.mode] - Bypass mode (default: log-only)
 * @param {string} [options.reason] - Reason for bypass
 * @param {string} [options.setBy] - Who set the bypass
 * @returns {{ success: boolean, expiresAt: Date|null, error: string|null }}
 */
export function setTemporaryBypass(duration, options = {}) {
  const durationMs = parseDuration(duration);

  if (!durationMs) {
    return {
      success: false,
      expiresAt: null,
      error: `Invalid duration "${duration}". Use format: 30s, 5m, 1h, 2d`,
    };
  }

  // Cap at 24 hours for temporary bypass
  const maxDuration = 24 * 60 * 60 * 1000;
  const actualDuration = Math.min(durationMs, maxDuration);

  const mode = options.mode || BYPASS_MODES.LOG_ONLY;
  if (!Object.values(BYPASS_MODES).includes(mode) || mode === BYPASS_MODES.OFF) {
    return {
      success: false,
      expiresAt: null,
      error: `Invalid bypass mode "${mode}". Use: log-only or disabled`,
    };
  }

  const expiresAt = new Date(Date.now() + actualDuration);

  temporaryBypass = {
    active: true,
    mode,
    expiresAt,
    reason: options.reason || `Temporary bypass for ${duration}`,
    setBy: options.setBy || 'operator',
  };

  bypassStats.temporaryBypassCount++;
  bypassStats.lastBypassAt = new Date();
  bypassStats.lastBypassDuration = duration;

  console.log(`[ACE Bypass] Temporary ${mode} mode enabled until ${expiresAt.toISOString()}`);

  return {
    success: true,
    expiresAt,
    mode,
    error: null,
  };
}

/**
 * Clear any temporary bypass
 */
export function clearTemporaryBypass() {
  if (temporaryBypass.active) {
    console.log('[ACE Bypass] Temporary bypass cleared');
  }

  temporaryBypass = {
    active: false,
    mode: BYPASS_MODES.OFF,
    expiresAt: null,
    reason: null,
    setBy: null,
  };
}

/**
 * Get bypass statistics for audit
 * @returns {Object}
 */
export function getBypassStats() {
  return {
    ...bypassStats,
    currentMode: getBypassMode(),
    temporaryBypassActive: temporaryBypass.active,
  };
}

/**
 * Reset bypass statistics (for testing)
 */
export function resetBypassStats() {
  bypassStats = {
    temporaryBypassCount: 0,
    actionsWhileBypassed: 0,
    hardCeilingBlockedDuringBypass: 0,
    lastBypassAt: null,
    lastBypassDuration: null,
  };
}

/**
 * Format remaining bypass time for display
 * @returns {string|null}
 */
export function getRemainingBypassTime() {
  if (!temporaryBypass.active || !temporaryBypass.expiresAt) {
    return null;
  }

  const now = new Date();
  const remaining = temporaryBypass.expiresAt - now;

  if (remaining <= 0) {
    return null;
  }

  // Format as human readable
  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m remaining`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s remaining`;
  }
  return `${seconds}s remaining`;
}

export default {
  BYPASS_MODES,
  getBypassMode,
  isBypassed,
  setTemporaryBypass,
  clearTemporaryBypass,
  getBypassStats,
  resetBypassStats,
  getRemainingBypassTime,
};
