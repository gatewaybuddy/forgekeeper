/**
 * Messaging Module for Forgekeeper
 *
 * Unified cross-platform messaging abstraction.
 *
 * Usage:
 *   import { router, types, adapters } from './messaging/index.js';
 *
 *   // Register an adapter
 *   const telegram = adapters.createTelegramAdapter({ bot: myBot });
 *   router.registerAdapter(telegram);
 *
 *   // Handle messages
 *   router.onMessage(async (message) => {
 *     console.log(`Got message from ${message.platform}: ${message.content.text}`);
 *     await router.reply(message, { text: 'Hello!' });
 *   });
 */

// Types
export * from './types.js';
export { default as types } from './types.js';

// Base adapter
export { MessagingAdapter } from './adapter.js';

// Router
export * from './router.js';
export { default as router } from './router.js';

// Adapters
export { ConsoleAdapter, createConsoleAdapter } from './adapters/console.js';
export { TelegramAdapter, createTelegramAdapter } from './adapters/telegram.js';

// Convenience object with all adapters
export const adapters = {
  ConsoleAdapter: (await import('./adapters/console.js')).ConsoleAdapter,
  TelegramAdapter: (await import('./adapters/telegram.js')).TelegramAdapter,
  createConsoleAdapter: (await import('./adapters/console.js')).createConsoleAdapter,
  createTelegramAdapter: (await import('./adapters/telegram.js')).createTelegramAdapter,
};

export default {
  types: (await import('./types.js')).default,
  router: (await import('./router.js')).default,
  adapters,
  MessagingAdapter: (await import('./adapter.js')).MessagingAdapter,
};
