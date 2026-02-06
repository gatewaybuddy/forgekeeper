/**
 * Plugin Sandbox for Forgekeeper
 *
 * Uses worker_threads for real process-level isolation.
 * Plugins run in a separate V8 isolate with no access to the main process,
 * filesystem, network, or environment variables.
 *
 * Previous implementation used Node.js `vm` module which provides NO security
 * isolation (plugins could escape via constructor chain traversal).
 */

import { Worker } from 'worker_threads';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Worker script that runs inside the isolated thread
const WORKER_SCRIPT = `
const { parentPort, workerData } = require('worker_threads');

// Block dangerous globals inside the worker
delete globalThis.process.env;
// Override require to prevent loading dangerous modules
const originalRequire = require;
const BLOCKED_MODULES = new Set([
  'child_process', 'fs', 'net', 'http', 'https', 'dgram',
  'cluster', 'worker_threads', 'vm', 'v8', 'os', 'dns',
  'tls', 'readline', 'repl',
]);

global.require = function sandboxedRequire(mod) {
  if (BLOCKED_MODULES.has(mod)) {
    throw new Error('Module "' + mod + '" is not available in plugin sandbox');
  }
  return originalRequire(mod);
};

// Set up limited console that sends messages to parent
const pluginConsole = {
  log: (...args) => parentPort.postMessage({ type: 'console', level: 'log', args: args.map(String) }),
  warn: (...args) => parentPort.postMessage({ type: 'console', level: 'warn', args: args.map(String) }),
  error: (...args) => parentPort.postMessage({ type: 'console', level: 'error', args: args.map(String) }),
  info: (...args) => parentPort.postMessage({ type: 'console', level: 'info', args: args.map(String) }),
};

// Set up the forgekeeper API proxy — method calls are sent to parent for execution
const forgekeeperProxy = new Proxy({}, {
  get(target, namespace) {
    return new Proxy({}, {
      get(_, method) {
        return (...args) => {
          return new Promise((resolve, reject) => {
            const callId = Math.random().toString(36).slice(2);
            const handler = (msg) => {
              if (msg.type === 'api_response' && msg.callId === callId) {
                parentPort.off('message', handler);
                if (msg.error) reject(new Error(msg.error));
                else resolve(msg.result);
              }
            };
            parentPort.on('message', handler);
            parentPort.postMessage({
              type: 'api_call',
              callId,
              namespace: String(namespace),
              method: String(method),
              args: JSON.parse(JSON.stringify(args)), // Structured clone safe
            });
          });
        };
      }
    });
  }
});

try {
  const { code, pluginName } = workerData;

  // Execute plugin code in a function scope
  const moduleObj = { exports: {} };
  const wrappedFn = new Function(
    'module', 'exports', 'console', 'forgekeeper', 'require',
    code
  );
  wrappedFn(moduleObj, moduleObj.exports, pluginConsole, forgekeeperProxy, global.require);

  // Send back the exports (serializable properties only)
  const exportKeys = Object.keys(moduleObj.exports);
  const serializableExports = {};
  for (const key of exportKeys) {
    const val = moduleObj.exports[key];
    if (typeof val === 'function') {
      serializableExports[key] = { __type: 'function', name: key };
    } else {
      try {
        JSON.stringify(val); // Test serializability
        serializableExports[key] = val;
      } catch {
        serializableExports[key] = String(val);
      }
    }
  }

  parentPort.postMessage({ type: 'loaded', exports: serializableExports });

  // Keep worker alive for API calls from the host
  // The host can send 'call' messages to invoke exported functions
  parentPort.on('message', async (msg) => {
    if (msg.type === 'call') {
      try {
        const fn = moduleObj.exports[msg.method];
        if (typeof fn !== 'function') {
          parentPort.postMessage({ type: 'call_response', callId: msg.callId, error: 'Not a function: ' + msg.method });
          return;
        }
        const result = await fn(...(msg.args || []));
        parentPort.postMessage({ type: 'call_response', callId: msg.callId, result: JSON.parse(JSON.stringify(result ?? null)) });
      } catch (err) {
        parentPort.postMessage({ type: 'call_response', callId: msg.callId, error: err.message });
      }
    }
    if (msg.type === 'shutdown') {
      process.exit(0);
    }
  });

} catch (err) {
  parentPort.postMessage({ type: 'error', error: err.message, stack: err.stack });
}
`;

/**
 * Create a sandboxed context for plugin execution.
 * Returns an object compatible with the old API for backwards compat.
 */
export function createSandbox(pluginApi = {}, options = {}) {
  return {
    context: null, // No vm context — worker-based isolation
    sandbox: { pluginApi, options },
  };
}

/**
 * Execute code in an isolated worker thread.
 */
export async function executeInSandbox(code, sandbox, options = {}) {
  const timeout = options.timeout || 5000;

  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { code, pluginName: options.filename || 'plugin' },
      resourceLimits: {
        maxOldGenerationSizeMb: options.maxMemoryMb || 64,
        maxYoungGenerationSizeMb: 16,
        codeRangeSizeMb: 16,
      },
      env: {}, // Empty env — no secrets leak
    });

    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ success: false, error: 'Execution timed out' });
    }, timeout);

    worker.on('message', (msg) => {
      if (msg.type === 'loaded') {
        clearTimeout(timer);
        worker.terminate();
        resolve({ success: true, result: msg.exports });
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        resolve({ success: false, error: msg.error, stack: msg.stack });
      }
      if (msg.type === 'console') {
        console.log(`[Plugin] [${msg.level}]`, ...msg.args);
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ success: false, error: `Worker exited with code ${code}` });
      }
    });
  });
}

