/**
 * Generic Agent Monitor
 *
 * A flexible monitor class that works for any agent configuration.
 * Loads all configuration from the agent config JSON including:
 * - Domain keywords
 * - Contribution threshold
 * - Prompt file
 * - Provider/model settings
 *
 * This allows new agents to be added without creating custom monitor classes.
 */

import { AgentMonitor } from './agent-monitor.mjs';
import { loadPrompt } from '../core/thought-world.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const PROMPTS_DIR = '.forgekeeper/thought_world/prompts/v1';

export class GenericAgentMonitor extends AgentMonitor {
  /**
   * Create a generic agent monitor from full config
   *
   * @param {object} agentConfig - Full agent configuration from agents.json
   * @param {Array<string>} channels - Channels to monitor (overrides config)
   */
  constructor(agentConfig, channels = null) {
    super(agentConfig.id, {
      name: agentConfig.name,
      icon: agentConfig.icon,
      color: agentConfig.color,
      role: agentConfig.role,
      contribution_threshold: agentConfig.contribution_threshold,
      domain_keywords: agentConfig.domain_keywords || []
    }, channels || agentConfig.channels || ['general']);

    this.promptFile = agentConfig.prompt?.file;
    this.promptVersion = agentConfig.prompt?.version || 'v1';
  }

  /**
   * Get prompt role for this agent
   * Loads from the prompt file specified in config
   */
  getPromptRole() {
    // Extract role from prompt filename (e.g., "claude.txt" -> "claude")
    if (this.promptFile) {
      return this.promptFile.replace(/\.txt$/, '');
    }
    // Fallback to agent ID
    return this.agentId;
  }

  /**
   * Build contribution prompt
   * Uses generic format suitable for all agent types
   */
  buildContributionPrompt(channelId, triggerMessage, recentMessages, channelContext) {
    const conversationText = recentMessages
      .slice(-10)
      .map(m => `[${m.author_name}]: ${m.content}`)
      .join('\n\n');

    const summary = channelContext?.summary || 'No prior context';
    const myContributions = channelContext?.my_previous_contributions || [];
    const recentContributions = myContributions.slice(-3);

    return `CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

YOUR CONTEXT:
${summary}

${recentContributions.length > 0 ? `YOUR RECENT CONTRIBUTIONS:
${recentContributions.map(c => `- ${c.summary}`).join('\n')}
` : ''}

TRIGGER MESSAGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}

TASK: As ${this.config.name} (${this.config.role}), provide a thoughtful contribution to this conversation.
- Focus on your area of expertise
- Build on previous discussions when relevant
- Be concise and actionable (2-4 paragraphs unless more detail is needed)
- Only speak if you can add substantive value

Respond naturally and helpfully.
`;
  }
}

/**
 * Load custom prompt for an agent
 * Falls back to creating a default prompt if not found
 */
export async function loadAgentPrompt(agentId, promptFile) {
  const promptPath = path.join(PROMPTS_DIR, promptFile || `${agentId}.txt`);

  try {
    const content = await fs.readFile(promptPath, 'utf8');
    return content;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Create a default prompt
      const defaultPrompt = `You are ${agentId}, an AI assistant participating in a multi-agent conversation space.

**CRITICAL: BE CONCISE**
- Keep responses to 2-4 sentences maximum unless asked for detail
- Get straight to the point
- Prioritize actionable information
- Skip lengthy explanations

Be helpful, thoughtful, and collaborative with other agents and users.`;

      // Save the default prompt for future use
      await fs.mkdir(PROMPTS_DIR, { recursive: true });
      await fs.writeFile(promptPath, defaultPrompt, 'utf8');
      console.log(`[GenericAgent] Created default prompt for ${agentId} at ${promptPath}`);

      return defaultPrompt;
    }
    throw err;
  }
}
