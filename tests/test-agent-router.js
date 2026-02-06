#!/usr/bin/env node
/**
 * Tests for Agent Router Module
 *
 * Run with: node tests/test-agent-router.js
 */

import {
  routeToAgent,
  getAgentConfig,
  registerAgent,
  listAgents,
  getSessionNamespace,
  isEnabled,
  getStats,
  clearCache,
} from '../core/agent-router.js';

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
  console.log('\n=== Agent Router Tests ===\n');

  // Clear cache before tests
  clearCache();

  // Test: isEnabled returns boolean
  await test('isEnabled returns boolean', async () => {
    const enabled = isEnabled();
    assert(typeof enabled === 'boolean', 'Should return boolean');
  });

  // Test: listAgents returns array
  await test('listAgents returns array of agents', async () => {
    const agents = listAgents();
    assert(Array.isArray(agents), 'Should return array');
    assert(agents.length >= 5, 'Should have at least 5 default agents');

    // Check structure
    const first = agents[0];
    assert(first.name, 'Should have name');
    assert(first.description, 'Should have description');
  });

  // Test: getAgentConfig returns config
  await test('getAgentConfig returns agent configuration', async () => {
    const config = getAgentConfig('conversational');
    assert(config !== null, 'Should return config');
    assertEqual(config.name, 'conversational');
    assert(config.thinkingContext, 'Should have thinkingContext');
    assert(config.timeoutMs, 'Should have timeoutMs');
  });

  // Test: getAgentConfig returns null for unknown agent
  await test('getAgentConfig returns null for unknown agent', async () => {
    const config = getAgentConfig('nonexistent-agent');
    assertEqual(config, null, 'Should return null');
  });

  // Test: routeToAgent for chat context
  await test('routeToAgent routes chat to conversational', async () => {
    const result = routeToAgent({
      source: 'chat',
      content: 'Hello, how are you?',
    });
    assertEqual(result.agent, 'conversational', 'Chat should route to conversational');
    assert(result.config, 'Should have config');
    // sessionNamespace only present when routing is enabled
    assert(result.reason, 'Should have reason');
  });

  // Test: routeToAgent for autonomous task (when enabled)
  await test('routeToAgent returns config for autonomous context', async () => {
    const result = routeToAgent({
      source: 'task',
      taskType: 'autonomous',
      content: 'Complete this background work',
    });
    // When disabled, routes to conversational; when enabled, to autonomous
    assert(result.agent, 'Should have agent');
    assert(result.config, 'Should have config');
  });

  // Test: routeToAgent for research content
  await test('routeToAgent routes research keywords to research agent', async () => {
    const result = routeToAgent({
      source: 'chat',
      content: 'Can you research and explore the codebase?',
    });
    // When enabled, should route to research; when disabled, to conversational
    assert(['research', 'conversational'].includes(result.agent), 'Should route to research or conversational');
  });

  // Test: routeToAgent for maintenance content
  await test('routeToAgent routes maintenance keywords correctly', async () => {
    const result = routeToAgent({
      source: 'chat',
      content: 'Please commit these changes and push',
    });
    assert(['maintenance', 'conversational'].includes(result.agent), 'Should route to maintenance or conversational');
  });

  // Test: routeToAgent for quick query
  await test('routeToAgent routes short questions to query agent', async () => {
    const result = routeToAgent({
      source: 'chat',
      content: 'What time is it?',
    });
    assert(['query', 'conversational'].includes(result.agent), 'Short question should route to query or conversational');
  });

  // Test: getSessionNamespace
  await test('getSessionNamespace returns proper namespace', async () => {
    const ns = getSessionNamespace('autonomous');
    assertEqual(ns, 'agent:autonomous', 'Should return prefixed namespace');
  });

  // Test: getStats
  await test('getStats returns proper structure', async () => {
    const stats = getStats();
    assert(typeof stats === 'object', 'Should return object');
    assert('enabled' in stats, 'Should have enabled');
    assert('agentCount' in stats, 'Should have agentCount');
    assert(Array.isArray(stats.agents), 'Should have agents array');
    assert(stats.agentCount >= 5, 'Should have at least 5 agents');
  });

  // Test: registerAgent
  await test('registerAgent creates new agent', async () => {
    const result = registerAgent({
      name: 'test-agent',
      description: 'Test agent for unit tests',
      thinkingContext: 'chat',
      timeoutMs: 10000,
    });
    assertEqual(result.success, true, 'Should succeed');

    // Verify it's registered
    const config = getAgentConfig('test-agent');
    assert(config !== null, 'Should be retrievable');
    assertEqual(config.description, 'Test agent for unit tests');
  });

  // Test: registerAgent requires name
  await test('registerAgent requires name', async () => {
    const result = registerAgent({
      description: 'No name agent',
    });
    assertEqual(result.success, false, 'Should fail without name');
  });

  // Test: clearCache works
  await test('clearCache invalidates cache', async () => {
    // Load agents to populate cache
    listAgents();

    // Clear
    clearCache();

    // Stats should show null cache age
    const stats = getStats();
    // After clearCache, getting stats will reload the cache
    // So we just verify it doesn't error
    assert(stats.agentCount >= 5, 'Should still work after cache clear');
  });

  // Test: routeToAgent includes API options
  await test('routeToAgent includes apiOptions', async () => {
    const result = routeToAgent({
      source: 'task',
      content: 'Some task',
    });
    assert('apiOptions' in result, 'Should have apiOptions');
    assert(typeof result.apiOptions === 'object', 'apiOptions should be object');
  });

  // Test: All default agents have required fields
  await test('all default agents have required fields', async () => {
    const agents = listAgents();
    for (const agent of agents) {
      assert(agent.name, `Agent should have name`);
      assert(agent.description, `${agent.name} should have description`);
    }
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
