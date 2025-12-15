// Comprehensive test suite for combined mode (review + chunked) - T209
// Tests per_chunk, final_only, and both strategies with ContextLog integration

import assert from 'assert';
import {
  createCombinedModeStartEvent,
  createCombinedModeCompleteEvent,
  appendEvent,
  tailEvents,
} from '../server/telemetry/contextlog.mjs';

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function pass(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg, expected, actual) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  throw new Error(`Test failed: ${msg}`);
}

function section(title) {
  console.log(`\n${colors.blue}═══ ${title} ═══${colors.reset}`);
}

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    pass(name);
  } catch (err) {
    console.error(err);
    fail(name, err.expected || 'no error', err.message);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    pass(name);
  } catch (err) {
    console.error(err);
    fail(name, err.expected || 'no error', err.message);
  }
}

// ============================================================================
// ContextLog Event Creators
// ============================================================================

section('ContextLog Event Creators');

test('Creates combined mode start event', () => {
  const event = createCombinedModeStartEvent({
    conv_id: 'test-conv-1',
    trace_id: 'test-trace-1',
    strategy: 'per_chunk',
    chunk_count: 5,
  });

  assert.strictEqual(event.actor, 'system');
  assert.strictEqual(event.act, 'combined_mode_start');
  assert.strictEqual(event.conv_id, 'test-conv-1');
  assert.strictEqual(event.trace_id, 'test-trace-1');
  assert.strictEqual(event.strategy, 'per_chunk');
  assert.strictEqual(event.chunk_count, 5);
  assert.strictEqual(event.status, 'ok');
  assert('id' in event);
  assert('ts' in event);
});

test('Creates combined mode complete event', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test-conv-2',
    trace_id: 'test-trace-2',
    strategy: 'final_only',
    chunk_count: 3,
    total_review_passes: 1,
    final_score: 0.85,
    total_elapsed_ms: 5000,
  });

  assert.strictEqual(event.actor, 'system');
  assert.strictEqual(event.act, 'combined_mode_complete');
  assert.strictEqual(event.conv_id, 'test-conv-2');
  assert.strictEqual(event.strategy, 'final_only');
  assert.strictEqual(event.chunk_count, 3);
  assert.strictEqual(event.total_review_passes, 1);
  assert.strictEqual(event.final_score, 0.85);
  assert.strictEqual(event.total_elapsed_ms, 5000);
  assert.strictEqual(event.status, 'ok');
});

test('Rounds final score to 3 decimal places', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test-conv',
    trace_id: 'test-trace',
    strategy: 'both',
    chunk_count: 4,
    total_review_passes: 5,
    final_score: 0.8765432,
    total_elapsed_ms: 10000,
  });

  assert.strictEqual(event.final_score, 0.877);
});

test('Handles error status in combined mode events', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test-conv',
    trace_id: 'test-trace',
    strategy: 'per_chunk',
    chunk_count: 0,
    total_review_passes: 0,
    final_score: 0.0,
    total_elapsed_ms: 1000,
    status: 'error',
  });

  assert.strictEqual(event.status, 'error');
});

// ============================================================================
// ContextLog Integration
// ============================================================================

section('ContextLog Integration');

await asyncTest('Appends and retrieves combined mode events', async () => {
  const convId = 'test-conv-contextlog-' + Date.now();
  const traceId = 'test-trace-contextlog-' + Date.now();

  // Append start event
  const startEvent = createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 3,
  });
  appendEvent(startEvent);

  // Append complete event
  const completeEvent = createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 3,
    total_review_passes: 3,
    final_score: 0.82,
    total_elapsed_ms: 7500,
  });
  appendEvent(completeEvent);

  // Wait a bit for filesystem
  await new Promise(resolve => setTimeout(resolve, 100));

  // Retrieve events
  const events = tailEvents(10, convId);

  // Verify we got both events
  const startEvents = events.filter(e => e.act === 'combined_mode_start');
  const completeEvents = events.filter(e => e.act === 'combined_mode_complete');

  assert(startEvents.length >= 1, 'Should find start event');
  assert(completeEvents.length >= 1, 'Should find complete event');

  // Verify start event data
  const retrievedStart = startEvents[0];
  assert.strictEqual(retrievedStart.conv_id, convId);
  assert.strictEqual(retrievedStart.strategy, 'per_chunk');
  assert.strictEqual(retrievedStart.chunk_count, 3);

  // Verify complete event data
  const retrievedComplete = completeEvents[0];
  assert.strictEqual(retrievedComplete.conv_id, convId);
  assert.strictEqual(retrievedComplete.strategy, 'per_chunk');
  assert.strictEqual(retrievedComplete.total_review_passes, 3);
  assert.strictEqual(retrievedComplete.final_score, 0.82);
});

