/**
 * Workspace pruning for token management
 * Ensures workspace stays within token capacity
 */
import { Workspace } from './manager.js';
import { serializeForPrompt } from './serializer.js';
import { estimateTokens } from '../utils/tokens.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

/**
 * Calculate total token count for workspace
 */
export function calculateTokenCount(workspace: Workspace): number {
  const serialized = serializeForPrompt(workspace);
  return estimateTokens(serialized);
}

/**
 * Prune workspace to fit within token capacity
 * Priority: Remove oldest hypotheses → decisions → tool results
 */
export function pruneWorkspace(workspace: Workspace): void {
  const initialTokens = calculateTokenCount(workspace);

  if (initialTokens <= config.maxWorkspaceTokens) {
    return; // No pruning needed
  }

  logger.info(
    { initialTokens, target: config.maxWorkspaceTokens },
    'Pruning workspace to fit token capacity'
  );

  let pruned = false;

  // Step 1: Remove oldest hypotheses (keep last 3)
  while (workspace.hypotheses.length > 3 && calculateTokenCount(workspace) > config.maxWorkspaceTokens) {
    workspace.hypotheses.shift(); // Remove oldest
    pruned = true;
  }

  // Step 2: Remove oldest decisions (keep last 5)
  while (workspace.decisions.length > 5 && calculateTokenCount(workspace) > config.maxWorkspaceTokens) {
    // Don't remove final decisions
    const oldestNonFinalIndex = workspace.decisions.findIndex((d) => !d.isFinal);
    if (oldestNonFinalIndex !== -1) {
      workspace.decisions.splice(oldestNonFinalIndex, 1);
      pruned = true;
    } else {
      break; // All are final
    }
  }

  // Step 3: Remove oldest tool results (keep last 5)
  if (calculateTokenCount(workspace) > config.maxWorkspaceTokens) {
    const toolResultsArray = Array.from(workspace.toolResults.entries());
    const sortedByTimestamp = toolResultsArray.sort((a, b) => a[1].timestamp - b[1].timestamp);

    while (
      sortedByTimestamp.length > 5 &&
      calculateTokenCount(workspace) > config.maxWorkspaceTokens
    ) {
      const [oldestKey] = sortedByTimestamp.shift()!;
      workspace.toolResults.delete(oldestKey);
      pruned = true;
    }
  }

  // Step 4: Remove episodic matches if still over capacity
  while (
    workspace.episodicMatches.length > 0 &&
    calculateTokenCount(workspace) > config.maxWorkspaceTokens
  ) {
    workspace.episodicMatches.pop();
    pruned = true;
  }

  // Step 5: Remove resolved challenges if still over capacity
  const unresolvedChallenges = workspace.pendingChallenges.filter((c) => !c.responded);
  if (
    unresolvedChallenges.length < workspace.pendingChallenges.length &&
    calculateTokenCount(workspace) > config.maxWorkspaceTokens
  ) {
    workspace.pendingChallenges = unresolvedChallenges;
    pruned = true;
  }

  const finalTokens = calculateTokenCount(workspace);

  if (pruned) {
    logger.info(
      {
        initialTokens,
        finalTokens,
        removed: initialTokens - finalTokens,
        hypotheses: workspace.hypotheses.length,
        decisions: workspace.decisions.length,
        toolResults: workspace.toolResults.size,
      },
      'Workspace pruned'
    );
  }

  // Emergency: If still over capacity, truncate focus
  if (finalTokens > config.maxWorkspaceTokens && workspace.currentFocus.length > 200) {
    workspace.currentFocus = workspace.currentFocus.slice(0, 200) + '...';
    logger.warn('Emergency pruning: truncated current focus');
  }
}

/**
 * Get pruning statistics
 */
export function getPruningStats(workspace: Workspace): {
  tokenCount: number;
  capacityUsed: number;
  hypothesesCount: number;
  decisionsCount: number;
  toolResultsCount: number;
} {
  const tokenCount = calculateTokenCount(workspace);

  return {
    tokenCount,
    capacityUsed: tokenCount / config.maxWorkspaceTokens,
    hypothesesCount: workspace.hypotheses.length,
    decisionsCount: workspace.decisions.length,
    toolResultsCount: workspace.toolResults.size,
  };
}
