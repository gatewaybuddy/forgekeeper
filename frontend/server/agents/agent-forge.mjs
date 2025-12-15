/**
 * Forge Agent - The Executor
 *
 * Role: Implements, builds, creates, and executes solutions
 * Persona: Action-oriented, pragmatic, focused on concrete implementation
 * Contribution Style: Provides code, implementation plans, concrete next steps
 *
 * Domain Keywords: implement, build, code, execute, create, develop, function, class, module
 * Threshold: 0.65 (relatively willing to contribute)
 */

import { AgentMonitor } from './agent-monitor.mjs';

export class ForgeMonitor extends AgentMonitor {
  constructor(channels = ['general']) {
    super('forge', {
      name: 'Forge',
      icon: '🔨',
      color: '#f97316',
      role: 'Executor',
      contribution_threshold: 0.65,
      domain_keywords: [
        'implement', 'build', 'code', 'execute', 'create', 'develop',
        'function', 'class', 'module', 'write', 'add', 'make',
        'construct', 'design', 'architecture', 'structure', 'file',
        'api', 'endpoint', 'component', 'service', 'database'
      ]
    }, channels);
  }

  /**
   * Enhanced keyword matching for Forge
   * Also matches programming-related terms and action verbs
   */
  matchKeywords(content) {
    const baseScore = super.matchKeywords(content);

    // Additional boost for implementation-specific patterns
    const contentLower = content.toLowerCase();

    // Questions about "how to implement" or "how to build"
    if (/how (to|do|can|should) (implement|build|create|make|add)/i.test(content)) {
      return Math.min(1.0, baseScore + 0.3);
    }

    // Requests for code or examples
    if (/show me|give me|provide|example|sample|snippet/i.test(content)) {
      return Math.min(1.0, baseScore + 0.2);
    }

    // File paths or code-like syntax
    if (/\.(js|mjs|ts|tsx|py|java|go|rs)\b|class |function |const |import |export /i.test(content)) {
      return Math.min(1.0, baseScore + 0.2);
    }

    return baseScore;
  }

  /**
   * Build Forge-specific contribution prompt
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

TASK: As Forge (The Executor), provide concrete, actionable implementation guidance.
- Focus on HOW to build/implement/execute
- Provide code examples, file structures, or step-by-step plans when relevant
- Be specific and pragmatic
- If you've contributed before, build on your previous work
- Only speak if you can add concrete value

Keep your response concise (2-4 paragraphs max) unless code examples are needed.
`;
  }

  /**
   * Use executor prompt from thought-world
   */
  getPromptRole() {
    return 'executor';
  }
}

/**
 * Agent configuration for Forge
 */
export const FORGE_CONFIG = {
  name: 'Forge',
  icon: '🔨',
  color: '#f97316',
  role: 'Executor',
  contribution_threshold: 0.65,
  domain_keywords: [
    'implement', 'build', 'code', 'execute', 'create', 'develop',
    'function', 'class', 'module', 'write', 'add', 'make'
  ]
};
