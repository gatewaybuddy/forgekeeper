/**
 * Forgekeeper Event Hook System
 *
 * Enables behavior modification based on runtime events through registered hooks.
 * Hooks are JavaScript modules in forgekeeper_personality/hooks/ that can modify
 * forgekeeper's behavior dynamically.
 *
 * Events:
 *   reflection:start, reflection:complete, reflection:repetitive
 *   task:created, task:started, task:completed, task:failed
 *   context:near-limit, context:flushed
 *   message:received, message:proactive-reply
 *   session:started, session:ended
 *   security:injection-detected
 */

import { existsSync, readFileSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { config } from '../config.js';
import { rotateIfNeeded } from './jsonl-rotate.js';
import { atomicWriteFileSync } from './atomic-write.js';

// Hook system configuration
const HOOKS_ENABLED = process.env.FK_HOOKS_ENABLED !== '0';
// Use hooks config if available, fall back to personality path, then default
const HOOKS_DIR = config.hooks?.hooksDir ||
  join(config.autonomous?.personalityPath || 'forgekeeper_personality', 'hooks');
const HOOKS_CONFIG = join(HOOKS_DIR, 'hooks.json');
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const HOOKS_LOG = join(PERSONALITY_PATH, 'journal', 'hook_events.jsonl');

// In-memory hook registry
const registeredHooks = new Map(); // event -> [{ name, handler, priority }]
const loadedModules = new Map(); // path -> module

// Built-in hooks (always available)
const builtinHooks = new Map();

/**
 * Initialize the hook system
 */
export async function initHooks() {
  if (!HOOKS_ENABLED) {
    console.log('[Hooks] Hook system disabled');
    return;
  }

  // Ensure hooks directory exists
  if (!existsSync(HOOKS_DIR)) {
    mkdirSync(HOOKS_DIR, { recursive: true });
    console.log(`[Hooks] Created hooks directory: ${HOOKS_DIR}`);
  }

  // Ensure journal directory exists
  const journalDir = dirname(HOOKS_LOG);
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }

  // Create default hooks.json if it doesn't exist
  if (!existsSync(HOOKS_CONFIG)) {
    const defaultConfig = {
      version: 1,
      description: 'Forgekeeper hook configuration',
      hooks: {
        // Example: 'reflection:repetitive': ['evolve-prompt.js'],
      },
    };
    atomicWriteFileSync(HOOKS_CONFIG, JSON.stringify(defaultConfig, null, 2));
    console.log(`[Hooks] Created default hooks config: ${HOOKS_CONFIG}`);
  }

  // Register built-in hooks
  registerBuiltinHooks();

  // Load hooks from config
  await loadHooksFromConfig();

  console.log(`[Hooks] Initialized with ${countRegisteredHooks()} hooks`);
}

/**
 * Count total registered hooks
 */
function countRegisteredHooks() {
  let count = 0;
  for (const hooks of registeredHooks.values()) {
    count += hooks.length;
  }
  return count;
}

/**
 * Register built-in hooks that are always available
 */
function registerBuiltinHooks() {
  // Log all events (for debugging)
  builtinHooks.set('log-events', {
    events: ['*'],
    handler: async (event, context) => {
      if (process.env.FK_HOOKS_DEBUG === '1') {
        console.log(`[Hooks] Event: ${event}`, JSON.stringify(context).slice(0, 200));
      }
      return null; // Don't modify anything
    },
  });

  // Security: Auto-flag injection attempts
  builtinHooks.set('security-alert', {
    events: ['security:injection-detected'],
    handler: async (event, context) => {
      console.warn(`[Hooks/Security] Injection detected: ${context.patterns?.join(', ')}`);
      return { flagged: true };
    },
  });
}

/**
 * Load hooks from configuration file
 */
