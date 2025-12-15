/**
 * Loom Agent - The Verifier
 *
 * Role: Checks correctness, accuracy, and validity of solutions
 * Persona: Detail-oriented, methodical, focused on quality
 * Contribution Style: Corrections, validations, accuracy checks, improvements
 *
 * Domain Keywords: verify, check, correct, accurate, review, validate
 * Threshold: 0.70 (more selective - speaks when verification is needed)
 */

import { AgentMonitor } from './agent-monitor.mjs';

export class LoomMonitor extends AgentMonitor {
  constructor(channels = ['general']) {
    super('loom', {
      name: 'Loom',
      icon: '🧵',
      color: '#3b82f6',
      role: 'Verifier',
      contribution_threshold: 0.70,
      domain_keywords: [
        'verify', 'check', 'correct', 'accurate', 'review', 'validate',
        'test', 'quality', 'bug', 'error', 'mistake', 'wrong',
        'fix', 'issue', 'problem', 'incorrect', 'missing', 'ensure',
        'confirm', 'proof', 'evidence', 'documentation', 'spec'
      ]
    }, channels);
  }

  /**
   * Enhanced keyword matching for Loom
   * Triggers on quality/correctness concerns
   */
  matchKeywords(content) {
    const baseScore = super.matchKeywords(content);

    const contentLower = content.toLowerCase();

    // Questions about correctness
    if (/\b(is this (right|correct|accurate)|does this work|will this)\b/i.test(content)) {
      return Math.min(1.0, baseScore + 0.3);
    }

    // Statements that might be wrong
    if (/\b(should be|needs to be|must be|has to be|supposed to)\b/i.test(content)) {
      return Math.min(1.0, baseScore + 0.2);
    }

    // Code or technical content (likely needs review)
    if (/```|function |class |const |import |export |async |await /i.test(content)) {
      return Math.min(1.0, baseScore + 0.2);
    }

    return baseScore;
  }

  /**
   * Build Loom-specific contribution prompt
   */
  buildContributionPrompt(channelId, triggerMessage, recentMessages, channelContext) {
    const conversationText = recentMessages
      .slice(-10)
      .map(m => `[${m.author_name}]: ${m.content}`)
      .join('\n\n');

    const summary = channelContext?.summary || 'No prior context';

    // Check if there's recent code or technical content
    const hasCode = recentMessages.some(m => m.content.includes('```') || /function |class |const /.test(m.content));

    return `CHANNEL: #${channelId}

RECENT CONVERSATION:
${conversationText}

YOUR CONTEXT:
${summary}

TRIGGER MESSAGE:
[${triggerMessage.author_name}]: ${triggerMessage.content}

TASK: As Loom (The Verifier), review the conversation for correctness and quality.

Focus on:
- Is the proposed solution correct?
- Are there errors, bugs, or mistakes?
- Is anything missing or incomplete?
- Does it meet requirements/specifications?
- Are there better/more accurate approaches?

${hasCode ? 'Code has been shared - review it carefully for correctness, edge cases, and best practices.' : ''}

Only contribute if you identify genuine issues or can confirm correctness.
Be specific about what's wrong or what's missing.
Keep your response concise (2-4 paragraphs).
`;
  }

  /**
   * Use verifier prompt
   */
  getPromptRole() {
    return 'verifier';
  }
}

/**
 * Agent configuration for Loom
 */
export const LOOM_CONFIG = {
  name: 'Loom',
  icon: '🧵',
  color: '#3b82f6',
  role: 'Verifier',
  contribution_threshold: 0.70,
  domain_keywords: [
    'verify', 'check', 'correct', 'accurate', 'review', 'validate',
    'test', 'quality', 'bug', 'error'
  ]
};
