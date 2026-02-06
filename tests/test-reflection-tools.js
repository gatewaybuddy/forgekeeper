#!/usr/bin/env node
/**
 * Tests for Reflection Tools Module
 *
 * Run with: node tests/test-reflection-tools.js
 *
 * Note: Some tests require FK_REFLECTION_TOOLS_ENABLED=1 to fully exercise functionality.
 */

import {
  isEnabled,
  gitStatus,
  listPendingTasks,
  checkFileExists,
  readFileSnippet,
  getSystemTime,
  executeTool,
  getAvailableTools,
  buildToolPrompt,
  getRecentUsage,
  getStats,
} from '../core/reflection-tools.js';

let passed = 0;
let failed = 0;

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

async function runTests() {
  console.log('\n=== Reflection Tools Tests ===\n');

  const enabled = isEnabled();
  console.log(`[Setup] Tools enabled: ${enabled}\n`);

  // Test: isEnabled returns boolean
  await test('isEnabled returns boolean', async () => {
    const result = isEnabled();
    assert(typeof result === 'boolean', 'Should return boolean');
  });

  // Test: getAvailableTools returns array
  await test('getAvailableTools returns array when enabled', async () => {
    const tools = getAvailableTools();
    assert(Array.isArray(tools), 'Should return array');
    if (enabled) {
      assert(tools.length > 0, 'Should have tools when enabled');
      assert(tools[0].name, 'Tools should have name');
      assert(tools[0].description, 'Tools should have description');
    }
  });

  // Test: gitStatus function exists and handles disabled state
  await test('gitStatus handles disabled/enabled state', async () => {
    const result = gitStatus();
    if (enabled) {
      assert(result !== null, 'Should return result when enabled');
      assert('summary' in result || 'error' in result, 'Should have summary or error');
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: listPendingTasks function
  await test('listPendingTasks handles disabled/enabled state', async () => {
    const result = listPendingTasks();
    if (enabled) {
      assert(result !== null, 'Should return result when enabled');
      assert('count' in result || 'error' in result, 'Should have count or error');
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: checkFileExists function
  await test('checkFileExists handles disabled/enabled state', async () => {
    const result = checkFileExists('package.json');
    if (enabled) {
      assert(result !== null, 'Should return result when enabled');
      assert('exists' in result || 'error' in result, 'Should have exists or error');
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: checkFileExists prevents path traversal
  await test('checkFileExists prevents path traversal when enabled', async () => {
    if (enabled) {
      const result = checkFileExists('../../../etc/passwd');
      assert(result.error, 'Should return error for path traversal');
      assert(result.error.includes('traversal'), 'Error should mention traversal');
    }
  });

  // Test: readFileSnippet function
  await test('readFileSnippet handles disabled/enabled state', async () => {
    const result = readFileSnippet('package.json');
    if (enabled) {
      assert(result !== null, 'Should return result when enabled');
      if (!result.error) {
        assert('content' in result, 'Should have content');
        assert('lineCount' in result, 'Should have lineCount');
      }
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: readFileSnippet blocks sensitive files
  await test('readFileSnippet blocks sensitive files when enabled', async () => {
    if (enabled) {
      const result = readFileSnippet('.env');
      assert(result.error, 'Should return error for sensitive file');
      assert(result.error.includes('sensitive'), 'Error should mention sensitive');
    }
  });

  // Test: getSystemTime function
  await test('getSystemTime handles disabled/enabled state', async () => {
    const result = getSystemTime();
    if (enabled) {
      assert(result !== null, 'Should return result when enabled');
      assert('iso' in result, 'Should have iso');
      assert('local' in result, 'Should have local');
      assert('hour' in result, 'Should have hour');
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: executeTool function
  await test('executeTool handles unknown tools', async () => {
    const result = executeTool('nonexistent');
    if (enabled) {
      assert(result.error, 'Should return error for unknown tool');
    } else {
      assert(result.error, 'Should return error when disabled');
    }
  });

  // Test: executeTool with valid tool
  await test('executeTool works with valid tool', async () => {
    const result = executeTool('getSystemTime');
    if (enabled) {
      assert(result.iso || result.error, 'Should return result or error');
    } else {
      assert(result.error, 'Should return error when disabled');
    }
  });

  // Test: buildToolPrompt
  await test('buildToolPrompt returns prompt or null', async () => {
    const result = buildToolPrompt();
    if (enabled) {
      assert(result !== null, 'Should return prompt when enabled');
      assert(result.includes('gitStatus'), 'Should mention git status tool');
    } else {
      assertEqual(result, null, 'Should return null when disabled');
    }
  });

  // Test: getRecentUsage returns array
  await test('getRecentUsage returns array', async () => {
    const result = getRecentUsage(5);
    assert(Array.isArray(result), 'Should return array');
  });

  // Test: getStats returns proper structure
  await test('getStats returns proper structure', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Should return object');
    assert('enabled' in stats, 'Should have enabled');
    assert('availableTools' in stats, 'Should have availableTools');
    assert(Array.isArray(stats.availableTools), 'availableTools should be array');
  });

  // Conditional tests that only run when enabled
  if (enabled) {
    console.log('\n--- Running enabled-only tests ---\n');

    await test('gitStatus returns structured data', async () => {
      const result = gitStatus();
      if (!result.error) {
        assert('modified' in result, 'Should have modified count');
        assert('staged' in result, 'Should have staged count');
        assert('untracked' in result, 'Should have untracked count');
        assert('summary' in result, 'Should have summary');
      }
    });

    await test('listPendingTasks returns structured data', async () => {
      const result = listPendingTasks();
      if (!result.error) {
        assert('count' in result, 'Should have count');
        assert(Array.isArray(result.tasks), 'Should have tasks array');
        assert('summary' in result, 'Should have summary');
      }
    });

    await test('readFileSnippet limits lines correctly', async () => {
      const result = readFileSnippet('package.json', 5);
      if (!result.error) {
        assert(result.lineCount <= 5, 'Should respect line limit');
      }
    });
  } else {
    console.log('\n--- Skipping enabled-only tests (set FK_REFLECTION_TOOLS_ENABLED=1) ---\n');
  }

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
  process.exit(1);
});
