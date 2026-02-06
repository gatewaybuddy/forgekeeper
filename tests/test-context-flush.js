#!/usr/bin/env node
/**
 * Tests for Context Flush Module
 *
 * Run with: node tests/test-context-flush.js
 */

import {
  estimateTokens,
  detectApproachingLimit,
  extractKeyContext,
  flushToMemory,
  loadFlushedContext,
  getStats,
  getRecentFlushes,
  clearWorkingMemory,
} from '../core/context-flush.js';

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
  console.log('\n=== Context Flush Tests ===\n');

  // Test: Token estimation
  await test('estimateTokens works correctly', async () => {
    const tokens = estimateTokens('Hello world, this is a test message.');
    assert(tokens > 0, 'Should return positive token count');
    assert(tokens < 20, 'Should be reasonable estimate');

    const emptyTokens = estimateTokens('');
    assertEqual(emptyTokens, 0, 'Empty string should be 0 tokens');

    const nullTokens = estimateTokens(null);
    assertEqual(nullTokens, 0, 'Null should be 0 tokens');
  });

  // Test: Approaching limit detection
  await test('detectApproachingLimit detects threshold correctly', async () => {
    // At 80% threshold
    assert(detectApproachingLimit(80000, 100000) === true, '80% should trigger');
    assert(detectApproachingLimit(90000, 100000) === true, '90% should trigger');
    assert(detectApproachingLimit(70000, 100000) === false, '70% should not trigger');
    assert(detectApproachingLimit(50000, 100000) === false, '50% should not trigger');
  });

  // Test: Edge cases for limit detection
  await test('detectApproachingLimit handles edge cases', async () => {
    assert(detectApproachingLimit(0, 0) === false, '0/0 should not trigger');
    assert(detectApproachingLimit(100, 0) === false, 'max=0 should not trigger');
    assert(detectApproachingLimit(100, -1) === false, 'negative max should not trigger');
  });

  // Test: Extract key context structure
  await test('extractKeyContext returns proper structure for empty history', async () => {
    const result = await extractKeyContext([]);
    assert(typeof result === 'object', 'Should return object');
    assert('success' in result, 'Should have success field');
    assertEqual(result.success, false, 'Empty history should fail');
    assert(result.reason, 'Should have reason');
  });

  // Test: Flush to memory with mock extraction
  await test('flushToMemory handles valid extraction', async () => {
    const mockExtraction = {
      raw: '**DECISIONS MADE:**\n- Test decision\n\n**ACTION ITEMS:**\n- Test action\n\n**KEY INSIGHTS:**\n- Test insight',
      ts: new Date().toISOString(),
      messageCount: 5,
    };

    const result = flushToMemory(mockExtraction, { sessionId: 'test-session' });
    assert(typeof result === 'object', 'Should return object');
    assert('success' in result, 'Should have success field');
    assertEqual(result.success, true, 'Should succeed with valid extraction');
  });

  // Test: Flush to memory with null extraction
  await test('flushToMemory handles null extraction', async () => {
    const result = flushToMemory(null);
    assertEqual(result.success, false, 'Should fail with null');
    assert(result.reason, 'Should have reason');
  });

  // Test: Load flushed context
  await test('loadFlushedContext returns proper structure', async () => {
    const context = loadFlushedContext();
    assert(typeof context === 'object', 'Should return object');
    assert('available' in context, 'Should have available field');

    if (context.available) {
      assert(context.content, 'Should have content when available');
    }
  });

  // Test: Get stats
  await test('getStats returns proper structure', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Should return object');
    assert('enabled' in stats, 'Should have enabled');
    assert('threshold' in stats, 'Should have threshold');
    assert('flushCount' in stats, 'Should have flushCount');
    assert(typeof stats.threshold === 'number', 'Threshold should be number');
  });

  // Test: Get recent flushes
  await test('getRecentFlushes returns array', async () => {
    const flushes = getRecentFlushes(5);
    assert(Array.isArray(flushes), 'Should return array');
    if (flushes.length > 0) {
      assert(flushes[0].type === 'context_flush', 'Entries should be context_flush type');
    }
  });

  // Test: Clear working memory
  await test('clearWorkingMemory works', async () => {
    // First, ensure there's something to clear
    const mockExtraction = {
      raw: '**TEST:** This will be cleared',
      ts: new Date().toISOString(),
      messageCount: 1,
    };
    flushToMemory(mockExtraction);

    // Now clear
    const cleared = clearWorkingMemory();
    // Result depends on whether file exists
    assert(typeof cleared === 'boolean', 'Should return boolean');

    // Verify it's cleared (or was already empty)
    const context = loadFlushedContext();
    if (context.available && context.content) {
      assert(!context.content.includes('This will be cleared'), 'Content should be cleared');
    }
  });

  // Test: Threshold boundary
  await test('threshold boundary is exact', async () => {
    // Exactly at threshold (0.8)
    assert(detectApproachingLimit(80, 100) === true, 'Exactly at 80% should trigger');
    assert(detectApproachingLimit(79, 100) === false, '79% should not trigger');
  });

  // Test: Large token estimation
  await test('estimateTokens handles large text', async () => {
    const largeText = 'a'.repeat(10000);
    const tokens = estimateTokens(largeText);
    assertEqual(tokens, 2500, 'Should estimate 2500 tokens for 10000 chars');
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
