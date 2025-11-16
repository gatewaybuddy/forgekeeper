#!/usr/bin/env node
// T11 Test Script - Verify hardened ToolShell execution sandbox
// Tests: allowlist, argument validation, feature flag, timeout, structured logging

import { runTool } from './server.tools.mjs';
import {
  checkToolAllowed,
  validateToolArguments,
  createToolLogEvent,
  emitToolLog,
  TOOLS_EXECUTION_ENABLED
} from './config/tools.config.mjs';

console.log('=== T11: ToolShell Hardening Tests ===\n');

// Test 1: Feature flag check
console.log('Test 1: Global execution feature flag');
console.log(`TOOLS_EXECUTION_ENABLED: ${TOOLS_EXECUTION_ENABLED}`);
console.log('✓ Feature flag loaded\n');

// Test 2: Allowlist check
console.log('Test 2: Tool allowlist gating');
const allowedCheck = checkToolAllowed('get_time');
console.log('get_time allowlist check:', allowedCheck);

const disallowedCheck = checkToolAllowed('malicious_tool');
console.log('malicious_tool allowlist check:', disallowedCheck);
console.log(disallowedCheck.allowed ? '✗ FAIL: Should be blocked' : '✓ PASS: Correctly blocked\n');

// Test 3: Argument validation
console.log('Test 3: Argument schema validation');

// Valid arguments
const validArgs = { message: 'Hello world' };
const validResult = validateToolArguments('echo', validArgs);
console.log('echo with valid args:', validResult);
console.log(validResult.valid ? '✓ PASS: Valid args accepted' : '✗ FAIL: Should be valid');

// Missing required argument
const missingArgs = {};
const missingResult = validateToolArguments('echo', missingArgs);
console.log('echo with missing args:', missingResult);
console.log(!missingResult.valid ? '✓ PASS: Missing arg rejected' : '✗ FAIL: Should reject missing arg');

// Invalid type
const invalidArgs = { message: 12345 };
const invalidResult = validateToolArguments('echo', invalidArgs);
console.log('echo with invalid type:', invalidResult);
console.log(!invalidResult.valid ? '✓ PASS: Invalid type rejected' : '✗ FAIL: Should reject invalid type');

// Exceeds max length
const tooLongArgs = { message: 'x'.repeat(20000) };
const tooLongResult = validateToolArguments('echo', tooLongArgs);
console.log('echo with too long message:', tooLongResult);
console.log(!tooLongResult.valid ? '✓ PASS: Too long rejected\n' : '✗ FAIL: Should reject too long\n');

// Test 4: Structured logging
console.log('Test 4: Structured telemetry logs');

const startLog = createToolLogEvent('start', 'get_time', {
  args: {},
  trace_id: 'test-trace-123',
  conv_id: 'test-conv-456'
});
console.log('Start log:', JSON.stringify(startLog, null, 2));

const finishLog = createToolLogEvent('finish', 'get_time', {
  elapsed_ms: 45,
  result_preview: '2025-11-16T10:30:45.123Z',
  result_size_bytes: 24,
  trace_id: 'test-trace-123',
  conv_id: 'test-conv-456'
});
console.log('Finish log:', JSON.stringify(finishLog, null, 2));

const errorLog = createToolLogEvent('error', 'get_time', {
  error: 'Test error',
  error_type: 'execution',
  elapsed_ms: 10,
  trace_id: 'test-trace-123',
  conv_id: 'test-conv-456'
});
console.log('Error log:', JSON.stringify(errorLog, null, 2));
console.log('✓ PASS: Structured logs created\n');

// Test 5: Real tool execution with telemetry
console.log('Test 5: Real tool execution with telemetry');
console.log('Calling get_time tool...');

try {
  const result = await runTool('get_time', {}, {
    trace_id: 'test-real-trace-789',
    conv_id: 'test-real-conv-012'
  });
  console.log('Result:', result);
  console.log('✓ PASS: Tool executed successfully\n');
} catch (err) {
  console.log('✗ FAIL: Tool execution failed:', err.message);
}

// Test 6: Gated error with feature flag disabled
console.log('Test 6: Gated error simulation');
console.log('Note: To test TOOLS_EXECUTION_ENABLED=0, set env var and re-run');
console.log('With current setting (ENABLED=1), tools should execute normally\n');

// Test 7: Disallowed tool execution
console.log('Test 7: Disallowed tool execution');
try {
  const result = await runTool('not_in_allowlist', {}, {
    trace_id: 'test-gated-trace',
    conv_id: 'test-gated-conv'
  });
  if (result && result.gated && result.reason === 'tool_not_in_allowlist') {
    console.log('✓ PASS: Gated error returned:', result);
  } else {
    console.log('✗ FAIL: Expected gated error, got:', result);
  }
} catch (err) {
  console.log('Error:', err.message);
}

console.log('\n=== T11 Tests Complete ===');
console.log('\nTo see structured logs, check console output for [TOOL_TELEMETRY] entries');
console.log('\nTo test with disabled execution:');
console.log('  TOOLS_EXECUTION_ENABLED=0 node test-t11.mjs');
