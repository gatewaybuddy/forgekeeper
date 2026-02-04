/**
 * Unit Tests for OutcomeTracker
 *
 * Run with: node frontend/core/agent/__tests__/outcome-tracker.test.mjs
 */

import { createOutcomeTracker } from '../outcome-tracker.mjs';
import fs from 'fs/promises';
import path from 'path';

console.log('Running OutcomeTracker tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

// Test directory
const testDir = '.forgekeeper/learning-test';

// Clean up test directory before and after tests
async function cleanup() {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore errors
  }
}

// Test 1: Record outcome
console.log('Test 1: Record outcome');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  const outcome = {
    sessionId: 'test-session',
    taskGoal: 'Install npm dependencies',
    taskCategory: 'install',
    alternativeId: 'alt-123',
    alternativeName: 'Use npm install',
    weights: { effort: 0.35, risk: 0.25, alignment: 0.30, confidence: 0.10 },
    overallScore: 0.87,
    outcome: 'success',
    actualIterations: 2,
  };

  await tracker.recordOutcome(outcome);

  // Verify file exists
  const filePath = path.join(testDir, 'outcomes.jsonl');
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  assert(lines.length === 1, 'Should have 1 line in JSONL');

  const recorded = JSON.parse(lines[0]);
  assert(recorded.alternativeName === 'Use npm install', 'Should record alternative name');
  assert(recorded.outcome === 'success', 'Should record outcome');
  assert(recorded.id !== undefined, 'Should have auto-generated ID');
  assert(recorded.ts !== undefined, 'Should have auto-generated timestamp');

  await cleanup();
})();
console.log('');

// Test 2: Record multiple outcomes
console.log('Test 2: Record multiple outcomes');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({
    taskGoal: 'Test 1',
    taskCategory: 'test',
    alternativeName: 'Alt 1',
    outcome: 'success',
    overallScore: 0.8,
  });

  await tracker.recordOutcome({
    taskGoal: 'Test 2',
    taskCategory: 'build',
    alternativeName: 'Alt 2',
    outcome: 'failure',
    overallScore: 0.5,
  });

  const filePath = path.join(testDir, 'outcomes.jsonl');
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  assert(lines.length === 2, 'Should have 2 lines in JSONL');

  await cleanup();
})();
console.log('');

// Test 3: Query all outcomes
console.log('Test 3: Query all outcomes');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', alternativeName: 'Alt 1', outcome: 'success' });
  await tracker.recordOutcome({ taskCategory: 'test', alternativeName: 'Alt 2', outcome: 'failure' });

  const outcomes = await tracker.queryOutcomes();

  assert(outcomes.length === 2, 'Should query 2 outcomes');

  await cleanup();
})();
console.log('');

// Test 4: Query by task category
console.log('Test 4: Query by task category');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', alternativeName: 'Alt 1', outcome: 'success' });
  await tracker.recordOutcome({ taskCategory: 'install', alternativeName: 'Alt 2', outcome: 'failure' });
  await tracker.recordOutcome({ taskCategory: 'test', alternativeName: 'Alt 3', outcome: 'success' });

  const installOutcomes = await tracker.queryOutcomes({ taskCategory: 'install' });

  assert(installOutcomes.length === 2, 'Should query 2 install outcomes');

  await cleanup();
})();
console.log('');

// Test 5: Query by outcome type
console.log('Test 5: Query by outcome type');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.8 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'failure', overallScore: 0.5 });
  await tracker.recordOutcome({ taskCategory: 'test', outcome: 'success', overallScore: 0.9 });

  const successes = await tracker.queryOutcomes({ outcome: 'success' });

  assert(successes.length === 2, 'Should query 2 successful outcomes');

  await cleanup();
})();
console.log('');

// Test 6: Query by score threshold
console.log('Test 6: Query by score threshold');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.9 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.7 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.5 });

  const highScores = await tracker.queryOutcomes({ minScore: 0.75 });

  assert(highScores.length === 1, 'Should query 1 outcome with score >= 0.75');

  await cleanup();
})();
console.log('');

// Test 7: Combined filters
console.log('Test 7: Combined filters');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.9 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'failure', overallScore: 0.5 });
  await tracker.recordOutcome({ taskCategory: 'test', outcome: 'success', overallScore: 0.8 });

  const results = await tracker.queryOutcomes({ taskCategory: 'install', outcome: 'success' });

  assert(results.length === 1, 'Should query 1 install+success outcome');

  await cleanup();
})();
console.log('');

// Test 8: Get statistics
console.log('Test 8: Get statistics');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.9, actualIterations: 2 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'success', overallScore: 0.8, actualIterations: 3 });
  await tracker.recordOutcome({ taskCategory: 'install', outcome: 'failure', overallScore: 0.5, actualIterations: 5 });

  const stats = await tracker.getStats('install');

  assert(stats.total === 3, 'Should have 3 total outcomes');
  assert(stats.successes === 2, 'Should have 2 successes');
  assert(stats.failures === 1, 'Should have 1 failure');
  assert(Math.abs(stats.successRate - 0.667) < 0.01, `Success rate should be ~0.667, got ${stats.successRate.toFixed(3)}`);

  await cleanup();
})();
console.log('');

// Test 9: Task categorization
console.log('Test 9: Task categorization');
await (async () => {
  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  assert(tracker.categorizeTask('Install npm dependencies') === 'install', 'Should categorize install task');
  assert(tracker.categorizeTask('Run tests') === 'test', 'Should categorize test task');
  assert(tracker.categorizeTask('Build project') === 'build', 'Should categorize build task');
  assert(tracker.categorizeTask('Deploy to production') === 'deploy', 'Should categorize deploy task');
  assert(tracker.categorizeTask('Fix bug in login') === 'debug', 'Should categorize debug task');
  assert(tracker.categorizeTask('Read config file') === 'query', 'Should categorize query task');
  assert(tracker.categorizeTask('Create new file') === 'modify', 'Should categorize modify task');
  assert(tracker.categorizeTask('Do something') === 'general', 'Should categorize general task');
})();
console.log('');

// Test 10: Empty query
console.log('Test 10: Empty query');
await (async () => {
  await cleanup();

  const tracker = createOutcomeTracker({ outcomesDir: testDir });

  const outcomes = await tracker.queryOutcomes();

  assert(outcomes.length === 0, 'Should return empty array when no outcomes file exists');

  await cleanup();
})();
console.log('');

// Summary
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\n✓ All OutcomeTracker tests passed!\n');
