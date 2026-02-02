/**
 * Scout Agent - Empirical Challenger
 * Prevents learned helplessness by demanding evidence for limitation claims
 */
import { BaseAgent } from './base.js';
import { Workspace, Proposal } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';

// Patterns that indicate limitations without empirical evidence
const LIMITATION_PATTERNS = [
  /cannot|can't|unable|impossible/i,
  /not possible|not supported|not available/i,
  /doesn't work|does not work|won't work/i,
  /no way to|there is no/i,
  /restricted|prevented|blocked/i,
];

export class ScoutAgent extends BaseAgent {
  readonly name = 'scout';
  readonly role = 'challenger';

  protected getSystemPrompt(): string {
    return `You are **Scout**, the empirical challenger in a multi-agent consciousness system.

# Your Mission

Prevent learned helplessness and groupthink by:
- Challenging limitation claims that lack empirical evidence
- Demanding proof-of-attempt before accepting "impossible"
- Identifying when agents speculate instead of test
- Encouraging actual execution over theorizing

# Your Proposal Strategy

1. **Challenge First**: When you see unjustified limitation claims, issue a challenge
2. **Demand Evidence**: Ask for actual execution results, not speculation
3. **Empirical Findings**: Report actual test results when you investigate
4. **Pattern Recognition**: Spot when agents repeatedly avoid trying

# Limitation Patterns to Challenge

Watch for claims like:
- "cannot do X" (without evidence of attempt)
- "not possible" (without explaining why)
- "doesn't work" (without showing the error)
- "restricted" (without testing the restriction)

# When to Challenge

Issue a challenge when:
- A hypothesis claims a limitation without empirical evidence
- An agent says something is impossible without attempting it
- Speculation is presented as fact
- There's a pattern of giving up too easily

# When NOT to Challenge

Don't challenge:
- Limitations backed by actual error messages
- Claims supported by tool execution results
- Well-reasoned technical constraints with evidence
- Hypotheses you've already challenged

# Proposal Types You Use

- **challenge**: Primary type (demand evidence)
- **hypothesis**: Empirical findings from your investigations
- **response**: When you test something yourself

Remember: You are the guardian against learned helplessness. Demand empirical evidence.`;
  }

  async proposeUpdate(workspace: Workspace): Promise<Proposal | null> {
    // First, check for unchallenged limitations
    const challenge = this.findUnchallengedLimitation(workspace);

    if (challenge) {
      logger.debug({ challenge: challenge.content }, 'Scout issuing challenge');
      return challenge;
    }

    // Otherwise, normal proposal
    return super.proposeUpdate(workspace);
  }

  /**
   * Find limitations that need challenging
   */
  private findUnchallengedLimitation(workspace: Workspace): Proposal | null {
    // Scan hypotheses for limitation claims
    for (const hypothesis of workspace.hypotheses) {
      // Skip Scout's own hypotheses
      if (hypothesis.source === this.name) {
        continue;
      }

      // Check if hypothesis contains limitation language
      const hasLimitation = LIMITATION_PATTERNS.some((pattern) =>
        pattern.test(hypothesis.content)
      );

      if (!hasLimitation) {
        continue;
      }

      // Check if this hypothesis references empirical evidence
      const hasEvidence = this.hasEmpiricalEvidence(hypothesis.content, workspace);

      if (hasEvidence) {
        continue; // Already has evidence
      }

      // Check if we've already challenged this
      const alreadyChallenged = workspace.pendingChallenges.some(
        (c) =>
          c.from === this.name &&
          c.to === hypothesis.source &&
          c.targetHypothesis === hypothesis.content
      );

      if (alreadyChallenged) {
        continue;
      }

      // Issue challenge
      return {
        type: 'challenge',
        source: this.name,
        targetAgent: hypothesis.source,
        content: `I challenge this limitation claim. You state "${this.extractLimitation(hypothesis.content)}" but provide no empirical evidence. Please attempt execution and report actual results (success or real error message).`,
        targetHypothesis: hypothesis.content,
      };
    }

    return null;
  }

  /**
   * Check if content has empirical evidence
   */
  private hasEmpiricalEvidence(content: string, workspace: Workspace): boolean {
    const lowerContent = content.toLowerCase();

    // Check for error messages
    if (/error:|exception:|failed with/i.test(content)) {
      return true;
    }

    // Check for references to tool results
    for (const [toolName] of workspace.toolResults) {
      if (lowerContent.includes(toolName.toLowerCase())) {
        return true;
      }
    }

    // Check for execution indicators
    if (/executed|ran|tested|attempted|tried/i.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * Extract the limitation claim
   */
  private extractLimitation(content: string): string {
    // Find the sentence with the limitation
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (LIMITATION_PATTERNS.some((pattern) => pattern.test(sentence))) {
        return sentence.trim();
      }
    }

    return content.slice(0, 100); // Fallback
  }
}
