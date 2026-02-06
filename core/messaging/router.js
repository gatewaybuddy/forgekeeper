/**
 * Messaging Router for Forgekeeper
 *
 * Routes messages to/from appropriate platform adapters.
 * Provides unified API for cross-platform communication.
 */

import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../../config.js';
import { validateMessage, PLATFORMS } from './types.js';
import { rotateIfNeeded } from '../jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const MESSAGE_LOG_PATH = join(JOURNAL_DIR, 'cross_platform_messages.jsonl');

// Registered adapters
const adapters = new Map();

// Global message handlers
const globalMessageHandlers = [];
const globalErrorHandlers = [];

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Log cross-platform message
 */
function logMessage(message, direction) {
  ensureJournalDir();

  try {
    appendFileSync(MESSAGE_LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      direction, // 'inbound' or 'outbound'
      platform: message.platform,
      channelId: message.channel?.id,
      senderId: message.sender?.id,
      messageId: message.id,
      type: message.type,
      hasAttachments: (message.content?.attachments?.length || 0) > 0,
    }) + '\n');
    rotateIfNeeded(MESSAGE_LOG_PATH);
  } catch (err) {
    console.error('[MessagingRouter] Failed to log message:', err.message);
  }
}

/**
 * Register a platform adapter
 *
 * @param {MessagingAdapter} adapter - Adapter instance
 * @returns {Object} Registration result
 */
export function registerAdapter(adapter) {
  const platform = adapter.getPlatform();

  if (adapters.has(platform)) {
    return {
      success: false,
      error: `Adapter for ${platform} already registered`,
    };
  }

  // Wire up message handling
  adapter.onMessage(async (message) => {
    logMessage(message, 'inbound');
    await handleIncomingMessage(message);
  });

  adapter.onError((error) => {
    handleError(error, platform);
  });

  adapters.set(platform, adapter);

  console.log(`[MessagingRouter] Registered adapter: ${platform}`);

  return {
    success: true,
    platform,
  };
}

/**
 * Unregister a platform adapter
 *
 * @param {string} platform - Platform to unregister
 * @returns {Object} Unregistration result
 */
export function unregisterAdapter(platform) {
  if (!adapters.has(platform)) {
    return {
      success: false,
      error: `No adapter registered for ${platform}`,
    };
  }

  const adapter = adapters.get(platform);

  // Disconnect if connected
  if (adapter.isConnected()) {
    adapter.disconnect().catch(err => {
      console.error(`[MessagingRouter] Error disconnecting ${platform}:`, err.message);
    });
  }

  adapters.delete(platform);

  console.log(`[MessagingRouter] Unregistered adapter: ${platform}`);

  return {
    success: true,
    platform,
  };
}

/**
 * Get a registered adapter
 *
 * @param {string} platform - Platform name
 * @returns {MessagingAdapter|null} Adapter or null
 */
export function getAdapter(platform) {
  return adapters.get(platform) || null;
}

/**
 * Get all registered adapters
 *
 * @returns {Array} Array of adapter info
 */
export function getAdapters() {
  return Array.from(adapters.entries()).map(([platform, adapter]) => ({
    platform,
    connected: adapter.isConnected(),
    stats: adapter.getStats(),
  }));
}

/**
 * Connect all registered adapters
 *
 * @returns {Promise<Object>} Connection results
 */
export async function connectAll() {
  const results = {};

  for (const [platform, adapter] of adapters.entries()) {
    try {
      const connected = await adapter.connect();
      results[platform] = { success: connected };
    } catch (err) {
      results[platform] = { success: false, error: err.message };
    }
  }

  return results;
}

/**
 * Disconnect all registered adapters
 *
 * @returns {Promise<Object>} Disconnection results
 */
export async function disconnectAll() {
  const results = {};

  for (const [platform, adapter] of adapters.entries()) {
    try {
      const disconnected = await adapter.disconnect();
      results[platform] = { success: disconnected };
    } catch (err) {
      results[platform] = { success: false, error: err.message };
    }
  }

  return results;
}

/**
 * Send a message through the appropriate adapter
 *
 * @param {string} platform - Target platform
 * @param {Object} channel - Channel to send to
 * @param {Object} response - Response to send
 * @returns {Promise<Object>} Send result
 */
