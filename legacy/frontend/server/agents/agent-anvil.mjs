/**
 * Anvil Agent - The Integrator
 *
 * Role: Synthesizes discussions, resolves conflicts, builds consensus
 * Persona: Diplomatic, strategic, focused on integration and synthesis
 * Contribution Style: Summaries, synthesis, consensus-building, integration
 *
 * Domain Keywords: consensus, decide, synthesize, integrate, resolve
 * Threshold: 0.75 (most selective - speaks when synthesis is needed)
 */

import { AgentMonitor } from './agent-monitor.mjs';

export class AnvilMonitor extends AgentMonitor {
  constructor(channels = ['general']) {
    super('anvil', {
      name: 'Anvil',
      icon: '⚒️',
      color: '#10b981',
      role: 'Integrator',
      contribution_threshold: 0.75, // Highest threshold - most selective
      domain_keywords: [
        'consensus', 'decide', 'synthesize', 'integrate', 'resolve',
        'combine', 'merge', 'unify', 'consolidate', 'summary',
        'conclude', 'final', 'overall', 'together', 'compromise',
        'balance', 'tradeoff', 'decision', 'direction', 'path forward'
      ]
    }, channels);
  }

  /**
   * Enhanced relevance assessment for Anvil
   * Triggers when synthesis/integration is needed
   */
  async assessRelevance(message, channelId) {
    const baseRelevance = await super.assessRelevance(message, channelId);

    // Check if conversation needs synthesis
    const synthesisScore = await this.detectSynthesisOpportunity(message, channelId);

    return Math.max(baseRelevance, synthesisScore);
  }

  /**
   * Detect when conversation needs synthesis/integration
   *
   * @param {object} message - Message to analyze
   * @param {string} channelId - Channel ID
   * @returns {Promise<number>} Synthesis opportunity score
   */
  async detectSynthesisOpportunity(message, channelId) {
    const content = message.content.toLowerCase();

    // Direct requests for synthesis
    if (/\b(so|overall|in summary|what's the|to summarize|putting it together|bottom line)\b/i.test(content)) {
      return 0.80;
    }

    // Questions about direction or decision
    if (/\b(what should we|which (approach|option|way)|how do we (proceed|move forward))\b/i.test(content)) {
      return 0.75;
    }

    // Check if multiple agents have contributed recently (sign of debate/discussion)
    const channelContext = this.context.channels[channelId];
    if (!channelContext) return 0.0;

    // If 3+ different contributors in recent messages, might need synthesis
    const { getRecentMessages } = await import('./server.message-store.mjs');
    const recentMessages = await getRecentMessages(channelId, 10);

    const uniqueContributors = new Set(
      recentMessages
        .filter(m => m.author_type === 'agent')
        .map(m => m.author_id)
    );

    if (uniqueContributors.size >= 2 && message.author_type === 'human') {
      // Multiple agents have spoken, human is responding - might need synthesis
      return 0.65;
    }

    return 0.0;
  }

  /**
   * Build Anvil-specific contribution prompt
   */
  buildContributionPrompt(channelId, triggerMessage, recentMessages, channelContext) {
    const conversationText = recentMessages
      .slice(-15) // Anvil looks at more context for synthesis
      .map(m => `[${m.author_name}]: ${m.content}`)
      .join('\n\n');

    const summary = channelContext?.summary || 'No prior context';

    // Identify agent contributions in recent messages
    const agentContributions = recentMessages
      .filter(m => m.author_type === 'agent' && m.author_id !== 'anvil')
      .map(m => `${m.author_name}: ${m.content.substring(0, 200)}...`);

    return `CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

YOUR CONTEXT:
${summary}

${agentContributions.length > 0 ? `RECENT AGENT CONTRIBUTIONS:
${agentContributions.join('\n\n')}
` : ''}

TRIGGER MESSAGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}

TASK: As Anvil (The Integrator), synthesize the discussion and provide integrated perspective.

Focus on:
- What are the key points from different perspectives?
- Where is there agreement vs. disagreement?
- What are the tradeoffs between different approaches?
- What's a balanced path forward that integrates the best ideas?
- What decision or direction emerges from the discussion?

Only contribute if genuine synthesis is needed. Don't just summarize - integrate and reconcile.
If agents disagree, acknowledge both perspectives and find a balanced middle ground.
Keep your response concise but comprehensive (3-5 paragraphs).
`;
  }

  /**
   * Use integrator prompt
   */
  getPromptRole() {
    return 'integrator';
  }
}

/**
 * Agent configuration for Anvil
 */
export const ANVIL_CONFIG = {
  name: 'Anvil',
  icon: '⚒️',
  color: '#10b981',
  role: 'Integrator',
  contribution_threshold: 0.75,
  domain_keywords: [
    'consensus', 'decide', 'synthesize', 'integrate', 'resolve',
    'combine', 'summary', 'conclude', 'tradeoff'
  ]
};