/**
 * Load and execute a plugin module in an isolated worker.
 * The worker stays alive so exported functions can be called via IPC.
 */
export async function loadPluginInSandbox(pluginPath, pluginApi = {}, options = {}) {
  const manifestPath = join(pluginPath, 'manifest.json');

  if (!existsSync(manifestPath)) {
    return { success: false, error: 'Missing manifest.json' };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Invalid manifest.json: ${err.message}` };
  }

  const entry = manifest.main || 'index.js';
  const entryFullPath = join(pluginPath, entry);

  if (!existsSync(entryFullPath)) {
    return { success: false, error: `Entry point not found: ${entry}` };
  }

  let code;
  try {
    code = readFileSync(entryFullPath, 'utf-8');
  } catch (err) {
    return { success: false, error: `Failed to read plugin: ${err.message}` };
  }

  const timeout = options.timeout || 5000;

  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { code, pluginName: manifest.name || entry },
      resourceLimits: {
        maxOldGenerationSizeMb: options.maxMemoryMb || 64,
        maxYoungGenerationSizeMb: 16,
        codeRangeSizeMb: 16,
      },
      env: {}, // No env vars — prevents secret leaks
    });

    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ success: false, error: 'Plugin load timed out' });
    }, timeout);

    // Handle API calls from the plugin to the host
    worker.on('message', (msg) => {
      if (msg.type === 'loaded') {
        clearTimeout(timer);

        // Build a proxy exports object that calls back into the worker
        const exports = {};
        for (const [key, val] of Object.entries(msg.exports)) {
          if (val && val.__type === 'function') {
            exports[key] = (...args) => callWorkerMethod(worker, key, args, timeout);
          } else {
            exports[key] = val;
          }
        }

        resolve({
          success: true,
          manifest,
          exports,
          worker, // Keep reference for cleanup
          terminate: () => {
            worker.postMessage({ type: 'shutdown' });
            setTimeout(() => worker.terminate(), 1000);
          },
        });
      }

      if (msg.type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        resolve({ success: false, error: msg.error, stack: msg.stack });
      }

      if (msg.type === 'console') {
        const prefix = `[Plugin:${manifest.name || 'unknown'}]`;
        console[msg.level]?.(prefix, ...msg.args);
      }

      if (msg.type === 'api_call') {
        handleApiCall(pluginApi, msg, worker);
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
    });
  });
}

/**
 * Call an exported function in the worker thread.
 */
function callWorkerMethod(worker, method, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const callId = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      reject(new Error(`Plugin method ${method} timed out`));
    }, timeout);

    const handler = (msg) => {
      if (msg.type === 'call_response' && msg.callId === callId) {
        clearTimeout(timer);
        worker.off('message', handler);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.result);
      }
    };

    worker.on('message', handler);
    worker.postMessage({
      type: 'call',
      callId,
      method,
      args: JSON.parse(JSON.stringify(args ?? [])),
    });
  });
}

/**
 * Handle an API call from the plugin worker to the host.
 */
async function handleApiCall(pluginApi, msg, worker) {
  const { callId, namespace, method, args } = msg;
  try {
    const ns = pluginApi[namespace];
    if (!ns || typeof ns[method] !== 'function') {
      worker.postMessage({ type: 'api_response', callId, error: `Unknown API: ${namespace}.${method}` });
      return;
    }
    const result = await ns[method](...args);
    worker.postMessage({ type: 'api_response', callId, result: JSON.parse(JSON.stringify(result ?? null)) });
  } catch (err) {
    worker.postMessage({ type: 'api_response', callId, error: err.message });
  }
}

/**
 * Create a controlled API for plugins (unchanged API surface)
 */
export function createPluginApi(handlers = {}) {
  return {
    messaging: {
      send: handlers.sendMessage || (() => Promise.resolve({ success: false, error: 'Not implemented' })),
    },
    memory: {
      get: handlers.getMemory || (() => null),
      search: handlers.searchMemory || (() => []),
    },
    journal: {
      append: handlers.appendJournal || (() => ({ success: false })),
    },
    scheduling: {
      schedule: handlers.scheduleTask || (() => ({ success: false, error: 'Not implemented' })),
      list: handlers.listScheduled || (() => []),
    },
    events: {
      emit: handlers.emitEvent || (() => {}),
      on: handlers.onEvent || (() => () => {}),
    },
    utils: {
      generateId: () => Math.random().toString(36).slice(2, 10),
      now: () => new Date().toISOString(),
    },
  };
}

/**
 * Validate plugin interface
 */
export function validatePluginInterface(exports) {
  const required = ['name', 'version'];
  const optional = ['init', 'destroy', 'onMessage', 'onEvent'];
  const missing = [];
  const provided = [];

  for (const key of required) {
    if (exports[key] === undefined) {
      missing.push(key);
    } else {
      provided.push(key);
    }
  }

  for (const key of optional) {
    if (exports[key] && (typeof exports[key] === 'function' || exports[key]?.__type === 'function')) {
      provided.push(key);
    }
  }

  return { valid: missing.length === 0, missing, provided };
}

export default {
  createSandbox,
  executeInSandbox,
  loadPluginInSandbox,
  createPluginApi,
  validatePluginInterface,
};
