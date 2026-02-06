/**
 * Console Adapter for Forgekeeper
 *
 * Local console adapter for testing and development.
 * Simulates messaging through stdin/stdout.
 */

import { createInterface } from 'readline';
import { MessagingAdapter } from '../adapter.js';
import { createMessage, createUser, createChannel, PLATFORMS, CHANNEL_TYPES, MESSAGE_TYPES } from '../types.js';

/**
 * Console messaging adapter
 */
export class ConsoleAdapter extends MessagingAdapter {
  constructor(options = {}) {
    super({
      platform: PLATFORMS.CONSOLE,
      name: 'Console',
      ...options,
    });

    this.readline = null;
    this.userId = options.userId || 'console-user';
    this.userName = options.userName || 'Console User';
    this.channelId = options.channelId || 'console-channel';
    this.prompt = options.prompt || '> ';
    this.messageCount = 0;
  }

  /**
   * Connect - set up readline interface
   */
  async connect() {
    if (this.connected) {
      return true;
    }

    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.readline.on('line', (line) => {
      this.handleInput(line);
    });

    this.readline.on('close', () => {
      this.connected = false;
      console.log('[Console] Disconnected');
    });

    this.connected = true;
    console.log('[Console] Connected. Type messages and press Enter.');
    this.showPrompt();

    return true;
  }

  /**
   * Disconnect - close readline interface
   */
  async disconnect() {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    this.connected = false;
    return true;
  }

  /**
   * Handle input from console
   */
  handleInput(line) {
    const text = line.trim();

    if (!text) {
      this.showPrompt();
      return;
    }

    // Special commands
    if (text === '/quit' || text === '/exit') {
      this.disconnect();
      return;
    }

    this.messageCount++;

    // Create unified message
    const message = this.normalizeMessage({
      text,
      timestamp: new Date(),
    });

    // Emit to handlers
    this.emitMessage(message);
  }

  /**
   * Show input prompt
   */
  showPrompt() {
    if (this.readline && this.connected) {
      process.stdout.write(this.prompt);
    }
  }

  /**
   * Send a message to console
   */
  async send(channel, response) {
    const text = this.denormalizeResponse(response);

    console.log('');
    console.log(`[Forgekeeper] ${text}`);
    console.log('');

    this.showPrompt();

    return {
      id: `console-${Date.now()}`,
      success: true,
    };
  }

  /**
   * Reply to a message
   */
  async reply(message, response) {
    return this.send(message.channel, response);
  }

  /**
   * Convert console input to unified message
   */
  normalizeMessage(rawMessage) {
    const user = createUser({
      id: this.userId,
      platform: PLATFORMS.CONSOLE,
      name: this.userName,
      isAdmin: true,
    });

    const channel = createChannel({
      id: this.channelId,
      platform: PLATFORMS.CONSOLE,
      type: CHANNEL_TYPES.DM,
      name: 'Console',
    });

    const isCommand = rawMessage.text.startsWith('/');

    return createMessage({
      id: `console-${this.messageCount}`,
      platform: PLATFORMS.CONSOLE,
      type: isCommand ? MESSAGE_TYPES.COMMAND : MESSAGE_TYPES.TEXT,
      channel,
      sender: user,
      text: rawMessage.text,
      timestamp: rawMessage.timestamp?.toISOString() || new Date().toISOString(),
      raw: rawMessage,
    });
  }

  /**
   * Convert unified response to console output
   */
  denormalizeResponse(response) {
    let text = response.text || '';

    // Handle attachments
    if (response.attachments?.length > 0) {
      const attachmentInfo = response.attachments
        .map(a => `[${a.type}: ${a.filename || a.url}]`)
        .join(' ');
      text += `\n${attachmentInfo}`;
    }

    return text;
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      ...super.getStats(),
      messageCount: this.messageCount,
      userId: this.userId,
      channelId: this.channelId,
    };
  }
}

/**
 * Create and return a console adapter instance
 */
export function createConsoleAdapter(options = {}) {
  return new ConsoleAdapter(options);
}

export default ConsoleAdapter;
