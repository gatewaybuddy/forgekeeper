/**
 * Telegram Adapter for Forgekeeper
 *
 * Wraps existing Telegram functionality in the unified messaging interface.
 */

import { MessagingAdapter } from '../adapter.js';
import { createMessage, createUser, createChannel, PLATFORMS, CHANNEL_TYPES, MESSAGE_TYPES } from '../types.js';
import { sendChunkedMessage, chunkMessage } from '../../telegram-chunker.js';
import { config } from '../../../config.js';

// Telegram API constants
const MAX_MESSAGE_LENGTH = config.telegram?.maxLength || 4096;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300;

/**
 * Retry a Telegram API call with exponential backoff.
 * Handles 429 (rate limit) with Telegram's retry_after, and retries on 5xx/network errors.
 */
async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.code === 'ETELEGRAM' && err.response?.statusCode === 429 ||
        err.code === 'ETELEGRAM' && err.response?.statusCode >= 500 ||
        err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND';

      if (!isRetryable || attempt === retries) {
        throw err;
      }

      // Use Telegram's retry_after if provided, otherwise exponential backoff
      const retryAfter = err.response?.body?.parameters?.retry_after;
      const delayMs = retryAfter ? retryAfter * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[TelegramAdapter] Retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries}): ${err.message}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Telegram messaging adapter
 */
export class TelegramAdapter extends MessagingAdapter {
  constructor(options = {}) {
    super({
      platform: PLATFORMS.TELEGRAM,
      name: 'Telegram',
      ...options,
    });

    this.bot = options.bot || null;
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.allowedUsers = options.allowedUsers || (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
    this.adminUsers = options.adminUsers || (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(Boolean);
    this.messageCount = 0;
  }

  /**
   * Set the bot instance (for integration with existing telegram.js)
   */
  setBot(bot) {
    this.bot = bot;
  }

  /**
   * Connect - start polling (or mark as connected if bot already running)
   */
  async connect() {
    if (!this.bot && !this.botToken) {
      throw new Error('No bot instance or token provided');
    }

    // If we have a bot instance, assume it's already connected
    if (this.bot) {
      this.connected = true;
      console.log('[TelegramAdapter] Connected via existing bot instance');
      return true;
    }

    // Otherwise would need to initialize bot here
    // For now, require bot to be passed in
    throw new Error('Bot instance must be provided via setBot()');
  }

  /**
   * Disconnect - stop polling
   */
  async disconnect() {
    if (this.bot && typeof this.bot.stop === 'function') {
      try {
        await this.bot.stop();
      } catch (err) {
        console.error('[TelegramAdapter] Error stopping bot:', err.message);
      }
    }

    this.connected = false;
    return true;
  }

  /**
   * Check if user is allowed
   */
  isUserAllowed(userId, username) {
    // Default-deny: if no allowed users configured, reject all messages.
    // This prevents an unconfigured bot from accepting messages from anyone.
    if (this.allowedUsers.length === 0) {
      console.warn('[Telegram] WARNING: No TELEGRAM_ALLOWED_USERS configured — rejecting all messages. Set TELEGRAM_ALLOWED_USERS to allow access.');
      return false;
    }

    return this.allowedUsers.some(allowed => {
      const a = allowed.toLowerCase();
      return a === userId?.toString() || a === `@${username?.toLowerCase()}` || a === username?.toLowerCase();
    });
  }

  /**
   * Check if user is admin
   */
  isUserAdmin(userId, username) {
    return this.adminUsers.some(allowed => {
      const a = allowed.toLowerCase();
      return a === userId?.toString() || a === `@${username?.toLowerCase()}` || a === username?.toLowerCase();
    });
  }

  /**
   * Send a message
   */
  async send(channel, response) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const chatId = channel.id;
    const options = this.denormalizeResponse(response);
    const text = response.text || '';

    // Use chunker for long messages
    if (text.length > MAX_MESSAGE_LENGTH) {
      const sendFn = async (cid, txt, opts) => {
        return withRetry(() => this.bot.sendMessage(cid, txt, opts));
      };

      const results = await sendChunkedMessage(sendFn, chatId, text, options);
      return {
        id: results[results.length - 1]?.message_id,
        success: true,
        chunks: results.length,
      };
    }

    // Single message
    const result = await withRetry(() => this.bot.sendMessage(chatId, text, options));

    return {
      id: result.message_id,
      success: true,
    };
  }

  /**
   * Reply to a message
   */
  async reply(message, response) {
    const options = this.denormalizeResponse(response);
    options.reply_to_message_id = message.raw?.message_id;

    return this.send(message.channel, {
      ...response,
      metadata: { ...response.metadata, replyOptions: options },
    });
  }

  /**
   * Edit a message
   */
  async edit(channel, messageId, response) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const options = this.denormalizeResponse(response);

    const result = await withRetry(() => this.bot.editMessageText(response.text, {
      chat_id: channel.id,
      message_id: messageId,
      ...options,
    }));

    return {
      id: messageId,
      success: true,
      result,
    };
  }

