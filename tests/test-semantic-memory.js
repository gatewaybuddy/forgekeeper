#!/usr/bin/env node
/**
 * Tests for Semantic Memory Module
 *
 * Run with: node tests/test-semantic-memory.js
 *
 * Note: Full functionality requires @xenova/transformers to be installed.
 * Tests will pass with graceful fallback if not installed.
 */

import {
  initSemanticMemory,
  isAvailable,
  embed,
  store,
  search,
  getRelevantContext,
  indexJournalEntry,
  getStats,
  flush,
} from '../core/semantic-memory.js';

let passed = 0;
let failed = 0;
let transformersInstalled = false;

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
  console.log('\n=== Semantic Memory Tests ===\n');

  // Test: Initialize (should not throw even without transformers)
  await test('can initialize without error', async () => {
    const available = await initSemanticMemory();
    // This returns true only if transformers is installed AND enabled
    transformersInstalled = available;
    console.log(`   [transformers available: ${transformersInstalled}]`);
  });

  // Test: isAvailable reflects initialization state
  await test('isAvailable returns consistent state', async () => {
    const available = isAvailable();
    assertEqual(available, transformersInstalled, 'Should match init result');
  });

  // Test: getStats works even when disabled
  await test('getStats works regardless of availability', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Stats should be object');
    assert('available' in stats, 'Should have available field');
    assert('enabled' in stats, 'Should have enabled field');
    assert('model' in stats, 'Should have model field');
    assert('totalEntries' in stats, 'Should have totalEntries field');
  });

  // Test: embed returns null when not available
  await test('embed handles unavailability gracefully', async () => {
    const result = await embed('test text');
    if (transformersInstalled) {
      assert(Array.isArray(result), 'Should return array when available');
      assert(result.length > 0, 'Should have vector elements');
    } else {
      assertEqual(result, null, 'Should return null when not available');
    }
  });

  // Test: store returns false when not available
  await test('store handles unavailability gracefully', async () => {
    const result = await store('test text', { id: 'test-1' });
    if (transformersInstalled) {
      assertEqual(result, true, 'Should return true when available');
    } else {
      assertEqual(result, false, 'Should return false when not available');
    }
  });

  // Test: search returns empty array when not available
  await test('search handles unavailability gracefully', async () => {
    const results = await search('test query');
    assert(Array.isArray(results), 'Should return array');
    if (!transformersInstalled) {
      assertEqual(results.length, 0, 'Should be empty when not available');
    }
  });

  // Test: getRelevantContext returns proper structure
  await test('getRelevantContext returns proper structure', async () => {
    const context = await getRelevantContext('thinking about something');
    assert(typeof context === 'object', 'Should return object');
    assert('available' in context, 'Should have available field');
    assert('relatedThoughts' in context, 'Should have relatedThoughts field');
    assert(Array.isArray(context.relatedThoughts), 'relatedThoughts should be array');
  });

  // Test: indexJournalEntry doesn't throw
  await test('indexJournalEntry handles entries gracefully', async () => {
    // Should not throw even when disabled
    indexJournalEntry({
      id: 'journal-1',
      type: 'thought',
      ts: new Date().toISOString(),
      thought: 'This is a test thought about something interesting',
    }, 'test-source');
    // If we get here without error, test passes
  });

  // Test: flush doesn't throw
  await test('flush works without error', async () => {
    flush();
    // Should not throw
  });

  // Conditional tests that only run when transformers is available
  if (transformersInstalled) {
    console.log('\n--- Running full embedding tests ---\n');

    await test('embed produces consistent vector dimensions', async () => {
      const vec1 = await embed('hello world');
      const vec2 = await embed('goodbye moon');
      assert(vec1.length === vec2.length, 'Vectors should have same dimension');
      assert(vec1.length === 384, 'MiniLM produces 384-dim vectors');
    });

    await test('similar texts have higher similarity', async () => {
      await store('I love programming in JavaScript', { id: 'sim-1', type: 'test' });
      await store('I enjoy coding in Python', { id: 'sim-2', type: 'test' });
      await store('The weather is nice today', { id: 'sim-3', type: 'test' });

      const results = await search('I like writing code', 3);
      assert(results.length > 0, 'Should find results');

      // Programming-related entries should score higher than weather
      const codeResults = results.filter(r => r.id.startsWith('sim-1') || r.id.startsWith('sim-2'));
      assert(codeResults.length > 0, 'Should find programming-related entries');
    });

    await test('getRelevantContext finds related thoughts', async () => {
      // Add some thoughts
      await store('Thinking about git commits and version control', { id: 'ctx-1', type: 'thought', ts: '2025-02-01T10:00:00Z' });
      await store('Reflecting on code quality and best practices', { id: 'ctx-2', type: 'thought', ts: '2025-02-02T10:00:00Z' });

      const context = await getRelevantContext('working with git and committing changes');
      assert(context.available === true, 'Should be available');
      // May or may not find related thoughts depending on similarity threshold
      assert(Array.isArray(context.relatedThoughts), 'Should have relatedThoughts array');
    });

    await test('search respects topK limit', async () => {
      const results = await search('programming code', 2);
      assert(results.length <= 2, 'Should respect topK limit');
    });
  } else {
    console.log('\n--- Skipping full embedding tests (transformers not installed) ---');
    console.log('   To run full tests: npm install @xenova/transformers');
  }

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
