#!/usr/bin/env node
/**
 * Tests for ACE Precedent Memory
 *
 * Run with: node tests/test-ace-precedent.js
 */

import fs from 'fs/promises';
import path from 'path';
import {
  recordAction,
  recordOutcome,
  getPrecedent,
  decayScores,
  getAuditSummary,
  resetPrecedent,
  clearCache,
  getMemoryPath,
  getRawMemory,
  PRECEDENT_CEILING,
  PRECEDENT_FLOOR,
} from '../core/ace/precedent-memory.js';

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

function assertClose(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ~${expected} but got ${actual}`);
  }
}

async function cleanup() {
  clearCache();
  try {
    await fs.unlink(getMemoryPath());
  } catch (err) {
    // File may not exist
  }
}

async function runTests() {
  console.log('\n=== ACE Precedent Memory Tests ===\n');

  // Cleanup before tests
  await cleanup();

  // ===== Constants Tests =====
  console.log('--- Constants Tests ---\n');

  await test('PRECEDENT_CEILING is 0.95', async () => {
    assertEqual(PRECEDENT_CEILING, 0.95, 'Ceiling should be 0.95');
  });

  await test('PRECEDENT_FLOOR is 0.0', async () => {
    assertEqual(PRECEDENT_FLOOR, 0.0, 'Floor should be 0.0');
  });

  // ===== Basic Recording Tests =====
  console.log('\n--- Basic Recording Tests ---\n');

  await test('recordAction creates new class entry', async () => {
    await cleanup();

    const result = await recordAction({
      class: 'test:action:one',
      details: 'Test action',
      tier: 'deliberate',
    });

    assertEqual(result.success, true, 'Should succeed');
    assertEqual(result.precedent, 0, 'Initial precedent should be 0');

    const memory = await getRawMemory();
    assert(memory.classes['test:action:one'], 'Should create class entry');
    assertEqual(memory.classes['test:action:one'].instances.length, 1, 'Should have 1 instance');
  });

  await test('recordAction adds to existing class', async () => {
    await cleanup();

    await recordAction({ class: 'test:action:two', details: 'First' });
    await recordAction({ class: 'test:action:two', details: 'Second' });
    await recordAction({ class: 'test:action:two', details: 'Third' });

    const memory = await getRawMemory();
    assertEqual(memory.classes['test:action:two'].instances.length, 3, 'Should have 3 instances');
  });

  // ===== Outcome Recording Tests =====
  console.log('\n--- Outcome Recording Tests ---\n');

  await test('recordOutcome with positive result increases score', async () => {
    await cleanup();

    await recordAction({ class: 'test:positive:action' });
    const result = await recordOutcome({
      class: 'test:positive:action',
      result: 'positive',
      operatorResponse: 'approved',
    });

    assertEqual(result.success, true, 'Should succeed');
    assertEqual(result.oldScore, 0, 'Old score should be 0');
    assertClose(result.newScore, 0.15, 0.01, 'New score should be ~0.15');
  });

  await test('Multiple positive outcomes increase score cumulatively', async () => {
    await cleanup();

    await recordAction({ class: 'test:cumulative:action' });
    await recordOutcome({ class: 'test:cumulative:action', result: 'positive' });

    await recordAction({ class: 'test:cumulative:action' });
    await recordOutcome({ class: 'test:cumulative:action', result: 'positive' });

    await recordAction({ class: 'test:cumulative:action' });
    const result = await recordOutcome({ class: 'test:cumulative:action', result: 'positive' });

    assertClose(result.newScore, 0.45, 0.01, 'Score should be ~0.45 after 3 positives');
  });

  await test('Score cannot exceed ceiling', async () => {
    await cleanup();

    // Record many positive outcomes
    for (let i = 0; i < 10; i++) {
      await recordAction({ class: 'test:ceiling:action' });
      await recordOutcome({ class: 'test:ceiling:action', result: 'positive' });
    }

    const precedent = await getPrecedent('test:ceiling:action');
    assert(precedent.score <= PRECEDENT_CEILING, 'Score should not exceed ceiling');
    assertEqual(precedent.score, PRECEDENT_CEILING, 'Score should be at ceiling');
  });

  await test('recordOutcome with negative result decreases score', async () => {
    await cleanup();

    // Build up some score first
    await recordAction({ class: 'test:negative:action' });
    await recordOutcome({ class: 'test:negative:action', result: 'positive' });
    await recordAction({ class: 'test:negative:action' });
    await recordOutcome({ class: 'test:negative:action', result: 'positive' });

    // Now a negative outcome
    await recordAction({ class: 'test:negative:action' });
    const result = await recordOutcome({
      class: 'test:negative:action',
      result: 'negative',
      severity: 1,
      operatorResponse: 'corrected',
    });

    assertEqual(result.success, true, 'Should succeed');
    assertClose(result.newScore, 0.10, 0.01, 'Score should decrease by 0.20');
  });

  await test('Severity affects negative outcome impact', async () => {
    await cleanup();

    // Start with score at 0.6
    for (let i = 0; i < 4; i++) {
      await recordAction({ class: 'test:severity:action' });
      await recordOutcome({ class: 'test:severity:action', result: 'positive' });
    }

    // Severity 3 should decrease by 0.60
    await recordAction({ class: 'test:severity:action' });
    const result = await recordOutcome({
      class: 'test:severity:action',
      result: 'negative',
      severity: 3,
    });

    assertEqual(result.oldScore, 0.6, 'Old score should be 0.6');
    assertClose(result.newScore, 0.0, 0.01, 'Score should drop to ~0 after severity 3');
  });

  // ===== Propagation Tests =====
  console.log('\n--- Propagation Tests ---\n');

  await test('Negative outcome propagates to parent class', async () => {
    await cleanup();

    // Set up parent and child classes with scores
    await recordAction({ class: 'test:parent:*' });
    await recordOutcome({ class: 'test:parent:*', result: 'positive' });
    await recordOutcome({ class: 'test:parent:*', result: 'positive' });

    await recordAction({ class: 'test:parent:child' });
    await recordOutcome({ class: 'test:parent:child', result: 'positive' });

    // Get parent score before
    const parentBefore = await getPrecedent('test:parent:*');

    // Negative on child
    await recordAction({ class: 'test:parent:child' });
    const result = await recordOutcome({
      class: 'test:parent:child',
      result: 'negative',
      severity: 2,
    });

    // Check propagation
    assert(result.propagated.length > 0, 'Should have propagated');
    assert(result.propagated.some(p => p.includes('test:parent:*')), 'Should propagate to parent');

    const parentAfter = await getPrecedent('test:parent:*');
    assert(parentAfter.score < parentBefore.score, 'Parent score should decrease');
  });

  // ===== getPrecedent Tests =====
  console.log('\n--- getPrecedent Tests ---\n');

  await test('getPrecedent returns isFirstAction true for new class', async () => {
    await cleanup();

    const result = await getPrecedent('test:new:class');

    assertEqual(result.score, 0, 'Score should be 0');
    assertEqual(result.isFirstAction, true, 'Should be first action');
    assertEqual(result.history, null, 'Should have no history');
  });

  await test('getPrecedent returns history for existing class', async () => {
    await cleanup();

    await recordAction({ class: 'test:history:class' });
    await recordOutcome({ class: 'test:history:class', result: 'positive' });

    const result = await getPrecedent('test:history:class');

    assertEqual(result.isFirstAction, false, 'Should not be first action');
    assert(result.history !== null, 'Should have history');
    assertEqual(result.history.instances, 1, 'Should have 1 instance');
    assertEqual(result.history.approved, 1, 'Should have 1 approval');
  });

  // ===== Decay Tests =====
  console.log('\n--- Decay Tests ---\n');

  await test('decayScores applies decay to old entries', async () => {
    await cleanup();

    // Create entry with old decay anchor
    await recordAction({ class: 'test:decay:action' });
    await recordOutcome({ class: 'test:decay:action', result: 'positive' });
    await recordOutcome({ class: 'test:decay:action', result: 'positive' });
    await recordOutcome({ class: 'test:decay:action', result: 'positive' });

    // Manually set old decay anchor in the file
    const memory = await getRawMemory();
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    memory.classes['test:decay:action'].decayAnchor = oldDate.toISOString();

    // Write the modified memory to disk
    const memoryPath = getMemoryPath();
    await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), 'utf-8');
    clearCache();

    // Reload and check decay
    const before = await getPrecedent('test:decay:action', { applyDecay: false });
    const after = await getPrecedent('test:decay:action', { applyDecay: true });

    assert(after.score < before.score, 'Decayed score should be lower');
  });

  // ===== Audit Summary Tests =====
  console.log('\n--- Audit Summary Tests ---\n');

  await test('getAuditSummary returns summary structure', async () => {
    await cleanup();

    await recordAction({ class: 'test:audit:action' });
    await recordOutcome({ class: 'test:audit:action', result: 'positive' });

    const summary = await getAuditSummary({ days: 7 });

    assert('period' in summary, 'Should have period');
    assert('totals' in summary, 'Should have totals');
    assert('recentActivity' in summary, 'Should have recentActivity');
    assert('scoreChanges' in summary, 'Should have scoreChanges');
  });

  await test('getAuditSummary counts recent activity', async () => {
    await cleanup();

    await recordAction({ class: 'test:audit2:action' });
    await recordOutcome({ class: 'test:audit2:action', result: 'positive' });
    await recordAction({ class: 'test:audit2:action' });
    await recordOutcome({ class: 'test:audit2:action', result: 'positive' });
    await recordAction({ class: 'test:audit2:action' });
    await recordOutcome({ class: 'test:audit2:action', result: 'negative', severity: 1 });

    const summary = await getAuditSummary({ days: 7 });

    assertEqual(summary.recentActivity.actions, 3, 'Should have 3 actions');
    assertEqual(summary.recentActivity.positive, 2, 'Should have 2 positive');
    assertEqual(summary.recentActivity.negative, 1, 'Should have 1 negative');
  });

  // ===== Reset Tests =====
  console.log('\n--- Reset Tests ---\n');

  await test('resetPrecedent resets score to zero', async () => {
    await cleanup();

    await recordAction({ class: 'test:reset:action' });
    await recordOutcome({ class: 'test:reset:action', result: 'positive' });
    await recordAction({ class: 'test:reset:action' });
    await recordOutcome({ class: 'test:reset:action', result: 'positive' });

    const before = await getPrecedent('test:reset:action', { applyDecay: false });
    assert(before.score > 0, 'Score should be positive before reset');

    const result = await resetPrecedent('test:reset:action');
    assertEqual(result.success, true, 'Should succeed');
    assert(result.oldScore > 0, 'Should report old score');

    // Check raw score without decay applied
    const after = await getPrecedent('test:reset:action', { applyDecay: false });
    assertEqual(after.score, 0, 'Score should be 0 after reset');
  });

  await test('resetPrecedent fails for unknown class', async () => {
    await cleanup();

    const result = await resetPrecedent('test:unknown:action');
    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('No recorded actions'), 'Should mention no actions');
  });

  // ===== Cleanup =====
  await cleanup();

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
