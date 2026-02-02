#!/usr/bin/env node
// Telegram MCP Server for Forgekeeper v3
// Provides bidirectional communication via Telegram
import { Telegraf } from 'telegraf';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FK_DATA_DIR || join(__dirname, '..', 'data');
const PENDING_FILE = join(DATA_DIR, 'telegram_pending.json');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
const ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(Boolean);

if (!BOT_TOKEN) {
  console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Pending messages queue (for when loop requests input)
let pendingRequests = loadPendingRequests();
let messageHandlers = new Map();

function loadPendingRequests() {
  if (existsSync(PENDING_FILE)) {
    try {
      return JSON.parse(readFileSync(PENDING_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function savePendingRequests() {
  writeFileSync(PENDING_FILE, JSON.stringify(pendingRequests, null, 2));
}

// Check if user is allowed
function isAllowed(ctx) {
  const userId = ctx.from?.id?.toString();
  if (ALLOWED_USERS.length === 0) return true; // No restrictions
  return ALLOWED_USERS.includes(userId);
}

function isAdmin(ctx) {
  const userId = ctx.from?.id?.toString();
  return ADMIN_USERS.includes(userId);
}

// Bot commands
bot.command('start', (ctx) => {
  if (!isAllowed(ctx)) {
    return ctx.reply('Not authorized. Contact admin for access.');
  }
  ctx.reply(`Welcome to Forgekeeper v3!

Commands:
/task <description> - Create a new task
/goal <description> - Create a new goal
/status - Show current status
/approve <id> - Approve a pending request
/reject <id> - Reject a pending request
/help - Show this help

Just send a message to chat with me.`);
});

bot.command('task', async (ctx) => {
  if (!isAllowed(ctx)) return;
  const description = ctx.message.text.replace('/task', '').trim();
  if (!description) {
    return ctx.reply('Usage: /task <description>');
  }

  // Send to loop via stdout (MCP protocol)
  const response = await mcpCall('create_task', { description, userId: ctx.from.id });
  ctx.reply(`Task created: ${response.taskId}\n${description}`);
});

bot.command('goal', async (ctx) => {
  if (!isAllowed(ctx)) return;
  const description = ctx.message.text.replace('/goal', '').trim();
  if (!description) {
    return ctx.reply('Usage: /goal <description>');
  }

  const response = await mcpCall('create_goal', { description, userId: ctx.from.id });
  ctx.reply(`Goal created: ${response.goalId}\n${description}`);
});

bot.command('status', async (ctx) => {
  if (!isAllowed(ctx)) return;

  const response = await mcpCall('get_status', {});
  ctx.reply(`📊 Forgekeeper Status

🔄 Running: ${response.running ? 'Yes' : 'No'}
📋 Pending Tasks: ${response.pendingTasks}
🎯 Active Goals: ${response.activeGoals}
✅ Pending Approvals: ${response.pendingApprovals}
${response.currentTask ? `\n⚡ Current: ${response.currentTask}` : ''}`);
});

bot.command('approve', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Only admins can approve requests.');
  }
  const id = ctx.message.text.replace('/approve', '').trim();
  if (!id) {
    return ctx.reply('Usage: /approve <approval-id>');
  }

  const response = await mcpCall('resolve_approval', { id, decision: 'approved', userId: ctx.from.id });
  ctx.reply(response.success ? `✅ Approved: ${id}` : `❌ Failed: ${response.error}`);
});

bot.command('reject', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Only admins can reject requests.');
  }
  const id = ctx.message.text.replace('/reject', '').trim();
  if (!id) {
    return ctx.reply('Usage: /reject <approval-id>');
  }

  const response = await mcpCall('resolve_approval', { id, decision: 'rejected', userId: ctx.from.id });
  ctx.reply(response.success ? `❌ Rejected: ${id}` : `❌ Failed: ${response.error}`);
});

// Handle regular messages
bot.on('text', async (ctx) => {
  if (!isAllowed(ctx)) return;

  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Check if this is a response to a pending request
  const pending = pendingRequests.find(r => r.userId === userId && r.status === 'waiting');
  if (pending) {
    pending.response = text;
    pending.status = 'responded';
    savePendingRequests();

    // Resolve the handler if waiting
    const handler = messageHandlers.get(pending.id);
    if (handler) {
      handler.resolve(text);
      messageHandlers.delete(pending.id);
    }

    ctx.reply('Got it! Processing...');
    return;
  }

  // Otherwise, treat as a chat message / task
  ctx.reply('Processing your message...');

  const response = await mcpCall('chat', { message: text, userId });

  if (response.reply) {
    ctx.reply(response.reply);
  }
});

// MCP Protocol - communicate with the main loop
const mcpRequests = new Map();
let requestId = 0;

function mcpCall(method, params) {
  return new Promise((resolve) => {
    const id = ++requestId;
    mcpRequests.set(id, resolve);

    const request = { id, method, params };
    console.log(JSON.stringify(request));

    // Timeout after 30 seconds
    setTimeout(() => {
      if (mcpRequests.has(id)) {
        mcpRequests.delete(id);
        resolve({ error: 'Request timed out' });
      }
    }, 30000);
  });
}

// Listen for responses from the loop
const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const data = JSON.parse(line);

    // Response to our request
    if (data.id && mcpRequests.has(data.id)) {
      const resolve = mcpRequests.get(data.id);
      mcpRequests.delete(data.id);
      resolve(data.result || data);
      return;
    }

    // Incoming request from loop (e.g., send message, request input)
    if (data.method) {
      const result = await handleLoopRequest(data);
      console.log(JSON.stringify({ id: data.id, result }));
    }
  } catch (e) {
    console.error('[Telegram] Parse error:', e.message);
  }
});

