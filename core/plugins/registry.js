/**
 * Plugin Registry for Forgekeeper
 *
 * Tracks installed plugins, their approval status,
 * and version information.
 */

import { existsSync, readFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../../config.js';
import { atomicWriteFileSync } from '../atomic-write.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const PLUGINS_DIR = join(PERSONALITY_PATH, 'plugins');
const MEMORY_DIR = join(PERSONALITY_PATH, 'memory');
const APPROVED_PLUGINS_PATH = join(MEMORY_DIR, 'approved_plugins.json');

// In-memory cache
let approvedPlugins = {};
let pluginMetadata = new Map();

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  for (const dir of [PLUGINS_DIR, MEMORY_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Load approved plugins from disk
 */
function loadApprovedPlugins() {
  try {
    if (existsSync(APPROVED_PLUGINS_PATH)) {
      const data = readFileSync(APPROVED_PLUGINS_PATH, 'utf-8');
      approvedPlugins = JSON.parse(data);
      console.log(`[PluginRegistry] Loaded ${Object.keys(approvedPlugins).length} approved plugins`);
    }
  } catch (err) {
    console.error('[PluginRegistry] Failed to load approved plugins:', err.message);
    approvedPlugins = {};
  }
}

/**
 * Save approved plugins to disk
 */
function saveApprovedPlugins() {
  ensureDirectories();

  try {
    atomicWriteFileSync(APPROVED_PLUGINS_PATH, JSON.stringify(approvedPlugins, null, 2));
  } catch (err) {
    console.error('[PluginRegistry] Failed to save approved plugins:', err.message);
  }
}

/**
 * Initialize registry
 */
export function initialize() {
  ensureDirectories();
  loadApprovedPlugins();
  scanPlugins();
}

/**
 * Scan plugins directory for installed plugins
 */
export function scanPlugins() {
  ensureDirectories();
  pluginMetadata.clear();

  try {
    if (!existsSync(PLUGINS_DIR)) {
      return [];
    }

    const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = join(PLUGINS_DIR, entry.name);
      const manifestPath = join(pluginPath, 'manifest.json');

      if (!existsSync(manifestPath)) {
        console.log(`[PluginRegistry] Skipping ${entry.name}: no manifest.json`);
        continue;
      }

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const metadata = {
          name: entry.name,
          path: pluginPath,
          manifest,
          approved: isApproved(entry.name, manifest.version),
          hasApprovalFile: existsSync(join(pluginPath, '.approved')),
        };

        pluginMetadata.set(entry.name, metadata);
        plugins.push(metadata);
      } catch (err) {
        console.error(`[PluginRegistry] Failed to read manifest for ${entry.name}:`, err.message);
      }
    }

    console.log(`[PluginRegistry] Found ${plugins.length} plugins`);
    return plugins;

  } catch (err) {
    console.error('[PluginRegistry] Failed to scan plugins:', err.message);
    return [];
  }
}

/**
 * Get plugin metadata
 */
export function getPlugin(name) {
  return pluginMetadata.get(name) || null;
}

/**
 * Get all plugins
 */
export function getAllPlugins() {
  return Array.from(pluginMetadata.values());
}

/**
 * Check if a plugin version is approved
 */
export function isApproved(name, version) {
  const approved = approvedPlugins[name];
  if (!approved) return false;

  // Check version match
  if (approved.version !== version) return false;

  // Check approval hasn't expired (no expiry for now)
  return true;
}

/**
 * Check if plugin was created by Forgekeeper
 */
export function isSelfCreated(name) {
  const approved = approvedPlugins[name];
  return approved?.selfCreated === true;
}

/**
 * Approve a plugin
 */
export function approvePlugin(name, version, options = {}) {
  approvedPlugins[name] = {
    version,
    approvedAt: new Date().toISOString(),
    selfCreated: options.selfCreated || false,
    approvedBy: options.approvedBy || 'user',
    analysisHash: options.analysisHash || null,
  };

  saveApprovedPlugins();

  // Update metadata
  const metadata = pluginMetadata.get(name);
  if (metadata) {
    metadata.approved = true;
    pluginMetadata.set(name, metadata);
  }

  console.log(`[PluginRegistry] Approved plugin: ${name}@${version}`);

  return {
    success: true,
    name,
    version,
  };
}

/**
 * Revoke plugin approval
 */
export function revokeApproval(name) {
  if (!approvedPlugins[name]) {
    return {
      success: false,
      error: 'Plugin not found in approved list',
    };
  }

  delete approvedPlugins[name];
  saveApprovedPlugins();

  // Update metadata
  const metadata = pluginMetadata.get(name);
  if (metadata) {
    metadata.approved = false;
    pluginMetadata.set(name, metadata);
  }

  console.log(`[PluginRegistry] Revoked approval for: ${name}`);

  return {
    success: true,
    name,
  };
}

/**
 * Register a new plugin (without approval)
 */
export function registerPlugin(name, manifest, path) {
  const metadata = {
    name,
    path,
    manifest,
    approved: false,
    registeredAt: new Date().toISOString(),
  };

  pluginMetadata.set(name, metadata);

  return {
    success: true,
    name,
    needsApproval: true,
  };
}

/**
 * Unregister a plugin
 */
export function unregisterPlugin(name) {
  if (!pluginMetadata.has(name)) {
    return {
      success: false,
      error: 'Plugin not registered',
    };
  }

  pluginMetadata.delete(name);

  return {
    success: true,
    name,
  };
}

/**
 * Get registry statistics
 */
export function getStats() {
  const plugins = getAllPlugins();

  return {
    totalCount: plugins.length,
    approvedCount: plugins.filter(p => p.approved).length,
    pendingCount: plugins.filter(p => !p.approved).length,
    selfCreatedCount: Object.values(approvedPlugins).filter(p => p.selfCreated).length,
  };
}

// Initialize on module load
initialize();

export default {
  initialize,
  scanPlugins,
  getPlugin,
  getAllPlugins,
  isApproved,
  isSelfCreated,
  approvePlugin,
  revokeApproval,
  registerPlugin,
  unregisterPlugin,
  getStats,
};