export async function send(platform, channel, response) {
  const adapter = adapters.get(platform);

  if (!adapter) {
    return {
      success: false,
      error: `No adapter registered for ${platform}`,
    };
  }

  if (!adapter.isConnected()) {
    return {
      success: false,
      error: `Adapter ${platform} is not connected`,
    };
  }

  try {
    const result = await adapter.send(channel, response);

    // Log outbound message
    logMessage({
      platform,
      channel,
      content: { text: response.text },
      id: result?.id,
    }, 'outbound');

    return {
      success: true,
      result,
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Reply to a message through the appropriate adapter
 *
 * @param {Object} message - Original message to reply to
 * @param {Object} response - Response to send
 * @returns {Promise<Object>} Reply result
 */
export async function reply(message, response) {
  const validation = validateMessage(message);

  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid message: ${validation.errors.join(', ')}`,
    };
  }

  const adapter = adapters.get(message.platform);

  if (!adapter) {
    return {
      success: false,
      error: `No adapter registered for ${message.platform}`,
    };
  }

  if (!adapter.isConnected()) {
    return {
      success: false,
      error: `Adapter ${message.platform} is not connected`,
    };
  }

  try {
    const result = await adapter.reply(message, response);

    // Log outbound reply
    logMessage({
      platform: message.platform,
      channel: message.channel,
      content: { text: response.text },
      id: result?.id,
      replyTo: message.id,
    }, 'outbound');

    return {
      success: true,
      result,
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Broadcast a message to all connected adapters
 *
 * @param {Object} response - Response to broadcast
 * @param {Object} options - Broadcast options
 * @returns {Promise<Object>} Broadcast results
 */
export async function broadcast(response, options = {}) {
  const results = {};
  const platforms = options.platforms || Array.from(adapters.keys());

  for (const platform of platforms) {
    const adapter = adapters.get(platform);

    if (!adapter || !adapter.isConnected()) {
      results[platform] = { success: false, error: 'Not connected' };
      continue;
    }

    // Need a channel to broadcast to - platform specific
    if (!options.channels?.[platform]) {
      results[platform] = { success: false, error: 'No channel specified' };
      continue;
    }

    try {
      const result = await adapter.send(options.channels[platform], response);
      results[platform] = { success: true, result };
    } catch (err) {
      results[platform] = { success: false, error: err.message };
    }
  }

  return results;
}

/**
 * Handle incoming message from any adapter
 */
async function handleIncomingMessage(message) {
  for (const handler of globalMessageHandlers) {
    try {
      await handler(message);
    } catch (err) {
      console.error('[MessagingRouter] Handler error:', err.message);
      handleError(err, message.platform);
    }
  }
}

/**
 * Handle error from any adapter
 */
function handleError(error, platform) {
  for (const handler of globalErrorHandlers) {
    try {
      handler(error, platform);
    } catch (err) {
      console.error('[MessagingRouter] Error handler failed:', err.message);
    }
  }
}

/**
 * Register a global message handler
 *
 * @param {Function} handler - Handler function (message) => Promise<void>
 */
export function onMessage(handler) {
  globalMessageHandlers.push(handler);
}

/**
 * Remove a global message handler
 *
 * @param {Function} handler - Handler to remove
 */
export function offMessage(handler) {
  const index = globalMessageHandlers.indexOf(handler);
  if (index >= 0) {
    globalMessageHandlers.splice(index, 1);
  }
}

/**
 * Register a global error handler
 *
 * @param {Function} handler - Handler function (error, platform) => void
 */
export function onError(handler) {
  globalErrorHandlers.push(handler);
}

/**
 * Get router statistics
 *
 * @returns {Object} Statistics
 */
export function getStats() {
  const adapterStats = {};

  for (const [platform, adapter] of adapters.entries()) {
    adapterStats[platform] = adapter.getStats();
  }

  return {
    adapterCount: adapters.size,
    connectedCount: Array.from(adapters.values()).filter(a => a.isConnected()).length,
    messageHandlers: globalMessageHandlers.length,
    errorHandlers: globalErrorHandlers.length,
    adapters: adapterStats,
  };
}

export default {
  registerAdapter,
  unregisterAdapter,
  getAdapter,
  getAdapters,
  connectAll,
  disconnectAll,
  send,
  reply,
  broadcast,
  onMessage,
  offMessage,
  onError,
  getStats,
};