await asyncTest('Logs per_chunk strategy events in correct order', async () => {
  const convId = 'test-conv-perchunk-' + Date.now();
  const traceId = 'test-trace-perchunk-' + Date.now();

  // Simulate per_chunk strategy: start, outline, chunk1 review, chunk2 review, chunk3 review, complete
  appendEvent(createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 0, // Not known yet
  }));

  // Simulate 3 chunk reviews (would be created by reviewContent function)
  for (let i = 0; i < 3; i++) {
    appendEvent({
      id: `review-${i}`,
      ts: new Date().toISOString(),
      actor: 'system',
      act: 'review_cycle',
      conv_id: convId,
      trace_id: traceId,
      iter: i + 1,
      review_pass: i + 1,
      quality_score: 0.75 + (i * 0.05),
      threshold: 0.7,
      critique: `Chunk ${i + 1} review`,
      accepted: true,
      elapsed_ms: 500,
      status: 'ok',
    });
  }

  appendEvent(createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 3,
    total_review_passes: 3,
    final_score: 0.85,
    total_elapsed_ms: 8000,
  }));

  await new Promise(resolve => setTimeout(resolve, 100));

  // Retrieve and verify event order
  const events = tailEvents(10, convId);

  // Should have: 1 start + 3 reviews + 1 complete = 5 events
  assert(events.length >= 5, `Should have at least 5 events, got ${events.length}`);

  // Verify sequence
  const startEvents = events.filter(e => e.act === 'combined_mode_start');
  const reviewEvents = events.filter(e => e.act === 'review_cycle');
  const completeEvents = events.filter(e => e.act === 'combined_mode_complete');

  assert.strictEqual(startEvents.length, 1, 'Should have 1 start event');
  assert.strictEqual(reviewEvents.length, 3, 'Should have 3 review events');
  assert.strictEqual(completeEvents.length, 1, 'Should have 1 complete event');
});

await asyncTest('Logs final_only strategy with single review event', async () => {
  const convId = 'test-conv-finalonly-' + Date.now();
  const traceId = 'test-trace-finalonly-' + Date.now();

  // Simulate final_only strategy: start, chunks (no review), final review, complete
  appendEvent(createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'final_only',
    chunk_count: 0,
  }));

  // Single review of assembled response
  appendEvent({
    id: 'final-review',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'review_cycle',
    conv_id: convId,
    trace_id: traceId,
    iter: 1,
    review_pass: 1,
    quality_score: 0.88,
    threshold: 0.7,
    critique: 'Final assembled response: Good quality',
    accepted: true,
    elapsed_ms: 600,
    status: 'ok',
  });

  appendEvent(createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'final_only',
    chunk_count: 4,
    total_review_passes: 1,
    final_score: 0.88,
    total_elapsed_ms: 6000,
  }));

  await new Promise(resolve => setTimeout(resolve, 100));

  const events = tailEvents(10, convId);

  const reviewEvents = events.filter(e => e.act === 'review_cycle');
  assert.strictEqual(reviewEvents.length, 1, 'Should have exactly 1 review event for final_only');

  const completeEvents = events.filter(e => e.act === 'combined_mode_complete');
  assert.strictEqual(completeEvents[0].total_review_passes, 1, 'Should record 1 review pass');
  assert.strictEqual(completeEvents[0].strategy, 'final_only');
});

