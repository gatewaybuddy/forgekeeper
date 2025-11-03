/**
 * Unit Tests for ProgressTracker
 *
 * Run with: node frontend/core/agent/__tests__/progress-tracker.test.mjs
 */

import { ProgressTracker } from '../progress-tracker.mjs';

console.log('Running ProgressTracker tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    testsFailed++;
  }
}

// Test 1: Heartbeat recording
console.log('Test 1: Heartbeat recording');
{
  const tracker = new ProgressTracker('test-1');

  tracker.heartbeat({ iteration: 1, phase: 'reflection' });
  tracker.heartbeat({ iteration: 2, phase: 'execution' });

  const status = tracker.getStatus();
  assertEquals(status.progress.heartbeats, 2, 'Should record 2 heartbeats');
  assertEquals(status.currentIteration, 2, 'Should track current iteration');
  assertEquals(status.currentPhase, 'execution', 'Should track current phase');
}
console.log('');

// Test 2: State change tracking
console.log('Test 2: State change tracking');
{
  const tracker = new ProgressTracker('test-2');

  tracker.stateChange({ type: 'tool_call', data: { tool: 'write_file' } });
  tracker.stateChange({ type: 'reflection_complete', data: { assessment: 'continue' } });

  const status = tracker.getStatus();
  assertEquals(status.progress.stateChanges, 2, 'Should record 2 state changes');
  assertEquals(status.progress.lastChange, 'reflection_complete', 'Should track last change type');
}
console.log('');

// Test 3: Not stuck when making progress
console.log('Test 3: Not stuck when making progress');
{
  const tracker = new ProgressTracker('test-3', { stuckThreshold: 3 });

  tracker.heartbeat({ iteration: 1 });
  tracker.stateChange({ type: 'tool_call' });

  tracker.heartbeat({ iteration: 2 });
  tracker.stateChange({ type: 'reflection_complete' });

  tracker.heartbeat({ iteration: 3 });
  tracker.stateChange({ type: 'tool_call' });

  assert(!tracker.isStuck(), 'Should NOT be stuck when state changes occur');
}
console.log('');

// Test 4: Stuck detection when no state changes
console.log('Test 4: Stuck detection when no state changes');
{
  const tracker = new ProgressTracker('test-4', { stuckThreshold: 3 });

  tracker.heartbeat({ iteration: 1 });
  tracker.heartbeat({ iteration: 2 });
  tracker.heartbeat({ iteration: 3 });
  // No state changes!

  assert(tracker.isStuck(), 'Should be stuck when no state changes');
}
console.log('');

// Test 5: Stuck threshold enforcement
console.log('Test 5: Stuck threshold enforcement');
{
  const tracker = new ProgressTracker('test-5', { stuckThreshold: 5 });

  tracker.heartbeat({ iteration: 1 });
  tracker.heartbeat({ iteration: 2 });
  tracker.heartbeat({ iteration: 3 });

  assert(!tracker.isStuck(), 'Should NOT be stuck with only 3 heartbeats (threshold 5)');

  tracker.heartbeat({ iteration: 4 });
  tracker.heartbeat({ iteration: 5 });

  assert(tracker.isStuck(), 'Should be stuck with 5 heartbeats and no state changes');
}
console.log('');

// Test 6: Alive detection (async)
console.log('Test 6: Alive detection');
await (async () => {
  const tracker = new ProgressTracker('test-6', { heartbeatInterval: 100 });

  tracker.heartbeat({ iteration: 1 });

  const status1 = tracker.getStatus();
  assert(status1.alive === true, 'Should be alive immediately after heartbeat');

  // Wait 250ms (> 2x heartbeat interval of 100ms)
  await new Promise(resolve => setTimeout(resolve, 250));

  const status2 = tracker.getStatus();
  assert(status2.alive === false, 'Should be NOT alive after 2x heartbeat interval');
})();
console.log('');

// Test 7: Memory cleanup
console.log('Test 7: Memory cleanup');
{
  const tracker = new ProgressTracker('test-7', {
    maxHeartbeatsInMemory: 5,
    maxStateChangesInMemory: 3,
  });

  // Add 10 heartbeats
  for (let i = 1; i <= 10; i++) {
    tracker.heartbeat({ iteration: i });
  }

  assertEquals(tracker.heartbeats.length, 5, 'Should keep only 5 heartbeats in memory');

  // Add 6 state changes
  for (let i = 1; i <= 6; i++) {
    tracker.stateChange({ type: 'tool_call', data: { iteration: i } });
  }

  assertEquals(tracker.stateChanges.length, 3, 'Should keep only 3 state changes in memory');
}
console.log('');

// Test 8: Reset functionality
console.log('Test 8: Reset functionality');
{
  const tracker = new ProgressTracker('test-8');

  tracker.heartbeat({ iteration: 1 });
  tracker.stateChange({ type: 'tool_call' });

  tracker.reset();

  assertEquals(tracker.heartbeats.length, 0, 'Should clear heartbeats on reset');
  assertEquals(tracker.stateChanges.length, 0, 'Should clear state changes on reset');
}
console.log('');

// Test 9: History retrieval
console.log('Test 9: History retrieval');
{
  const tracker = new ProgressTracker('test-9');

  for (let i = 1; i <= 15; i++) {
    tracker.heartbeat({ iteration: i });
    tracker.stateChange({ type: 'tool_call', data: { iteration: i } });
  }

  const history = tracker.getHistory(5);

  assertEquals(history.heartbeats.length, 5, 'Should return last 5 heartbeats');
  assertEquals(history.stateChanges.length, 5, 'Should return last 5 state changes');
  assertEquals(history.heartbeats[4].iteration, 15, 'Should return most recent heartbeats');
}
console.log('');

// Test 10: Stuck detection window (async)
console.log('Test 10: Stuck detection window');
await (async () => {
  const tracker = new ProgressTracker('test-10', { stuckThreshold: 3 });

  tracker.heartbeat({ iteration: 1 });
  await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
  tracker.stateChange({ type: 'tool_call' }); // State change at start

  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.heartbeat({ iteration: 2 });
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.heartbeat({ iteration: 3 });
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.heartbeat({ iteration: 4 });
  // No state changes in last 3 heartbeats

  assert(tracker.isStuck(), 'Should be stuck when state change is outside window');
})();
console.log('');

// Summary
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\n✓ All ProgressTracker tests passed!\n');
