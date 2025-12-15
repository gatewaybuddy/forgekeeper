/**
 * Agent Monitor - Base class for all conversation space agents
 *
 * Implements continuous listening pattern:
 * 1. Subscribe to message bus for new messages
 * 2. Assess relevance when new message arrives
 * 3. Emit "thinking" event if processing
 * 4. Contribute if relevance exceeds threshold
 * 5. Maintain persistent context summary
 *
 * Each agent extends this class and overrides:
 * - matchKeywords() - Domain-specific keyword matching
 * - generateContribution() - LLM call with agent persona
 * - (optional) Additional relevance logic
 */

import { subscribe, emitAgentThinking, emitAgentContributing, emitAgentChunk, emitAgentComplete, emitReactionAdded, emitAgentOnline, emitAgentOffline } from '../conversations/message-bus.mjs';
import { getRecentMessages, appendMessage, countUnreadMessages } from '../conversations/message-store.mjs';
import { loadPrompt, callLLM, callLLMStreaming, AGENTS as AGENT_LLM_CONFIGS } from '../core/thought-world.mjs';
import { callLLMWithTools, callLLMStreamingWithTools } from './agent-tools.mjs';
import { TOOL_DEFS } from '../../tools/index.mjs';
import { getDefaultPermissionLevel } from './agent-permissions.mjs';
import { ulid } from 'ulid';
import fs from 'node:fs/promises';
import path from 'node:path';

const AGENT_CONTEXT_DIR = '.forgekeeper/conversation_spaces/agent_context';

/**
 * Base Agent Monitor class
 */
export class AgentMonitor {
  /**
   * Create an agent monitor
   *
   * @param {string} agentId - Agent identifier (e.g., "forge", "scout")
   * @param {object} config - Agent configuration
   * @param {Array<string>} channels - Channels to monitor
   */
  constructor(agentId, config, channels = ['general']) {
    this.agentId = agentId;
    this.config = config;
    this.channels = channels;
    this.running = false;
    this.context = null;
    this.unsubscribe = null;

    // Random jitter to avoid simultaneous responses (50-200ms)
    this.jitterMs = 50 + Math.random() * 150;
  }

  /**
   * Start monitoring channels
   */
  async start() {
    if (this.running) {
      console.warn(`[${this.agentId}] Already running`);
      return;
    }

    console.log(`[${this.agentId}] Starting monitor for channels: ${this.channels.join(', ')}`);

    // Load or initialize context
    this.context = await this.loadContext();

    // Subscribe to message bus
    this.unsubscribe = subscribe('message_created', async (event) => {
      await this.onNewMessage(event);
    });

    this.running = true;

    // Emit agent_online event
    await emitAgentOnline(this.agentId, this.channels);

    console.log(`[${this.agentId}] ✅ Monitoring started`);
  }

  /**
   * Stop monitoring
   */
  async stop() {
    if (!this.running) {
      return;
    }

    console.log(`[${this.agentId}] Stopping monitor`);

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.running = false;

    // Emit agent_offline event
    await emitAgentOffline(this.agentId);

    console.log(`[${this.agentId}] ❌ Monitoring stopped`);
  }

