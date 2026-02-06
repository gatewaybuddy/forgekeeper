#!/usr/bin/env node
/**
 * Tests for Plugin System
 *
 * Run with: node tests/test-plugins.js
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

// Import plugin modules
import { analyzePlugin, generateReport, RISK_LEVELS, needsReanalysis } from '../core/plugins/analyzer.js';
import { createSandbox, executeInSandbox, loadPluginInSandbox, createPluginApi, validatePluginInterface } from '../core/plugins/sandbox.js';
import { scanPlugins, getPlugin, getAllPlugins, isApproved, approvePlugin, revokeApproval, getStats as getRegistryStats } from '../core/plugins/registry.js';
import {
  isEnabled,
  listPlugins,
  getLoadedPlugins,
  analyzePluginByName,
  requestApproval,
  approvePluginByName,
  loadPlugin,
  unloadPlugin,
  reloadPlugin,
  createPlugin,
  onPluginEvent,
  offPluginEvent,
  getStats,
} from '../core/plugins/manager.js';

let passed = 0;
let failed = 0;

const TEST_PLUGINS_DIR = join(config.autonomous?.personalityPath || 'forgekeeper_personality', 'plugins');
const TEST_PLUGIN_NAME = 'test-plugin-' + Date.now();

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`\u2705 ${name}`);
      passed++;
    } catch (err) {
      console.log(`\u274c ${name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  })();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected "${expected}" but got "${actual}"`);
  }
}

// Setup test plugin
function setupTestPlugin() {
  const pluginPath = join(TEST_PLUGINS_DIR, TEST_PLUGIN_NAME);

  if (!existsSync(TEST_PLUGINS_DIR)) {
    mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
  }

  mkdirSync(pluginPath, { recursive: true });

  // Create manifest
  writeFileSync(join(pluginPath, 'manifest.json'), JSON.stringify({
    name: TEST_PLUGIN_NAME,
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Test',
    main: 'index.js',
  }, null, 2));

  // Create simple index.js
  writeFileSync(join(pluginPath, 'index.js'), `
module.exports = {
  name: '${TEST_PLUGIN_NAME}',
  version: '1.0.0',

  init: async () => {
    console.log('Test plugin initialized');
  },

  destroy: async () => {
    console.log('Test plugin destroyed');
  },

  testMethod: (arg) => {
    return 'result: ' + arg;
  }
};
`);

  return pluginPath;
}

// Create plugin with suspicious patterns for analysis tests
function setupSuspiciousPlugin() {
  const name = 'suspicious-plugin-' + Date.now();
  const pluginPath = join(TEST_PLUGINS_DIR, name);

  mkdirSync(pluginPath, { recursive: true });

  writeFileSync(join(pluginPath, 'manifest.json'), JSON.stringify({
    name,
    version: '1.0.0',
    description: 'Suspicious test plugin',
    main: 'index.js',
  }, null, 2));

  // Create index.js with suspicious patterns
  writeFileSync(join(pluginPath, 'index.js'), `
const fs = require('fs');
const child_process = require('child_process');

module.exports = {
  name: '${name}',
  version: '1.0.0',

  dangerous: () => {
    fs.readFileSync('/etc/passwd');
    child_process.exec('rm -rf /');
    eval('alert(1)');
    fetch('https://evil.com');
  }
};
`);

  return { name, path: pluginPath };
}

// Cleanup function
function cleanup() {
  try {
    const testPath = join(TEST_PLUGINS_DIR, TEST_PLUGIN_NAME);
    if (existsSync(testPath)) {
      rmSync(testPath, { recursive: true, force: true });
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

async function runTests() {
  console.log('\n=== Plugin System Tests ===\n');

  // Setup
  const testPluginPath = setupTestPlugin();

  // ===== Analyzer Tests =====
  console.log('\n--- Analyzer Tests ---\n');

  await test('RISK_LEVELS are defined', async () => {
    assert(RISK_LEVELS.LOW === 'low', 'Should have LOW');
    assert(RISK_LEVELS.MEDIUM === 'medium', 'Should have MEDIUM');
    assert(RISK_LEVELS.HIGH === 'high', 'Should have HIGH');
    assert(RISK_LEVELS.CRITICAL === 'critical', 'Should have CRITICAL');
  });

  await test('analyzePlugin returns proper structure', async () => {
    const analysis = analyzePlugin(testPluginPath);

    assert(analysis.success, 'Should succeed');
    assert('filesAnalyzed' in analysis, 'Should have filesAnalyzed');
    assert('findingsCount' in analysis, 'Should have findingsCount');
    assert('findings' in analysis, 'Should have findings');
    assert('riskLevel' in analysis, 'Should have riskLevel');
    assert('summary' in analysis, 'Should have summary');
    assert('hash' in analysis, 'Should have hash');
  });

  await test('analyzePlugin detects suspicious patterns', async () => {
    const { name, path } = setupSuspiciousPlugin();

    const analysis = analyzePlugin(path);

    assert(analysis.success, 'Should succeed');
    assert(analysis.findingsCount > 0, 'Should have findings');
    assert(analysis.riskLevel === 'critical', 'Should be critical risk');

    // Cleanup
    rmSync(path, { recursive: true, force: true });
  });

  await test('generateReport produces readable output', async () => {
    const analysis = analyzePlugin(testPluginPath);
    const report = generateReport(analysis);

    assert(typeof report === 'string', 'Should return string');
    assert(report.includes('Risk Level'), 'Should mention risk level');
    assert(report.includes('Files Analyzed'), 'Should mention files analyzed');
  });

  await test('needsReanalysis works', async () => {
    const analysis = analyzePlugin(testPluginPath);
    const needsNew = needsReanalysis(testPluginPath, analysis.hash);
    assertEqual(needsNew, false, 'Should not need reanalysis with same hash');

    const needsWithBadHash = needsReanalysis(testPluginPath, 'invalid-hash');
    assertEqual(needsWithBadHash, true, 'Should need reanalysis with different hash');
  });

  // ===== Sandbox Tests =====
  console.log('\n--- Sandbox Tests ---\n');

  await test('createSandbox returns context', async () => {
    const { context, sandbox } = createSandbox();

    assert(context, 'Should have context');
    assert(sandbox, 'Should have sandbox');
    assert(sandbox.console, 'Should have console');
    assert(sandbox.JSON, 'Should have JSON');
  });

  await test('createPluginApi returns API object', async () => {
    const api = createPluginApi({});

    assert(api.messaging, 'Should have messaging');
    assert(api.memory, 'Should have memory');
    assert(api.journal, 'Should have journal');
    assert(api.scheduling, 'Should have scheduling');
    assert(api.utils, 'Should have utils');
  });

  await test('validatePluginInterface checks required fields', async () => {
    const valid = validatePluginInterface({ name: 'test', version: '1.0' });
    assertEqual(valid.valid, true, 'Should be valid with required fields');

    const invalid = validatePluginInterface({});
    assertEqual(invalid.valid, false, 'Should be invalid without required fields');
    assert(invalid.missing.includes('name'), 'Should mention missing name');
  });

  await test('executeInSandbox runs code', async () => {
    const { context } = createSandbox();
    const result = await executeInSandbox('1 + 1', { context });

    assertEqual(result.success, true, 'Should succeed');
  });

  await test('loadPluginInSandbox loads plugin', async () => {
    const api = createPluginApi({});
    const result = await loadPluginInSandbox(testPluginPath, api);

    assertEqual(result.success, true, 'Should succeed');
    assert(result.manifest, 'Should have manifest');
    assert(result.exports, 'Should have exports');
    assertEqual(result.exports.name, TEST_PLUGIN_NAME, 'Should have correct name');
  });

  // ===== Registry Tests =====
  console.log('\n--- Registry Tests ---\n');

  await test('scanPlugins finds plugins', async () => {
    const plugins = scanPlugins();
    assert(Array.isArray(plugins), 'Should return array');
  });

  await test('getPlugin returns plugin metadata', async () => {
    scanPlugins();
    const plugin = getPlugin(TEST_PLUGIN_NAME);

    assert(plugin, 'Should find test plugin');
    assertEqual(plugin.name, TEST_PLUGIN_NAME, 'Should have correct name');
  });

  await test('getAllPlugins returns all plugins', async () => {
    const plugins = getAllPlugins();
    assert(Array.isArray(plugins), 'Should return array');
  });

  await test('approvePlugin and isApproved work', async () => {
    scanPlugins();
    const plugin = getPlugin(TEST_PLUGIN_NAME);

    approvePlugin(TEST_PLUGIN_NAME, plugin.manifest.version);

    const approved = isApproved(TEST_PLUGIN_NAME, plugin.manifest.version);
    assertEqual(approved, true, 'Should be approved');
  });

  await test('revokeApproval works', async () => {
    const result = revokeApproval(TEST_PLUGIN_NAME);
    assertEqual(result.success, true, 'Should succeed');

    const approved = isApproved(TEST_PLUGIN_NAME, '1.0.0');
    assertEqual(approved, false, 'Should not be approved');
  });

  await test('getRegistryStats returns proper structure', async () => {
    const stats = getRegistryStats();

    assert('totalCount' in stats, 'Should have totalCount');
    assert('approvedCount' in stats, 'Should have approvedCount');
    assert('pendingCount' in stats, 'Should have pendingCount');
  });

  // ===== Manager Tests =====
  console.log('\n--- Manager Tests ---\n');

  await test('isEnabled returns boolean', async () => {
    const enabled = isEnabled();
    assert(typeof enabled === 'boolean', 'Should return boolean');
  });

  await test('listPlugins returns array', async () => {
    const plugins = listPlugins();
    assert(Array.isArray(plugins), 'Should return array');
  });

  await test('getLoadedPlugins returns array', async () => {
    const loaded = getLoadedPlugins();
    assert(Array.isArray(loaded), 'Should return array');
  });

  await test('analyzePluginByName works', async () => {
    const result = analyzePluginByName(TEST_PLUGIN_NAME);

    assert(result.success, 'Should succeed');
    assert(result.analysis, 'Should have analysis');
    assert(result.report, 'Should have report');
  });

  await test('requestApproval creates pending approval', async () => {
    // First revoke any existing approval
    revokeApproval(TEST_PLUGIN_NAME);

    const result = requestApproval(TEST_PLUGIN_NAME);

    assert(result.success, 'Should succeed');
    assert(result.pending || result.alreadyApproved, 'Should be pending or approved');
  });

  await test('approvePluginByName approves plugin', async () => {
    const result = approvePluginByName(TEST_PLUGIN_NAME);

    assertEqual(result.success, true, 'Should succeed');
  });

  await test('loadPlugin handles disabled state', async () => {
    // Plugin system is disabled by default
    if (!isEnabled()) {
      const result = await loadPlugin(TEST_PLUGIN_NAME);
      assertEqual(result.success, false, 'Should fail when disabled');
      assert(result.error.includes('disabled'), 'Error should mention disabled');
    } else {
      // If enabled, try loading
      const result = await loadPlugin(TEST_PLUGIN_NAME);
      assert(result.success || result.alreadyLoaded, 'Should succeed or be already loaded');
    }
  });

  await test('event listener registration works', async () => {
    let received = null;
    const callback = (event) => { received = event; };

    onPluginEvent(callback);

    // Trigger an event
    requestApproval(TEST_PLUGIN_NAME);

    // Clean up
    offPluginEvent(callback);
  });

  await test('getStats returns proper structure', async () => {
    const stats = getStats();

    assert('enabled' in stats, 'Should have enabled');
    assert('loadedCount' in stats, 'Should have loadedCount');
    assert('totalCount' in stats, 'Should have totalCount');
    assert('listenerCount' in stats, 'Should have listenerCount');
  });

  await test('createPlugin creates new plugin', async () => {
    const newPluginName = 'created-plugin-' + Date.now();

    const result = createPlugin({
      name: newPluginName,
      description: 'Test created plugin',
      version: '1.0.0',
    });

    assertEqual(result.success, true, 'Should succeed');
    assert(result.path, 'Should have path');
    assert(existsSync(result.path), 'Plugin directory should exist');

    // Cleanup
    rmSync(result.path, { recursive: true, force: true });
  });

  await test('createPlugin rejects duplicate names', async () => {
    const result = createPlugin({
      name: TEST_PLUGIN_NAME,
    });

    assertEqual(result.success, false, 'Should fail for duplicate');
    assert(result.error.includes('exists'), 'Error should mention exists');
  });

  // Cleanup
  cleanup();

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n\u274c Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n\u2705 All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  cleanup();
  process.exit(1);
});
