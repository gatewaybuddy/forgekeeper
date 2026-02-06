#!/usr/bin/env node
/**
 * Tests for ACE Bypass Mode
 *
 * Run with: node tests/test-ace-bypass.js
 */

import {
  BYPASS_MODES,
  getBypassMode,
  isBypassed,
  setTemporaryBypass,
  clearTemporaryBypass,
  getBypassStats,
  resetBypassStats,
  getRemainingBypassTime,
} from '../core/ace/bypass.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
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
  console.log('\n=== ACE Bypass Tests ===\n');

  // Reset state before tests
  clearTemporaryBypass();
  resetBypassStats();

  // ===== Constants Tests =====
  console.log('--- Constants Tests ---\n');

  await test('BYPASS_MODES are defined', async () => {
    assertEqual(BYPASS_MODES.OFF, 'off', 'Should have OFF');
    assertEqual(BYPASS_MODES.LOG_ONLY, 'log-only', 'Should have LOG_ONLY');
    assertEqual(BYPASS_MODES.DISABLED, 'disabled', 'Should have DISABLED');
  });

  // ===== Default State Tests =====
  console.log('\n--- Default State Tests ---\n');

  await test('Default bypass mode is off', async () => {
    clearTemporaryBypass();
    const mode = getBypassMode();
    assertEqual(mode.mode, BYPASS_MODES.OFF, 'Should be off by default');
    assertEqual(mode.isTemporary, false, 'Should not be temporary');
  });

  await test('Default isBypassed returns false', async () => {
    clearTemporaryBypass();
    const result = isBypassed();
    assertEqual(result.bypassed, false, 'Should not be bypassed');
    assertEqual(result.mode, BYPASS_MODES.OFF, 'Mode should be off');
  });

  // ===== Temporary Bypass Tests =====
  console.log('\n--- Temporary Bypass Tests ---\n');

  await test('setTemporaryBypass parses duration correctly', async () => {
    // Seconds
    const s = setTemporaryBypass('30s');
    assert(s.success, 'Should succeed with 30s');
    clearTemporaryBypass();

    // Minutes
    const m = setTemporaryBypass('5m');
    assert(m.success, 'Should succeed with 5m');
    clearTemporaryBypass();

    // Hours
    const h = setTemporaryBypass('1h');
    assert(h.success, 'Should succeed with 1h');
    clearTemporaryBypass();

    // Days
    const d = setTemporaryBypass('2d');
    assert(d.success, 'Should succeed with 2d');
    clearTemporaryBypass();
  });

  await test('setTemporaryBypass rejects invalid duration', async () => {
    const result = setTemporaryBypass('invalid');
    assertEqual(result.success, false, 'Should fail with invalid');
    assert(result.error.includes('Invalid duration'), 'Error should mention invalid duration');
  });

  await test('setTemporaryBypass sets log-only mode by default', async () => {
    const result = setTemporaryBypass('1h');
    assert(result.success, 'Should succeed');
    assertEqual(result.mode, BYPASS_MODES.LOG_ONLY, 'Should be log-only');

    const mode = getBypassMode();
    assertEqual(mode.mode, BYPASS_MODES.LOG_ONLY, 'Mode should be log-only');
    assertEqual(mode.isTemporary, true, 'Should be temporary');

    clearTemporaryBypass();
  });

  await test('setTemporaryBypass respects mode option', async () => {
    const result = setTemporaryBypass('1h', { mode: BYPASS_MODES.DISABLED });
    assert(result.success, 'Should succeed');
    assertEqual(result.mode, BYPASS_MODES.DISABLED, 'Should be disabled');

    const mode = getBypassMode();
    assertEqual(mode.mode, BYPASS_MODES.DISABLED, 'Mode should be disabled');

    clearTemporaryBypass();
  });

  await test('setTemporaryBypass rejects off mode', async () => {
    const result = setTemporaryBypass('1h', { mode: BYPASS_MODES.OFF });
    assertEqual(result.success, false, 'Should fail with off mode');
    assert(result.error.includes('Invalid bypass mode'), 'Error should mention invalid mode');
  });

  await test('setTemporaryBypass caps at 24 hours', async () => {
    const result = setTemporaryBypass('7d');
    assert(result.success, 'Should succeed');

    // Check that expiry is within 24 hours
    const now = new Date();
    const maxExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1000);
    assert(result.expiresAt <= maxExpiry, 'Should cap at 24 hours');

    clearTemporaryBypass();
  });

  await test('clearTemporaryBypass clears bypass', async () => {
    setTemporaryBypass('1h');
    clearTemporaryBypass();

    const mode = getBypassMode();
    assertEqual(mode.mode, BYPASS_MODES.OFF, 'Should be off after clear');
    assertEqual(mode.isTemporary, false, 'Should not be temporary');
  });

  // ===== isBypassed Tests =====
  console.log('\n--- isBypassed Tests ---\n');

  await test('isBypassed returns true in log-only mode', async () => {
    setTemporaryBypass('1h', { mode: BYPASS_MODES.LOG_ONLY });

    const result = isBypassed('git:commit:local');
    assertEqual(result.bypassed, true, 'Should be bypassed');
    assertEqual(result.mode, BYPASS_MODES.LOG_ONLY, 'Should be log-only');

    clearTemporaryBypass();
  });

  await test('isBypassed returns true in disabled mode', async () => {
    setTemporaryBypass('1h', { mode: BYPASS_MODES.DISABLED });

    const result = isBypassed('git:commit:local');
    assertEqual(result.bypassed, true, 'Should be bypassed');
    assertEqual(result.mode, BYPASS_MODES.DISABLED, 'Should be disabled');

    clearTemporaryBypass();
  });

  await test('Hard ceiling actions cannot be bypassed', async () => {
    setTemporaryBypass('1h', { mode: BYPASS_MODES.DISABLED });

    const credentials = isBypassed('api:credentials:read');
    assertEqual(credentials.bypassed, false, 'Credentials should not be bypassed');
    assertEqual(credentials.hardCeilingBlocked, true, 'Should be hard ceiling blocked');

    const selfModify = isBypassed('self:modify:ace-thresholds');
    assertEqual(selfModify.bypassed, false, 'Self-modify should not be bypassed');
    assertEqual(selfModify.hardCeilingBlocked, true, 'Should be hard ceiling blocked');

    const execute = isBypassed('code:execute:external');
    assertEqual(execute.bypassed, false, 'External execute should not be bypassed');
    assertEqual(execute.hardCeilingBlocked, true, 'Should be hard ceiling blocked');

    clearTemporaryBypass();
  });

  // ===== Stats Tests =====
  console.log('\n--- Stats Tests ---\n');

  await test('getBypassStats tracks bypass count', async () => {
    resetBypassStats();

    setTemporaryBypass('1h');
    setTemporaryBypass('30m');
    setTemporaryBypass('2h');

    const stats = getBypassStats();
    assertEqual(stats.temporaryBypassCount, 3, 'Should count 3 bypasses');

    clearTemporaryBypass();
  });

  await test('getBypassStats tracks actions while bypassed', async () => {
    resetBypassStats();
    setTemporaryBypass('1h');

    isBypassed('git:commit:local');
    isBypassed('git:push:remote');
    isBypassed('filesystem:write:local');

    const stats = getBypassStats();
    assertEqual(stats.actionsWhileBypassed, 3, 'Should count 3 actions');

    clearTemporaryBypass();
  });

  await test('getBypassStats tracks hard ceiling blocks', async () => {
    resetBypassStats();
    setTemporaryBypass('1h');

    isBypassed('code:execute:external');
    isBypassed('self:modify:ace-thresholds');

    const stats = getBypassStats();
    assertEqual(stats.hardCeilingBlockedDuringBypass, 2, 'Should count 2 blocks');

    clearTemporaryBypass();
  });

  await test('resetBypassStats clears stats', async () => {
    setTemporaryBypass('1h');
    isBypassed('git:commit:local');
    isBypassed('code:execute:external');

    resetBypassStats();
    clearTemporaryBypass();

    const stats = getBypassStats();
    assertEqual(stats.temporaryBypassCount, 0, 'Should be 0');
    assertEqual(stats.actionsWhileBypassed, 0, 'Should be 0');
    assertEqual(stats.hardCeilingBlockedDuringBypass, 0, 'Should be 0');
  });

  // ===== Remaining Time Tests =====
  console.log('\n--- Remaining Time Tests ---\n');

  await test('getRemainingBypassTime returns null when not active', async () => {
    clearTemporaryBypass();
    const remaining = getRemainingBypassTime();
    assertEqual(remaining, null, 'Should be null when not active');
  });

  await test('getRemainingBypassTime returns formatted time', async () => {
    setTemporaryBypass('1h');

    const remaining = getRemainingBypassTime();
    assert(remaining !== null, 'Should not be null');
    assert(remaining.includes('remaining'), 'Should include "remaining"');

    clearTemporaryBypass();
  });

  // ===== Cleanup =====
  clearTemporaryBypass();
  resetBypassStats();

  // ===== Results =====
  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