  /**
   * Handle new message event
   *
   * @param {object} event - message_created event data
   */
  async onNewMessage(event) {
    try {
      const { channel_id, message } = event;

      // Only monitor assigned channels
      if (!this.shouldMonitorChannel(channel_id)) {
        return;
      }

      // Skip own messages
      if (message.author_id === this.agentId) {
        return;
      }

      // Add random jitter to avoid simultaneous responses
      await this.sleep(this.jitterMs);

      // Update context
      if (!this.context.channels[channel_id]) {
        this.context.channels[channel_id] = this.initChannelContext();
      }
      this.context.channels[channel_id].last_read_message_id = message.id;

      // Assess relevance
      const relevanceScore = await this.assessRelevance(message, channel_id);

      // Emit thinking indicator if processing
      if (relevanceScore > 0.3) {
        await emitAgentThinking(this.agentId, channel_id, message.id, relevanceScore);
      }

      // Check contribution threshold
      if (relevanceScore >= this.config.contribution_threshold) {
        console.log(`[${this.agentId}] Relevance ${relevanceScore.toFixed(2)} >= threshold ${this.config.contribution_threshold}`);

        // LLM-based assessment: Do I have something substantive to add?
        // Check if feature is enabled (default: true for better quality)
        const useLLMAssessment = process.env.AGENT_USE_LLM_ASSESSMENT !== '0';

        if (useLLMAssessment) {
          console.log(`[${this.agentId}] Running LLM-based contribution assessment...`);
          const recentMessages = await getRecentMessages(channel_id, 10);
          const assessment = await this.shouldContribute(message, channel_id, recentMessages);

          if (assessment.shouldContribute) {
            console.log(`[${this.agentId}] LLM assessment: YES - ${assessment.reason} (${assessment.responseMode})`);
            await this.contribute(channel_id, message, assessment.responseMode);
          } else {
            console.log(`[${this.agentId}] LLM assessment: NO - ${assessment.reason}`);
            // Add a subtle reaction to show we considered but decided not to contribute
            await emitReactionAdded(message.id, 'considered', this.agentId);
          }
        } else {
          // Skip LLM assessment, contribute based on threshold alone
          console.log(`[${this.agentId}] LLM assessment disabled, contributing to #${channel_id}`);
          await this.contribute(channel_id, message);
        }
      } else if (relevanceScore > 0.5) {
        // Signal tracking without full contribution
        console.log(`[${this.agentId}] Relevance ${relevanceScore.toFixed(2)}, tracking (no contribution)`);
        await emitReactionAdded(message.id, 'tracking', this.agentId);
      } else {
        // Silent (low relevance)
        console.log(`[${this.agentId}] Relevance ${relevanceScore.toFixed(2)}, ignoring`);
      }
    } catch (err) {
      console.error(`[${this.agentId}] Error in onNewMessage:`, err);
    }
  }

  /**
   * Assess relevance of a message
   *
   * @param {object} message - Message to assess
   * @param {string} channelId - Channel ID
   * @returns {Promise<number>} Relevance score (0.0 to 1.0)
   */
  async assessRelevance(message, channelId) {
    // 1. Keyword matching (fast, no LLM)
    const keywordScore = this.matchKeywords(message.content);

    // 2. Context change assessment
    const contextScore = this.assessContextChange(message, channelId);

    // 3. Directedness detection
    const directednessScore = this.assessDirectedness(message.content);

    // 4. Explicit @mention (override)
    if (this.isMentioned(message.content)) {
      console.log(`[${this.agentId}] Explicit @mention detected`);
      return 1.0;
    }

    // Get weights from config (or use defaults)
    const weights = this.config.assessment_weights || {
      keywords: 0.2,
      novelty: 0.4,
      directedness: 0.4
    };

    // Weighted combination
    const finalScore =
      (keywordScore * weights.keywords) +
      (contextScore * weights.novelty) +
      (directednessScore * weights.directedness);

    return Math.min(1.0, finalScore);
  }

  /**
   * Match domain keywords (override in subclasses)
   *
   * @param {string} content - Message content
   * @returns {number} Keyword match score (0.0 to 1.0)
   */
  matchKeywords(content) {
    if (!this.config.domain_keywords || this.config.domain_keywords.length === 0) {
      return 0.0;
    }

    const contentLower = content.toLowerCase();
    const matches = this.config.domain_keywords.filter(kw =>
      contentLower.includes(kw.toLowerCase())
    );

    const score = matches.length / this.config.domain_keywords.length;
    return Math.min(1.0, score * 2); // Amplify (cap at 1.0)
  }

  /**
   * Assess context change (how much new information)
   *
   * @param {object} message - Message to assess
   * @param {string} channelId - Channel ID
   * @returns {number} Context change score (0.0 to 1.0)
   */
  assessContextChange(message, channelId) {
    const channelContext = this.context.channels[channelId];
    if (!channelContext || !channelContext.summary) {
      // No prior context, anything is new
      return 0.5;
    }

    // Simple heuristic: extract potential new concepts (words not in summary)
    const summaryWords = new Set(
      channelContext.summary.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );

    const messageWords = message.content
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);

    const newWords = messageWords.filter(w => !summaryWords.has(w));
    const noveltyRatio = newWords.length / Math.max(1, messageWords.length);

