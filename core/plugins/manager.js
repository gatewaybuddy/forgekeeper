/**
 * Plugin Manager for Forgekeeper
 *
 * Plugin lifecycle management: load, unload, reload, list.
 * Enforces security requirements and approval workflow.
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { config } from '../../config.js';
import { rotateIfNeeded } from '../jsonl-rotate.js';
import { atomicWriteFileSync } from '../atomic-write.js';
import { scanPlugins, getPlugin, getAllPlugins, isApproved, approvePlugin, revokeApproval, getStats as getRegistryStats } from './registry.js';
import { analyzePlugin, generateReport, RISK_LEVELS } from './analyzer.js';
import { loadPluginInSandbox, createPluginApi, validatePluginInterface } from './sandbox.js';
import { getPersonalityPath } from '../identity.js';

// Configuration
const PLUGINS_DIR = join(getPersonalityPath(), 'plugins');
const JOURNAL_DIR = join(getPersonalityPath(), 'journal');
const SECURITY_LOG_PATH = join(JOURNAL_DIR, 'plugin_security.jsonl');

// Settings
const ENABLED = config.plugins?.enabled ?? false;
const AUTO_APPROVE_SELF = config.plugins?.autoApproveSelf ?? false;

// Loaded plugins
const loadedPlugins = new Map();
const eventListeners = [];

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  for (const dir of [PLUGINS_DIR, JOURNAL_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Log security event
 */
function logSecurityEvent(event) {
  ensureDirectories();

  try {
    appendFileSync(SECURITY_LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    }) + '\n');
    rotateIfNeeded(SECURITY_LOG_PATH);
  } catch (err) {
    console.error('[PluginManager] Failed to log security event:', err.message);
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
      console.error('[PluginManager] Listener error:', err.message);
    }
  }
}

/**
 * Check if plugin system is enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Get list of all plugins with their status
 */
export function listPlugins() {
  scanPlugins();
  const all = getAllPlugins();

  return all.map(p => ({
    name: p.name,
    version: p.manifest?.version,
    description: p.manifest?.description,
    author: p.manifest?.author,
    approved: p.approved,
    loaded: loadedPlugins.has(p.name),
    path: p.path,
  }));
}

/**
 * Get loaded plugins
 */
export function getLoadedPlugins() {
  return Array.from(loadedPlugins.keys());
}

/**
 * Analyze a plugin and return security report
 *
 * @param {string} name - Plugin name
 * @returns {Object} Analysis result
 */
export function analyzePluginByName(name) {
  const plugin = getPlugin(name);

  if (!plugin) {
    return {
      success: false,
      error: 'Plugin not found',
    };
  }

  const analysis = analyzePlugin(plugin.path);
  const report = generateReport(analysis);

  return {
    success: analysis.success,
    analysis,
    report,
  };
}

/**
 * Request approval for a plugin
 *
 * @param {string} name - Plugin name
 * @returns {Object} Approval request result
 */
export function requestApproval(name) {
  const plugin = getPlugin(name);

  if (!plugin) {
    return {
      success: false,
      error: 'Plugin not found',
    };
  }

  if (plugin.approved) {
    return {
      success: true,
      alreadyApproved: true,
      message: 'Plugin is already approved',
    };
  }

  // Analyze the plugin
  const analysis = analyzePlugin(plugin.path);
  const report = generateReport(analysis);

  // Log approval request
  logSecurityEvent({
    event: 'approval_requested',
    plugin: name,
    version: plugin.manifest?.version,
    riskLevel: analysis.riskLevel,
    findingsCount: analysis.findingsCount,
  });

  // Emit event for notification
  emitEvent('approval_requested', {
    plugin: name,
    version: plugin.manifest?.version,
    analysis,
    report,
  });

  return {
    success: true,
    pending: true,
    plugin: name,
    version: plugin.manifest?.version,
    riskLevel: analysis.riskLevel,
    report,
    message: `Approval required. Risk level: ${analysis.riskLevel.toUpperCase()}`,
  };
}

/**
 * Approve a plugin for loading
 *
 * @param {string} name - Plugin name
 * @param {Object} options - Approval options
 * @returns {Object} Approval result
 */
export function approvePluginByName(name, options = {}) {
  const plugin = getPlugin(name);

  if (!plugin) {
    return {
      success: false,
      error: 'Plugin not found',
    };
  }

  const version = plugin.manifest?.version || '0.0.0';

  // Analyze for hash
  const analysis = analyzePlugin(plugin.path);

  const result = approvePlugin(name, version, {
    selfCreated: options.selfCreated,
    approvedBy: options.approvedBy || 'user',
    analysisHash: analysis.hash,
  });

  // Create .approved file
  const approvedPath = join(plugin.path, '.approved');
  try {
    atomicWriteFileSync(approvedPath, '');
  } catch (err) {
    console.warn('[PluginManager] Could not create .approved file:', err.message);
  }

  // Log approval
  logSecurityEvent({
    event: 'approved',
    plugin: name,
    version,
    approvedBy: options.approvedBy || 'user',
    riskLevel: analysis.riskLevel,
  });

  console.log(`[PluginManager] Approved plugin: ${name}@${version}`);

  emitEvent('plugin_approved', { name, version });

  return result;
}

