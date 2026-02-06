#!/usr/bin/env node
/**
 * Tests for Autonomous Feedback Module
 *
 * Run with: node tests/test-autonomous-feedback.js
 */

import {
  isAutonomousTask,
  prioritizeTasks,
  recordOutcome,
  getLastOutcome,
  getRecentOutcomes,
  findStuckTasks,
  formatOutcomeForReflection,
  formatStuckTasksForReflection,
  buildCompletionNotification,
  getStats,
  clearLastOutcome,
} from '../core/autonomous-feedback.js';

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
  console.log('\n=== Autonomous Feedback Tests ===\n');

  // Clear state before tests
  clearLastOutcome();

  // Test: isAutonomousTask detection
  await test('isAutonomousTask detects autonomous origin', async () => {
    assertEqual(isAutonomousTask({ origin: 'autonomous' }), true);
    assertEqual(isAutonomousTask({ origin: 'reflection' }), true);
    assertEqual(isAutonomousTask({ metadata: { fromReflection: true } }), true);
    assertEqual(isAutonomousTask({ origin: 'user' }), false);
    assertEqual(isAutonomousTask({ origin: 'manual' }), false);
    assertEqual(isAutonomousTask(null), false);
  });

  // Test: prioritizeTasks with no user tasks
  await test('prioritizeTasks puts autonomous first when no user tasks', async () => {
    const tasks = [
      { id: 1, origin: 'autonomous', priority: 'medium', created: '2025-02-01' },
      { id: 2, origin: 'autonomous', priority: 'high', created: '2025-02-01' },
    ];
    const sorted = prioritizeTasks(tasks);
    assertEqual(sorted[0].id, 2, 'High priority should be first');
    assertEqual(sorted.length, 2, 'Should have both tasks');
  });

  // Test: prioritizeTasks with mixed tasks
  await test('prioritizeTasks puts user tasks before autonomous', async () => {
    const tasks = [
      { id: 1, origin: 'autonomous', priority: 'high', created: '2025-02-01' },
      { id: 2, origin: 'user', priority: 'low', created: '2025-02-01' },
    ];
    const sorted = prioritizeTasks(tasks);
    assertEqual(sorted[0].id, 2, 'User task should be first');
  });

  // Test: prioritizeTasks with empty array
  await test('prioritizeTasks handles empty array', async () => {
    const sorted = prioritizeTasks([]);
    assertEqual(sorted.length, 0, 'Should return empty array');
  });

  // Test: recordOutcome stores outcome
  await test('recordOutcome stores and returns outcome', async () => {
    const task = {
      id: 'test-task-1',
      description: 'Test task description',
      origin: 'autonomous',
    };
    const result = { success: true, output: 'Task completed', elapsed: 1000 };

    const outcome = recordOutcome(task, result);

    assert(outcome.id, 'Should have id');
    assert(outcome.ts, 'Should have timestamp');
    assertEqual(outcome.taskId, 'test-task-1');
    assertEqual(outcome.success, true);
    assertEqual(outcome.isAutonomous, true);
  });

  // Test: getLastOutcome returns last recorded
  await test('getLastOutcome returns last recorded outcome', async () => {
    const last = getLastOutcome();
    assert(last !== null, 'Should have last outcome');
    assertEqual(last.taskId, 'test-task-1');
  });

  // Test: getRecentOutcomes
  await test('getRecentOutcomes returns array', async () => {
    const recent = getRecentOutcomes(5);
    assert(Array.isArray(recent), 'Should return array');
    assert(recent.length > 0, 'Should have at least one outcome');
  });

  // Test: findStuckTasks with no stuck tasks
  await test('findStuckTasks returns empty for recent tasks', async () => {
    const tasks = [
      { id: 1, origin: 'autonomous', created: new Date().toISOString() },
    ];
    const stuck = findStuckTasks(tasks);
    assertEqual(stuck.length, 0, 'Recent tasks should not be stuck');
  });

  // Test: findStuckTasks finds old autonomous tasks
  await test('findStuckTasks finds old autonomous tasks', async () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const tasks = [
      { id: 1, origin: 'autonomous', created: oldDate },
      { id: 2, origin: 'user', created: oldDate },
    ];
    const stuck = findStuckTasks(tasks);
    assertEqual(stuck.length, 1, 'Should find 1 stuck autonomous task');
    assertEqual(stuck[0].id, 1);
    assert(stuck[0].stuckMinutes > 30, 'Should report stuck duration');
  });

  // Test: formatOutcomeForReflection
  await test('formatOutcomeForReflection returns formatted string', async () => {
    // Record a fresh outcome
    recordOutcome(
      { id: 'fresh-task', description: 'Fresh test', origin: 'autonomous' },
      { success: true, output: 'Done!' }
    );

    const formatted = formatOutcomeForReflection();
    assert(formatted !== null, 'Should return formatted string');
    assert(formatted.includes('Fresh test'), 'Should include task description');
    assert(formatted.includes('succeeded'), 'Should include success status');
  });

  // Test: formatStuckTasksForReflection
  await test('formatStuckTasksForReflection formats stuck tasks', async () => {
    const stuckTasks = [
      { description: 'Stuck task 1', stuckMinutes: 45 },
      { description: 'Stuck task 2', stuckMinutes: 60 },
    ];
    const formatted = formatStuckTasksForReflection(stuckTasks);
    assert(formatted !== null, 'Should return formatted string');
    assert(formatted.includes('Stuck task 1'), 'Should include first task');
    assert(formatted.includes('45 minutes'), 'Should include duration');
  });

  // Test: formatStuckTasksForReflection with empty array
  await test('formatStuckTasksForReflection handles empty array', async () => {
    const formatted = formatStuckTasksForReflection([]);
    assertEqual(formatted, null, 'Should return null for empty');
  });

  // Test: buildCompletionNotification for autonomous task
  await test('buildCompletionNotification builds notification for autonomous', async () => {
    const task = { id: 1, description: 'Auto task', origin: 'autonomous' };
    const result = { success: true, output: 'Great success!' };

    const notification = buildCompletionNotification(task, result);
    assert(notification !== null, 'Should return notification');
    assert(notification.includes('Auto task'), 'Should include description');
    assert(notification.includes('Great success'), 'Should include output');
  });

  // Test: buildCompletionNotification returns null for user task
  await test('buildCompletionNotification returns null for user task', async () => {
    const task = { id: 1, description: 'User task', origin: 'user' };
    const result = { success: true };

    const notification = buildCompletionNotification(task, result);
    assertEqual(notification, null, 'Should return null for user task');
  });

  // Test: buildCompletionNotification for failed task
  await test('buildCompletionNotification handles failure', async () => {
    const task = { id: 1, description: 'Failed auto', origin: 'autonomous' };
    const result = { success: false, error: 'Something went wrong' };

    const notification = buildCompletionNotification(task, result);
    assert(notification !== null, 'Should return notification');
    assert(notification.includes('Failed auto'), 'Should include description');
    assert(notification.includes('went wrong'), 'Should include error');
  });

  // Test: getStats returns proper structure
  await test('getStats returns proper structure', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Should return object');
    assert('totalCompleted' in stats, 'Should have totalCompleted');
    assert('totalFailed' in stats, 'Should have totalFailed');
    assert('successRate' in stats, 'Should have successRate');
    assert('stuckThresholdMinutes' in stats, 'Should have stuckThresholdMinutes');
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