    return Math.min(1.0, noveltyRatio * 2); // Amplify, cap at 1.0
  }

  /**
   * Assess directedness of message (questions, imperatives, requests)
   *
   * @param {string} content - Message content
   * @returns {number} Directedness score (0.0 to 1.0)
   */
  assessDirectedness(content) {
    const contentLower = content.toLowerCase().trim();
    let score = 0.0;

    // Question indicators
    if (content.includes('?')) score += 0.5;

    // Question words (more specific)
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can you', 'could you', 'would you', 'should'];
    if (questionWords.some(word => contentLower.includes(word))) {
      score += 0.3;
    }

    // Imperative patterns
    const imperatives = ['please', 'help', 'show', 'explain', 'tell', 'create', 'make', 'build', 'fix', 'update', 'add', 'remove'];
    if (imperatives.some(word => contentLower.startsWith(word) || contentLower.includes(` ${word} `))) {
      score += 0.4;
    }

    // Request patterns
    if (contentLower.match(/need|want|looking for|trying to|working on/)) {
      score += 0.3;
    }

    // Penalize low-effort greetings (unless they're questions)
    const greetings = ['hi', 'hello', 'hey', 'ping', 'sup', 'yo'];
    if (greetings.includes(contentLower) && !content.includes('?')) {
      score = Math.min(score, 0.2);
    }

    return Math.min(1.0, score);
  }

  /**
   * Check if agent is mentioned in message
   *
   * @param {string} content - Message content
   * @returns {boolean} True if mentioned
   */
  isMentioned(content) {
    const mentionPattern = new RegExp(`@${this.agentId}\\b`, 'i');
    return mentionPattern.test(content);
  }

  /**
   * Check collision avoidance (prevent multiple agents responding simultaneously)
   *
   * @param {string} channelId - Channel ID
   * @param {Array} recentMessages - Recent messages
   * @returns {Promise<{shouldAvoid: boolean, reason: string}>}
   */
  async checkCollisionAvoidance(channelId, recentMessages) {
    const config = this.config.collision_avoidance || {
      enabled: true,
      cooldown_seconds: 10,
      higher_bar: 0.7
    };

    if (!config.enabled) {
      return { shouldAvoid: false, reason: 'Collision avoidance disabled' };
    }

    // Check if another agent just responded
    const lastMessage = recentMessages[recentMessages.length - 1];
    if (!lastMessage) {
      return { shouldAvoid: false, reason: 'No recent messages' };
    }

    // If last message was from another agent
    if (lastMessage.author_type === 'agent' && lastMessage.author_id !== this.agentId) {
      const messageAge = Date.now() - new Date(lastMessage.created_at).getTime();
      const cooldownMs = config.cooldown_seconds * 1000;

      if (messageAge < cooldownMs) {
        console.log(`[${this.agentId}] Collision avoidance: ${lastMessage.author_id} just responded ${Math.floor(messageAge/1000)}s ago`);
        return {
          shouldAvoid: true,
          reason: `${lastMessage.author_id} just responded (${Math.floor(messageAge/1000)}s ago). Higher bar required.`
        };
      }
    }

    return { shouldAvoid: false, reason: 'No collision' };
  }

  /**
   * LLM-based assessment: Should I contribute to this conversation?
   *
   * @param {object} message - Trigger message
   * @param {string} channelId - Channel ID
   * @param {Array} recentMessages - Recent conversation context
   * @returns {Promise<{shouldContribute: boolean, reason: string, responseMode?: string}>}
   */
  async shouldContribute(message, channelId, recentMessages) {
    try {
      // Check collision avoidance first
      const collisionCheck = await this.checkCollisionAvoidance(channelId, recentMessages);
      if (collisionCheck.shouldAvoid) {
        return { shouldContribute: false, reason: collisionCheck.reason };
      }

      // Build context for assessment
      const conversationText = recentMessages
        .slice(-5)  // Last 5 messages for context
        .map(m => `[${m.author_name}]: ${m.content}`)
        .join('\n\n');

      const channelContext = this.context.channels[channelId];
      const summary = channelContext?.summary || 'No prior context';

      // Stricter assessment prompt
      const assessmentPrompt = `You are ${this.config.name}, ${this.config.role}.
Your expertise: ${this.getExpertiseDescription()}

STRICT CONTRIBUTION RULES:
1. Only respond if you can add NEW information or make a DECISION
2. If it's a greeting/ping/handshake, use ACK mode (≤8 words) unless asked for more
3. If another agent just responded, only contribute if you DISAGREE materially or ADD a missing angle
4. Silence is better than redundancy

RESPONSE MODES:
- ACK: Brief acknowledgment (3-8 tokens). For: greetings, confirmations, simple questions
- ANSWER: Focused response (1-3 sentences). For: direct questions, requests
- ADVICE: Detailed explanation with context. For: complex questions, "how/why" requests

CONVERSATION:
${conversationText}

SUMMARY: ${summary}

LATEST: [${message.author_name}]: ${message.content}

Respond in format:
CONTRIBUTE: yes/no - reason
MODE: ACK/ANSWER/ADVICE (only if yes)`;

      // Quick LLM assessment
      const llmConfig = AGENT_LLM_CONFIGS[this.agentId] || AGENT_LLM_CONFIGS.forge;
      const response = await callLLM(llmConfig, assessmentPrompt, '', 250);

      // Parse response
      const contributeMatch = response.match(/CONTRIBUTE:\s*(yes|no)\s*-\s*(.+?)(?:\n|$)/i);
      const modeMatch = response.match(/MODE:\s*(ACK|ANSWER|ADVICE)/i);

      if (contributeMatch) {
        const decision = contributeMatch[1].toLowerCase() === 'yes';
        const reason = contributeMatch[2].trim();
        const responseMode = modeMatch ? modeMatch[1].toUpperCase() : 'ANSWER';

        console.log(`[${this.agentId}] shouldContribute: ${decision} - ${reason} (${responseMode})`);
        return { shouldContribute: decision, reason, responseMode };
      }

      // Fallback
      console.warn(`[${this.agentId}] Could not parse assessment: ${response}`);
      return { shouldContribute: false, reason: 'Unable to assess' };

    } catch (err) {
      console.error(`[${this.agentId}] Error in shouldContribute:`, err);
      return { shouldContribute: true, reason: 'Assessment error, proceeding', responseMode: 'ANSWER' };
    }
  }

  /**
   * Get agent expertise description (override in subclasses for specific agents)
   *
   * @returns {string} Description of agent's expertise
   */
  getExpertiseDescription() {
    // Default descriptions by agent ID
    const expertiseMap = {
      forge: 'Implementation, execution, building features and writing code',
      scout: 'Critical analysis, challenging assumptions, identifying risks and flaws',
      loom: 'Verification, testing, code review, quality assurance',
      anvil: 'Integration, synthesis, decision-making, combining perspectives',
      claude: 'General assistance, broad knowledge across domains',
      chatgpt: 'General assistance, conversational support'
    };

    return expertiseMap[this.agentId] || 'General assistance';
  }

  /**
   * Contribute to the conversation
   *
   * @param {string} channelId - Channel to post in
   * @param {object} triggerMessage - Message that triggered contribution
   * @param {string} responseMode - ACK/ANSWER/ADVICE
   */
  async contribute(channelId, triggerMessage, responseMode = 'ANSWER') {
    try {
      // 1. Fetch recent context
      let recentMessages;

      // If this is part of a conversation, load conversation-scoped messages only
      if (triggerMessage.conversation_id) {
        const { getConversationMessages } = await import('./server.conversation-metadata.mjs');
        const allMessages = await getConversationMessages(triggerMessage.conversation_id);
        // Get last 20 messages
        recentMessages = allMessages.slice(-20);
      } else {
        // Fallback to channel-scoped messages
        recentMessages = await getRecentMessages(channelId, 20);
      }

      // 2. Update summary (if needed)
      await this.updateSummary(channelId, recentMessages);

      // 3. Generate contribution with streaming
      const message = await this.generateContribution(
        channelId,
        triggerMessage,
        recentMessages,
        responseMode
      );

      // 4. Update context
      const channelContext = this.context.channels[channelId];
      channelContext.my_previous_contributions.push({
        message_id: message.id,
        summary: message.content.substring(0, 200),
        timestamp: message.created_at
      });

      // 5. Save context
      await this.saveContext();

      console.log(`[${this.agentId}] Contribution complete: ${message.id}`);
    } catch (err) {
      console.error(`[${this.agentId}] Error in contribute:`, err);
    }
  }

  /**
   * Generate contribution (override in subclasses)
   *
   * @param {string} channelId - Channel ID
   * @param {object} triggerMessage - Message that triggered contribution
   * @param {Array} recentMessages - Recent conversation context
   * @param {string} responseMode - ACK/ANSWER/ADVICE
   * @returns {Promise<object>} Posted message object
   */
  async generateContribution(channelId, triggerMessage, recentMessages, responseMode = 'ANSWER') {
    const startTime = Date.now();

    // Determine max tokens based on response mode
    const tokenLimits = this.config.response_modes || {
      ACK: 30,
      ANSWER: 200,
      ADVICE: 800
    };
    const maxTokens = tokenLimits[responseMode] || tokenLimits.ANSWER;

    // Load agent prompt
    const systemPrompt = await loadPrompt(this.getPromptRole());

    // Build user message with context + response mode instruction
    const channelContext = this.context.channels[channelId];
    const basePrompt = this.buildContributionPrompt(
      channelId,
      triggerMessage,
      recentMessages,
      channelContext
    );

    // Add response mode guidance
    const modeGuidance = {
      ACK: '\n\nRESPONSE MODE: ACK - Keep it brief (3-8 words). Just acknowledge or confirm.',
      ANSWER: '\n\nRESPONSE MODE: ANSWER - Be focused and concise (1-3 sentences).',
      ADVICE: '\n\nRESPONSE MODE: ADVICE - Provide detailed explanation with context and reasoning.'
    };
    const userMessage = basePrompt + (modeGuidance[responseMode] || modeGuidance.ANSWER);

    // Create placeholder message
    const messageId = ulid();
    const placeholderMessage = {
      id: messageId,
      channel_id: channelId,
      conversation_id: triggerMessage.conversation_id || null,
      thread_parent_id: null,
      author_type: 'agent',
      author_id: this.agentId,
      author_name: this.config.name,
      author_avatar: this.config.icon,
      content: '',
      created_at: new Date().toISOString(),
      agent_state: 'contributing',
      response_mode: responseMode
    };

    await appendMessage(channelId, placeholderMessage);
    await emitAgentContributing(this.agentId, channelId, messageId, 'generating');

    // Stream response with tools
    let fullContent = '';

    const llmConfig = AGENT_LLM_CONFIGS[this.agentId] || AGENT_LLM_CONFIGS.forge;

    // Get permission level from config (default to read_only)
    const permissionLevel = this.config.permission_level || getDefaultPermissionLevel();

    await callLLMStreamingWithTools(
      llmConfig,
      systemPrompt,
      userMessage,
      TOOL_DEFS,
      permissionLevel,
      maxTokens,
      async (chunk) => {
        fullContent += chunk;
        await emitAgentChunk(this.agentId, channelId, messageId, chunk);
      }
    );

    // Finalize message
    const finalMessage = {
      ...placeholderMessage,
      content: fullContent,
      agent_state: 'complete',
      elapsed_ms: Date.now() - startTime
    };

    // Update message (append as edit event)
    await appendMessage(channelId, {
      ...finalMessage,
      id: ulid(),
      edit_of: messageId,
      event_type: 'message_updated'
    });

    // If this is part of a conversation, also save to conversation file
    if (finalMessage.conversation_id) {
      const { addConversationMessage } = await import('./server.conversation-metadata.mjs');
      await addConversationMessage(finalMessage.conversation_id, finalMessage);
    }

    // Emit complete
    await emitAgentComplete(this.agentId, channelId, messageId, finalMessage.elapsed_ms);

    return finalMessage;
  }

  /**
   * Build contribution prompt
   *
   * @param {string} channelId - Channel ID
   * @param {object} triggerMessage - Trigger message
   * @param {Array} recentMessages - Recent messages
   * @param {object} channelContext - Agent's channel context
   * @returns {string} Prompt for LLM
   */
  buildContributionPrompt(channelId, triggerMessage, recentMessages, channelContext) {
    const conversationText = recentMessages
      .slice(-10)
      .map(m => `[${m.author_name}]: ${m.content}`)
      .join('\n\n');

    const summary = channelContext?.summary || 'No prior context';

    // Check for response_style in trigger message metadata
    const responseStyle = triggerMessage.metadata?.response_style || 'conversational';
    let styleHint = '';

    switch (responseStyle) {
      case 'minimal':
        styleHint = '\n\n**RESPONSE STYLE: MINIMAL**\nUser wants a terse, direct response. 1-2 sentences MAXIMUM. No explanation unless critical.\nIf asked to "just say hi" - literally just say "Hi" or "Hey".\n';
        break;
      case 'detailed':
        styleHint = '\n\n**RESPONSE STYLE: DETAILED**\nUser wants comprehensive analysis. You can be thorough and detailed. Explain your reasoning.\n';
        break;
      case 'conversational':
      default:
        styleHint = ''; // Default behavior, no special instruction
        break;
    }

    return `CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

YOUR CONTEXT:
${summary}

TRIGGER MESSAGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}${styleHint}

TASK: The conversation has reached a point where your expertise is relevant. Contribute your perspective.
Only speak if you have something substantive to add. Be concise and actionable.
`;
  }

  /**
   * Get prompt role for this agent (override in subclasses)
   *
   * @returns {string} Prompt role name (e.g., "executor", "verifier")
   */
  getPromptRole() {
    return 'executor'; // Default: forge/executor prompt
  }

  /**
   * Update summary for a channel
   *
   * @param {string} channelId - Channel ID
   * @param {Array} recentMessages - Recent messages
   */
  async updateSummary(channelId, recentMessages) {
    // Placeholder: simple extractive summarization
    // Full implementation in context manager

    const channelContext = this.context.channels[channelId];
    if (!channelContext) return;

    const lastUpdateTime = new Date(channelContext.last_summary_timestamp || 0);
    const hoursSinceUpdate = (Date.now() - lastUpdateTime) / (1000 * 60 * 60);

    // Only update if 2+ hours or 15+ new messages
    const unreadCount = await countUnreadMessages(channelId, channelContext.last_read_message_id);

    if (hoursSinceUpdate < 2 && unreadCount < 15) {
      return; // No update needed
    }

    // Simple summary: last 5 substantive messages
    const summaryMessages = recentMessages
      .filter(m => m.content.length > 100)
      .slice(-5);

    channelContext.summary = summaryMessages
      .map(m => `${m.author_name}: ${m.content.substring(0, 150)}...`)
      .join(' ');

    channelContext.last_summary_timestamp = new Date().toISOString();
    channelContext.total_messages_read = recentMessages.length;

    await this.saveContext();
  }

  /**
   * Load agent context from file
   *
   * @returns {Promise<object>} Agent context
   */
  async loadContext() {
    const contextPath = path.join(AGENT_CONTEXT_DIR, `${this.agentId}.json`);

    try {
      const content = await fs.readFile(contextPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Initialize new context
        return {
          agent_id: this.agentId,
          last_updated: new Date().toISOString(),
          channels: {}
        };
      }
      throw err;
    }
  }

  /**
   * Save agent context to file
   */
  async saveContext() {
    const contextPath = path.join(AGENT_CONTEXT_DIR, `${this.agentId}.json`);

    this.context.last_updated = new Date().toISOString();

    await fs.mkdir(AGENT_CONTEXT_DIR, { recursive: true });
    await fs.writeFile(contextPath, JSON.stringify(this.context, null, 2), 'utf8');
  }

  /**
   * Initialize channel context
   *
   * @returns {object} Fresh channel context
   */
  initChannelContext() {
    return {
      last_read_message_id: null,
      last_summary_timestamp: null,
      summary: '',
      key_decisions: [],
      open_questions: [],
      my_previous_contributions: [],
      total_messages_read: 0,
      tokens_in_summary: 0
    };
  }

  /**
   * Check if should monitor this channel
   *
   * @param {string} channelId - Channel to check
   * @returns {boolean} True if should monitor
   */
  shouldMonitorChannel(channelId) {
    return this.channels.includes(channelId);
  }

  /**
   * Sleep for specified milliseconds (for jitter)
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
