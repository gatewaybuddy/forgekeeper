#!/usr/bin/env node
/**
 * Tests for Elevation Module
 *
 * Run with: node tests/test-elevation.js
 */

import {
  ELEVATION_LEVELS,
  isEnabled,
  getElevationStatus,
  isElevated,
  requestElevation,
  approveElevation,
  denyElevation,
  executeElevated,
  revokeElevation,
  revokeAllElevations,
  onElevationEvent,
  offElevationEvent,
  getStats,
  cleanupExpired,
} from '../core/security/elevation.js';

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
  console.log('\n=== Elevation Tests ===\n');

  // Clean up before tests
  revokeAllElevations();

  // Test: ELEVATION_LEVELS are defined
  await test('ELEVATION_LEVELS are defined', async () => {
    assert(ELEVATION_LEVELS.STANDARD === 'standard', 'Should have STANDARD');
    assert(ELEVATION_LEVELS.ELEVATED === 'elevated', 'Should have ELEVATED');
    assert(ELEVATION_LEVELS.MAINTENANCE === 'maintenance', 'Should have MAINTENANCE');
  });

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
    assert('defaultTimeout' in stats, 'Should have defaultTimeout');
    assert('activeCount' in stats, 'Should have activeCount');
    assert('pendingCount' in stats, 'Should have pendingCount');
    assert('listenerCount' in stats, 'Should have listenerCount');
  });

  // Test: Stats values are reasonable
  await test('getStats returns reasonable values', async () => {
    const stats = getStats();

    assert(stats.defaultTimeout >= 10000, 'timeout should be at least 10 seconds');
    assert(stats.activeCount >= 0, 'activeCount should be non-negative');
    assert(stats.pendingCount >= 0, 'pendingCount should be non-negative');
  });

  // Test: getElevationStatus returns proper structure
  await test('getElevationStatus returns proper structure', async () => {
    const status = getElevationStatus();

    assert('enabled' in status, 'Should have enabled');
    assert('activeCount' in status, 'Should have activeCount');
    assert('pendingCount' in status, 'Should have pendingCount');
    assert(Array.isArray(status.active), 'active should be array');
    assert(Array.isArray(status.pending), 'pending should be array');
  });

  // Test: isElevated returns false when not elevated
  await test('isElevated returns false when not elevated', async () => {
    const elevated = isElevated('file:/tmp/test.txt');
    assertEqual(elevated, false, 'Should not be elevated');
  });

  // Test: requestElevation requires scope
  await test('requestElevation requires scope', async () => {
    const result = requestElevation({ reason: 'test' });
    assertEqual(result.success, false, 'Should fail without scope');
    assert(result.error.includes('Scope'), 'Error should mention scope');
  });

  // Test: requestElevation requires reason
  await test('requestElevation requires reason', async () => {
    const result = requestElevation({ scope: 'file:/tmp/*' });
    assertEqual(result.success, false, 'Should fail without reason');
    assert(result.error.includes('Reason'), 'Error should mention reason');
  });

  // Test: requestElevation creates pending request
  await test('requestElevation creates pending request', async () => {
    const result = requestElevation({
      scope: 'file:/tmp/test1.txt',
      reason: 'Test elevation request',
    });

    assertEqual(result.success, true, 'Should succeed');
    assert(result.requestId, 'Should have requestId');
    assertEqual(result.status, 'pending', 'Should be pending');

    // Check in status
    const status = getElevationStatus();
    assert(status.pendingCount > 0, 'Should have pending requests');

    // Clean up
    revokeElevation(result.requestId);
  });

  // Test: approveElevation grants elevation
  await test('approveElevation grants elevation', async () => {
    const request = requestElevation({
      scope: 'file:/tmp/test2.txt',
      reason: 'Test approval',
    });

    const approval = approveElevation(request.requestId);

    assertEqual(approval.success, true, 'Should succeed');
    assertEqual(approval.status, 'approved', 'Should be approved');
    assert(approval.expiresAt, 'Should have expiration');

    // Check elevated status
    const elevated = isElevated('file:/tmp/test2.txt');
    assertEqual(elevated, true, 'Should be elevated now');

    // Clean up
    revokeElevation(request.requestId);
  });

  // Test: denyElevation removes pending request
  await test('denyElevation removes pending request', async () => {
    const request = requestElevation({
      scope: 'file:/tmp/test3.txt',
      reason: 'Test denial',
    });

    const denial = denyElevation(request.requestId, 'Testing denial');

    assertEqual(denial.success, true, 'Should succeed');
    assertEqual(denial.status, 'denied', 'Should be denied');

    // Should not be elevated
    const elevated = isElevated('file:/tmp/test3.txt');
    assertEqual(elevated, false, 'Should not be elevated');
  });

  // Test: revokeElevation removes active elevation
  await test('revokeElevation removes active elevation', async () => {
    const request = requestElevation({
      scope: 'file:/tmp/test4.txt',
      reason: 'Test revocation',
    });

    approveElevation(request.requestId);

    // Should be elevated
    assertEqual(isElevated('file:/tmp/test4.txt'), true, 'Should be elevated');

    // Revoke
    const result = revokeElevation(request.requestId);
    assertEqual(result.success, true, 'Should succeed');

    // Should not be elevated anymore
    assertEqual(isElevated('file:/tmp/test4.txt'), false, 'Should not be elevated');
  });

  // Test: revokeAllElevations clears everything
  await test('revokeAllElevations clears everything', async () => {
    // Create some requests and approvals
    const req1 = requestElevation({ scope: 'file:/tmp/a.txt', reason: 'Test 1' });
    const req2 = requestElevation({ scope: 'file:/tmp/b.txt', reason: 'Test 2' });
    approveElevation(req1.requestId);

    // Revoke all
    const result = revokeAllElevations();

    assertEqual(result.success, true, 'Should succeed');

    // Check all cleared
    const status = getElevationStatus();
    assertEqual(status.activeCount, 0, 'Should have no active');
    assertEqual(status.pendingCount, 0, 'Should have no pending');
  });

  // Test: executeElevated succeeds when elevated
  await test('executeElevated succeeds when elevated', async () => {
    const request = requestElevation({
      scope: 'command:test',
      reason: 'Test execution',
    });

    approveElevation(request.requestId);

    const result = await executeElevated('command:test', async () => {
      return 'success';
    });

    assertEqual(result.success, true, 'Should succeed');
    assertEqual(result.result, 'success', 'Should have result');
    assert(result.usedElevation, 'Should track used elevation');

    // Clean up
    revokeElevation(request.requestId);
  });

  // Test: executeElevated fails when not elevated
  await test('executeElevated fails when not elevated', async () => {
    const result = await executeElevated('command:forbidden', async () => {
      return 'should not run';
    });

    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('Not elevated'), 'Error should mention not elevated');
  });

  // Test: Scope wildcard matching
  await test('scope wildcard matching works', async () => {
    const request = requestElevation({
      scope: 'file:/tmp/*',
      reason: 'Test wildcard',
    });

    approveElevation(request.requestId);

    // Should match specific files under /tmp
    assertEqual(isElevated('file:/tmp/test.txt'), true, 'Should match file');
    assertEqual(isElevated('file:/tmp/subdir/file.txt'), true, 'Should match subdir');

    // Should not match other paths
    assertEqual(isElevated('file:/var/test.txt'), false, 'Should not match /var');

    // Clean up
    revokeElevation(request.requestId);
  });

  // Test: Event listener registration
  await test('onElevationEvent registers listener', async () => {
    const initialStats = getStats();
    const initialCount = initialStats.listenerCount;

    const callback = () => {};
    onElevationEvent(callback);

    const newStats = getStats();
    assertEqual(newStats.listenerCount, initialCount + 1, 'Should increment listener count');

    // Clean up
    offElevationEvent(callback);
  });

  // Test: Event listener receives events
  await test('event listener receives events', async () => {
    let receivedEvent = null;

    const callback = (event) => {
      receivedEvent = event;
    };

    onElevationEvent(callback);

    const request = requestElevation({
      scope: 'file:/tmp/event-test.txt',
      reason: 'Test event',
    });

    // Should have received the event
    assert(receivedEvent, 'Should receive event');
    assertEqual(receivedEvent.type, 'elevation_requested', 'Should be request event');
    assertEqual(receivedEvent.requestId, request.requestId, 'Should have correct requestId');

    // Clean up
    offElevationEvent(callback);
    revokeElevation(request.requestId);
  });

  // Test: cleanupExpired returns number
  await test('cleanupExpired returns cleanup count', async () => {
    const cleaned = cleanupExpired();
    assert(typeof cleaned === 'number', 'Should return number');
    assert(cleaned >= 0, 'Should be non-negative');
  });

  // Test: approveElevation handles unknown request
  await test('approveElevation handles unknown request', async () => {
    const result = approveElevation('nonexistent-request-id');
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('not found'), 'Error should mention not found');
  });

  // Test: denyElevation handles unknown request
  await test('denyElevation handles unknown request', async () => {
    const result = denyElevation('nonexistent-request-id');
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('not found'), 'Error should mention not found');
  });

  // Test: revokeElevation handles unknown request
  await test('revokeElevation handles unknown request', async () => {
    const result = revokeElevation('nonexistent-request-id');
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('not found'), 'Error should mention not found');
  });

  // Test: Single-use elevation
  await test('single-use elevation is consumed after use', async () => {
    const request = requestElevation({
      scope: 'command:single-use-test',
      reason: 'Test single use',
    });

    approveElevation(request.requestId, { singleUse: true });

    // Should be elevated
    assertEqual(isElevated('command:single-use-test'), true, 'Should be elevated');

    // Execute once
    await executeElevated('command:single-use-test', async () => 'done');

    // Should no longer be elevated
    assertEqual(isElevated('command:single-use-test'), false, 'Should not be elevated after use');
  });

  // Final cleanup
  revokeAllElevations();

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