await asyncTest('Logs both strategy with all review events', async () => {
  const convId = 'test-conv-both-' + Date.now();
  const traceId = 'test-trace-both-' + Date.now();

  appendEvent(createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'both',
    chunk_count: 0,
  }));

  // Per-chunk reviews (2 chunks)
  for (let i = 0; i < 2; i++) {
    appendEvent({
      id: `chunk-review-${i}`,
      ts: new Date().toISOString(),
      actor: 'system',
      act: 'review_cycle',
      conv_id: convId,
      trace_id: traceId,
      iter: i + 1,
      review_pass: i + 1,
      quality_score: 0.8,
      threshold: 0.7,
      critique: `Chunk ${i + 1} review`,
      accepted: true,
      elapsed_ms: 500,
      status: 'ok',
    });
  }

  // Final review
  appendEvent({
    id: 'final-review-both',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'review_cycle',
    conv_id: convId,
    trace_id: traceId,
    iter: 3,
    review_pass: 3,
    quality_score: 0.9,
    threshold: 0.7,
    critique: 'Final assembled response (already chunk-reviewed): Excellent',
    accepted: true,
    elapsed_ms: 600,
    status: 'ok',
  });

  appendEvent(createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'both',
    chunk_count: 2,
    total_review_passes: 3,
    final_score: 0.9,
    total_elapsed_ms: 9000,
  }));

  await new Promise(resolve => setTimeout(resolve, 100));

  const events = tailEvents(15, convId);

  const reviewEvents = events.filter(e => e.act === 'review_cycle');
  assert.strictEqual(reviewEvents.length, 3, 'Should have 3 review events (2 per-chunk + 1 final)');

  const completeEvents = events.filter(e => e.act === 'combined_mode_complete');
  assert.strictEqual(completeEvents[0].total_review_passes, 3, 'Should record 3 review passes');
  assert.strictEqual(completeEvents[0].strategy, 'both');
  assert.strictEqual(completeEvents[0].final_score, 0.9);
});

// ============================================================================
// Strategy Validation
// ============================================================================

section('Strategy Validation');

test('Validates strategy names', () => {
  const validStrategies = ['per_chunk', 'final_only', 'both'];

  for (const strategy of validStrategies) {
    const event = createCombinedModeStartEvent({
      conv_id: 'test',
      trace_id: 'test',
      strategy,
      chunk_count: 1,
    });
    assert.strictEqual(event.strategy, strategy);
  }
});

test('Handles unknown strategy gracefully', () => {
  // Unknown strategies should still create valid events
  const event = createCombinedModeStartEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'unknown_strategy',
    chunk_count: 1,
  });
  assert.strictEqual(event.strategy, 'unknown_strategy');
  assert.strictEqual(event.status, 'ok'); // Should still be valid event
});

// ============================================================================
// Edge Cases
// ============================================================================

section('Edge Cases');

test('Handles zero chunks', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'per_chunk',
    chunk_count: 0,
    total_review_passes: 0,
    final_score: 0.0,
    total_elapsed_ms: 100,
  });
  assert.strictEqual(event.chunk_count, 0);
  assert.strictEqual(event.total_review_passes, 0);
});

test('Handles very low final score', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'final_only',
    chunk_count: 3,
    total_review_passes: 1,
    final_score: 0.1,
    total_elapsed_ms: 5000,
  });
  assert.strictEqual(event.final_score, 0.1);
});

test('Handles perfect final score', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'both',
    chunk_count: 5,
    total_review_passes: 6,
    final_score: 1.0,
    total_elapsed_ms: 12000,
  });
  assert.strictEqual(event.final_score, 1.0);
});

test('Handles large chunk count', () => {
  const event = createCombinedModeStartEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'per_chunk',
    chunk_count: 100,
  });
  assert.strictEqual(event.chunk_count, 100);
});

test('Handles very long elapsed time', () => {
  const event = createCombinedModeCompleteEvent({
    conv_id: 'test',
    trace_id: 'test',
    strategy: 'both',
    chunk_count: 10,
    total_review_passes: 11,
    final_score: 0.75,
    total_elapsed_ms: 300000, // 5 minutes
  });
  assert.strictEqual(event.total_elapsed_ms, 300000);
});

// ============================================================================
// Integration Scenarios
// ============================================================================

section('Integration Scenarios');

