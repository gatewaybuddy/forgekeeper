#!/usr/bin/env node
/**
 * Tests for Subagents Module
 *
 * Run with: node tests/test-subagents.js
 *
 * Note: Full subagent spawning tests require Claude CLI to be available.
 * These tests focus on the helper functions and state management.
 */

import {
  spawnSubagent,
  getSubagentStatus,
  collectResults,
  cancelSubagent,
  listActiveSubagents,
  onCompletion,
  offCompletion,
  getStats,
  cleanup,
} from '../core/subagents.js';

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
  console.log('\n=== Subagents Tests ===\n');

  // Test: getStats returns proper structure
  await test('getStats returns proper structure', async () => {
    const stats = getStats();

    assert(typeof stats === 'object', 'Should return object');
    assert('maxSubagents' in stats, 'Should have maxSubagents');
    assert('defaultTimeout' in stats, 'Should have defaultTimeout');
    assert('activeCount' in stats, 'Should have activeCount');
    assert('completedCount' in stats, 'Should have completedCount');
    assert('listenerCount' in stats, 'Should have listenerCount');
    assert(typeof stats.maxSubagents === 'number', 'maxSubagents should be number');
    assert(typeof stats.defaultTimeout === 'number', 'defaultTimeout should be number');
  });

  // Test: Stats values are reasonable
  await test('getStats returns reasonable values', async () => {
    const stats = getStats();

    assert(stats.maxSubagents > 0, 'maxSubagents should be positive');
    assert(stats.maxSubagents <= 10, 'maxSubagents should not be excessive');
    assert(stats.defaultTimeout >= 10000, 'timeout should be at least 10 seconds');
    assert(stats.activeCount >= 0, 'activeCount should be non-negative');
  });

  // Test: listActiveSubagents returns array
  await test('listActiveSubagents returns array', async () => {
    const active = listActiveSubagents();
    assert(Array.isArray(active), 'Should return array');
  });

  // Test: getSubagentStatus returns not_found for unknown subagent
  await test('getSubagentStatus returns not_found for unknown subagent', async () => {
    const status = getSubagentStatus('nonexistent-subagent-id');
    assertEqual(status.status, 'not_found', 'Should return not_found');
  });

  // Test: collectResults returns null for unknown subagent
  await test('collectResults returns null for unknown subagent', async () => {
    const result = collectResults('nonexistent-subagent-id');
    assert(result === null, 'Should return null for unknown subagent');
  });

  // Test: cancelSubagent returns failure for unknown subagent
  await test('cancelSubagent returns failure for unknown subagent', async () => {
    const result = cancelSubagent('nonexistent-subagent-id');
    assertEqual(result.success, false, 'Should return success: false');
    assert(result.reason, 'Should have reason');
  });

  // Test: spawnSubagent requires task
  await test('spawnSubagent requires task', async () => {
    const result = await spawnSubagent({});
    assertEqual(result.success, false, 'Should fail without task');
    assert(result.error.includes('required'), 'Error should mention required');
  });

  // Test: Completion listener registration
  await test('onCompletion registers listener', async () => {
    const initialStats = getStats();
    const initialCount = initialStats.listenerCount;

    const callback = () => {};
    onCompletion(callback);

    const newStats = getStats();
    assertEqual(newStats.listenerCount, initialCount + 1, 'Should increment listener count');

    // Clean up
    offCompletion(callback);
    const finalStats = getStats();
    assertEqual(finalStats.listenerCount, initialCount, 'Should decrement listener count');
  });

  // Test: offCompletion removes listener
  await test('offCompletion removes listener', async () => {
    const callback = () => {};
    onCompletion(callback);

    const beforeRemove = getStats().listenerCount;
    offCompletion(callback);
    const afterRemove = getStats().listenerCount;

    assertEqual(afterRemove, beforeRemove - 1, 'Should remove listener');
  });

  // Test: offCompletion handles non-existent listener
  await test('offCompletion handles non-existent listener', async () => {
    const initialCount = getStats().listenerCount;
    offCompletion(() => {}); // Listener that was never registered
    const afterCount = getStats().listenerCount;

    assertEqual(afterCount, initialCount, 'Should not change count for unregistered listener');
  });

  // Test: cleanup returns number
  await test('cleanup returns cleanup count', async () => {
    const cleaned = cleanup();
    assert(typeof cleaned === 'number', 'Should return number');
    assert(cleaned >= 0, 'Should be non-negative');
  });

  // Test: cleanup with custom maxAge
  await test('cleanup accepts custom maxAge', async () => {
    // This should not throw
    const cleaned = cleanup(1000);
    assert(typeof cleaned === 'number', 'Should return number');
  });

  // Test: Initial state is clean
  await test('initial state has no active subagents', async () => {
    const active = listActiveSubagents();
    assertEqual(active.length, 0, 'Should have no active subagents initially');
  });

  // Test: Stats match list count
  await test('stats activeCount matches listActiveSubagents length', async () => {
    const stats = getStats();
    const active = listActiveSubagents();
    assertEqual(stats.activeCount, active.length, 'Counts should match');
  });

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
