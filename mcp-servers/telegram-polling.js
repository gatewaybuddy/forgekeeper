// Custom polling implementation that works with Node 23
// Uses native fetch instead of Telegraf's internal HTTP client

export class TelegramPoller {
  constructor(token, options = {}) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.running = false;
    this.timeout = options.timeout || 30;
    this.limit = options.limit || 100;
    this.handlers = {
      message: [],
      error: [],
    };
  }

  on(event, handler) {
    if (this.handlers[event]) {
      this.handlers[event].push(handler);
    }
    return this;
  }

  async callApi(method, params = {}) {
    const url = new URL(`${this.baseUrl}/${method}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.append(k, v);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || 'Telegram API error');
    }
    return data.result;
  }

  async sendMessage(chatId, text, options = {}) {
    return this.callApi('sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  async setMessageReaction(chatId, messageId, reaction) {
    try {
      return await this.callApi('setMessageReaction', {
        chat_id: chatId,
        message_id: messageId,
        reaction: JSON.stringify([{ type: 'emoji', emoji: reaction }]),
      });
    } catch (e) {
      // Reactions might not be supported in all chats
    }
  }

  async getUpdates() {
    return this.callApi('getUpdates', {
      offset: this.offset,
      timeout: this.timeout,
      limit: this.limit,
      allowed_updates: JSON.stringify(['message']),
    });
  }

  async deleteWebhook(dropPending = false) {
    return this.callApi('deleteWebhook', {
      drop_pending_updates: dropPending,
    });
  }

  async getMe() {
    return this.callApi('getMe');
  }

  async start(options = {}) {
    if (this.running) return;

    console.error('[TelegramPoller] Starting...');

    // Clear any webhook and optionally drop pending updates
    if (options.dropPendingUpdates) {
      await this.deleteWebhook(true);
    }

    // Verify bot token
    const me = await this.getMe();
    console.error(`[TelegramPoller] Connected as @${me.username}`);

    this.running = true;
    this.poll();
    return me;
  }

  async poll() {
    while (this.running) {
      try {
        const updates = await this.getUpdates();

        for (const update of updates) {
          this.offset = update.update_id + 1;

          if (update.message) {
            const ctx = {
              update,
              message: update.message,
              from: update.message.from,
              chat: update.message.chat,
              reply: (text, options) => this.sendMessage(update.message.chat.id, text, options),
              react: (emoji) => this.setMessageReaction(update.message.chat.id, update.message.message_id, emoji),
            };

            for (const handler of this.handlers.message) {
              try {
                await handler(ctx);
              } catch (e) {
                console.error('[TelegramPoller] Handler error:', e.message);
              }
            }
          }
        }
      } catch (err) {
        console.error('[TelegramPoller] Poll error:', err.message);
        for (const handler of this.handlers.error) {
          handler(err);
        }
        // Wait before retrying on error
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  stop() {
    console.error('[TelegramPoller] Stopping...');
    this.running = false;
  }
}
