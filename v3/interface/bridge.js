// Interface Bridge - connects MCP servers (Telegram, Discord) to the main loop
import { spawn } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import loop from '../core/loop.js';
import { tasks, goals, approvals, conversations } from '../core/memory.js';
import { query } from '../core/claude.js';

const connectedServers = new Map();

// Start an interface MCP server
export function startInterface(name, scriptPath) {
  console.log(`[Bridge] Starting interface: ${name}`);

  const proc = spawn('node', [scriptPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
  });

  let buffer = '';

  proc.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = await handleInterfaceRequest(name, request);
        proc.stdin.write(JSON.stringify({ id: request.id, result: response }) + '\n');
      } catch (e) {
        console.error(`[Bridge] Error handling request from ${name}:`, e.message);
      }
    }
  });

  proc.on('close', (code) => {
    console.log(`[Bridge] Interface ${name} exited with code ${code}`);
    connectedServers.delete(name);
  });

  connectedServers.set(name, proc);

  return proc;
}

// Send a message to an interface
export function sendToInterface(name, method, params) {
  const proc = connectedServers.get(name);
  if (!proc) {
    console.error(`[Bridge] Interface not connected: ${name}`);
    return null;
  }

  const request = { method, params };
  proc.stdin.write(JSON.stringify(request) + '\n');
}

// Handle requests from interface servers
async function handleInterfaceRequest(interfaceName, request) {
  const { method, params } = request;

  switch (method) {
    case 'create_task': {
      const task = tasks.create({
        description: params.description,
        origin: `interface:${interfaceName}`,
        tags: params.tags || [],
        metadata: { userId: params.userId },
      });
      return { success: true, taskId: task.id };
    }

    case 'create_goal': {
      const goal = goals.create({
        description: params.description,
        origin: `interface:${interfaceName}`,
        metadata: { userId: params.userId },
      });
      return { success: true, goalId: goal.id };
    }

    case 'get_status': {
      return loop.status();
    }

    case 'resolve_approval': {
      const { id, decision, userId } = params;
      const result = approvals.resolve(id, decision, `interface:${interfaceName}:${userId}`);
      if (result) {
        // Trigger the approval callback if exists
        loop.emit(`approval:${decision}`, { approval: result });
        return { success: true };
      }
      return { success: false, error: 'Approval not found' };
    }

    case 'chat': {
      const { message, userId } = params;

      // Store in conversation history
      conversations.append(userId, { role: 'user', content: message });

      // Get conversation context
      const history = conversations.get(userId, 10);

      // Determine if this is a task, question, or chat
      const intent = await detectIntent(message);

      if (intent.type === 'task') {
        // Create and run as task
        const task = await loop.createAndRun(message, {
          origin: `interface:${interfaceName}`,
          metadata: { userId },
          immediate: true,
        });

        const reply = task.status === 'completed'
          ? `Done! ${task.attempts[task.attempts.length - 1]?.output?.slice(0, 500) || ''}`
          : `Task created: ${task.id}. Status: ${task.status}`;

        conversations.append(userId, { role: 'assistant', content: reply });
        return { reply };
      }

      if (intent.type === 'question') {
        // Quick query via Claude
        const result = await query(message);
        const reply = result.success ? result.output : `Error: ${result.error}`;
        conversations.append(userId, { role: 'assistant', content: reply });
        return { reply };
      }

      // Default: conversational response
      const contextPrompt = history.map(m => `${m.role}: ${m.content}`).join('\n');
      const result = await query(`Given this conversation:\n${contextPrompt}\n\nRespond naturally and helpfully.`);
      const reply = result.success ? result.output : "I'm having trouble right now. Please try again.";
      conversations.append(userId, { role: 'assistant', content: reply });
      return { reply };
    }

    default:
      return { error: `Unknown method: ${method}` };
  }
}

// Detect user intent
async function detectIntent(message) {
  const lowerMsg = message.toLowerCase();

  // Quick heuristics first
  if (lowerMsg.match(/^(create|make|build|add|fix|update|deploy|run|test|install)/)) {
    return { type: 'task', confidence: 0.9 };
  }

  if (lowerMsg.match(/\?$/) || lowerMsg.match(/^(what|why|how|when|where|who|is|are|can|could|would|should)/)) {
    return { type: 'question', confidence: 0.8 };
  }

  if (lowerMsg.match(/^(hi|hello|hey|thanks|ok|yes|no|sure)$/)) {
    return { type: 'chat', confidence: 0.9 };
  }

  // Default to question for ambiguous messages
  return { type: 'question', confidence: 0.5 };
}

// Wire up loop events to broadcast to interfaces
export function setupLoopBroadcasts() {
  loop.on('task:completed', ({ task }) => {
    if (task.metadata?.userId) {
      const interfaceName = task.origin?.split(':')[1];
      if (interfaceName && connectedServers.has(interfaceName)) {
        sendToInterface(interfaceName, 'send_message', {
          userId: task.metadata.userId,
          text: `✅ Task completed: ${task.description}`,
        });
      }
    }
  });

  loop.on('task:failed', ({ task }) => {
    if (task.metadata?.userId) {
      const interfaceName = task.origin?.split(':')[1];
      if (interfaceName && connectedServers.has(interfaceName)) {
        sendToInterface(interfaceName, 'send_message', {
          userId: task.metadata.userId,
          text: `❌ Task failed: ${task.description}`,
        });
      }
    }
  });

  loop.on('task:needs_approval', ({ task, reason }) => {
    // Notify all admin interfaces
    for (const [name] of connectedServers) {
      sendToInterface(name, 'request_approval', {
        userId: task.metadata?.userId,
        description: `Task requires approval:\n${task.description}\n\nReason: ${reason}`,
        approvalId: task.id,
      });
    }
  });
}

export default { startInterface, sendToInterface, setupLoopBroadcasts };
