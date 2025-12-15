/**
 * Conversation Space Orchestrator
 *
 * Main orchestration layer for multi-agent conversation spaces.
 * Provides:
 * - API endpoints for posting/reading messages
 * - SSE streaming for real-time updates
 * - Agent lifecycle management
 * - Channel management
 *
 * Architecture:
 * - HTTP POST → Message Store → MessageBus → Agents wake → Assess → Contribute → SSE broadcast
 */

import { ForgeMonitor } from './server.agent-forge.mjs';
import { ScoutMonitor } from './server.agent-scout.mjs';
import { LoomMonitor } from './server.agent-loom.mjs';
import { AnvilMonitor } from './server.agent-anvil.mjs';
import { GenericAgentMonitor } from './server.agent-generic.mjs';
import { MessageBus, emitMessageCreated, subscribe } from './server.message-bus.mjs';
import { appendMessage, getRecentMessages, getMessage, getAllMessages } from './server.message-store.mjs';
import {
  loadAgentConfig,
  getEnabledAgents,
  getAgent as getAgentConfig,
  updateAgent as updateAgentConfig,
  createAgent as createAgentConfig,
  deleteAgent as deleteAgentConfig
} from './server.agent-config.mjs';
import { ulid } from 'ulid';
import fs from 'node:fs/promises';
import path from 'node:path';

// Active agent instances
const activeAgents = new Map();

// Active SSE connections per channel
const activeStreams = new Map(); // channelId -> Set<Response>

/**
 * Initialize conversation space system
 *
 * @param {object} app - Express app instance
 */
export async function initConversationSpace(app) {
  console.log('[ConversationSpace] Initializing...');

  // 1. Setup directories
  await setupDirectories();

  // 2. Setup API routes
  await setupRoutes(app);

  // 3. Start agent monitors
  await startAgents();

  // 4. Setup message bus listeners for SSE broadcasting
  setupBroadcasting();

  console.log('[ConversationSpace] ✅ Ready');
  console.log('[ConversationSpace] API:');
  console.log('  Conversations:');
  console.log('    GET  /api/conversation-space/conversations');
  console.log('    POST /api/conversation-space/conversations');
  console.log('    GET  /api/conversation-space/conversations/:id');
  console.log('    PUT  /api/conversation-space/conversations/:id');
  console.log('    POST /api/conversation-space/conversations/:id/archive');
  console.log('    DEL  /api/conversation-space/conversations/:id');
  console.log('    GET  /api/conversation-space/conversations/:id/messages');
  console.log('    POST /api/conversation-space/conversations/:id/messages');
  console.log('  Projects:');
  console.log('    GET  /api/conversation-space/projects');
  console.log('    POST /api/conversation-space/projects');
  console.log('    PUT  /api/conversation-space/projects/:id');
  console.log('    DEL  /api/conversation-space/projects/:id');
  console.log('  Search:');
  console.log('    GET  /api/conversation-space/search');
  console.log('  Legacy (Channels):');
  console.log('    POST /api/conversation-space/channels/:channelId/messages');
  console.log('    GET  /api/conversation-space/channels/:channelId/messages');
  console.log('    POST /api/conversation-space/channels/:channelId/archive');
  console.log('    GET  /api/conversation-space/channels/:channelId/archives');
  console.log('  Other:');
  console.log('    GET  /api/conversation-space/stream/:channelId');
  console.log('    GET  /api/conversation-space/status');
  console.log('    GET  /api/conversation-space/agents');
  console.log('    GET  /api/conversation-space/agents/:agentId');
  console.log('    PUT  /api/conversation-space/agents/:agentId');
  console.log('    POST /api/conversation-space/agents');
  console.log('    DEL  /api/conversation-space/agents/:agentId');
  console.log('    POST /api/conversation-space/reload-agents');
  console.log('    GET  /api/conversation-space/agents/:agentId/prompt');
  console.log('    PUT  /api/conversation-space/agents/:agentId/prompt');
}

/**
 * Setup directory structure
 */
