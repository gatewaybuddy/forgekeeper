/**
 * Messaging Types for Forgekeeper
 *
 * Defines unified message format for cross-platform communication.
 */

import { randomUUID } from 'crypto';

/**
 * Platform identifiers
 */
export const PLATFORMS = {
  TELEGRAM: 'telegram',
  DISCORD: 'discord',
  SLACK: 'slack',
  CONSOLE: 'console',
  WEBHOOK: 'webhook',
};

/**
 * Channel types
 */
export const CHANNEL_TYPES = {
  DM: 'dm',           // Direct message
  GROUP: 'group',     // Group chat
  CHANNEL: 'channel', // Broadcast channel
  THREAD: 'thread',   // Thread within a channel
};

/**
 * Message types
 */
export const MESSAGE_TYPES = {
  TEXT: 'text',
  COMMAND: 'command',
  MEDIA: 'media',
  SYSTEM: 'system',
  REACTION: 'reaction',
};

/**
 * Create a unified User object
 *
 * @param {Object} options - User options
 * @returns {Object} User object
 */
export function createUser(options) {
  return {
    id: options.id,
    platform: options.platform,
    name: options.name || null,
    username: options.username || null,
    isAdmin: options.isAdmin ?? false,
    isBot: options.isBot ?? false,
    metadata: options.metadata || {},
  };
}

/**
 * Create a unified Channel object
 *
 * @param {Object} options - Channel options
 * @returns {Object} Channel object
 */
export function createChannel(options) {
  return {
    id: options.id,
    platform: options.platform,
    type: options.type || CHANNEL_TYPES.DM,
    name: options.name || null,
    metadata: options.metadata || {},
  };
}

/**
 * Create a unified Message object
 *
 * @param {Object} options - Message options
 * @returns {Object} Message object
 */
export function createMessage(options) {
  return {
    id: options.id || `msg-${randomUUID().slice(0, 8)}`,
    platform: options.platform,
    type: options.type || MESSAGE_TYPES.TEXT,
    channel: options.channel,
    sender: options.sender,
    content: {
      text: options.text || '',
      attachments: options.attachments || [],
      entities: options.entities || [],
    },
    replyTo: options.replyTo || null,
    threadId: options.threadId || null,
    timestamp: options.timestamp || new Date().toISOString(),
    raw: options.raw || null, // Original platform-specific message
    metadata: options.metadata || {},
  };
}

/**
 * Create a unified Response object
 *
 * @param {Object} options - Response options
 * @returns {Object} Response object
 */
export function createResponse(options) {
  return {
    text: options.text || '',
    attachments: options.attachments || [],
    replyToMessageId: options.replyToMessageId || null,
    parseMode: options.parseMode || 'text', // text, markdown, html
    silent: options.silent ?? false,
    metadata: options.metadata || {},
  };
}

/**
 * Create an Attachment object
 *
 * @param {Object} options - Attachment options
 * @returns {Object} Attachment object
 */
export function createAttachment(options) {
  return {
    type: options.type, // image, file, audio, video, sticker
    url: options.url || null,
    path: options.path || null,
    filename: options.filename || null,
    mimeType: options.mimeType || null,
    size: options.size || null,
    metadata: options.metadata || {},
  };
}

/**
 * Validate a message object
 *
 * @param {Object} message - Message to validate
 * @returns {Object} Validation result
 */
export function validateMessage(message) {
  const errors = [];

  if (!message.platform) {
    errors.push('Missing platform');
  }

  if (!message.channel?.id) {
    errors.push('Missing channel.id');
  }

  if (!message.sender?.id) {
    errors.push('Missing sender.id');
  }

  if (!message.content?.text && !message.content?.attachments?.length) {
    errors.push('Message has no content');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if message is a command
 *
 * @param {Object} message - Message to check
 * @returns {boolean} True if command
 */
export function isCommand(message) {
  const text = message.content?.text || '';
  return text.startsWith('/');
}

/**
 * Parse command from message
 *
 * @param {Object} message - Message to parse
 * @returns {Object|null} Command info or null
 */
export function parseCommand(message) {
  const text = message.content?.text || '';

  if (!text.startsWith('/')) {
    return null;
  }

  const parts = text.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return {
    command,
    args,
    raw: text,
  };
}

export default {
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
};
