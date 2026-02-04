/**
 * Attention mechanism for proposal scoring
 * Implements Global Workspace Theory broadcast competition
 */
import { Proposal, Workspace } from './manager.js';

export interface ScoredProposal extends Proposal {
  score: number;
}

// Scoring weights
const WEIGHTS = {
  relevance: 0.4, // Relevance to current focus
  novelty: 0.25, // Not duplicating existing content
  confidence: 0.15, // Agent confidence
  empirical: 0.1, // Empirical grounding (Scout bonus)
  priority: 0.1, // Challenge/response priority
};

/**
 * Calculate attention score for a proposal
 */
export function calculateScore(proposal: Proposal, workspace: Workspace): number {
  let score = 0;

  // 1. Relevance to current focus (0.4 weight)
  score += calculateRelevance(proposal, workspace) * WEIGHTS.relevance;

  // 2. Novelty - not duplicating existing content (0.25 weight)
  score += calculateNovelty(proposal, workspace) * WEIGHTS.novelty;

  // 3. Agent confidence (0.15 weight)
  score += (proposal.confidence || 0.5) * WEIGHTS.confidence;

  // 4. Empirical grounding - Scout bonus (0.1 weight)
  score += calculateEmpiricalBonus(proposal, workspace) * WEIGHTS.empirical;

  // 5. Challenge/response priority (0.1 weight)
  score += calculatePriorityBonus(proposal, workspace) * WEIGHTS.priority;

  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}

/**
 * Calculate relevance to current focus
 * Uses simple word overlap similarity
 */
function calculateRelevance(proposal: Proposal, workspace: Workspace): number {
  if (!workspace.currentFocus) {
    return 0.5; // Neutral if no focus
  }

  const focusWords = tokenize(workspace.currentFocus.toLowerCase());
  const proposalWords = tokenize(proposal.content.toLowerCase());

  if (focusWords.length === 0 || proposalWords.length === 0) {
    return 0;
  }

  const overlap = focusWords.filter((word) => proposalWords.includes(word)).length;
  const relevance = overlap / Math.max(focusWords.length, proposalWords.length);

  return relevance;
}

/**
 * Calculate novelty - penalize duplicates
 * Uses Jaccard similarity against existing hypotheses/decisions
 */
function calculateNovelty(proposal: Proposal, workspace: Workspace): number {
  let maxSimilarity = 0;

  // Check against hypotheses
  for (const hypothesis of workspace.hypotheses) {
    const similarity = jaccardSimilarity(proposal.content, hypothesis.content);
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  // Check against decisions
  for (const decision of workspace.decisions) {
    const similarity = jaccardSimilarity(proposal.content, decision.content);
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  // Novelty = inverse of similarity
  return 1 - maxSimilarity;
}

/**
 * Calculate empirical grounding bonus
 * Tool results and Scout responses get bonus
 */
function calculateEmpiricalBonus(proposal: Proposal, workspace: Workspace): number {
  // Tool results are empirical
  if (proposal.type === 'tool_result') {
    return 1.0;
  }

  // Scout responses to challenges are empirical
  if (proposal.type === 'response' && proposal.source === 'scout') {
    return 1.0;
  }

  // Hypotheses based on tool results
  if (proposal.type === 'hypothesis' && workspace.toolResults.size > 0) {
    // Check if proposal mentions any tool results
    const proposalLower = proposal.content.toLowerCase();
    for (const [toolName] of workspace.toolResults) {
      if (proposalLower.includes(toolName.toLowerCase())) {
        return 0.8;
      }
    }
  }

  return 0;
}

/**
 * Calculate priority bonus
 * Challenges and responses to challenges get priority
 */
function calculatePriorityBonus(proposal: Proposal, workspace: Workspace): number {
  // Challenges get priority
  if (proposal.type === 'challenge') {
    return 1.0;
  }

  // Responses to pending challenges get priority
  if (proposal.type === 'response') {
    const hasChallenge = workspace.pendingChallenges.some(
      (c) => c.to === proposal.source && !c.responded
    );

    if (hasChallenge) {
      return 1.0;
    }
  }

  return 0;
}

/**
 * Jaccard similarity between two strings
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a.toLowerCase()));
  const tokensB = new Set(tokenize(b.toLowerCase()));

  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1; // Both empty
  }

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Simple tokenization
 */
function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\w]/g, ''))
    .filter((word) => word.length > 2); // Filter short words
}

/**
 * Check if two pieces of content are similar
 * Used for duplicate detection
 */
export function isSimilar(a: string, b: string, threshold = 0.5): boolean {
  return jaccardSimilarity(a, b) > threshold;
}