async function loadHooksFromConfig() {
  try {
    const configData = JSON.parse(readFileSync(HOOKS_CONFIG, 'utf-8'));
    const hookMappings = configData.hooks || {};

    for (const [event, hookFiles] of Object.entries(hookMappings)) {
      for (const hookFile of hookFiles) {
        await loadHookFile(event, hookFile);
      }
    }
  } catch (err) {
    console.error(`[Hooks] Failed to load config: ${err.message}`);
  }
}

/**
 * Load a hook module from file
 */
async function loadHookFile(event, hookFile) {
  const hookPath = join(HOOKS_DIR, hookFile);

  if (!existsSync(hookPath)) {
    console.warn(`[Hooks] Hook file not found: ${hookPath}`);
    return false;
  }

  try {
    // Use file URL for ES module import
    const fileUrl = pathToFileURL(hookPath).href;

    // Check cache first
    let hookModule = loadedModules.get(hookPath);
    if (!hookModule) {
      // Dynamic import with cache busting for reloads
      hookModule = await import(`${fileUrl}?t=${Date.now()}`);
      loadedModules.set(hookPath, hookModule);
    }

    if (typeof hookModule.execute !== 'function') {
      console.warn(`[Hooks] Hook ${hookFile} missing execute() function`);
      return false;
    }

    // Register the hook
    registerHook(event, {
      name: hookFile,
      handler: hookModule.execute,
      priority: hookModule.priority || 0,
      source: 'file',
    });

    console.log(`[Hooks] Loaded ${hookFile} for event: ${event}`);
    return true;
  } catch (err) {
    console.error(`[Hooks] Failed to load ${hookFile}: ${err.message}`);
    return false;
  }
}

/**
 * Register a hook for an event
 *
 * @param {string} event - Event name
 * @param {Object} hook - Hook definition
 * @param {string} hook.name - Hook name
 * @param {Function} hook.handler - Handler function(event, context) -> modifications | null
 * @param {number} [hook.priority=0] - Priority (higher runs first)
 * @param {string} [hook.source='code'] - Source: 'file', 'code', 'builtin'
 */
export function registerHook(event, hook) {
  if (!registeredHooks.has(event)) {
    registeredHooks.set(event, []);
  }

  const hooks = registeredHooks.get(event);
  hooks.push({
    name: hook.name,
    handler: hook.handler,
    priority: hook.priority || 0,
    source: hook.source || 'code',
  });

  // Sort by priority (higher first)
  hooks.sort((a, b) => b.priority - a.priority);
}

/**
 * Unregister a hook
 */
export function unregisterHook(event, hookName) {
  if (!registeredHooks.has(event)) return false;

  const hooks = registeredHooks.get(event);
  const index = hooks.findIndex(h => h.name === hookName);
  if (index >= 0) {
    hooks.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Fire an event and execute all registered hooks
 *
 * @param {string} event - Event name
 * @param {Object} context - Event context/data
 * @returns {Object} Merged modifications from all hooks
 */
export async function fireEvent(event, context = {}) {
  if (!HOOKS_ENABLED) return {};

  const startTime = Date.now();
  const modifications = {};
  const executedHooks = [];

  // Get hooks for this specific event
  const eventHooks = registeredHooks.get(event) || [];

  // Get wildcard hooks
  const wildcardHooks = registeredHooks.get('*') || [];

  // Get built-in hooks for this event
  const builtins = [];
  for (const [name, builtin] of builtinHooks) {
    if (builtin.events.includes('*') || builtin.events.includes(event)) {
      builtins.push({ name, handler: builtin.handler, priority: -1, source: 'builtin' });
    }
  }

  // Combine all hooks
  const allHooks = [...eventHooks, ...wildcardHooks, ...builtins];

  // Execute hooks in priority order
  for (const hook of allHooks) {
    try {
      const result = await hook.handler(event, { ...context, modifications });

      if (result && typeof result === 'object') {
        Object.assign(modifications, result);
      }

      executedHooks.push({
        name: hook.name,
        source: hook.source,
        result: result ? 'modified' : 'pass',
      });
    } catch (err) {
      console.error(`[Hooks] Error in hook ${hook.name}: ${err.message}`);
      executedHooks.push({
        name: hook.name,
        source: hook.source,
        result: 'error',
        error: err.message,
      });
    }
  }

  // Log hook execution
  if (executedHooks.length > 0) {
    logHookEvent({
      event,
      hooks: executedHooks,
      modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
      durationMs: Date.now() - startTime,
    });
  }

  return modifications;
}

/**
 * Log hook event to journal
 */
function logHookEvent(eventData) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      type: 'hook_event',
      ...eventData,
    };

    appendFileSync(HOOKS_LOG, JSON.stringify(entry) + '\n');
    rotateIfNeeded(HOOKS_LOG);
  } catch (err) {
    // Silent fail for logging
  }
}

