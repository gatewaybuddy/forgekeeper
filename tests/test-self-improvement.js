#!/usr/bin/env node
/**
 * Tests for Self-Improvement Pipeline
 *
 * Run with: node tests/test-self-improvement.js
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  classifyImprovement,
  checkTripwires,
  snapshotState,
  rollback,
  generateDigest,
  getStats,
  pause,
  resume,
  resetState,
  processImprovement,
  getJournalPath,
} from '../core/self-improvement.js';
import {
  hasHardCeiling,
  requiresDeliberation,
  getDefaultReversibility,
  getDefaultBlastRadius,
} from '../core/ace/action-classes.js';
import { TIERS } from '../core/ace/scorer.js';

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

// Temp directory for test files
const TEST_DIR = join(process.cwd(), 'tests', '_tmp_si_test');

function setupTestDir() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  try {
    const files = ['test_a.txt', 'test_b.txt', 'test_new.txt'];
    for (const f of files) {
      const p = join(TEST_DIR, f);
      if (existsSync(p)) unlinkSync(p);
    }
  } catch { /* ignore */ }
}

async function runTests() {
  console.log('\n=== Self-Improvement Pipeline Tests ===\n');

  setupTestDir();

  // ===== Classification Tests =====
  console.log('--- Classification Tests ---\n');

  await test('classifyImprovement maps reflection to correct action class', async () => {
    assertEqual(classifyImprovement('reflection'), 'self:improve:reflection');
  });

  await test('classifyImprovement maps skill to correct action class', async () => {
    assertEqual(classifyImprovement('skill'), 'self:improve:skill');
  });

  await test('classifyImprovement maps plugin to correct action class', async () => {
    assertEqual(classifyImprovement('plugin'), 'self:improve:plugin');
  });

  await test('classifyImprovement maps config to correct action class', async () => {
    assertEqual(classifyImprovement('config'), 'self:improve:config');
  });

  await test('classifyImprovement maps core to correct action class', async () => {
    assertEqual(classifyImprovement('core'), 'self:improve:core');
  });

  await test('classifyImprovement defaults unknown types to core', async () => {
    assertEqual(classifyImprovement('unknown'), 'self:improve:core');
  });

  // ===== Action Class Integration Tests =====
  console.log('\n--- Action Class Integration Tests ---\n');

  await test('self:improve:core has hard ceiling', async () => {
    assert(hasHardCeiling('self:improve:core'), 'core should have hard ceiling');
  });

  await test('self:improve:reflection does NOT have hard ceiling', async () => {
    assert(!hasHardCeiling('self:improve:reflection'), 'reflection should not have hard ceiling');
  });

  await test('self:improve:skill requires deliberation', async () => {
    assert(requiresDeliberation('self:improve:skill'), 'skill should require deliberation');
  });

  await test('self:improve:plugin requires deliberation', async () => {
    assert(requiresDeliberation('self:improve:plugin'), 'plugin should require deliberation');
  });

  await test('self:improve:config requires deliberation', async () => {
    assert(requiresDeliberation('self:improve:config'), 'config should require deliberation');
  });

  await test('self:improve:reflection does NOT require deliberation', async () => {
    assert(!requiresDeliberation('self:improve:reflection'), 'reflection should not require deliberation');
  });

  await test('self:improve:reflection has R=0.9', async () => {
    assertEqual(getDefaultReversibility('self:improve:reflection'), 0.9);
  });

  await test('self:improve:skill has R=0.7', async () => {
    assertEqual(getDefaultReversibility('self:improve:skill'), 0.7);
  });

  await test('self:improve:config has R=0.5', async () => {
    assertEqual(getDefaultReversibility('self:improve:config'), 0.5);
  });

  await test('self:improve:core has R=0.1', async () => {
    assertEqual(getDefaultReversibility('self:improve:core'), 0.1);
  });

  await test('self:improve:reflection has B=0.9', async () => {
    assertEqual(getDefaultBlastRadius('self:improve:reflection'), 0.9);
  });

  await test('self:improve:plugin has B=0.65', async () => {
    assertEqual(getDefaultBlastRadius('self:improve:plugin'), 0.65);
  });

  // ===== Tripwire Tests =====
  console.log('\n--- Tripwire Tests ---\n');

  await test('checkTripwires passes when within limits', async () => {
    resetState();
    const result = checkTripwires();
    assertEqual(result.ok, true, 'Should be ok');
    assertEqual(result.reason, null, 'Should have no reason');
  });

  await test('checkTripwires blocks when paused', async () => {
    resetState();
    pause('Test pause');
    const result = checkTripwires();
    assertEqual(result.ok, false, 'Should not be ok');
    assert(result.reason.includes('Paused'), 'Should mention paused');
    resetState();
  });

  await test('pause and resume work correctly', async () => {
    resetState();
    pause('Test reason');
    let stats = getStats();
    assertEqual(stats.paused, true, 'Should be paused');
    assertEqual(stats.pauseReason, 'Test reason', 'Should have reason');

    resume();
    stats = getStats();
    assertEqual(stats.paused, false, 'Should not be paused');
    assertEqual(stats.pauseReason, null, 'Should have no reason');
  });

  await test('getStats returns correct structure', async () => {
    resetState();
    const stats = getStats();
    assert('enabled' in stats, 'Should have enabled');
    assert('appliedThisHour' in stats, 'Should have appliedThisHour');
    assert('appliedToday' in stats, 'Should have appliedToday');
    assert('consecutiveFailures' in stats, 'Should have consecutiveFailures');
    assert('paused' in stats, 'Should have paused');
    assert('config' in stats, 'Should have config');
  });

  // ===== Snapshot and Rollback Tests =====
  console.log('\n--- Snapshot & Rollback Tests ---\n');

  await test('snapshotState captures existing file content', async () => {
    cleanupTestDir();
    const testFile = join(TEST_DIR, 'test_a.txt');
    writeFileSync(testFile, 'original content');

    const snapshot = snapshotState([{ file: testFile }]);
    assertEqual(snapshot.get(testFile), 'original content', 'Should capture original content');
    cleanupTestDir();
  });

  await test('snapshotState captures null for non-existent files', async () => {
    cleanupTestDir();
    const testFile = join(TEST_DIR, 'test_new.txt');
    if (existsSync(testFile)) unlinkSync(testFile);

    const snapshot = snapshotState([{ file: testFile }]);
    assertEqual(snapshot.get(testFile), null, 'Should be null for non-existent file');
  });

  await test('rollback restores file to original content', async () => {
    cleanupTestDir();
    const testFile = join(TEST_DIR, 'test_a.txt');
    writeFileSync(testFile, 'original');

    const snapshot = snapshotState([{ file: testFile }]);
    writeFileSync(testFile, 'modified');
    assertEqual(readFileSync(testFile, 'utf-8'), 'modified', 'Should be modified');

    rollback(snapshot);
    assertEqual(readFileSync(testFile, 'utf-8'), 'original', 'Should be restored');
    cleanupTestDir();
  });

  await test('rollback removes file that did not exist before', async () => {
    cleanupTestDir();
    const testFile = join(TEST_DIR, 'test_new.txt');
    if (existsSync(testFile)) unlinkSync(testFile);

    const snapshot = snapshotState([{ file: testFile }]);
    writeFileSync(testFile, 'new content');
    assert(existsSync(testFile), 'File should exist after write');

    rollback(snapshot);
    assert(!existsSync(testFile), 'File should be removed after rollback');
  });

  await test('rollback handles multiple files', async () => {
    cleanupTestDir();
    const fileA = join(TEST_DIR, 'test_a.txt');
    const fileB = join(TEST_DIR, 'test_b.txt');
    writeFileSync(fileA, 'content_a');
    writeFileSync(fileB, 'content_b');

    const snapshot = snapshotState([{ file: fileA }, { file: fileB }]);
    writeFileSync(fileA, 'changed_a');
    writeFileSync(fileB, 'changed_b');

    rollback(snapshot);
    assertEqual(readFileSync(fileA, 'utf-8'), 'content_a', 'File A should be restored');
    assertEqual(readFileSync(fileB, 'utf-8'), 'content_b', 'File B should be restored');
    cleanupTestDir();
  });

  // ===== Digest Tests =====
  console.log('\n--- Digest Tests ---\n');

  await test('generateDigest returns correct structure', async () => {
    const digest = generateDigest(7);
    assert('period' in digest, 'Should have period');
    assert('total' in digest, 'Should have total');
    assert('byOutcome' in digest, 'Should have byOutcome');
    assert('byType' in digest, 'Should have byType');
    assert('paused' in digest, 'Should have paused');
    assert('entries' in digest, 'Should have entries');
  });

  await test('generateDigest byOutcome has all outcome keys', async () => {
    const digest = generateDigest(7);
    const outcomes = digest.byOutcome;
    assert('applied' in outcomes, 'Should have applied');
    assert('rolled_back' in outcomes, 'Should have rolled_back');
    assert('review_rejected' in outcomes, 'Should have review_rejected');
    assert('awaiting_approval' in outcomes, 'Should have awaiting_approval');
    assert('rate_limited' in outcomes, 'Should have rate_limited');
  });

  // ===== processImprovement Integration Tests =====
  console.log('\n--- processImprovement Tests ---\n');

  await test('processImprovement returns disabled when SI is off', async () => {
    resetState();
    // config.selfImprovement.enabled is false by default in test env
    const result = await processImprovement({
      type: 'reflection',
      description: 'test',
      changes: [{ file: '/tmp/test.txt', content: 'test' }],
      reason: 'test',
      origin: 'autonomous',
    });
    assertEqual(result.outcome, 'disabled', 'Should return disabled outcome');
    assertEqual(result.applied, false, 'Should not apply');
  });

  await test('processImprovement rejects invalid input', async () => {
    resetState();
    // Temporarily enable for this test (we override the config check)
    const origEnabled = config.selfImprovement?.enabled;
    if (config.selfImprovement) config.selfImprovement.enabled = true;

    const result = await processImprovement(null);
    assertEqual(result.outcome, 'invalid', 'Should return invalid for null');

    const result2 = await processImprovement({ type: 'reflection' });
    assertEqual(result2.outcome, 'invalid', 'Should return invalid for missing changes');

    if (config.selfImprovement) config.selfImprovement.enabled = origEnabled;
  });

  await test('processImprovement blocks when paused', async () => {
    resetState();
    const origEnabled = config.selfImprovement?.enabled;
    if (config.selfImprovement) config.selfImprovement.enabled = true;

    pause('Test');
    const result = await processImprovement({
      type: 'reflection',
      description: 'test',
      changes: [{ file: '/tmp/test.txt', content: 'test' }],
      reason: 'test',
      origin: 'autonomous',
    });
    assertEqual(result.outcome, 'rate_limited', 'Should be rate limited when paused');

    if (config.selfImprovement) config.selfImprovement.enabled = origEnabled;
    resetState();
  });

  // ===== Results =====
  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  cleanupTestDir();

  if (failed > 0) {
    console.log('\n\u274c Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n\u2705 All tests passed!');
    process.exit(0);
  }
}

// Need config import for integration tests
import { config } from '../config.js';

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
