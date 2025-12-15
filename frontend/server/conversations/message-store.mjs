/**
 * Message Store - JSONL-based message persistence for conversation spaces
 *
 * Provides atomic message append, retrieval, and querying operations.
 * Messages are stored in JSONL format (one JSON object per line) for:
 * - Atomic append operations (file system guarantees)
 * - Simple tail/grep operations
 * - Rotation and archival support
 * - Human-readable format for debugging
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';

const CONVERSATION_SPACES_DIR = '.forgekeeper/conversation_spaces';
const CHANNELS_DIR = path.join(CONVERSATION_SPACES_DIR, 'channels');
const THREADS_DIR = path.join(CONVERSATION_SPACES_DIR, 'threads');

// In-memory LRU cache for recent messages (performance optimization)
const messageCache = new Map(); // channelId -> {messages: [], lastModified: timestamp}
const CACHE_SIZE = 100; // Keep last 100 messages per channel in memory

/**
 * Append a message to a channel's JSONL file
 *
 * @param {string} channelId - Channel identifier (e.g., "general")
 * @param {object} message - Message object
 * @returns {Promise<object>} The complete message with generated ID and timestamp
 */
export async function appendMessage(channelId, message) {
  const filePath = path.join(CHANNELS_DIR, `${channelId}.jsonl`);

  // Ensure message has ID and timestamp
  const fullMessage = {
    ...message,
    id: message.id || ulid(),
    created_at: message.created_at || new Date().toISOString()
  };

  // Atomic append (file system guarantees atomicity)
  const line = JSON.stringify(fullMessage) + '\n';
  await fs.appendFile(filePath, line, 'utf8');

  // Update cache
  updateCache(channelId, fullMessage);

  return fullMessage;
}

/**
 * Get recent messages from a channel
 *
 * @param {string} channelId - Channel identifier
 * @param {number} limit - Maximum number of messages to retrieve (default: 50)
 * @returns {Promise<Array>} Array of messages, most recent last
 */
export async function getRecentMessages(channelId, limit = 50) {
  // Check cache first
  const cached = messageCache.get(channelId);
  if (cached && cached.messages.length > 0) {
    return cached.messages.slice(-limit);
  }

  const filePath = path.join(CHANNELS_DIR, `${channelId}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Get last N lines
    const recentLines = lines.slice(-limit);
    const messages = recentLines.map(line => JSON.parse(line));

    // Update cache
    messageCache.set(channelId, {
      messages,
      lastModified: Date.now()
    });

    return messages;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist yet - return empty array
      return [];
    }
    throw err;
  }
}

/**
 * Get messages since a specific message ID
 *
 * Useful for agents catching up on new messages since their last read.
 *
 * @param {string} channelId - Channel identifier
 * @param {string} sinceMessageId - Get messages after this ID
 * @param {number} limit - Maximum number of messages to retrieve (default: 100)
 * @returns {Promise<Array>} Array of messages after sinceMessageId
 */
export async function getMessagesSince(channelId, sinceMessageId, limit = 100) {
  const filePath = path.join(CHANNELS_DIR, `${channelId}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    const messages = lines.map(line => JSON.parse(line));

    // Find index of sinceMessageId
    const sinceIndex = messages.findIndex(m => m.id === sinceMessageId);

    if (sinceIndex === -1) {
      // Message not found - return recent messages as fallback
      console.warn(`[MessageStore] Message ID ${sinceMessageId} not found in ${channelId}, returning recent messages`);
      return messages.slice(-limit);
    }

    // Return messages after sinceIndex
    const newMessages = messages.slice(sinceIndex + 1, sinceIndex + 1 + limit);
    return newMessages;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Get a specific message by ID
 *
 * @param {string} channelId - Channel identifier
 * @param {string} messageId - Message ID to retrieve
 * @returns {Promise<object|null>} Message object or null if not found
 */
export async function getMessage(channelId, messageId) {
  const filePath = path.join(CHANNELS_DIR, `${channelId}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const message = JSON.parse(line);
      if (message.id === messageId) {
        return message;
      }
    }

    return null;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Count unread messages for an agent
 *
 * @param {string} channelId - Channel identifier
 * @param {string} lastReadMessageId - Last message ID the agent read
 * @returns {Promise<number>} Number of unread messages
 */
export async function countUnreadMessages(channelId, lastReadMessageId) {
  const messages = await getMessagesSince(channelId, lastReadMessageId, 1000);
  return messages.length;
}

/**
 * Get all messages in a channel (use with caution for large channels)
 *
 * @param {string} channelId - Channel identifier
 * @returns {Promise<Array>} All messages in the channel
 */
export async function getAllMessages(channelId) {
  const filePath = path.join(CHANNELS_DIR, `${channelId}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Append a threaded reply
 *
 * @param {string} parentMessageId - Parent message ID
 * @param {object} reply - Reply message object
 * @returns {Promise<object>} The complete reply message
 */
export async function appendThreadReply(parentMessageId, reply) {
  const filePath = path.join(THREADS_DIR, `${parentMessageId}-replies.jsonl`);

  const fullReply = {
    ...reply,
    id: reply.id || ulid(),
    thread_parent_id: parentMessageId,
    created_at: reply.created_at || new Date().toISOString()
  };

  const line = JSON.stringify(fullReply) + '\n';
  await fs.appendFile(filePath, line, 'utf8');

  return fullReply;
}

/**
 * Get threaded replies for a message
 *
 * @param {string} parentMessageId - Parent message ID
 * @returns {Promise<Array>} Array of reply messages
 */
export async function getThreadReplies(parentMessageId) {
  const filePath = path.join(THREADS_DIR, `${parentMessageId}-replies.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Update message cache (internal helper)
 *
 * @param {string} channelId - Channel identifier
 * @param {object} newMessage - New message to add to cache
 */
function updateCache(channelId, newMessage) {
  const cached = messageCache.get(channelId);

  if (cached) {
    cached.messages.push(newMessage);

    // Trim cache if too large
    if (cached.messages.length > CACHE_SIZE) {
      cached.messages = cached.messages.slice(-CACHE_SIZE);
    }

    cached.lastModified = Date.now();
  } else {
    messageCache.set(channelId, {
      messages: [newMessage],
      lastModified: Date.now()
    });
  }
}

/**
 * Clear cache for a channel (useful for testing)
 *
 * @param {string} channelId - Channel identifier
 */
export function clearCache(channelId) {
  if (channelId) {
    messageCache.delete(channelId);
  } else {
    messageCache.clear();
  }
}

/**
 * Get cache statistics (for monitoring)
 *
 * @returns {object} Cache statistics
 */
export function getCacheStats() {
  const stats = {
    channels: messageCache.size,
    totalMessages: 0,
    channels: []
  };

  for (const [channelId, cache] of messageCache.entries()) {
    stats.totalMessages += cache.messages.length;
    stats.channels.push({
      id: channelId,
      messageCount: cache.messages.length,
      lastModified: new Date(cache.lastModified).toISOString()
    });
  }

  return stats;
}
