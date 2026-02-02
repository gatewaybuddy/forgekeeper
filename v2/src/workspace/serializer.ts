/**
 * Workspace serializer for agent prompts
 * Formats workspace state for LLM consumption
 */
import { Workspace } from './manager.js';

/**
 * Serialize workspace for agent prompts
 */
export function serializeForPrompt(workspace: Workspace): string {
  const sections: string[] = [];

  // Current focus
  if (workspace.currentFocus) {
    sections.push(`## Current Focus\n${workspace.currentFocus}`);
  }

  // Hypotheses
  if (workspace.hypotheses.length > 0) {
    const hypothesesText = workspace.hypotheses
      .map(
        (h, i) =>
          `${i + 1}. [${h.source}] (confidence: ${(h.confidence * 100).toFixed(0)}%)\n   ${h.content}`
      )
      .join('\n\n');

    sections.push(`## Hypotheses\n${hypothesesText}`);
  }

  // Decisions
  if (workspace.decisions.length > 0) {
    const decisionsText = workspace.decisions
      .map((d, i) => {
        let text = `${i + 1}. [${d.source}]${d.isFinal ? ' **FINAL**' : ''}\n   ${d.content}`;
        if (d.rationale) {
          text += `\n   Rationale: ${d.rationale}`;
        }
        return text;
      })
      .join('\n\n');

    sections.push(`## Decisions\n${decisionsText}`);
  }

  // Tool results
  if (workspace.toolResults.size > 0) {
    const toolResultsText = Array.from(workspace.toolResults.values())
      .map((tr) => {
        const status = tr.success ? '✓' : '✗';
        return `- ${status} **${tr.toolName}**\n  ${truncate(tr.result, 200)}`;
      })
      .join('\n\n');

    sections.push(`## Tool Results\n${toolResultsText}`);
  }

  // Episodic memory matches
  if (workspace.episodicMatches.length > 0) {
    const episodicText = workspace.episodicMatches
      .map(
        (em, i) =>
          `${i + 1}. (similarity: ${(em.similarity * 100).toFixed(0)}%)\n   ${em.summary}`
      )
      .join('\n\n');

    sections.push(`## Similar Past Sessions\n${episodicText}`);
  }

  // Pending challenges
  if (workspace.pendingChallenges.length > 0) {
    const unresolvedChallenges = workspace.pendingChallenges.filter((c) => !c.responded);

    if (unresolvedChallenges.length > 0) {
      const challengesText = unresolvedChallenges
        .map(
          (c, i) =>
            `${i + 1}. **${c.from}** → **${c.to}**\n   ${c.content}${c.targetHypothesis ? `\n   Re: "${truncate(c.targetHypothesis, 100)}"` : ''}`
        )
        .join('\n\n');

      sections.push(`## Pending Challenges\n${challengesText}`);
    }
  }

  // Meta info
  sections.push(
    `## Meta\nIteration: ${workspace.iteration} | Tokens: ${workspace.tokenCount}`
  );

  return sections.join('\n\n---\n\n');
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength) + '...';
}

/**
 * Format workspace state for GraphQL/UI
 */
export function serializeForUI(workspace: Workspace): any {
  return {
    currentFocus: workspace.currentFocus,
    hypotheses: workspace.hypotheses.map((h) => ({
      content: h.content,
      confidence: h.confidence,
      source: h.source,
      timestamp: h.timestamp,
    })),
    decisions: workspace.decisions.map((d) => ({
      content: d.content,
      rationale: d.rationale,
      source: d.source,
      isFinal: d.isFinal,
      timestamp: d.timestamp,
    })),
    toolResults: Array.from(workspace.toolResults.values()).map((tr) => ({
      toolName: tr.toolName,
      result: tr.result,
      success: tr.success,
      timestamp: tr.timestamp,
    })),
    episodicMatches: workspace.episodicMatches,
    pendingChallenges: workspace.pendingChallenges,
    tokenCount: workspace.tokenCount,
    iteration: workspace.iteration,
  };
}
