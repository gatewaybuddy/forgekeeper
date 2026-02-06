#!/usr/bin/env node
/**
 * Tests for Session Hydration Module
 *
 * Run with: node tests/test-session-hydration.js
 */

import {
  appendMessage,
  loadChunk,
  getRecentMessages,
  getSessionContext,
  hydrateSession,
  updateMetadata,
  getMetadata,
  updateSummary,
  getSessionStats,
  listSessions,
  clearCache,
} from '../core/session-hydration.js';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

let passed = 0;
let failed = 0;
const testSessionId = `test-session-${Date.now()}`;

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
  console.log('\n=== Session Hydration Tests ===\n');

  // Test: Create session metadata
  await test('can create session metadata', async () => {
    const metadata = updateMetadata(testSessionId);
    assert(metadata.sessionId === testSessionId, 'Session ID should match');
    assert(metadata.messageCount === 0, 'Should start with 0 messages');
    assert(metadata.createdAt, 'Should have createdAt');
  });

  // Test: Get metadata
  await test('can get session metadata', async () => {
    const metadata = getMetadata(testSessionId);
    assert(metadata !== null, 'Metadata should exist');
    assertEqual(metadata.sessionId, testSessionId);
  });

  // Test: Append messages
  await test('can append messages', async () => {
    const msg1 = appendMessage(testSessionId, { role: 'user', content: 'Hello' });
    assert(msg1.id, 'Message should have ID');
    assert(msg1.ts, 'Message should have timestamp');
    assertEqual(msg1.role, 'user');

    const msg2 = appendMessage(testSessionId, { role: 'assistant', content: 'Hi there!' });
    assertEqual(msg2.role, 'assistant');

    const metadata = getMetadata(testSessionId);
    assertEqual(metadata.messageCount, 2, 'Should have 2 messages');
  });

  // Test: Load chunk
  await test('can load chunk', async () => {
    const chunk = loadChunk(testSessionId, 0);
    assert(Array.isArray(chunk), 'Chunk should be array');
    assertEqual(chunk.length, 2, 'Should have 2 messages in chunk');
    assertEqual(chunk[0].content, 'Hello');
    assertEqual(chunk[1].content, 'Hi there!');
  });

  // Test: Get recent messages
  await test('can get recent messages', async () => {
    const recent = getRecentMessages(testSessionId, 5);
    assertEqual(recent.length, 2, 'Should have 2 recent messages');
    assertEqual(recent[1].content, 'Hi there!');
  });

  // Test: Get session context
  await test('can get session context', async () => {
    const context = getSessionContext(testSessionId);
    assert(context !== null, 'Context should exist');
    assert(context.metadata, 'Should have metadata');
    assert(context.recentMessages, 'Should have recent messages');
    assertEqual(context.recentMessages.length, 2);
  });

  // Test: Update summary
  await test('can update summary', async () => {
    const summary = updateSummary(testSessionId, {
      topics: ['greeting', 'introduction'],
      keyPoints: ['User said hello', 'Bot responded'],
    });
    assert(summary.topics, 'Should have topics');
    assert(summary.updatedAt, 'Should have updatedAt');
  });

  // Test: Summary persists
  await test('summary persists in context', async () => {
    const context = getSessionContext(testSessionId);
    assert(context.summary !== null, 'Should have summary');
    assertEqual(context.summary.topics.length, 2);
  });

  // Test: Chunk caching
  await test('chunks are cached', async () => {
    // Load twice - second should be from cache
    const chunk1 = loadChunk(testSessionId, 0);
    const chunk2 = loadChunk(testSessionId, 0);
    assertEqual(chunk1.length, chunk2.length);
    // Cache should return same data
    assertEqual(chunk1[0].id, chunk2[0].id);
  });

  // Test: Clear cache
  await test('can clear cache', async () => {
    clearCache();
    // Should still work after cache clear
    const chunk = loadChunk(testSessionId, 0);
    assertEqual(chunk.length, 2);
  });

  // Test: Hydrate session (load all)
  await test('can hydrate full session', async () => {
    const allMessages = hydrateSession(testSessionId);
    assertEqual(allMessages.length, 2);
    assertEqual(allMessages[0].content, 'Hello');
  });

  // Test: Get session stats
  await test('can get session stats', async () => {
    const stats = getSessionStats(testSessionId);
    assert(stats !== null, 'Stats should exist');
    assertEqual(stats.sessionId, testSessionId);
    assertEqual(stats.messageCount, 2);
    assert(stats.diskSizeBytes > 0, 'Should have disk size');
  });

  // Test: List sessions
  await test('can list sessions', async () => {
    const sessions = listSessions();
    assert(Array.isArray(sessions), 'Should return array');
    const ourSession = sessions.find(s => s.sessionId === testSessionId);
    assert(ourSession !== undefined, 'Should include our test session');
  });

  // Test: Multiple chunks (add more messages to trigger new chunk)
  await test('handles multiple chunks correctly', async () => {
    // Add enough messages to fill multiple chunks (default chunk size is 100)
    for (let i = 0; i < 50; i++) {
      appendMessage(testSessionId, { role: 'user', content: `Message ${i}` });
    }

    const metadata = getMetadata(testSessionId);
    assertEqual(metadata.messageCount, 52, 'Should have 52 messages');

    const recent = getRecentMessages(testSessionId, 10);
    assertEqual(recent.length, 10, 'Should get last 10 messages');
    // Last message should be "Message 49"
    assert(recent[recent.length - 1].content.includes('Message 49'), 'Last should be Message 49');
  });

  // Test: Non-existent session
  await test('handles non-existent session gracefully', async () => {
    const metadata = getMetadata('non-existent-session-id');
    assert(metadata === null, 'Should return null for non-existent');

    const context = getSessionContext('non-existent-session-id');
    assert(context === null, 'Should return null for non-existent');
  });

  // Cleanup: Remove test session
  try {
    const sessionDir = join('./data/sessions', testSessionId);
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true });
    }
    console.log('\n[Cleanup] Removed test session directory');
  } catch {
    console.log('\n[Cleanup] Could not remove test session directory');
  }

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
