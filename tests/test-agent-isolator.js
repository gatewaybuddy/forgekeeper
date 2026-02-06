#!/usr/bin/env node
/**
 * Tests for Agent Isolator Module
 *
 * Run with: node tests/test-agent-isolator.js
 *
 * Note: Full agent spawning tests require Claude CLI to be available.
 * These tests focus on the helper functions and state management.
 */

import {
  isEnabled,
  getActiveCount,
  canSpawn,
  collectResults,
  injectResultsToMain,
  getAgentStatuses,
  cleanupCompleted,
  getStats,
} from '../core/agent-isolator.js';

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
  console.log('\n=== Agent Isolator Tests ===\n');

  // Test: isEnabled returns boolean
  await test('isEnabled returns boolean', async () => {
    const enabled = isEnabled();
    assert(typeof enabled === 'boolean', 'Should return boolean');
  });

  // Test: getActiveCount returns number
  await test('getActiveCount returns number', async () => {
    const count = getActiveCount();
    assert(typeof count === 'number', 'Should return number');
    assert(count >= 0, 'Should be non-negative');
  });

  // Test: canSpawn returns boolean
  await test('canSpawn returns boolean', async () => {
    const can = canSpawn();
    assert(typeof can === 'boolean', 'Should return boolean');
  });

  // Test: collectResults handles non-existent agent
  await test('collectResults returns not_found for unknown agent', async () => {
    const result = collectResults('nonexistent-agent-id');
    assertEqual(result.status, 'not_found', 'Should return not_found');
    assert(result.message, 'Should have message');
  });

  // Test: injectResultsToMain creates proper event
  await test('injectResultsToMain creates event structure', async () => {
    const mockResults = {
      status: 'completed',
      agentId: 'test-agent-1',
      taskId: 'task-1',
      taskDescription: 'Test task description',
      output: 'This is the output from the agent execution.',
      elapsed: 1500,
    };

    const event = injectResultsToMain(mockResults);

    assertEqual(event.type, 'isolated_task_complete');
    assertEqual(event.agentId, 'test-agent-1');
    assertEqual(event.taskId, 'task-1');
    assertEqual(event.status, 'completed');
    assert(event.summary, 'Should have summary');
    assert(event.ts, 'Should have timestamp');
  });

  // Test: injectResultsToMain handles failure
  await test('injectResultsToMain handles failed status', async () => {
    const mockResults = {
      status: 'failed',
      agentId: 'test-agent-2',
      taskId: 'task-2',
      taskDescription: 'Failed task',
      output: '',
      error: 'Something went wrong',
      elapsed: 500,
    };

    const event = injectResultsToMain(mockResults);

    assertEqual(event.status, 'failed');
    assert(event.summary.includes('failed'), 'Summary should mention failure');
    assert(event.summary.includes('went wrong'), 'Summary should include error');
  });

  // Test: injectResultsToMain truncates long output
  await test('injectResultsToMain truncates long output in summary', async () => {
    const mockResults = {
      status: 'completed',
      agentId: 'test-agent-3',
      taskId: 'task-3',
      taskDescription: 'Task with long output',
      output: 'x'.repeat(500), // Long output
      elapsed: 2000,
    };

    const event = injectResultsToMain(mockResults);

    assert(event.summary.includes('truncated'), 'Should indicate truncation');
    assert(event.summary.length < 600, 'Summary should be reasonably sized');
  });

  // Test: getAgentStatuses returns proper structure
  await test('getAgentStatuses returns proper structure', async () => {
    const statuses = getAgentStatuses();

    assert('active' in statuses, 'Should have active');
    assert('completed' in statuses, 'Should have completed');
    assert(Array.isArray(statuses.active), 'active should be array');
    assert(Array.isArray(statuses.completed), 'completed should be array');
  });

  // Test: cleanupCompleted returns number
  await test('cleanupCompleted returns cleanup count', async () => {
    const cleaned = cleanupCompleted();
    assert(typeof cleaned === 'number', 'Should return number');
    assert(cleaned >= 0, 'Should be non-negative');
  });

  // Test: getStats returns proper structure
  await test('getStats returns proper structure', async () => {
    const stats = getStats();

    assert(typeof stats === 'object', 'Should return object');
    assert('enabled' in stats, 'Should have enabled');
    assert('maxAgents' in stats, 'Should have maxAgents');
    assert('timeoutMs' in stats, 'Should have timeoutMs');
    assert('activeCount' in stats, 'Should have activeCount');
    assert('completedCount' in stats, 'Should have completedCount');
    assert(typeof stats.maxAgents === 'number', 'maxAgents should be number');
    assert(typeof stats.timeoutMs === 'number', 'timeoutMs should be number');
  });

  // Test: Stats values are reasonable
  await test('getStats returns reasonable values', async () => {
    const stats = getStats();

    assert(stats.maxAgents > 0, 'maxAgents should be positive');
    assert(stats.maxAgents <= 10, 'maxAgents should not be excessive');
    assert(stats.timeoutMs >= 10000, 'timeout should be at least 10 seconds');
    assert(stats.activeCount >= 0, 'activeCount should be non-negative');
  });

  // Test: canSpawn respects enabled state
  await test('canSpawn respects configuration', async () => {
    const enabled = isEnabled();
    const can = canSpawn();

    if (!enabled) {
      assertEqual(can, false, 'canSpawn should be false when disabled');
    }
  });

  // Test: getActiveCount starts at 0
  await test('getActiveCount is 0 with no spawned agents', async () => {
    const count = getActiveCount();
    // At test start, should be 0 (no agents spawned in tests)
    assertEqual(count, 0, 'Should have 0 active agents');
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
