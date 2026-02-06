/**
 * Base Messaging Adapter for Forgekeeper
 *
 * Abstract base class that all platform adapters extend.
 * Defines the interface for platform communication.
 */

/**
 * Base adapter class
 * All platform adapters must extend this class.
 */
export class MessagingAdapter {
  constructor(options = {}) {
    this.platform = options.platform || 'unknown';
    this.name = options.name || this.platform;
    this.connected = false;
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.options = options;
  }

  /**
   * Get platform identifier
   * @returns {string} Platform name
   */
  getPlatform() {
    return this.platform;
  }

  /**
   * Check if adapter is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Connect to the platform
   * Must be implemented by subclasses.
   * @returns {Promise<boolean>} Success status
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the platform
   * Must be implemented by subclasses.
   * @returns {Promise<boolean>} Success status
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Send a message
   * Must be implemented by subclasses.
   *
   * @param {Object} channel - Channel to send to
   * @param {Object} response - Response object
   * @returns {Promise<Object>} Sent message result
   */
  async send(channel, response) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Reply to a message
   * Can be overridden by subclasses for platform-specific reply behavior.
   *
   * @param {Object} message - Original message to reply to
   * @param {Object} response - Response object
   * @returns {Promise<Object>} Sent message result
   */
  async reply(message, response) {
    // Default implementation: send to same channel with replyTo set
    const replyResponse = {
      ...response,
      replyToMessageId: message.id,
    };

    return this.send(message.channel, replyResponse);
  }

  /**
   * Edit a previously sent message
   * Can be overridden by subclasses.
   *
   * @param {Object} channel - Channel containing the message
   * @param {string} messageId - ID of message to edit
   * @param {Object} response - New response content
   * @returns {Promise<Object>} Edit result
   */
  async edit(channel, messageId, response) {
    throw new Error('edit() not supported by this adapter');
  }

  /**
   * Delete a message
   * Can be overridden by subclasses.
   *
   * @param {Object} channel - Channel containing the message
   * @param {string} messageId - ID of message to delete
   * @returns {Promise<boolean>} Success status
   */
  async delete(channel, messageId) {
    throw new Error('delete() not supported by this adapter');
  }

  /**
   * Convert platform-specific message to unified format
   * Must be implemented by subclasses.
   *
   * @param {Object} rawMessage - Platform-specific message
   * @returns {Object} Unified message object
   */
  normalizeMessage(rawMessage) {
    throw new Error('normalizeMessage() must be implemented by subclass');
  }

  /**
   * Convert unified response to platform-specific format
   * Must be implemented by subclasses.
   *
   * @param {Object} response - Unified response
   * @returns {Object} Platform-specific format
   */
  denormalizeResponse(response) {
    throw new Error('denormalizeResponse() must be implemented by subclass');
  }

  /**
   * Register a message handler
   *
   * @param {Function} handler - Handler function (message) => Promise<void>
   */
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  /**
   * Remove a message handler
   *
   * @param {Function} handler - Handler to remove
   */
  offMessage(handler) {
    const index = this.messageHandlers.indexOf(handler);
    if (index >= 0) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * Register an error handler
   *
   * @param {Function} handler - Handler function (error) => void
   */
  onError(handler) {
    this.errorHandlers.push(handler);
  }

  /**
   * Emit a message to all handlers
   *
   * @param {Object} message - Unified message
   */
  async emitMessage(message) {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (err) {
        this.emitError(err);
      }
    }
  }

  /**
   * Emit an error to all handlers
   *
   * @param {Error} error - Error object
   */
  emitError(error) {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (err) {
        console.error('[Adapter] Error handler failed:', err.message);
      }
    }
  }

  /**
   * Get adapter statistics
   * Can be overridden by subclasses.
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      platform: this.platform,
      connected: this.connected,
      messageHandlers: this.messageHandlers.length,
      errorHandlers: this.errorHandlers.length,
    };
  }
}

export default MessagingAdapter;
