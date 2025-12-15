// Test suite for T12: Persist tool outputs to ContextLog
// Validates that tool execution events are written to ContextLog and retrievable via API

import { runTool } from './server/core/tools.mjs';
import { tailEvents, appendEvent, createToolExecutionEvent } from './server/telemetry/contextlog.mjs';
import assert from 'node:assert';
import crypto from 'node:crypto';

console.log('=== T12: Tool Output Persistence Tests ===\n');

// Test 1: Tool execution writes to ContextLog
console.log('Test 1: Tool execution writes start/finish events to ContextLog');
try {
  const testConvId = `test-conv-${crypto.randomUUID()}`;
  const testTraceId = `test-trace-${crypto.randomUUID()}`;

  // Run a simple tool with metadata
  const result = await runTool('get_time', {}, {
    conv_id: testConvId,
    trace_id: testTraceId
  });

  // Give it a moment for file writes
  await new Promise(resolve => setTimeout(resolve, 100));

  // Retrieve recent events
  const recentEvents = tailEvents(50);

  // Find our test events
  const ourEvents = recentEvents.filter(e =>
    e.conv_id === testConvId && e.trace_id === testTraceId
  );

  console.log(`  Found ${ourEvents.length} events for test conversation`);
  assert(ourEvents.length >= 2, 'Should have at least start and finish events');

  // Check for start event
  const startEvent = ourEvents.find(e => e.act === 'tool_execution_start');
  assert(startEvent, 'Should have a start event');
  assert(startEvent.name === 'get_time', 'Start event should have tool name');
  assert(startEvent.actor === 'tool', 'Start event should have actor=tool');
  console.log('  ✓ Start event found and valid');

  // Check for finish event
  const finishEvent = ourEvents.find(e => e.act === 'tool_execution_finish');
  assert(finishEvent, 'Should have a finish event');
  assert(finishEvent.name === 'get_time', 'Finish event should have tool name');
  assert(typeof finishEvent.elapsed_ms === 'number', 'Finish event should have elapsed_ms');
  assert(finishEvent.result_preview != null, 'Finish event should have result_preview');
  console.log('  ✓ Finish event found and valid');

  console.log('  ✓ Test 1 passed\n');
} catch (err) {
  console.error('  ✗ Test 1 failed:', err.message);
  process.exit(1);
}

// Test 2: Error events are logged correctly
console.log('Test 2: Tool errors write error events to ContextLog');
try {
  const testConvId = `test-conv-${crypto.randomUUID()}`;
  const testTraceId = `test-trace-${crypto.randomUUID()}`;

  // Run a tool with missing required argument to trigger an error
  const result = await runTool('echo', {}, {
    conv_id: testConvId,
    trace_id: testTraceId
  });

  // Give it a moment for file writes
  await new Promise(resolve => setTimeout(resolve, 100));

  // Retrieve recent events
  const recentEvents = tailEvents(50);

  // Find our test events
  const ourEvents = recentEvents.filter(e =>
    e.conv_id === testConvId && e.trace_id === testTraceId
  );

  console.log(`  Found ${ourEvents.length} events for test conversation`);
  assert(ourEvents.length >= 2, 'Should have start and error events');

  // Check for start event
  const startEvent = ourEvents.find(e => e.act === 'tool_execution_start');
  assert(startEvent, 'Should have a start event');
  console.log('  ✓ Start event found');

  // Check for error event
  const errorEvent = ourEvents.find(e => e.act === 'tool_execution_error');
  assert(errorEvent, 'Should have an error event');
  assert(errorEvent.name === 'echo', 'Error event should have tool name');
  assert(errorEvent.status === 'error', 'Error event should have status=error');
  assert(errorEvent.error != null, 'Error event should have error message');
  assert(errorEvent.error_type != null, 'Error event should have error_type');
  console.log('  ✓ Error event found and valid');

  console.log('  ✓ Test 2 passed\n');
} catch (err) {
  console.error('  ✗ Test 2 failed:', err.message);
  process.exit(1);
}