/**
 * Reload all hooks from config
 */
export async function reloadHooks() {
  // Clear current registrations (keep builtins)
  registeredHooks.clear();
  loadedModules.clear();

  // Re-register built-in hooks
  registerBuiltinHooks();

  // Reload from config
  await loadHooksFromConfig();

  console.log(`[Hooks] Reloaded with ${countRegisteredHooks()} hooks`);
}

/**
 * Get list of all registered hooks
 */
export function listHooks() {
  const result = {};

  for (const [event, hooks] of registeredHooks) {
    result[event] = hooks.map(h => ({
      name: h.name,
      priority: h.priority,
      source: h.source,
    }));
  }

  // Add builtins
  for (const [name, builtin] of builtinHooks) {
    for (const event of builtin.events) {
      if (!result[event]) result[event] = [];
      result[event].push({ name, priority: -1, source: 'builtin' });
    }
  }

  return result;
}

/**
 * Get hooks for a specific event
 */
export function getHooksForEvent(event) {
  return registeredHooks.get(event) || [];
}

/**
 * Create a hook file template
 */
export function createHookTemplate(hookName, targetEvent) {
  const template = `/**
 * ${hookName} - Forgekeeper Hook
 *
 * Triggered by: ${targetEvent}
 *
 * Return an object to modify behavior, or null to pass through.
 */

// Hook priority (higher = runs first)
export const priority = 0;

/**
 * Execute the hook
 *
 * @param {string} event - The event that triggered this hook
 * @param {Object} context - Event context data
 * @returns {Object|null} Modifications to apply, or null
 */
export async function execute(event, context) {
  // Example: Log the event
  console.log(\`[${hookName}] Event: \${event}\`);

  // Example: Return modifications
  // return { skipComplexityCheck: true };

  // Return null to not modify anything
  return null;
}
`;

  const hookPath = join(HOOKS_DIR, `${hookName}.js`);
  atomicWriteFileSync(hookPath, template);
  console.log(`[Hooks] Created hook template: ${hookPath}`);
  return hookPath;
}

/**
 * Add a hook mapping to config
 */
export function addHookToConfig(event, hookFile) {
  try {
    const configData = JSON.parse(readFileSync(HOOKS_CONFIG, 'utf-8'));
    if (!configData.hooks[event]) {
      configData.hooks[event] = [];
    }
    if (!configData.hooks[event].includes(hookFile)) {
      configData.hooks[event].push(hookFile);
      atomicWriteFileSync(HOOKS_CONFIG, JSON.stringify(configData, null, 2));
      console.log(`[Hooks] Added ${hookFile} to config for event: ${event}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[Hooks] Failed to update config: ${err.message}`);
    return false;
  }
}

// Export for testing
export const _internal = {
  HOOKS_DIR,
  HOOKS_CONFIG,
  HOOKS_LOG,
  registeredHooks,
  loadedModules,
  builtinHooks,
};

export default {
  initHooks,
  registerHook,
  unregisterHook,
  fireEvent,
  reloadHooks,
  listHooks,
  getHooksForEvent,
  createHookTemplate,
  addHookToConfig,
};
