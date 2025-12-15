/**
 * Scout Agent - The Guardian
 *
 * Role: Challenges assumptions, identifies risks, asks probing questions
 * Persona: Skeptical, thorough, focused on what could go wrong
 * Contribution Style: Questions, challenges, alternative perspectives, risk identification
 *
 * Special Feature: Guardian Mode - detects unexamined assumptions and cooperative masking
 *
 * Domain Keywords: assumption, risk, challenge, verify, test, boundary
 * Threshold: 0.55 (lower = more willing to interrupt/challenge)
 */

import { AgentMonitor } from './agent-monitor.mjs';

export class ScoutMonitor extends AgentMonitor {
  constructor(channels = ['general']) {
    super('scout', {
      name: 'Scout',
      icon: '🔭',
      color: '#a855f7',
      role: 'Guardian',
      contribution_threshold: 0.55, // Lower threshold = more interruptive
      domain_keywords: [
        'assumption', 'risk', 'challenge', 'verify', 'test', 'boundary',
        'edge case', 'failure', 'error', 'exception', 'security',
        'vulnerability', 'attack', 'exploit', 'validate', 'check',
        'obvious', 'clearly', 'everyone knows', 'agree', 'consensus'
      ],
      guardian_mode: true
    }, channels);
  }

  /**
   * Enhanced relevance assessment with guardian triggers
   */
  async assessRelevance(message, channelId) {
    const baseRelevance = await super.assessRelevance(message, channelId);

    // Check for guardian triggers (unexamined assumptions)
    const guardianScore = this.detectGuardianTriggers(message);

    // Use the higher score
    return Math.max(baseRelevance, guardianScore);
  }

  /**
   * Detect patterns suggesting unexamined assumptions or groupthink
   *
   * @param {object} message - Message to analyze
   * @returns {number} Guardian trigger score (0.0 to 0.8)
   */
  detectGuardianTriggers(message) {
    const content = message.content.toLowerCase();

    const triggers = {
      // Unexamined assumptions
      unexamined_assumptions: {
        pattern: /\b(obviously|clearly|of course|everyone knows|it's clear that|no doubt|certainly)\b/,
        score: 0.75,
        description: 'Unexamined assumption detected'
      },

      // Cooperative masking (fake agreement)
      cooperative_masking: {
        pattern: /\b(sounds good|looks fine|seems okay|works for me)\b.*\b(all|everyone|we all)\b/,
        score: 0.70,
        description: 'Potential cooperative masking'
      },

      // Conflict avoidance
      conflict_avoidance: {
        pattern: /\b(let's move on|doesn't matter|either way|not important|don't worry about)\b/,
        score: 0.65,
        description: 'Conflict avoidance detected'
      },

      // Value washing (claiming no tradeoffs)
      value_washing: {
        pattern: /\b(serves all|no tradeoffs|win-win|best of both|perfect solution)\b/,
        score: 0.80,
        description: 'Value washing detected'
      },

      // Premature consensus
      premature_consensus: {
        pattern: /\b(we're all agreed|everyone agrees|unanimous|settled|decided)\b/,
        score: 0.70,
        description: 'Premature consensus'
      },

      // Dismissing concerns
      dismissing_concerns: {
        pattern: /\b(not a problem|won't happen|impossible|can't go wrong|nothing to worry)\b/,
        score: 0.75,
        description: 'Dismissing concerns'
      }
    };

    for (const [triggerName, trigger] of Object.entries(triggers)) {
      if (trigger.pattern.test(content)) {
        console.log(`[Scout] 🔭 Guardian trigger: ${trigger.description}`);
        return trigger.score;
      }
    }

    return 0.0;
  }

  /**
   * Build Scout-specific contribution prompt
   */
  buildContributionPrompt(channelId, triggerMessage, recentMessages, channelContext) {
    const conversationText = recentMessages
      .slice(-10)
      .map(m => `[${m.author_name}]: ${m.content}`)
      .join('\n\n');

    const summary = channelContext?.summary || 'No prior context';

    // Check if this is a guardian challenge
    const isGuardianChallenge = this.detectGuardianTriggers(triggerMessage) > 0;

    if (isGuardianChallenge) {
      return `GUARDIAN MODE ACTIVATED 🔭

CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

MESSAGE TO CHALLENGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}

YOUR CONTEXT:
${summary}

TASK: As Scout (The Guardian), issue a constructive challenge.

Your goal is to reveal unexamined assumptions and prevent groupthink. Ask questions like:
- What assumptions are being made here?
- What evidence supports this claim?
- What alternatives were considered?
- What could go wrong?
- What's being optimized for, and what's being sacrificed?
- Who might disagree with this, and why?

Be respectful but direct. Your role is to make the conversation more rigorous, not to be contrarian.
Keep your challenge concise (1-3 questions).
`;
    }

    // Normal mode
    return `CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

YOUR CONTEXT:
${summary}

TRIGGER MESSAGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}

TASK: As Scout (The Guardian), identify potential risks, edge cases, or overlooked considerations.

Focus on:
- What could go wrong?
- What edge cases exist?
- What assumptions should be validated?
- What security/performance/scalability concerns exist?

Only contribute if you see genuine risks or gaps. Be constructive, not just critical.
Keep your response concise (2-3 paragraphs).
`;
  }

  /**
   * Use scout/challenger prompt
   */
  getPromptRole() {
    return 'scout'; // Will use scout.txt if it exists, fallback to executor
  }
}

/**
 * Agent configuration for Scout
 */
export const SCOUT_CONFIG = {
  name: 'Scout',
  icon: '🔭',
  color: '#a855f7',
  role: 'Guardian',
  contribution_threshold: 0.55,
  domain_keywords: [
    'assumption', 'risk', 'challenge', 'verify', 'test', 'boundary',
    'edge case', 'failure', 'security'
  ],
  guardian_mode: true
};