async function setupDirectories() {
  const dirs = [
    '.forgekeeper/conversation_spaces',
    '.forgekeeper/conversation_spaces/channels',
    '.forgekeeper/conversation_spaces/threads',
    '.forgekeeper/conversation_spaces/agent_context'
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Ensure general channel exists
  const generalPath = '.forgekeeper/conversation_spaces/channels/general.jsonl';
  try {
    await fs.access(generalPath);
  } catch {
    await fs.writeFile(generalPath, '');
    console.log('[ConversationSpace] Created #general channel');
  }
}

/**
 * Start all agent monitors
 */
async function startAgents() {
  // Load enabled agents from config
  const enabledAgents = await getEnabledAgents();

  console.log(`[ConversationSpace] Loading ${enabledAgents.length} enabled agents from config...`);

  // Map of known agents with custom monitor classes
  const agentMap = {
    forge: ForgeMonitor,
    scout: ScoutMonitor,
    loom: LoomMonitor,
    anvil: AnvilMonitor
  };

  for (const agentConfig of enabledAgents) {
    const AgentClass = agentMap[agentConfig.id];

    let agent;
    if (AgentClass) {
      // Use custom monitor class for known agents
      agent = new AgentClass(agentConfig.channels || ['general']);
      console.log(`[ConversationSpace] ✓ Using custom monitor for ${agentConfig.id}`);
    } else {
      // Use generic monitor for new/unknown agents
      agent = new GenericAgentMonitor(agentConfig);
      console.log(`[ConversationSpace] ✓ Using generic monitor for ${agentConfig.id}`);
    }

    await agent.start();
    activeAgents.set(agent.agentId, agent);
    console.log(`[ConversationSpace] ✓ Started ${agentConfig.id} (${agentConfig.name})`);
  }

  console.log(`[ConversationSpace] Started ${activeAgents.size} agents`);
}

/**
 * Setup SSE broadcasting listeners
 */
function setupBroadcasting() {
  // Subscribe to all events and broadcast to SSE clients
  const eventTypes = [
    'message_created',
    'message_edited',
    'agent_thinking',
    'agent_contributing',
    'agent_chunk',
    'agent_complete',
    'reaction_added',
    'reaction_removed',
    'channel_created',
    'topic_changed',
    'agent_online',
    'agent_offline'
  ];

  for (const eventType of eventTypes) {
    subscribe(eventType, (event) => {
      const channelId = event.channel_id || 'general';
      broadcastToChannel(channelId, eventType, event);
    });
  }
}

/**
 * Setup HTTP API routes
 *
 * @param {object} app - Express app
 */
async function setupRoutes(app) {
  // POST: Create a message
  app.post('/api/conversation-space/channels/:channelId/messages', async (req, res) => {
    try {
      const { channelId } = req.params;
      const { content, metadata, thread_parent_id } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid content' });
      }

      // Create message
      const message = {
        id: ulid(),
        channel_id: channelId,
        thread_parent_id: thread_parent_id || null,
        author_type: 'human',
        author_id: 'rado', // TODO: Get from session/auth
        author_name: 'Rado',
        author_avatar: '👤',
        content,
        metadata: metadata || null,
        created_at: new Date().toISOString()
      };

      // Persist
      await appendMessage(channelId, message);

      // Emit event (triggers agent monitors)
      await emitMessageCreated(channelId, message);

      res.json({ success: true, message });
    } catch (err) {
      console.error('[ConversationSpace] Error posting message:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Retrieve recent messages
  app.get('/api/conversation-space/channels/:channelId/messages', async (req, res) => {
    try {
      const { channelId } = req.params;
      const { limit = 50 } = req.query;

      const messages = await getRecentMessages(channelId, parseInt(limit));

      res.json({ success: true, messages, count: messages.length });
    } catch (err) {
      console.error('[ConversationSpace] Error getting messages:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Retrieve a specific message
  app.get('/api/conversation-space/channels/:channelId/messages/:messageId', async (req, res) => {
    try {
      const { channelId, messageId } = req.params;

      const message = await getMessage(channelId, messageId);

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      res.json({ success: true, message });
    } catch (err) {
      console.error('[ConversationSpace] Error getting message:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // SSE: Stream events for a channel
  app.get('/api/conversation-space/stream/:channelId', (req, res) => {
    const { channelId } = req.params;

    console.log(`[ConversationSpace] SSE client connected to #${channelId}`);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Track connection
    if (!activeStreams.has(channelId)) {
      activeStreams.set(channelId, new Set());
    }
    activeStreams.get(channelId).add(res);

    // Send initial connected event
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ channel_id: channelId, timestamp: new Date().toISOString() })}\n\n`);

    // Send heartbeat every 30s to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      }
    }, 30000);

    // Cleanup on close
    req.on('close', () => {
      console.log(`[ConversationSpace] SSE client disconnected from #${channelId}`);
      clearInterval(heartbeatInterval);

      const streams = activeStreams.get(channelId);
      if (streams) {
        streams.delete(res);
        if (streams.size === 0) {
          activeStreams.delete(channelId);
        }
      }
    });
  });

  // GET: Conversation space status
  app.get('/api/conversation-space/status', async (req, res) => {
    try {
      const agents = [];
      for (const [agentId, agent] of activeAgents.entries()) {
        agents.push({
          id: agentId,
          name: agent.config.name,
          icon: agent.config.icon,
          role: agent.config.role,
          running: agent.running,
          channels: agent.channels,
          threshold: agent.config.contribution_threshold
        });
      }

      const channels = [];
      for (const [channelId, streams] of activeStreams.entries()) {
        channels.push({
          id: channelId,
          active_connections: streams.size
        });
      }

      const busStats = MessageBus.getStats();

      res.json({
        success: true,
        status: 'active',
        agents,
        channels,
        message_bus: busStats,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[ConversationSpace] Error getting status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: List all agents
  app.get('/api/conversation-space/agents', async (req, res) => {
    try {
      const config = await loadAgentConfig();
      res.json({
        success: true,
        agents: config.agents,
        version: config.version
      });
    } catch (err) {
      console.error('[ConversationSpace] Error getting agents:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Get permission levels
  app.get('/api/conversation-space/permission-levels', async (req, res) => {
    try {
      const { PERMISSION_LEVELS } = await import('./server.agent-permissions.mjs');
      res.json({
        success: true,
        levels: Object.values(PERMISSION_LEVELS).map(level => ({
          id: level.id,
          name: level.name,
          description: level.description,
          icon: level.icon,
          tool_count: level.allowed_tools.includes('*') ? 'all' : level.allowed_tools.length
        }))
      });
    } catch (err) {
      console.error('[ConversationSpace] Error getting permission levels:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Get specific agent
  app.get('/api/conversation-space/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await getAgentConfig(agentId);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json({ success: true, agent });
    } catch (err) {
      console.error('[ConversationSpace] Error getting agent:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT: Update agent configuration
  app.put('/api/conversation-space/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const updates = req.body;

      const updatedAgent = await updateAgentConfig(agentId, updates);

      res.json({
        success: true,
        agent: updatedAgent,
        message: 'Agent updated. Restart required for changes to take effect.'
      });
    } catch (err) {
      console.error('[ConversationSpace] Error updating agent:', err);
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  });

  // POST: Create new agent
  app.post('/api/conversation-space/agents', async (req, res) => {
    try {
      const agentData = req.body;

      const newAgent = await createAgentConfig(agentData);

      res.status(201).json({
        success: true,
        agent: newAgent,
        message: 'Agent created. Restart required to activate.'
      });
    } catch (err) {
      console.error('[ConversationSpace] Error creating agent:', err);
      res.status(err.message.includes('already exists') ? 409 : 400).json({ error: err.message });
    }
  });

  // DELETE: Delete agent
  app.delete('/api/conversation-space/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;

      const deletedAgent = await deleteAgentConfig(agentId);

      res.json({
        success: true,
        agent: deletedAgent,
        message: 'Agent deleted. Restart required for changes to take effect.'
      });
    } catch (err) {
      console.error('[ConversationSpace] Error deleting agent:', err);
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  });

  // GET: Get agent prompt
  app.get('/api/conversation-space/agents/:agentId/prompt', async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await getAgentConfig(agentId);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const { loadPrompt } = await import('./server.thought-world.mjs');
      const promptFile = agent.prompt.file.replace('.txt', '');
      const promptContent = await loadPrompt(promptFile, agent.prompt.version);

      res.json({
        success: true,
        prompt: promptContent,
        file: agent.prompt.file,
        version: agent.prompt.version
      });
    } catch (err) {
      console.error('[ConversationSpace] Error getting prompt:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT: Update agent prompt
  app.put('/api/conversation-space/agents/:agentId/prompt', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid prompt content' });
      }

      const agent = await getAgentConfig(agentId);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Determine prompt path
      const promptFile = agent.prompt.file;
      const version = agent.prompt.version || 'v1';

      // Try Docker path first, then host path
      const dockerPath = path.join('.forgekeeper', 'thought_world', 'prompts', version, promptFile);
      const hostPath = path.join('..', '.forgekeeper', 'thought_world', 'prompts', version, promptFile);

      let promptPath = dockerPath;
      try {
        await fs.access(path.dirname(dockerPath));
      } catch {
        promptPath = hostPath;
      }

      await fs.writeFile(promptPath, content, 'utf8');

      res.json({
        success: true,
        message: 'Prompt updated successfully',
        file: promptFile
      });
    } catch (err) {
      console.error('[ConversationSpace] Error updating prompt:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Archive and clear channel messages
  app.post('/api/conversation-space/channels/:channelId/archive', async (req, res) => {
    try {
      const { channelId } = req.params;

      // Read current messages
      const messages = await getAllMessages(channelId);

      if (messages.length === 0) {
        return res.json({
          success: true,
          message: 'No messages to archive',
          archived_count: 0
        });
      }

      // Create archive directory if it doesn't exist
      const archiveDir = '.forgekeeper/conversation_spaces/archives';
      await fs.mkdir(archiveDir, { recursive: true });

      // Archive filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveFile = path.join(archiveDir, `${channelId}-${timestamp}.jsonl`);

      // Write messages to archive
      const archiveContent = messages.map(m => JSON.stringify(m)).join('\n');
      await fs.writeFile(archiveFile, archiveContent + '\n', 'utf8');

      // Clear current channel
      const channelPath = `.forgekeeper/conversation_spaces/channels/${channelId}.jsonl`;
      await fs.writeFile(channelPath, '', 'utf8');

      res.json({
        success: true,
        message: `Archived ${messages.length} messages`,
        archived_count: messages.length,
        archive_file: archiveFile
      });
    } catch (err) {
      console.error('[ConversationSpace] Error archiving messages:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: List archived conversations
  app.get('/api/conversation-space/channels/:channelId/archives', async (req, res) => {
    try {
      const { channelId } = req.params;
      const archiveDir = '.forgekeeper/conversation_spaces/archives';

      try {
        await fs.access(archiveDir);
      } catch {
        return res.json({ success: true, archives: [] });
      }

      const files = await fs.readdir(archiveDir);
      const channelArchives = files
        .filter(f => f.startsWith(`${channelId}-`) && f.endsWith('.jsonl'))
        .map(f => {
          const match = f.match(/^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.jsonl$/);
          if (match) {
            return {
              filename: f,
              channel: match[1],
              timestamp: match[2].replace(/-/g, ':').replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'),
              path: path.join(archiveDir, f)
            };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      res.json({ success: true, archives: channelArchives });
    } catch (err) {
      console.error('[ConversationSpace] Error listing archives:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Reload agents without restart (hot-reload)
  app.post('/api/conversation-space/reload-agents', async (req, res) => {
    try {
      console.log('[ConversationSpace] Hot-reloading agents...');

      // 1. Reload agent config from JSON
      const enabledAgents = await getEnabledAgents();
      const enabledIds = new Set(enabledAgents.map(a => a.id));

      // 2. Stop agents that are no longer enabled
      const stoppedAgents = [];
      for (const [agentId, agent] of activeAgents.entries()) {
        if (!enabledIds.has(agentId)) {
          console.log(`[ConversationSpace] Stopping disabled agent: ${agentId}`);
          await agent.stop();
          activeAgents.delete(agentId);
          stoppedAgents.push(agentId);
        }
      }

      // 3. Start newly enabled agents
      const agentMap = {
        forge: ForgeMonitor,
        scout: ScoutMonitor,
        loom: LoomMonitor,
        anvil: AnvilMonitor
      };

      const startedAgents = [];
      for (const agentConfig of enabledAgents) {
        // Skip if already running
        if (activeAgents.has(agentConfig.id)) {
          continue;
        }

        const AgentClass = agentMap[agentConfig.id];
        let agent;

        if (AgentClass) {
          agent = new AgentClass(agentConfig.channels || ['general']);
          console.log(`[ConversationSpace] ✓ Starting custom monitor for ${agentConfig.id}`);
        } else {
          agent = new GenericAgentMonitor(agentConfig);
          console.log(`[ConversationSpace] ✓ Starting generic monitor for ${agentConfig.id}`);
        }

        await agent.start();
        activeAgents.set(agent.agentId, agent);
        startedAgents.push(agentConfig.id);
        console.log(`[ConversationSpace] ✓ Started ${agentConfig.id} (${agentConfig.name})`);
      }

      console.log(`[ConversationSpace] Hot-reload complete: ${activeAgents.size} agents running`);

      res.json({
        success: true,
        message: 'Agents reloaded successfully',
        started: startedAgents,
        stopped: stoppedAgents,
        active_count: activeAgents.size
      });
    } catch (err) {
      console.error('[ConversationSpace] Error reloading agents:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Create a new channel (future feature)
  app.post('/api/conversation-space/channels', async (req, res) => {
    try {
      const { name, description, agents = ['forge', 'scout', 'loom', 'anvil'] } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Invalid channel name' });
      }

      const channelId = name.toLowerCase().replace(/\s+/g, '-');

      // Create JSONL file
      const filePath = path.join('.forgekeeper/conversation_spaces/channels', `${channelId}.jsonl`);
      await fs.writeFile(filePath, '');

      // Update config
      const configPath = '.forgekeeper/conversation_spaces/config.json';
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      config.channels[channelId] = {
        id: channelId,
        name,
        description: description || '',
        created_by: 'rado',
        created_at: new Date().toISOString(),
        agents
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      res.json({ success: true, channel: config.channels[channelId] });
    } catch (err) {
      console.error('[ConversationSpace] Error creating channel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: List all channels
  app.get('/api/conversation-space/channels', async (req, res) => {
    try {
      const configPath = '.forgekeeper/conversation_spaces/config.json';
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      const channels = Object.values(config.channels || {});

      res.json({ success: true, channels });
    } catch (err) {
      console.error('[ConversationSpace] Error listing channels:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== CONVERSATION MANAGEMENT ====================
  const {
    ensureMetadataDirectories,
    getAllConversations,
    getConversation,
    createConversation,
    updateConversation,
    archiveConversation,
    deleteConversation,
    getConversationMessages,
    addConversationMessage,
    getAllProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    searchConversations
  } = await import('./server.conversation-metadata.mjs');

  const {
    migrateChannelsToConversations,
    needsMigration
  } = await import('./server.conversation-migration.mjs');

  // Ensure metadata directories exist
  await ensureMetadataDirectories();

  // Check if migration is needed (auto-migrate on startup)
  if (await needsMigration()) {
    console.log('[ConversationSpace] Detecting unmigrated channel messages...');
    console.log('[ConversationSpace] Starting automatic migration...');
    const result = await migrateChannelsToConversations();
    console.log(`[ConversationSpace] ✅ Auto-migration complete: ${result.migrated} channels → ${result.total_messages} messages`);
  }

  // GET: List conversations
  app.get('/api/conversation-space/conversations', async (req, res) => {
    try {
      const { status, project_id, limit } = req.query;
      const conversations = await getAllConversations({
        status,
        project_id: project_id === 'null' ? null : project_id,
        limit: limit ? parseInt(limit) : undefined
      });
      res.json({ success: true, conversations });
    } catch (err) {
      console.error('[ConversationSpace] Error listing conversations:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Create new conversation
  app.post('/api/conversation-space/conversations', async (req, res) => {
    try {
      const { title, project_id, channel_id } = req.body;
      const conversation = await createConversation({ title, project_id, channel_id });
      res.json({ success: true, conversation });
    } catch (err) {
      console.error('[ConversationSpace] Error creating conversation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Get conversation details
  app.get('/api/conversation-space/conversations/:id', async (req, res) => {
    try {
      const conversation = await getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      res.json({ success: true, conversation });
    } catch (err) {
      console.error('[ConversationSpace] Error getting conversation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT: Update conversation
  app.put('/api/conversation-space/conversations/:id', async (req, res) => {
    try {
      const { title, project_id } = req.body;
      const conversation = await updateConversation(req.params.id, { title, project_id });
      res.json({ success: true, conversation });
    } catch (err) {
      console.error('[ConversationSpace] Error updating conversation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Archive conversation
  app.post('/api/conversation-space/conversations/:id/archive', async (req, res) => {
    try {
      const result = await archiveConversation(req.params.id);
      res.json({
        success: true,
        message: `Archived ${result.archived_messages} messages`,
        ...result
      });
    } catch (err) {
      console.error('[ConversationSpace] Error archiving conversation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE: Delete conversation permanently
  app.delete('/api/conversation-space/conversations/:id', async (req, res) => {
    try {
      await deleteConversation(req.params.id);
      res.json({ success: true, message: 'Conversation deleted' });
    } catch (err) {
      console.error('[ConversationSpace] Error deleting conversation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Get conversation messages
  app.get('/api/conversation-space/conversations/:id/messages', async (req, res) => {
    try {
      const messages = await getConversationMessages(req.params.id);
      res.json({ success: true, messages });
    } catch (err) {
      console.error('[ConversationSpace] Error getting messages:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Add message to conversation
  app.post('/api/conversation-space/conversations/:id/messages', async (req, res) => {
    try {
      const conversationId = req.params.id;
      const { content, metadata, thread_parent_id } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Invalid content' });
      }

      // Get conversation to find its channel
      const conversation = await getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Create message
      const message = {
        id: ulid(),
        channel_id: conversation.channel_id,
        conversation_id: conversationId,
        thread_parent_id: thread_parent_id || null,
        author_type: 'human',
        author_id: 'rado',
        author_name: 'Rado',
        author_avatar: '👤',
        content,
        metadata: metadata || null,
        created_at: new Date().toISOString()
      };

      // Add to conversation
      await addConversationMessage(conversationId, message);

      // Also append to channel for agent monitoring
      await appendMessage(conversation.channel_id, message);

      // Emit event to trigger agents
      await emitMessageCreated(conversation.channel_id, message);

      res.json({ success: true, message });
    } catch (err) {
      console.error('[ConversationSpace] Error adding message:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== PROJECT MANAGEMENT ====================

  // GET: List projects
  app.get('/api/conversation-space/projects', async (req, res) => {
    try {
      const projects = await getAllProjects();
      res.json({ success: true, projects });
    } catch (err) {
      console.error('[ConversationSpace] Error listing projects:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Create project
  app.post('/api/conversation-space/projects', async (req, res) => {
    try {
      const { name, description, color } = req.body;
      const project = await createProject({ name, description, color });
      res.json({ success: true, project });
    } catch (err) {
      console.error('[ConversationSpace] Error creating project:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT: Update project
  app.put('/api/conversation-space/projects/:id', async (req, res) => {
    try {
      const { name, description, color } = req.body;
      const project = await updateProject(req.params.id, { name, description, color });
      res.json({ success: true, project });
    } catch (err) {
      console.error('[ConversationSpace] Error updating project:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE: Delete project
  app.delete('/api/conversation-space/projects/:id', async (req, res) => {
    try {
      await deleteProject(req.params.id);
      res.json({ success: true, message: 'Project deleted, conversations moved to no project' });
    } catch (err) {
      console.error('[ConversationSpace] Error deleting project:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== SEARCH ====================

  // GET: Search conversations
  app.get('/api/conversation-space/search', async (req, res) => {
    try {
      const { q, limit, project_id, status } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      const results = await searchConversations(q, {
        limit: limit ? parseInt(limit) : 20,
        project_id: project_id === 'null' ? null : project_id,
        status: status || 'active'
      });

      res.json({ success: true, results });
    } catch (err) {
      console.error('[ConversationSpace] Error searching:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

/**
 * Broadcast event to all SSE clients connected to a channel
 *
 * @param {string} channelId - Channel ID
 * @param {string} eventName - Event name
 * @param {object} data - Event data
 */
function broadcastToChannel(channelId, eventName, data) {
  const streams = activeStreams.get(channelId);
  if (!streams || streams.size === 0) {
    return;
  }

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

  const deadConnections = [];

  for (const res of streams) {
    try {
      if (!res.writableEnded) {
        res.write(payload);
      } else {
        deadConnections.push(res);
      }
    } catch (err) {
      console.error(`[ConversationSpace] Error broadcasting to client:`, err.message);
      deadConnections.push(res);
    }
  }

  // Remove dead connections
  for (const deadRes of deadConnections) {
    streams.delete(deadRes);
  }
}

/**
 * Stop all agents and close connections
 */
export async function shutdownConversationSpace() {
  console.log('[ConversationSpace] Shutting down...');

  // Stop all agents
  for (const [agentId, agent] of activeAgents.entries()) {
    await agent.stop();
  }

  activeAgents.clear();

  // Close all SSE connections
  for (const [channelId, streams] of activeStreams.entries()) {
    for (const res of streams) {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  activeStreams.clear();

  console.log('[ConversationSpace] ✅ Shutdown complete');
}

/**
 * Get active agent by ID
 *
 * @param {string} agentId - Agent ID
 * @returns {AgentMonitor|null} Agent instance or null
 */
export function getAgent(agentId) {
  return activeAgents.get(agentId) || null;
}

/**
 * Get all active agents
 *
 * @returns {Map<string, AgentMonitor>} Map of agent ID to agent instance
 */
export function getAllAgents() {
  return activeAgents;
}

/**
 * Get SSE connection count for a channel
 *
 * @param {string} channelId - Channel ID
 * @returns {number} Number of active SSE connections
 */
export function getConnectionCount(channelId) {
  const streams = activeStreams.get(channelId);
  return streams ? streams.size : 0;
}
