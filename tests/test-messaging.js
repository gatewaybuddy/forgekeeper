#!/usr/bin/env node
/**
 * Tests for Messaging Module
 *
 * Run with: node tests/test-messaging.js
 */

import {
  PLATFORMS,
  CHANNEL_TYPES,
  MESSAGE_TYPES,
  createUser,
  createChannel,
  createMessage,
  createResponse,
  createAttachment,
  validateMessage,
  isCommand,
  parseCommand,
} from '../core/messaging/types.js';

import { MessagingAdapter } from '../core/messaging/adapter.js';

import {
  registerAdapter,
  unregisterAdapter,
  getAdapter,
  getAdapters,
  send,
  reply,
  onMessage,
  offMessage,
  getStats,
} from '../core/messaging/router.js';

import { ConsoleAdapter, createConsoleAdapter } from '../core/messaging/adapters/console.js';
import { TelegramAdapter, createTelegramAdapter } from '../core/messaging/adapters/telegram.js';

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
  console.log('\n=== Messaging Module Tests ===\n');

  // ===== Types Tests =====
  console.log('--- Types Tests ---\n');

  await test('PLATFORMS constants are defined', async () => {
    assert(PLATFORMS.TELEGRAM === 'telegram', 'Should have TELEGRAM');
    assert(PLATFORMS.DISCORD === 'discord', 'Should have DISCORD');
    assert(PLATFORMS.SLACK === 'slack', 'Should have SLACK');
    assert(PLATFORMS.CONSOLE === 'console', 'Should have CONSOLE');
  });

  await test('CHANNEL_TYPES constants are defined', async () => {
    assert(CHANNEL_TYPES.DM === 'dm', 'Should have DM');
    assert(CHANNEL_TYPES.GROUP === 'group', 'Should have GROUP');
    assert(CHANNEL_TYPES.CHANNEL === 'channel', 'Should have CHANNEL');
  });

  await test('MESSAGE_TYPES constants are defined', async () => {
    assert(MESSAGE_TYPES.TEXT === 'text', 'Should have TEXT');
    assert(MESSAGE_TYPES.COMMAND === 'command', 'Should have COMMAND');
  });

  await test('createUser creates valid user', async () => {
    const user = createUser({
      id: '123',
      platform: PLATFORMS.TELEGRAM,
      name: 'Test User',
      isAdmin: true,
    });

    assertEqual(user.id, '123', 'Should have id');
    assertEqual(user.platform, 'telegram', 'Should have platform');
    assertEqual(user.name, 'Test User', 'Should have name');
    assertEqual(user.isAdmin, true, 'Should be admin');
  });

  await test('createChannel creates valid channel', async () => {
    const channel = createChannel({
      id: 'ch-123',
      platform: PLATFORMS.TELEGRAM,
      type: CHANNEL_TYPES.GROUP,
      name: 'Test Group',
    });

    assertEqual(channel.id, 'ch-123', 'Should have id');
    assertEqual(channel.type, 'group', 'Should have type');
  });

  await test('createMessage creates valid message', async () => {
    const user = createUser({ id: '123', platform: PLATFORMS.TELEGRAM });
    const channel = createChannel({ id: 'ch-123', platform: PLATFORMS.TELEGRAM });

    const message = createMessage({
      platform: PLATFORMS.TELEGRAM,
      channel,
      sender: user,
      text: 'Hello world',
    });

    assert(message.id, 'Should have id');
    assertEqual(message.platform, 'telegram', 'Should have platform');
    assertEqual(message.content.text, 'Hello world', 'Should have text');
    assert(message.timestamp, 'Should have timestamp');
  });

  await test('createResponse creates valid response', async () => {
    const response = createResponse({
      text: 'Hello!',
      parseMode: 'markdown',
    });

    assertEqual(response.text, 'Hello!', 'Should have text');
    assertEqual(response.parseMode, 'markdown', 'Should have parseMode');
  });

  await test('createAttachment creates valid attachment', async () => {
    const attachment = createAttachment({
      type: 'image',
      url: 'https://example.com/image.png',
      filename: 'image.png',
    });

    assertEqual(attachment.type, 'image', 'Should have type');
    assertEqual(attachment.url, 'https://example.com/image.png', 'Should have url');
  });

  await test('validateMessage validates correctly', async () => {
    const user = createUser({ id: '123', platform: PLATFORMS.TELEGRAM });
    const channel = createChannel({ id: 'ch-123', platform: PLATFORMS.TELEGRAM });

    const validMessage = createMessage({
      platform: PLATFORMS.TELEGRAM,
      channel,
      sender: user,
      text: 'Hello',
    });

    const validation = validateMessage(validMessage);
    assertEqual(validation.valid, true, 'Should be valid');
  });

  await test('validateMessage catches missing fields', async () => {
    const validation = validateMessage({});
    assertEqual(validation.valid, false, 'Should be invalid');
    assert(validation.errors.length > 0, 'Should have errors');
  });

  await test('isCommand detects commands', async () => {
    const cmdMessage = createMessage({
      platform: PLATFORMS.CONSOLE,
      channel: createChannel({ id: '1', platform: PLATFORMS.CONSOLE }),
      sender: createUser({ id: '1', platform: PLATFORMS.CONSOLE }),
      text: '/help',
    });

    const textMessage = createMessage({
      platform: PLATFORMS.CONSOLE,
      channel: createChannel({ id: '1', platform: PLATFORMS.CONSOLE }),
      sender: createUser({ id: '1', platform: PLATFORMS.CONSOLE }),
      text: 'hello',
    });

    assertEqual(isCommand(cmdMessage), true, 'Should detect command');
    assertEqual(isCommand(textMessage), false, 'Should not detect command');
  });

  await test('parseCommand parses correctly', async () => {
    const message = createMessage({
      platform: PLATFORMS.CONSOLE,
      channel: createChannel({ id: '1', platform: PLATFORMS.CONSOLE }),
      sender: createUser({ id: '1', platform: PLATFORMS.CONSOLE }),
      text: '/task add Buy groceries',
    });

    const cmd = parseCommand(message);

    assertEqual(cmd.command, 'task', 'Should have command');
    assertEqual(cmd.args[0], 'add', 'Should have first arg');
    assertEqual(cmd.args[1], 'Buy', 'Should have second arg');
  });

  // ===== Adapter Tests =====
  console.log('\n--- Adapter Tests ---\n');

  await test('MessagingAdapter base class exists', async () => {
    assert(MessagingAdapter, 'Should have MessagingAdapter');
  });

  await test('ConsoleAdapter creates correctly', async () => {
    const adapter = createConsoleAdapter({ userId: 'test-user' });

    assertEqual(adapter.getPlatform(), 'console', 'Should be console platform');
    assertEqual(adapter.isConnected(), false, 'Should not be connected initially');
  });

  await test('ConsoleAdapter getStats works', async () => {
    const adapter = createConsoleAdapter();
    const stats = adapter.getStats();

    assertEqual(stats.platform, 'console', 'Should have platform');
    assert('connected' in stats, 'Should have connected');
    assert('messageCount' in stats, 'Should have messageCount');
  });

  await test('TelegramAdapter creates correctly', async () => {
    const adapter = createTelegramAdapter();

    assertEqual(adapter.getPlatform(), 'telegram', 'Should be telegram platform');
    assertEqual(adapter.isConnected(), false, 'Should not be connected initially');
  });

  await test('TelegramAdapter normalizeMessage works', async () => {
    const adapter = createTelegramAdapter();

    const rawMessage = {
      message_id: 123,
      from: {
        id: 456,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: {
        id: 789,
        type: 'private',
      },
      text: 'Hello',
      date: Math.floor(Date.now() / 1000),
    };

    const message = adapter.normalizeMessage(rawMessage);

    assertEqual(message.id, '123', 'Should have message id');
    assertEqual(message.sender.id, '456', 'Should have sender id');
    assertEqual(message.channel.id, '789', 'Should have channel id');
    assertEqual(message.content.text, 'Hello', 'Should have text');
  });

  await test('TelegramAdapter isUserAdmin works', async () => {
    const adapter = createTelegramAdapter({
      adminUsers: ['123', '@admin'],
    });

    assertEqual(adapter.isUserAdmin('123', 'someuser'), true, 'Should be admin by id');
    assertEqual(adapter.isUserAdmin('999', 'admin'), true, 'Should be admin by username');
    assertEqual(adapter.isUserAdmin('999', 'notadmin'), false, 'Should not be admin');
  });

  // ===== Router Tests =====
  console.log('\n--- Router Tests ---\n');

  await test('getStats returns proper structure', async () => {
    const stats = getStats();

    assert('adapterCount' in stats, 'Should have adapterCount');
    assert('connectedCount' in stats, 'Should have connectedCount');
    assert('messageHandlers' in stats, 'Should have messageHandlers');
  });

  await test('registerAdapter and unregisterAdapter work', async () => {
    const adapter = createConsoleAdapter();

    const regResult = registerAdapter(adapter);
    assertEqual(regResult.success, true, 'Should register successfully');

    const found = getAdapter('console');
    assert(found, 'Should find registered adapter');

    const unregResult = unregisterAdapter('console');
    assertEqual(unregResult.success, true, 'Should unregister successfully');

    const notFound = getAdapter('console');
    assertEqual(notFound, null, 'Should not find unregistered adapter');
  });

  await test('registerAdapter prevents duplicates', async () => {
    const adapter1 = createConsoleAdapter();
    const adapter2 = createConsoleAdapter();

    registerAdapter(adapter1);
    const result = registerAdapter(adapter2);

    assertEqual(result.success, false, 'Should fail for duplicate');
    assert(result.error.includes('already registered'), 'Error should mention already registered');

    // Cleanup
    unregisterAdapter('console');
  });

  await test('getAdapters returns all adapters', async () => {
    const adapter = createConsoleAdapter();
    registerAdapter(adapter);

    const adapters = getAdapters();

    assert(Array.isArray(adapters), 'Should return array');
    assert(adapters.length > 0, 'Should have adapters');

    // Cleanup
    unregisterAdapter('console');
  });

  await test('send fails for unregistered platform', async () => {
    const result = await send('nonexistent', { id: '123' }, { text: 'Hello' });

    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('No adapter'), 'Error should mention no adapter');
  });

  await test('reply fails for invalid message', async () => {
    const result = await reply({}, { text: 'Hello' });

    assertEqual(result.success, false, 'Should fail');
    assert(result.error.includes('Invalid'), 'Error should mention invalid');
  });

  await test('onMessage and offMessage work', async () => {
    let received = null;
    const handler = (msg) => { received = msg; };

    const initialStats = getStats();
    onMessage(handler);

    const afterAdd = getStats();
    assertEqual(afterAdd.messageHandlers, initialStats.messageHandlers + 1, 'Should add handler');

    offMessage(handler);

    const afterRemove = getStats();
    assertEqual(afterRemove.messageHandlers, initialStats.messageHandlers, 'Should remove handler');
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