/**
 * Load a plugin
 *
 * @param {string} name - Plugin name
 * @param {Object} apiHandlers - API handler implementations
 * @returns {Promise<Object>} Load result
 */
export async function loadPlugin(name, apiHandlers = {}) {
  if (!ENABLED) {
    return {
      success: false,
      error: 'Plugin system is disabled',
    };
  }

  const plugin = getPlugin(name);

  if (!plugin) {
    return {
      success: false,
      error: 'Plugin not found',
    };
  }

  // Check approval
  if (!plugin.approved) {
    // Log unapproved attempt
    logSecurityEvent({
      event: 'unapproved_load_attempt',
      plugin: name,
      version: plugin.manifest?.version,
    });

    return {
      success: false,
      error: 'Plugin not approved. Run approval flow first.',
      needsApproval: true,
    };
  }

  // Check if already loaded
  if (loadedPlugins.has(name)) {
    return {
      success: true,
      alreadyLoaded: true,
      message: 'Plugin already loaded',
    };
  }

  // Create API for plugin
  const api = createPluginApi(apiHandlers);

  // Load in sandbox
  const loadResult = await loadPluginInSandbox(plugin.path, api, {
    timeout: 5000,
  });

  if (!loadResult.success) {
    logSecurityEvent({
      event: 'load_failed',
      plugin: name,
      error: loadResult.error,
    });

    return {
      success: false,
      error: `Failed to load plugin: ${loadResult.error}`,
    };
  }

  // Validate interface
  const validation = validatePluginInterface(loadResult.exports);

  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid plugin interface. Missing: ${validation.missing.join(', ')}`,
    };
  }

  // Initialize plugin if it has init function
  if (typeof loadResult.exports.init === 'function') {
    try {
      await loadResult.exports.init();
    } catch (err) {
      return {
        success: false,
        error: `Plugin init failed: ${err.message}`,
      };
    }
  }

  // Store loaded plugin
  loadedPlugins.set(name, {
    name,
    manifest: loadResult.manifest,
    exports: loadResult.exports,
    context: loadResult.context,
    loadedAt: new Date().toISOString(),
  });

  logSecurityEvent({
    event: 'loaded',
    plugin: name,
    version: loadResult.manifest?.version,
  });

  console.log(`[PluginManager] Loaded plugin: ${name}`);

  emitEvent('plugin_loaded', { name, version: loadResult.manifest?.version });

  return {
    success: true,
    name,
    version: loadResult.manifest?.version,
    provides: validation.provided,
  };
}

/**
 * Unload a plugin
 *
 * @param {string} name - Plugin name
 * @returns {Promise<Object>} Unload result
 */
export async function unloadPlugin(name) {
  if (!loadedPlugins.has(name)) {
    return {
      success: false,
      error: 'Plugin not loaded',
    };
  }

  const loaded = loadedPlugins.get(name);

  // Call destroy if available
  if (typeof loaded.exports.destroy === 'function') {
    try {
      await loaded.exports.destroy();
    } catch (err) {
      console.warn(`[PluginManager] Plugin ${name} destroy error:`, err.message);
    }
  }

  loadedPlugins.delete(name);

  logSecurityEvent({
    event: 'unloaded',
    plugin: name,
  });

  console.log(`[PluginManager] Unloaded plugin: ${name}`);

  emitEvent('plugin_unloaded', { name });

  return {
    success: true,
    name,
    message: 'Plugin unloaded',
  };
}

/**
 * Reload a plugin (hot-swap)
 *
 * @param {string} name - Plugin name
 * @param {Object} apiHandlers - API handlers
 * @returns {Promise<Object>} Reload result
 */
export async function reloadPlugin(name, apiHandlers = {}) {
  // Unload if loaded
  if (loadedPlugins.has(name)) {
    const unloadResult = await unloadPlugin(name);
    if (!unloadResult.success) {
      return {
        success: false,
        error: `Failed to unload: ${unloadResult.error}`,
      };
    }
  }

  // Rescan to pick up changes
  scanPlugins();

  // Load fresh
  const loadResult = await loadPlugin(name, apiHandlers);

  if (loadResult.success) {
    console.log(`[PluginManager] Reloaded plugin: ${name}`);

    logSecurityEvent({
      event: 'reloaded',
      plugin: name,
    });

    emitEvent('plugin_reloaded', { name });
  }

  return loadResult;
}

/**
 * Create a new plugin (Forgekeeper self-creation)
 *
 * @param {Object} options - Plugin options
 * @returns {Object} Creation result
 */
export function createPlugin(options) {
  if (!options.name) {
    return {
      success: false,
      error: 'Plugin name is required',
    };
  }

  // Sanitize plugin name — only allow alphanumeric, hyphens, underscores
  const safeName = options.name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeName !== options.name || safeName.length === 0) {
    return {
      success: false,
      error: 'Plugin name must contain only alphanumeric characters, hyphens, and underscores',
    };
  }

  ensureDirectories();

  const pluginPath = join(PLUGINS_DIR, safeName);

  if (existsSync(pluginPath)) {
    return {
      success: false,
      error: 'Plugin with this name already exists',
    };
  }

  // Create plugin directory
  mkdirSync(pluginPath, { recursive: true });

  // Create manifest
  const manifest = {
    name: safeName,
    version: options.version || '1.0.0',
    description: options.description || 'Forgekeeper-created plugin',
    author: 'Forgekeeper',
    main: 'index.js',
    permissions: options.permissions || [],
    createdAt: new Date().toISOString(),
  };

  atomicWriteFileSync(join(pluginPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Create index.js
  // Use JSON.stringify for name to prevent template string injection
  const escapedName = JSON.stringify(safeName);
  const escapedVersion = JSON.stringify(manifest.version);
  const hasCustomCode = !!options.code;
  const code = options.code || `
// ${safeName} - Created by Forgekeeper
module.exports = {
  name: ${escapedName},
  version: ${escapedVersion},

  init: async () => {
    console.log(${escapedName} + ' initialized');
  },

  destroy: async () => {
    console.log(${escapedName} + ' destroyed');
  },
};
`;

  atomicWriteFileSync(join(pluginPath, 'index.js'), code.trim());

  // Create README
  const readme = `# ${safeName}

${options.description || 'A Forgekeeper-created plugin.'}

## Created By
Forgekeeper (self-created)

## Created At
${new Date().toISOString()}
`;

  atomicWriteFileSync(join(pluginPath, 'README.md'), readme);

  // Log creation
  logSecurityEvent({
    event: 'created',
    plugin: safeName,
    version: manifest.version,
    selfCreated: true,
    hasCustomCode,
  });

  // Rescan
  scanPlugins();

  console.log(`[PluginManager] Created plugin: ${safeName}`);

  emitEvent('plugin_created', {
    name: safeName,
    version: manifest.version,
    selfCreated: true,
    needsApproval: hasCustomCode || !AUTO_APPROVE_SELF,
  });

  // Auto-approve if configured, but NEVER auto-approve plugins with custom code
  if (AUTO_APPROVE_SELF && !hasCustomCode) {
    approvePluginByName(safeName, {
      selfCreated: true,
      approvedBy: 'auto',
    });
  } else if (hasCustomCode) {
    console.log(`[PluginManager] Plugin ${safeName} has custom code — requires manual approval`);
  }

  return {
    success: true,
    name: options.name,
    path: pluginPath,
    needsApproval: !AUTO_APPROVE_SELF,
    message: AUTO_APPROVE_SELF
      ? 'Plugin created and auto-approved'
      : 'Plugin created. Requires user approval before loading.',
  };
}

/**
 * Register event listener
 */
export function onPluginEvent(callback) {
  eventListeners.push(callback);
}

/**
 * Remove event listener
 */
export function offPluginEvent(callback) {
  const index = eventListeners.indexOf(callback);
  if (index >= 0) {
    eventListeners.splice(index, 1);
  }
}

/**
 * Get plugin manager statistics
 */
export function getStats() {
  const registryStats = getRegistryStats();

  return {
    enabled: ENABLED,
    autoApproveSelf: AUTO_APPROVE_SELF,
    loadedCount: loadedPlugins.size,
    ...registryStats,
    listenerCount: eventListeners.length,
  };
}

/**
 * Call a method on a loaded plugin
 *
 * @param {string} name - Plugin name
 * @param {string} method - Method name
 * @param {Array} args - Method arguments
 * @returns {Promise<Object>} Call result
 */
export async function callPlugin(name, method, ...args) {
  if (!loadedPlugins.has(name)) {
    return {
      success: false,
      error: 'Plugin not loaded',
    };
  }

  const loaded = loadedPlugins.get(name);

  if (typeof loaded.exports[method] !== 'function') {
    return {
      success: false,
      error: `Plugin does not have method: ${method}`,
    };
  }

  try {
    const result = await loaded.exports[method](...args);
    return {
      success: true,
      result,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

export default {
  isEnabled,
  listPlugins,
  getLoadedPlugins,
  analyzePluginByName,
  requestApproval,
  approvePluginByName,
  revokeApproval,
  loadPlugin,
  unloadPlugin,
  reloadPlugin,
  createPlugin,
  callPlugin,
  onPluginEvent,
  offPluginEvent,
  getStats,
};