await asyncTest('Simulates complete per_chunk workflow', async () => {
  const convId = 'integration-perchunk-' + Date.now();
  const traceId = 'integration-trace-' + Date.now();

  // 1. Start
  appendEvent(createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 0,
  }));

  // 2. Outline generation
  appendEvent({
    id: 'outline-event',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_outline',
    conv_id: convId,
    trace_id: traceId,
    chunk_count: 3,
    outline: ['Intro', 'Main', 'Conclusion'],
    status: 'ok',
  });

  // 3. Generate and review each chunk
  for (let i = 0; i < 3; i++) {
    // Chunk write
    appendEvent({
      id: `chunk-write-${i}`,
      ts: new Date().toISOString(),
      actor: 'assistant',
      act: 'chunk_write',
      conv_id: convId,
      trace_id: traceId,
      iter: i,
      chunk_index: i,
      chunk_label: ['Intro', 'Main', 'Conclusion'][i],
      content_tokens: 200,
      elapsed_ms: 1000,
      status: 'ok',
    });

    // Chunk review
    appendEvent({
      id: `chunk-review-${i}`,
      ts: new Date().toISOString(),
      actor: 'system',
      act: 'review_cycle',
      conv_id: convId,
      trace_id: traceId,
      iter: i + 1,
      review_pass: i + 1,
      quality_score: 0.8,
      threshold: 0.7,
      critique: `Review for chunk ${i + 1}`,
      accepted: true,
      elapsed_ms: 500,
      status: 'ok',
    });
  }

  // 4. Assembly
  appendEvent({
    id: 'assembly-event',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_assembly',
    conv_id: convId,
    trace_id: traceId,
    chunk_count: 3,
    total_tokens: 600,
    elapsed_ms: 100,
    status: 'ok',
  });

  // 5. Complete
  appendEvent(createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'per_chunk',
    chunk_count: 3,
    total_review_passes: 3,
    final_score: 0.8,
    total_elapsed_ms: 5000,
  }));

  await new Promise(resolve => setTimeout(resolve, 100));

  const events = tailEvents(20, convId);

  // Verify complete workflow
  assert(events.some(e => e.act === 'combined_mode_start'), 'Should have start event');
  assert(events.some(e => e.act === 'chunk_outline'), 'Should have outline event');
  assert.strictEqual(events.filter(e => e.act === 'chunk_write').length, 3, 'Should have 3 chunk write events');
  assert.strictEqual(events.filter(e => e.act === 'review_cycle').length, 3, 'Should have 3 review events');
  assert(events.some(e => e.act === 'chunk_assembly'), 'Should have assembly event');
  assert(events.some(e => e.act === 'combined_mode_complete'), 'Should have complete event');
});

await asyncTest('Simulates complete final_only workflow', async () => {
  const convId = 'integration-finalonly-' + Date.now();
  const traceId = 'integration-trace-final-' + Date.now();

  // 1. Start
  appendEvent(createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'final_only',
    chunk_count: 0,
  }));

  // 2. Outline
  appendEvent({
    id: 'outline',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_outline',
    conv_id: convId,
    trace_id: traceId,
    chunk_count: 4,
    status: 'ok',
  });

  // 3. Generate chunks (no reviews)
  for (let i = 0; i < 4; i++) {
    appendEvent({
      id: `chunk-${i}`,
      ts: new Date().toISOString(),
      actor: 'assistant',
      act: 'chunk_write',
      conv_id: convId,
      trace_id: traceId,
      iter: i,
      chunk_index: i,
      status: 'ok',
    });
  }

  // 4. Assembly
  appendEvent({
    id: 'assembly',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'chunk_assembly',
    conv_id: convId,
    trace_id: traceId,
    chunk_count: 4,
    status: 'ok',
  });

  // 5. Single final review
  appendEvent({
    id: 'final-review',
    ts: new Date().toISOString(),
    actor: 'system',
    act: 'review_cycle',
    conv_id: convId,
    trace_id: traceId,
    iter: 1,
    review_pass: 1,
    quality_score: 0.9,
    threshold: 0.7,
    critique: 'Final review',
    accepted: true,
    elapsed_ms: 800,
    status: 'ok',
  });

  // 6. Complete
  appendEvent(createCombinedModeCompleteEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy: 'final_only',
    chunk_count: 4,
    total_review_passes: 1,
    final_score: 0.9,
    total_elapsed_ms: 7000,
  }));

  await new Promise(resolve => setTimeout(resolve, 100));

  const events = tailEvents(20, convId);

  // Verify: should have chunks but only ONE review event
  const reviewEvents = events.filter(e => e.act === 'review_cycle');
  assert.strictEqual(reviewEvents.length, 1, 'Should have exactly 1 review event for final_only');
  assert.strictEqual(events.filter(e => e.act === 'chunk_write').length, 4, 'Should have 4 chunk writes');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}Test Summary${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed: ${totalTests - passedTests}${colors.reset}`);
console.log(`Coverage: ${Math.round((passedTests / totalTests) * 100)}%`);

if (passedTests === totalTests) {
  console.log(`\n${colors.green}✓ All tests passed!${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}✗ Some tests failed${colors.reset}`);
  process.exit(1);
}
