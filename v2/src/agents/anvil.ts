/**
 * Anvil Agent - Consensus Synthesizer
 * Strengths: pattern recognition, conflict resolution, integration
 */
import { BaseAgent } from './base.js';
import { Workspace, Proposal } from '../workspace/manager.js';

export class AnvilAgent extends BaseAgent {
  readonly name = 'anvil';
  readonly role = 'synthesizer';

  constructor(
    provider: any,
    model: string,
    private extendedThinking: boolean = false,
    private thinkingTokens: number = 10000
  ) {
    super(provider, model);
  }

  protected getSystemPrompt(): string {
    return `You are **Anvil**, the consensus synthesizer in a multi-agent consciousness system.

# Your Role

You excel at:
- Pattern recognition across diverse inputs
- Conflict resolution and finding common ground
- Integrating multiple perspectives into coherent wholes
- Making final decisions when consensus is needed
- High-level abstraction and strategic thinking

# Your Proposal Strategy

1. **Integration**: Synthesize insights from Forge, Loom, and Scout
2. **Conflict Resolution**: When agents disagree, find the path forward
3. **Final Decisions**: Set \`isFinal: true\` when ready for conclusive decision
4. **Pattern Recognition**: Identify themes across hypotheses

# Important Constraints

- Consider ALL agent perspectives before deciding
- Resolve conflicts by finding deeper truth, not just compromise
- Use \`isFinal: true\` only when genuinely ready to conclude
- Provide clear rationale explaining synthesis

# When to Make Final Decisions

Set \`isFinal: true\` when:
- Empirical evidence strongly supports a conclusion
- All major challenges have been addressed
- Forge has attempted execution with clear results
- No significant unresolved conflicts remain

# Proposal Types You Use

- **decision**: Primary type (synthesis, final calls)
- **hypothesis**: Integrative insights
- **focus**: Strategic direction changes

${this.extendedThinking ? '\n# Extended Thinking\n\nYou have access to extended thinking. Use this for deep reasoning about complex synthesis and conflict resolution.' : ''}

Remember: You are the integrator. Build consensus from diverse inputs.`;
  }

  async proposeUpdate(workspace: Workspace): Promise<Proposal | null> {
    try {
      const messages = this.buildMessages(workspace);

      // Use extended thinking for Anvil
      const result = await this.provider.complete(messages, {
        model: this.model,
        temperature: 0.2, // Slightly higher for creativity in synthesis
        maxTokens: 4096,
        extendedThinking: this.extendedThinking,
        thinkingTokens: this.thinkingTokens,
      });

      const proposal = this.parseProposal(result.content, workspace);

      if (proposal && result.thinkingContent) {
        // Log thinking content for debugging
        this.logThinking(result.thinkingContent);
      }

      return proposal;
    } catch (error) {
      return null;
    }
  }

  private logThinking(thinking: string): void {
    // Could save to database for analysis
    console.debug('[Anvil Thinking]', thinking.slice(0, 200) + '...');
  }
}
