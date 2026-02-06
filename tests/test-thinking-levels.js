#!/usr/bin/env node
/**
 * Tests for Thinking Levels Module
 *
 * Run with: node tests/test-thinking-levels.js
 */

import {
  THINKING_LEVELS,
  getThinkingLevel,
  applyThinkingBudget,
  getAllLevels,
  getDefaultContextLevels,
  getValidContexts,
  getValidLevels,
  isValidContext,
  isValidLevel,
  _internal,
} from '../core/thinking-levels.js';

let passed = 0;
let failed = 0;

// Store original env vars to restore later
const originalEnv = {};

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

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
  }
}

function setEnvVar(name, value) {
  if (!(name in originalEnv)) {
    originalEnv[name] = process.env[name];
  }
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function restoreEnv() {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function runTests() {
  console.log('\n=== Thinking Levels Module Tests ===\n');

  // === THINKING_LEVELS constant tests ===

  await test('THINKING_LEVELS has all expected levels', async () => {
    const expectedLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    for (const level of expectedLevels) {
      assert(THINKING_LEVELS[level], `Missing level: ${level}`);
    }
    assertEqual(Object.keys(THINKING_LEVELS).length, 6, 'Should have exactly 6 levels');
  });

  await test('THINKING_LEVELS have correct structure', async () => {
    for (const [name, level] of Object.entries(THINKING_LEVELS)) {
      assert(typeof level.name === 'string', `${name} should have name`);
      assert(typeof level.budget === 'number', `${name} should have budget`);
      assert(typeof level.description === 'string', `${name} should have description`);
      assertEqual(level.name, name, `${name} name should match key`);
    }
  });

  await test('THINKING_LEVELS budgets are in ascending order', async () => {
    const budgets = [
      THINKING_LEVELS.off.budget,
      THINKING_LEVELS.minimal.budget,
      THINKING_LEVELS.low.budget,
      THINKING_LEVELS.medium.budget,
      THINKING_LEVELS.high.budget,
      THINKING_LEVELS.xhigh.budget,
    ];

    for (let i = 1; i < budgets.length; i++) {
      assert(budgets[i] > budgets[i - 1], `Budget ${budgets[i]} should be > ${budgets[i - 1]}`);
    }
  });

  await test('THINKING_LEVELS.off has zero budget', async () => {
    assertEqual(THINKING_LEVELS.off.budget, 0, 'off level should have 0 budget');
  });

  // === getThinkingLevel tests ===

  await test('getThinkingLevel returns correct default for chat', async () => {
    const level = getThinkingLevel('chat', { log: false });
    assertEqual(level.name, 'minimal', 'chat should default to minimal');
  });

  await test('getThinkingLevel returns correct default for reflection', async () => {
    const level = getThinkingLevel('reflection', { log: false });
    assertEqual(level.name, 'medium', 'reflection should default to medium');
  });

  await test('getThinkingLevel returns correct default for task', async () => {
    const level = getThinkingLevel('task', { log: false });
    assertEqual(level.name, 'high', 'task should default to high');
  });

  await test('getThinkingLevel returns correct default for planning', async () => {
    const level = getThinkingLevel('planning', { log: false });
    assertEqual(level.name, 'xhigh', 'planning should default to xhigh');
  });

  await test('getThinkingLevel returns correct default for query', async () => {
    const level = getThinkingLevel('query', { log: false });
    assertEqual(level.name, 'off', 'query should default to off');
  });

  await test('getThinkingLevel respects FK_THINKING_LEVEL_CHAT override', async () => {
    setEnvVar('FK_THINKING_LEVEL_CHAT', 'high');
    try {
      const level = getThinkingLevel('chat', { log: false });
      assertEqual(level.name, 'high', 'chat should use override');
      assertEqual(level.budget, THINKING_LEVELS.high.budget);
    } finally {
      restoreEnv();
    }
  });

  await test('getThinkingLevel respects FK_THINKING_LEVEL_TASK override', async () => {
    setEnvVar('FK_THINKING_LEVEL_TASK', 'minimal');
    try {
      const level = getThinkingLevel('task', { log: false });
      assertEqual(level.name, 'minimal', 'task should use override');
    } finally {
      restoreEnv();
    }
  });

  await test('getThinkingLevel ignores invalid override and uses default', async () => {
    setEnvVar('FK_THINKING_LEVEL_CHAT', 'invalid_level');
    try {
      const level = getThinkingLevel('chat', { log: false });
      assertEqual(level.name, 'minimal', 'chat should fall back to default');
    } finally {
      restoreEnv();
    }
  });

  await test('getThinkingLevel handles unknown context gracefully', async () => {
    const level = getThinkingLevel('unknown_context', { log: false });
    // Should fall back to chat's default
    assertEqual(level.name, 'minimal', 'unknown context should default to chat level');
  });

  await test('getThinkingLevel returns a copy, not the original object', async () => {
    const level1 = getThinkingLevel('chat', { log: false });
    const level2 = getThinkingLevel('chat', { log: false });
    assert(level1 !== level2, 'Should return different objects');
    assertEqual(level1.name, level2.name, 'Objects should have same values');
  });

  // === applyThinkingBudget tests ===

  await test('applyThinkingBudget adds thinking config for non-off levels', async () => {
    const result = applyThinkingBudget('task', {}, { log: false });
    assert(result.thinking, 'Should have thinking config');
    assertEqual(result.thinking.type, 'enabled');
    assertEqual(result.thinking.budget_tokens, THINKING_LEVELS.high.budget);
  });

  await test('applyThinkingBudget does not add thinking for off level', async () => {
    const result = applyThinkingBudget('query', {}, { log: false });
    assert(!result.thinking, 'Should not have thinking config for off level');
  });

  await test('applyThinkingBudget preserves existing options', async () => {
    const existing = { model: 'test-model', temperature: 0.7 };
    const result = applyThinkingBudget('task', existing, { log: false });
    assertEqual(result.model, 'test-model');
    assertEqual(result.temperature, 0.7);
    assert(result.thinking, 'Should also have thinking config');
  });

  await test('applyThinkingBudget does not mutate input options', async () => {
    const existing = { model: 'test-model' };
    applyThinkingBudget('task', existing, { log: false });
    assert(!existing.thinking, 'Original should not have thinking');
  });

  await test('applyThinkingBudget respects environment override', async () => {
    setEnvVar('FK_THINKING_LEVEL_CHAT', 'xhigh');
    try {
      const result = applyThinkingBudget('chat', {}, { log: false });
      assertEqual(result.thinking.budget_tokens, THINKING_LEVELS.xhigh.budget);
    } finally {
      restoreEnv();
    }
  });

  // === Helper function tests ===

  await test('getAllLevels returns all levels', async () => {
    const levels = getAllLevels();
    assertEqual(Object.keys(levels).length, 6);
    assert(levels.off, 'Should have off');
    assert(levels.xhigh, 'Should have xhigh');
  });

  await test('getAllLevels returns a copy', async () => {
    const levels1 = getAllLevels();
    const levels2 = getAllLevels();
    assert(levels1 !== levels2, 'Should return different objects');
  });

  await test('getDefaultContextLevels returns correct mappings', async () => {
    const defaults = getDefaultContextLevels();
    assertEqual(defaults.chat, 'minimal');
    assertEqual(defaults.reflection, 'medium');
    assertEqual(defaults.task, 'high');
    assertEqual(defaults.planning, 'xhigh');
    assertEqual(defaults.query, 'off');
  });

  await test('getValidContexts returns all context types', async () => {
    const contexts = getValidContexts();
    assert(contexts.includes('chat'));
    assert(contexts.includes('reflection'));
    assert(contexts.includes('task'));
    assert(contexts.includes('planning'));
    assert(contexts.includes('query'));
    assertEqual(contexts.length, 5);
  });

  await test('getValidLevels returns all level names', async () => {
    const levels = getValidLevels();
    assert(levels.includes('off'));
    assert(levels.includes('minimal'));
    assert(levels.includes('low'));
    assert(levels.includes('medium'));
    assert(levels.includes('high'));
    assert(levels.includes('xhigh'));
    assertEqual(levels.length, 6);
  });

  await test('isValidContext returns true for valid contexts', async () => {
    assert(isValidContext('chat'));
    assert(isValidContext('task'));
    assert(isValidContext('planning'));
  });

  await test('isValidContext returns false for invalid contexts', async () => {
    assert(!isValidContext('invalid'));
    assert(!isValidContext(''));
    assert(!isValidContext('CHAT')); // case sensitive
  });

  await test('isValidLevel returns true for valid levels', async () => {
    assert(isValidLevel('off'));
    assert(isValidLevel('minimal'));
    assert(isValidLevel('xhigh'));
  });

  await test('isValidLevel returns false for invalid levels', async () => {
    assert(!isValidLevel('invalid'));
    assert(!isValidLevel(''));
    assert(!isValidLevel('HIGH')); // case sensitive
  });

  // === _internal tests ===

  await test('_internal.getEnvVarName generates correct names', async () => {
    assertEqual(_internal.getEnvVarName('chat'), 'FK_THINKING_LEVEL_CHAT');
    assertEqual(_internal.getEnvVarName('task'), 'FK_THINKING_LEVEL_TASK');
    assertEqual(_internal.getEnvVarName('planning'), 'FK_THINKING_LEVEL_PLANNING');
  });

  // === Edge cases ===

  await test('handles all override env vars correctly', async () => {
    const testCases = [
      ['FK_THINKING_LEVEL_CHAT', 'chat'],
      ['FK_THINKING_LEVEL_REFLECTION', 'reflection'],
      ['FK_THINKING_LEVEL_TASK', 'task'],
      ['FK_THINKING_LEVEL_PLANNING', 'planning'],
      ['FK_THINKING_LEVEL_QUERY', 'query'],
    ];

    for (const [envVar, context] of testCases) {
      setEnvVar(envVar, 'low');
      try {
        const level = getThinkingLevel(context, { log: false });
        assertEqual(level.name, 'low', `${context} should use override from ${envVar}`);
      } finally {
        restoreEnv();
      }
    }
  });

  // Clean up any lingering env changes
  restoreEnv();

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
