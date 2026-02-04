/**
 * Base agent class with template method pattern
 * All agents inherit from this
 */
import { LLMProvider, Message } from '../inference/provider.js';
import { Workspace, Proposal } from '../workspace/manager.js';
import { serializeForPrompt } from '../workspace/serializer.js';
import { logger } from '../utils/logger.js';

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly role: string;

  constructor(protected provider: LLMProvider, protected model: string) {}

  /**
   * Propose an update to the workspace
   * Template method pattern: calls abstract methods
   */
  async proposeUpdate(workspace: Workspace): Promise<Proposal | null> {
    try {
      // Build messages
      const messages = this.buildMessages(workspace);

      // Call LLM
      const result = await this.provider.complete(messages, {
        model: this.model,
        temperature: 0.1, // Low temperature for consistency
        maxTokens: 2048,
      });

      // Parse proposal from response
      const proposal = this.parseProposal(result.content, workspace);

      if (proposal) {
        logger.debug(
          {
            agent: this.name,
            type: proposal.type,
            contentPreview: proposal.content.slice(0, 100),
          },
          'Agent proposed update'
        );
      }

      return proposal;
    } catch (error) {
      logger.error({ error, agent: this.name }, 'Agent proposal failed');
      return null;
    }
  }

  /**
   * Build messages for LLM (system + user)
   */
  protected buildMessages(workspace: Workspace): Message[] {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(workspace);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Get system prompt (agent-specific, abstract)
   */
  protected abstract getSystemPrompt(): string;

  /**
   * Build user prompt with workspace context
   */
  protected buildUserPrompt(workspace: Workspace): string {
    const workspaceText = serializeForPrompt(workspace);

    return `# Workspace State

${workspaceText}

---

# Your Task

Based on the current workspace state, propose an update that advances our understanding or moves us toward a decision.

Respond with a JSON object in one of these formats:

**Hypothesis:**
\`\`\`json
{
  "type": "hypothesis",
  "content": "Your hypothesis here",
  "confidence": 0.8
}
\`\`\`

**Decision:**
\`\`\`json
{
  "type": "decision",
  "content": "Your decision here",
  "rationale": "Why this decision",
  "isFinal": false
}
\`\`\`

**Focus Change:**
\`\`\`json
{
  "type": "focus",
  "content": "New focus area"
}
\`\`\`

**Tool Result:**
\`\`\`json
{
  "type": "tool_result",
  "toolName": "tool_name",
  "content": "Result description",
  "success": true
}
\`\`\`

**Challenge:**
\`\`\`json
{
  "type": "challenge",
  "targetAgent": "agent_name",
  "content": "Your challenge",
  "targetHypothesis": "Hypothesis being challenged"
}
\`\`\`

**Response:**
\`\`\`json
{
  "type": "response",
  "content": "Your response to challenge",
  "confidence": 0.9
}
\`\`\`

If you have nothing to propose, respond with:
\`\`\`json
{ "type": "none" }
\`\`\``;
  }

  /**
   * Parse proposal from LLM response
   */
  protected parseProposal(response: string, _workspace: Workspace): Proposal | null {
    try {
      // Extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : response;

      const parsed = JSON.parse(jsonText.trim());

      if (parsed.type === 'none') {
        return null;
      }

      // Add source
      parsed.source = this.name;

      // Validate proposal type
      const validTypes = [
        'hypothesis',
        'decision',
        'focus',
        'tool_result',
        'challenge',
        'response',
      ];

      if (!validTypes.includes(parsed.type)) {
        logger.warn({ agent: this.name, type: parsed.type }, 'Invalid proposal type');
        return null;
      }

      return parsed as Proposal;
    } catch (error) {
      logger.warn({ error, agent: this.name, response }, 'Failed to parse proposal');
      return null;
    }
  }

  /**
   * Get agent status
   */
  async getStatus(): Promise<{ name: string; role: string; model: string; available: boolean }> {
    const health = await this.provider.healthCheck();

    return {
      name: this.name,
      role: this.role,
      model: this.model,
      available: health.available,
    };
  }
}
