#!/usr/bin/env node
/**
 * Tests for Memory Search Module
 *
 * Run with: node tests/test-memory-search.js
 */

import {
  search,
  searchByDate,
  searchByType,
  indexEntry,
  rebuildIndex,
  getStats,
  initSearch,
  formatResults,
} from '../core/memory-search.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

let passed = 0;
let failed = 0;

// Test data directory
const TEST_JOURNAL_DIR = 'forgekeeper_personality/journal';

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
  console.log('\n=== Memory Search Tests ===\n');

  // Ensure test journal directory exists
  if (!existsSync(TEST_JOURNAL_DIR)) {
    mkdirSync(TEST_JOURNAL_DIR, { recursive: true });
  }

  // Test: Rebuild index first (from real journal files)
  await test('can rebuild index', async () => {
    const count = rebuildIndex();
    assert(count >= 0, 'Should complete rebuild');
  });

  // Now add test entries directly to the index
  const testEntries = [
    { id: 'test-1', type: 'test_thought', ts: '2025-02-06T10:00:00Z', thought: 'I was thinking about uncommitted files in the git repository' },
    { id: 'test-2', type: 'test_thought', ts: '2025-02-06T11:00:00Z', thought: 'The weather is nice today, feeling curious about new projects' },
    { id: 'test-3', type: 'test_shared', ts: '2025-02-05T09:00:00Z', content: 'Shared reflection about code quality and testing practices' },
    { id: 'test-4', type: 'test_flush', ts: '2025-02-04T08:00:00Z', content: 'Context flush with important decisions about architecture' },
    { id: 'test-5', type: 'test_thought', ts: '2025-02-06T12:00:00Z', thought: 'More thoughts about git and version control best practices' },
  ];

  // Index test entries directly
  for (const entry of testEntries) {
    indexEntry(entry, 'test-source');
  }
  const testJournalPath = join(TEST_JOURNAL_DIR, 'test_entries.jsonl'); // For cleanup reference

  // Test: Get stats
  await test('can get index stats', async () => {
    const stats = getStats();
    assert(stats.totalDocs > 0, 'Should have indexed documents');
    assert(stats.totalTerms > 0, 'Should have indexed terms');
    assert(Array.isArray(stats.topTerms), 'Should have top terms');
  });

  // Test: Simple search
  await test('can perform simple search', async () => {
    const results = search('git');
    assert(results.length > 0, 'Should find results for "git"');
    assert(results[0].preview.toLowerCase().includes('git'), 'Results should contain search term');
  });

  // Test: Multi-word search (AND)
  await test('multi-word search uses AND logic', async () => {
    const results = search('git repository');
    assert(results.length > 0, 'Should find results');
    // Should match entry about "uncommitted files in the git repository"
    assert(results.some(r => r.preview.includes('repository')), 'Should find document with both terms');
  });

  // Test: OR search
  await test('OR search returns documents with either term', async () => {
    const results = search('weather OR architecture');
    assert(results.length >= 2, 'Should find multiple results');
  });

  // Test: Exclusion search (filter by test_thought to isolate test entries)
  await test('exclusion with - removes matching docs', async () => {
    const withoutExclusion = search('git', { type: 'test_thought' });
    const withExclusion = search('git -repository', { type: 'test_thought' });
    assert(withoutExclusion.length >= 2, 'Should find at least 2 git results');
    assert(withExclusion.length < withoutExclusion.length, 'Exclusion should reduce results');
  });

  // Test: Phrase search
  await test('phrase search finds exact matches', async () => {
    const results = search('"code quality"');
    assert(results.length > 0, 'Should find phrase');
    assert(results[0].preview.toLowerCase().includes('code quality'), 'Should contain exact phrase');
  });

  // Test: Search by type
  await test('can search by type', async () => {
    const thoughts = searchByType('test_thought');
    assert(thoughts.length > 0, 'Should find test thoughts');
    assert(thoughts.every(r => r.type === 'test_thought'), 'All results should be test_thought type');
  });

  // Test: Search by date range
  await test('can search by date range', async () => {
    const results = searchByDate('2025-02-05', '2025-02-06');
    assert(results.length > 0, 'Should find results in date range');
  });

  // Test: Combined filters
  await test('can combine search with filters', async () => {
    const results = search('git', {
      type: 'test_thought',
      limit: 5,
    });
    assert(results.length > 0, 'Should find results');
    assert(results.every(r => r.type === 'test_thought'), 'All should be test_thought');
    assert(results.length <= 5, 'Should respect limit');
  });

  // Test: Index entry
  await test('can index new entry', async () => {
    const entry = {
      id: 'dynamic-entry-1',
      type: 'thought',
      ts: new Date().toISOString(),
      thought: 'This is a dynamically indexed entry about elephants',
    };

    const indexed = indexEntry(entry, 'dynamic');
    assert(indexed === true, 'Should index successfully');

    // Search for it
    const results = search('elephants');
    assert(results.length > 0, 'Should find newly indexed entry');
  });

  // Test: Empty search
  await test('empty search returns empty results', async () => {
    const results = search('');
    assertEqual(results.length, 0, 'Empty search should return no results');
  });

  // Test: No results search
  await test('search with no matches returns empty', async () => {
    const results = search('xyznonexistentterm123');
    assertEqual(results.length, 0, 'Non-matching search should return empty');
  });

  // Test: Format results
  await test('can format results for display', async () => {
    const results = search('git');
    const formatted = formatResults(results);
    assert(formatted.length > 0, 'Should have formatted results');
    assert(formatted[0].id, 'Should have id');
    assert(formatted[0].score, 'Should have score');
    assert(formatted[0].date, 'Should have date');
  });

  // Test: Score ranking
  await test('results are ranked by relevance', async () => {
    const results = search('git');
    if (results.length > 1) {
      assert(results[0].score >= results[1].score, 'First result should have highest score');
    }
  });

  // Note: Test entries were indexed in memory, no file cleanup needed
  console.log('\n[Cleanup] Test entries were indexed in-memory only');

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
