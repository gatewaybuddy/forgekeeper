#!/usr/bin/env node
/**
 * Tests for Reflection Meta-Analysis Module
 *
 * Run with: node tests/test-reflection-meta.js
 */

import {
  detectRepetition,
  getReflectionPrompt,
  updateReflectionPrompt,
  getEvolutionHistory,
  getStats,
} from '../core/reflection-meta.js';

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
  console.log('\n=== Reflection Meta-Analysis Tests ===\n');

  // Test: Detect no repetition in empty array
  await test('detectRepetition handles empty array', async () => {
    const result = detectRepetition([]);
    assertEqual(result.repetitive, false, 'Empty should not be repetitive');
    assert(Array.isArray(result.topics), 'Should have topics array');
    assertEqual(result.topics.length, 0, 'Should have no topics');
  });

  // Test: Detect no repetition in varied thoughts
  await test('detectRepetition detects no repetition in varied thoughts', async () => {
    const thoughts = [
      { content: 'Thinking about the weather today' },
      { content: 'Working on a new feature for the app' },
      { content: 'Curious about machine learning approaches' },
    ];
    const result = detectRepetition(thoughts);
    assertEqual(result.repetitive, false, 'Varied thoughts should not be repetitive');
  });

  // Test: Detect repetition when threshold exceeded
  await test('detectRepetition detects repetitive patterns', async () => {
    const thoughts = [
      { content: 'Looking at the uncommitted files in the git repository' },
      { content: 'Still checking the uncommitted files status' },
      { content: 'The uncommitted files are still there' },
      { content: 'Those uncommitted files need attention' },
    ];
    const result = detectRepetition(thoughts, 3);
    assertEqual(result.repetitive, true, 'Should detect repetition');
    assert(result.topics.length > 0, 'Should identify repetitive topics');
    assert(result.analysis.includes('repetitive'), 'Analysis should mention repetition');
  });

  // Test: Frequency tracking
  await test('detectRepetition tracks frequency correctly', async () => {
    const thoughts = [
      { content: 'Working on the test suite' },
      { content: 'More testing work today' },
      { content: 'Testing is important' },
    ];
    const result = detectRepetition(thoughts, 2);
    assert(result.frequency, 'Should have frequency data');
    // 'test' or 'testing' should appear in frequency
    const hasTestTopic = Object.keys(result.frequency).some(k => k.includes('test'));
    assert(hasTestTopic, 'Should track test-related topic');
  });

  // Test: Get reflection prompt
  await test('getReflectionPrompt returns a prompt', async () => {
    const prompt = getReflectionPrompt();
    assert(typeof prompt === 'string', 'Should return string');
    assert(prompt.length > 50, 'Prompt should have content');
  });

  // Test: Get reflection prompt creates default if needed
  await test('getReflectionPrompt contains expected elements', async () => {
    const prompt = getReflectionPrompt();
    assert(prompt.includes('Forgekeeper'), 'Should mention Forgekeeper');
    assert(prompt.toLowerCase().includes('reflect') || prompt.toLowerCase().includes('think'), 'Should mention reflection or thinking');
  });

  // Test: Update reflection prompt
  await test('updateReflectionPrompt handles null input', async () => {
    const result = updateReflectionPrompt(null);
    assertEqual(result.success, false, 'Should fail with null');
    assert(result.reason, 'Should have reason');
  });

  // Test: Update reflection prompt with valid input
  await test('updateReflectionPrompt adds modification', async () => {
    const testModification = `Test modification added at ${Date.now()}`;
    const result = updateReflectionPrompt(testModification, {
      repetitiveTopics: ['test-topic'],
      reason: 'Unit test',
    });
    assertEqual(result.success, true, 'Should succeed');
    assert(result.evolutionId, 'Should have evolution ID');

    // Verify it's in the prompt
    const updatedPrompt = getReflectionPrompt();
    assert(updatedPrompt.includes(testModification), 'Prompt should contain modification');
  });

  // Test: Get evolution history
  await test('getEvolutionHistory returns array', async () => {
    const history = getEvolutionHistory(5);
    assert(Array.isArray(history), 'Should return array');
    if (history.length > 0) {
      assert(history[0].type === 'prompt_evolution', 'Should be evolution entries');
      assert(history[0].modification, 'Should have modification');
    }
  });

  // Test: Get stats
  await test('getStats returns proper structure', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Should return object');
    assert('promptLength' in stats, 'Should have promptLength');
    assert('evolutionCount' in stats, 'Should have evolutionCount');
    assert('repetitionThreshold' in stats, 'Should have repetitionThreshold');
    assert(typeof stats.promptLength === 'number', 'promptLength should be number');
  });

  // Test: Custom threshold in detectRepetition
  await test('detectRepetition respects custom threshold', async () => {
    const thoughts = [
      { content: 'Git repository status check' },
      { content: 'Looking at the git log' },
    ];
    // With threshold 2, should detect
    const result2 = detectRepetition(thoughts, 2);
    // With threshold 3, should not detect
    const result3 = detectRepetition(thoughts, 3);

    assertEqual(result2.repetitive, true, 'Should detect with threshold 2');
    assertEqual(result3.repetitive, false, 'Should not detect with threshold 3');
  });

  // Test: Topic extraction from different content formats
  await test('detectRepetition extracts topics from various formats', async () => {
    const thoughts = [
      { thought: 'Working on tests' }, // 'thought' field
      { content: 'More tests needed' }, // 'content' field
      { content: 'Testing the tests' },
    ];
    const result = detectRepetition(thoughts, 2);
    // Should detect 'test' or 'testing' as repetitive
    assert(result.repetitive, 'Should detect pattern');
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
