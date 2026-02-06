#!/usr/bin/env node
/**
 * Tests for Scheduler Module
 *
 * Run with: node tests/test-scheduler.js
 */

import {
  isEnabled,
  needsApproval,
  approveTaskType,
  scheduleTask,
  scheduleRecurring,
  cancelTask,
  listScheduled,
  getDueTasks,
  executeScheduled,
  onSchedulerEvent,
  offSchedulerEvent,
  getStats,
  cleanup,
} from '../core/scheduler.js';

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

// Helper: get future date
function futureDate(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60 * 1000);
}

async function runTests() {
  console.log('\n=== Scheduler Tests ===\n');

  // Test: isEnabled returns boolean
  await test('isEnabled returns boolean', async () => {
    const enabled = isEnabled();
    assert(typeof enabled === 'boolean', 'Should return boolean');
  });

  // Test: getStats returns proper structure
  await test('getStats returns proper structure', async () => {
    const stats = getStats();

    assert(typeof stats === 'object', 'Should return object');
    assert('enabled' in stats, 'Should have enabled');
    assert('maxPerHour' in stats, 'Should have maxPerHour');
    assert('rememberApproval' in stats, 'Should have rememberApproval');
    assert('skipApproval' in stats, 'Should have skipApproval');
    assert('pendingCount' in stats, 'Should have pendingCount');
    assert('activeCount' in stats, 'Should have activeCount');
    assert('listenerCount' in stats, 'Should have listenerCount');
  });

  // Test: listScheduled returns array
  await test('listScheduled returns array', async () => {
    const scheduled = listScheduled();
    assert(Array.isArray(scheduled), 'Should return array');
  });

  // Test: getDueTasks returns array
  await test('getDueTasks returns array', async () => {
    const due = getDueTasks();
    assert(Array.isArray(due), 'Should return array');
  });

  // Test: scheduleTask requires task
  await test('scheduleTask requires task', async () => {
    const result = scheduleTask({ at: futureDate(5) });
    assertEqual(result.success, false, 'Should fail without task');
    assert(result.error.includes('required'), 'Error should mention required');
  });

  // Test: scheduleTask requires at
  await test('scheduleTask requires execution time', async () => {
    const result = scheduleTask({ task: 'Test task' });
    assertEqual(result.success, false, 'Should fail without at');
    assert(result.error.includes('required'), 'Error should mention required');
  });

  // Test: scheduleTask rejects past times
  await test('scheduleTask rejects past times', async () => {
    const pastDate = new Date(Date.now() - 60000);
    const result = scheduleTask({
      task: 'Test task',
      at: pastDate,
      approved: true,
    });
    assertEqual(result.success, false, 'Should fail with past time');
    assert(result.error.includes('past'), 'Error should mention past');
  });

  // Test: scheduleTask creates task with approval
  await test('scheduleTask creates task when approved', async () => {
    const result = scheduleTask({
      task: 'Check git status',
      at: futureDate(5),
      approved: true,
    });

    assertEqual(result.success, true, 'Should succeed');
    assert(result.taskId, 'Should have taskId');
    assert(result.runAt, 'Should have runAt');

    // Clean up
    cancelTask(result.taskId);
  });

  // Test: scheduleRecurring requires task
  await test('scheduleRecurring requires task', async () => {
    const result = scheduleRecurring({ every: '1h' });
    assertEqual(result.success, false, 'Should fail without task');
  });

  // Test: scheduleRecurring requires interval or cron
  await test('scheduleRecurring requires interval or cron', async () => {
    const result = scheduleRecurring({ task: 'Test task' });
    assertEqual(result.success, false, 'Should fail without interval');
    assert(result.error.includes('every') || result.error.includes('cron'), 'Error should mention every or cron');
  });

  // Test: scheduleRecurring parses interval
  await test('scheduleRecurring parses interval correctly', async () => {
    const result = scheduleRecurring({
      task: 'Review PRs',
      every: '1h',
      approved: true,
    });

    assertEqual(result.success, true, 'Should succeed');
    assert(result.taskId, 'Should have taskId');
    assert(result.nextRun, 'Should have nextRun');

    // Clean up
    cancelTask(result.taskId);
  });

  // Test: scheduleRecurring rejects invalid interval
  await test('scheduleRecurring rejects invalid interval', async () => {
    const result = scheduleRecurring({
      task: 'Test task',
      every: 'invalid',
      approved: true,
    });
    assertEqual(result.success, false, 'Should fail with invalid interval');
    assert(result.error.includes('Invalid'), 'Error should mention invalid');
  });

  // Test: cancelTask works
  await test('cancelTask removes scheduled task', async () => {
    const scheduled = scheduleTask({
      task: 'Task to cancel',
      at: futureDate(10),
      approved: true,
    });

    const result = cancelTask(scheduled.taskId);
    assertEqual(result.success, true, 'Should succeed');

    // Verify not in list
    const list = listScheduled();
    const found = list.find(t => t.id === scheduled.taskId);
    assertEqual(found, undefined, 'Should not be in list');
  });

  // Test: cancelTask handles unknown task
  await test('cancelTask handles unknown task', async () => {
    const result = cancelTask('nonexistent-task-id');
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('not found'), 'Error should mention not found');
  });

  // Test: needsApproval returns proper structure
  await test('needsApproval returns proper structure', async () => {
    const approval = needsApproval('check git status');
    assert('needs' in approval, 'Should have needs');
    assert(typeof approval.needs === 'boolean', 'needs should be boolean');
  });

  // Test: approveTaskType works
  await test('approveTaskType adds to approved types', async () => {
    const result = approveTaskType('test_type');
    assertEqual(result.success, true, 'Should succeed');
    assertEqual(result.taskType, 'test_type', 'Should have taskType');
  });

  // Test: Event listener registration
  await test('onSchedulerEvent registers listener', async () => {
    const initialStats = getStats();
    const initialCount = initialStats.listenerCount;

    const callback = () => {};
    onSchedulerEvent(callback);

    const newStats = getStats();
    assertEqual(newStats.listenerCount, initialCount + 1, 'Should increment listener count');

    // Clean up
    offSchedulerEvent(callback);
  });

  // Test: Event listener receives events
  await test('event listener receives events', async () => {
    let receivedEvent = null;

    const callback = (event) => {
      receivedEvent = event;
    };

    onSchedulerEvent(callback);

    const scheduled = scheduleTask({
      task: 'Test event listener',
      at: futureDate(5),
      approved: true,
    });

    assert(receivedEvent, 'Should receive event');
    assertEqual(receivedEvent.type, 'task_scheduled', 'Should be scheduled event');
    assertEqual(receivedEvent.taskId, scheduled.taskId, 'Should have correct taskId');

    // Clean up
    offSchedulerEvent(callback);
    cancelTask(scheduled.taskId);
  });

  // Test: executeScheduled works
  await test('executeScheduled executes task', async () => {
    // Schedule a task for immediate execution (past the check)
    const scheduled = scheduleTask({
      task: 'Immediate execution test',
      at: futureDate(1),
      approved: true,
    });

    let executed = false;
    const executor = async (task, context) => {
      executed = true;
      return 'done';
    };

    const result = await executeScheduled(scheduled.taskId, executor);

    assertEqual(result.success, true, 'Should succeed');
    assertEqual(executed, true, 'Should have executed');
    assertEqual(result.result, 'done', 'Should have result');
  });

  // Test: executeScheduled handles unknown task
  await test('executeScheduled handles unknown task', async () => {
    const result = await executeScheduled('nonexistent-task-id', async () => {});
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('not found'), 'Error should mention not found');
  });

  // Test: executeScheduled handles executor errors
  await test('executeScheduled handles executor errors', async () => {
    const scheduled = scheduleTask({
      task: 'Error test task',
      at: futureDate(5),
      approved: true,
    });

    const result = await executeScheduled(scheduled.taskId, async () => {
      throw new Error('Test error');
    });

    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('Test error'), 'Should have error message');
  });

  // Test: cleanup returns number
  await test('cleanup returns cleanup count', async () => {
    const cleaned = cleanup();
    assert(typeof cleaned === 'number', 'Should return number');
    assert(cleaned >= 0, 'Should be non-negative');
  });

  // Test: interval parsing
  await test('various interval formats work', async () => {
    const intervals = ['30s', '5m', '2h', '1d'];

    for (const interval of intervals) {
      const result = scheduleRecurring({
        task: `Test ${interval} interval`,
        every: interval,
        approved: true,
      });

      assertEqual(result.success, true, `Should succeed for ${interval}`);
      cancelTask(result.taskId);
    }
  });

  // Test: cron expression parsing
  await test('simple cron expressions work', async () => {
    const result = scheduleRecurring({
      task: 'Test cron task',
      cron: '0 * * * *', // Every hour
      approved: true,
    });

    assertEqual(result.success, true, 'Should succeed');
    assert(result.nextRun, 'Should have nextRun');
    cancelTask(result.taskId);
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