  /**
   * Delete a message
   */
  async delete(channel, messageId) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    await withRetry(() => this.bot.deleteMessage(channel.id, messageId));

    return true;
  }

  /**
   * Convert Telegram message to unified format
   */
  normalizeMessage(rawMessage) {
    const from = rawMessage.from || {};
    const chat = rawMessage.chat || {};

    const user = createUser({
      id: from.id?.toString(),
      platform: PLATFORMS.TELEGRAM,
      name: [from.first_name, from.last_name].filter(Boolean).join(' ') || null,
      username: from.username,
      isAdmin: this.isUserAdmin(from.id, from.username),
      isBot: from.is_bot,
      metadata: {
        languageCode: from.language_code,
      },
    });

    const channelType = this.getChannelType(chat);

    const channel = createChannel({
      id: chat.id?.toString(),
      platform: PLATFORMS.TELEGRAM,
      type: channelType,
      name: chat.title || chat.username || null,
      metadata: {
        chatType: chat.type,
      },
    });

    const text = rawMessage.text || rawMessage.caption || '';
    const isCommand = text.startsWith('/');

    this.messageCount++;

    return createMessage({
      id: rawMessage.message_id?.toString(),
      platform: PLATFORMS.TELEGRAM,
      type: isCommand ? MESSAGE_TYPES.COMMAND : MESSAGE_TYPES.TEXT,
      channel,
      sender: user,
      text,
      attachments: this.extractAttachments(rawMessage),
      entities: rawMessage.entities || [],
      replyTo: rawMessage.reply_to_message?.message_id?.toString() || null,
      timestamp: new Date(rawMessage.date * 1000).toISOString(),
      raw: rawMessage,
      metadata: {
        forwardFrom: rawMessage.forward_from,
        forwardDate: rawMessage.forward_date,
      },
    });
  }

  /**
   * Get channel type from Telegram chat
   */
  getChannelType(chat) {
    switch (chat.type) {
      case 'private':
        return CHANNEL_TYPES.DM;
      case 'group':
      case 'supergroup':
        return CHANNEL_TYPES.GROUP;
      case 'channel':
        return CHANNEL_TYPES.CHANNEL;
      default:
        return CHANNEL_TYPES.DM;
    }
  }

  /**
   * Extract attachments from Telegram message
   */
  extractAttachments(message) {
    const attachments = [];

    if (message.photo) {
      const largest = message.photo[message.photo.length - 1];
      attachments.push({
        type: 'image',
        fileId: largest.file_id,
        width: largest.width,
        height: largest.height,
        fileSize: largest.file_size,
      });
    }

    if (message.document) {
      attachments.push({
        type: 'file',
        fileId: message.document.file_id,
        filename: message.document.file_name,
        mimeType: message.document.mime_type,
        fileSize: message.document.file_size,
      });
    }

    if (message.audio) {
      attachments.push({
        type: 'audio',
        fileId: message.audio.file_id,
        filename: message.audio.file_name,
        duration: message.audio.duration,
        mimeType: message.audio.mime_type,
      });
    }

    if (message.video) {
      attachments.push({
        type: 'video',
        fileId: message.video.file_id,
        width: message.video.width,
        height: message.video.height,
        duration: message.video.duration,
      });
    }

    if (message.voice) {
      attachments.push({
        type: 'audio',
        fileId: message.voice.file_id,
        duration: message.voice.duration,
      });
    }

    if (message.sticker) {
      attachments.push({
        type: 'sticker',
        fileId: message.sticker.file_id,
        emoji: message.sticker.emoji,
        setName: message.sticker.set_name,
      });
    }

    return attachments;
  }

  /**
   * Convert unified response to Telegram format
   */
  denormalizeResponse(response) {
    const options = {};

    // Parse mode
    if (response.parseMode === 'markdown') {
      options.parse_mode = 'MarkdownV2';
    } else if (response.parseMode === 'html') {
      options.parse_mode = 'HTML';
    }

    // Silent mode
    if (response.silent) {
      options.disable_notification = true;
    }

    // Reply markup from metadata
    if (response.metadata?.replyMarkup) {
      options.reply_markup = response.metadata.replyMarkup;
    }

    return options;
  }

  /**
   * Handle incoming Telegram update
   * Call this from the existing telegram.js message handler
   */
  handleUpdate(update) {
    if (update.message) {
      const message = this.normalizeMessage(update.message);

      // Check permissions
      if (!this.isUserAllowed(message.sender.id, message.sender.username)) {
        console.log(`[TelegramAdapter] Unauthorized user: ${message.sender.id}`);
        return;
      }

      this.emitMessage(message);
    }
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      ...super.getStats(),
      messageCount: this.messageCount,
      allowedUsers: this.allowedUsers.length,
      adminUsers: this.adminUsers.length,
    };
  }
}

/**
 * Create and return a Telegram adapter instance
 */
export function createTelegramAdapter(options = {}) {
  return new TelegramAdapter(options);
}

export default TelegramAdapter;