// Handle requests from the main loop
async function handleLoopRequest(request) {
  const { method, params } = request;

  switch (method) {
    case 'send_message': {
      const { userId, text, options } = params;
      try {
        await bot.telegram.sendMessage(userId, text, options);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'request_input': {
      const { userId, prompt, timeout = 300000 } = params;
      const reqId = `input-${Date.now()}`;

      // Send prompt to user
      await bot.telegram.sendMessage(userId, prompt);

      // Add to pending
      const pending = {
        id: reqId,
        userId,
        prompt,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      pendingRequests.push(pending);
      savePendingRequests();

      // Wait for response
      return new Promise((resolve) => {
        messageHandlers.set(reqId, { resolve: (text) => resolve({ success: true, response: text }) });

        setTimeout(() => {
          if (messageHandlers.has(reqId)) {
            messageHandlers.delete(reqId);
            pending.status = 'timeout';
            savePendingRequests();
            resolve({ success: false, error: 'Timeout waiting for response' });
          }
        }, timeout);
      });
    }

    case 'request_approval': {
      const { userId, description, data, approvalId } = params;

      let message = `🔔 Approval Required\n\n${description}`;

      if (data?.code) {
        message += `\n\nCode preview:\n\`\`\`\n${data.code.slice(0, 500)}...\n\`\`\``;
      }

      message += `\n\nReply:\n/approve ${approvalId}\n/reject ${approvalId}`;

      await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      return { success: true, notified: true };
    }

    case 'broadcast': {
      const { text, onlyAdmins } = params;
      const targets = onlyAdmins ? ADMIN_USERS : ALLOWED_USERS;

      for (const userId of targets) {
        try {
          await bot.telegram.sendMessage(userId, text);
        } catch (e) {
          console.error(`[Telegram] Failed to send to ${userId}:`, e.message);
        }
      }
      return { success: true, sent: targets.length };
    }

    default:
      return { error: `Unknown method: ${method}` };
  }
}

// Start bot
bot.launch()
  .then(() => {
    console.error('[Telegram] Bot started');
    console.error(`[Telegram] Allowed users: ${ALLOWED_USERS.length || 'all'}`);
    console.error(`[Telegram] Admin users: ${ADMIN_USERS.length}`);
  })
  .catch((err) => {
    console.error('[Telegram] Failed to start:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