// Test 3: Event format matches ContextLog schema
console.log('Test 3: Event format matches ContextLog schema');
try {
  const testEvent = createToolExecutionEvent({
    phase: 'finish',
    tool: 'test_tool',
    conv_id: 'test-conv',
    trace_id: 'test-trace',
    result_preview: 'Test result',
    elapsed_ms: 100,
    result_size_bytes: 1024,
  });

  // Verify required fields
  assert(testEvent.id != null, 'Event should have id');
  assert(testEvent.ts != null, 'Event should have ts');
  assert(testEvent.actor === 'tool', 'Event should have actor=tool');
  assert(testEvent.act === 'tool_execution_finish', 'Event should have correct act');
  assert(testEvent.name === 'test_tool', 'Event should have tool name');
  assert(testEvent.conv_id === 'test-conv', 'Event should have conv_id');
  assert(testEvent.trace_id === 'test-trace', 'Event should have trace_id');
  assert(testEvent.result_preview === 'Test result', 'Event should have result_preview');
  assert(testEvent.elapsed_ms === 100, 'Event should have elapsed_ms');
  assert(testEvent.bytes === 1024, 'Event should have bytes');

  console.log('  ✓ Event format is valid');
  console.log('  ✓ Test 3 passed\n');
} catch (err) {
  console.error('  ✗ Test 3 failed:', err.message);
  process.exit(1);
}

// Test 4: Filtering by conv_id and trace_id
console.log('Test 4: Filtering events by conv_id and trace_id');
try {
  const testConvId = `test-conv-${crypto.randomUUID()}`;
  const testTraceId = `test-trace-${crypto.randomUUID()}`;

  // Run multiple tools
  await runTool('get_time', {}, { conv_id: testConvId, trace_id: testTraceId });
  await runTool('echo', { text: 'test1' }, { conv_id: testConvId, trace_id: testTraceId });

  // Give it a moment for file writes
  await new Promise(resolve => setTimeout(resolve, 100));

  // Retrieve events filtered by conv_id
  const convEvents = tailEvents(50, testConvId);
  const toolConvEvents = convEvents.filter(e => e.actor === 'tool');

  console.log(`  Found ${toolConvEvents.length} tool events for conversation`);
  assert(toolConvEvents.length >= 4, 'Should have at least 4 tool events (2 tools × 2 events)');

  // Verify all events have the same conv_id
  const allSameConv = toolConvEvents.every(e => e.conv_id === testConvId);
  assert(allSameConv, 'All events should have the same conv_id');

  // Verify all events have the same trace_id
  const allSameTrace = toolConvEvents.every(e => e.trace_id === testTraceId);
  assert(allSameTrace, 'All events should have the same trace_id');

  console.log('  ✓ Filtering works correctly');
  console.log('  ✓ Test 4 passed\n');
} catch (err) {
  console.error('  ✗ Test 4 failed:', err.message);
  process.exit(1);
}

// Test 5: Preview truncation
console.log('Test 5: Preview text is truncated correctly');
try {
  const longText = 'A'.repeat(1000);
  const testEvent = createToolExecutionEvent({
    phase: 'finish',
    tool: 'test_tool',
    conv_id: 'test-conv',
    trace_id: 'test-trace',
    result_preview: longText,
    elapsed_ms: 100,
    result_size_bytes: 1000,
  });

  // Should be truncated to ~500 chars + '...'
  assert(testEvent.result_preview.length <= 503, 'Preview should be truncated to ~500 chars');
  assert(testEvent.result_preview.endsWith('...'), 'Truncated preview should end with ...');

  console.log('  ✓ Preview truncation works correctly');
  console.log('  ✓ Test 5 passed\n');
} catch (err) {
  console.error('  ✗ Test 5 failed:', err.message);
  process.exit(1);
}

console.log('=== All T12 Tests Passed ===');
console.log('\nSummary:');
console.log('  ✓ Tool executions write to ContextLog');
console.log('  ✓ Start/finish/error events are logged correctly');
console.log('  ✓ Event format matches ContextLog schema');
console.log('  ✓ Filtering by conv_id and trace_id works');
console.log('  ✓ Preview text truncation works correctly');
console.log('\nNext steps:');
console.log('  1. Start the frontend server: npm --prefix frontend run dev');
console.log('  2. Execute a tool via chat UI or API');
console.log('  3. Check DiagnosticsDrawer for tool execution history');
console.log('  4. Verify events in .forgekeeper/context_log/*.jsonl');
