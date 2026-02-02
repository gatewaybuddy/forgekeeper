/**
 * Workspace Manager - Global Workspace Theory implementation
 * Manages shared consciousness state and attention mechanism
 */
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { prisma } from '../utils/prisma.js';
import { calculateScore, type ScoredProposal } from './attention.js';
import { serializeForPrompt } from './serializer.js';
import { pruneWorkspace, calculateTokenCount } from './pruning.js';

// Workspace data structures
export interface Hypothesis {
  content: string;
  confidence: number; // 0.0 to 1.0
  source: string; // agent name
  timestamp: number;
}

export interface Decision {
  content: string;
  rationale: string;
  source: string; // agent name
  isFinal: boolean;
  timestamp: number;
}

export interface WorkspaceToolResult {
  toolName: string;
  result: string;
  success: boolean;
  timestamp: number;
}

export interface EpisodicMatch {
  sessionId: string;
  summary: string;
  similarity: number;
}

export interface Challenge {
  from: string; // challenging agent
  to: string; // challenged agent
  content: string;
  targetHypothesis?: string;
  timestamp: number;
  responded: boolean;
}

export interface Workspace {
  currentFocus: string;
  hypotheses: Hypothesis[];
  decisions: Decision[];
  toolResults: Map<string, WorkspaceToolResult>;
  episodicMatches: EpisodicMatch[];
  pendingChallenges: Challenge[];
  tokenCount: number;
  iteration: number;
}

// Proposal types
export type ProposalType =
  | 'hypothesis'
  | 'decision'
  | 'focus'
  | 'tool_result'
  | 'challenge'
  | 'response';

export interface Proposal {
  type: ProposalType;
  content: string;
  source: string; // agent name
  confidence?: number; // for hypotheses
  rationale?: string; // for decisions
  isFinal?: boolean; // for decisions
  toolName?: string; // for tool results
  success?: boolean; // for tool results
  targetAgent?: string; // for challenges
  targetHypothesis?: string; // for challenges/responses
}

// Workspace manager
export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();

  /**
   * Get or initialize workspace for session
   */
  async getCurrent(sessionId: string): Promise<Workspace> {
    // Check memory cache first
    if (this.workspaces.has(sessionId)) {
      return this.workspaces.get(sessionId)!;
    }

    // Load from database
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (session) {
      const workspaceData = typeof session.workspace === 'string'
        ? JSON.parse(session.workspace)
        : session.workspace;
      const workspace = this.deserializeWorkspace(workspaceData);
      this.workspaces.set(sessionId, workspace);
      return workspace;
    }

    // Initialize new workspace
    const workspace: Workspace = {
      currentFocus: '',
      hypotheses: [],
      decisions: [],
      toolResults: new Map(),
      episodicMatches: [],
      pendingChallenges: [],
      tokenCount: 0,
      iteration: 0,
    };

    this.workspaces.set(sessionId, workspace);
    return workspace;
  }

  /**
   * Collect proposals from agents in parallel
   */
  async collectProposals(
    workspace: Workspace,
    agents: Array<{ name: string; proposeUpdate: (ws: Workspace) => Promise<Proposal | null> }>
  ): Promise<Proposal[]> {
    const proposals = await Promise.all(
      agents.map(async (agent) => {
        try {
          const proposal = await agent.proposeUpdate(workspace);
          return proposal;
        } catch (error) {
          logger.error({ error, agent: agent.name }, 'Agent proposal failed');
          return null;
        }
      })
    );

    // Filter out null proposals
    return proposals.filter((p): p is Proposal => p !== null);
  }

  /**
   * Score proposals using attention mechanism
   */
  scoreProposals(proposals: Proposal[], workspace: Workspace): ScoredProposal[] {
    return proposals
      .map((proposal) => ({
        ...proposal,
        score: calculateScore(proposal, workspace),
      }))
      .sort((a, b) => b.score - a.score); // Highest score first
  }

  /**
   * Select winning proposal based on scores and capacity
   */
  selectWinner(scoredProposals: ScoredProposal[], workspace: Workspace): ScoredProposal | null {
    // Find first proposal that fits within token capacity
    for (const proposal of scoredProposals) {
      const projectedTokens = this.projectTokenCount(proposal, workspace);

      if (projectedTokens <= config.maxWorkspaceTokens) {
        return proposal;
      }
    }

    return null; // No proposal fits
  }

  /**
   * Apply winning proposal to workspace
   */
  async applyUpdate(
    winner: ScoredProposal,
    workspace: Workspace,
    sessionId: string
  ): Promise<void> {
    const now = Date.now();

    switch (winner.type) {
      case 'focus':
        workspace.currentFocus = winner.content;
        break;

      case 'hypothesis':
        workspace.hypotheses.push({
          content: winner.content,
          confidence: winner.confidence || 0.5,
          source: winner.source,
          timestamp: now,
        });

        // Enforce max hypotheses limit
        if (workspace.hypotheses.length > config.maxHypotheses) {
          workspace.hypotheses = workspace.hypotheses.slice(-config.maxHypotheses);
        }
        break;

      case 'decision':
        workspace.decisions.push({
          content: winner.content,
          rationale: winner.rationale || '',
          source: winner.source,
          isFinal: winner.isFinal || false,
          timestamp: now,
        });

        // Enforce max decisions limit
        if (workspace.decisions.length > config.maxDecisions) {
          workspace.decisions = workspace.decisions.slice(-config.maxDecisions);
        }
        break;

      case 'tool_result':
        if (winner.toolName) {
          workspace.toolResults.set(winner.toolName, {
            toolName: winner.toolName,
            result: winner.content,
            success: winner.success || false,
            timestamp: now,
          });

          // Enforce max tool results limit
          if (workspace.toolResults.size > config.maxToolResults) {
            const oldest = Array.from(workspace.toolResults.keys())[0];
            workspace.toolResults.delete(oldest);
          }
        }
        break;

      case 'challenge':
        workspace.pendingChallenges.push({
          from: winner.source,
          to: winner.targetAgent || '',
          content: winner.content,
          targetHypothesis: winner.targetHypothesis,
          timestamp: now,
          responded: false,
        });
        break;

      case 'response':
        // Mark challenge as responded
        const challenge = workspace.pendingChallenges.find(
          (c) => c.to === winner.source && !c.responded
        );
        if (challenge) {
          challenge.responded = true;
        }

        // Add as hypothesis
        workspace.hypotheses.push({
          content: winner.content,
          confidence: winner.confidence || 0.5,
          source: winner.source,
          timestamp: now,
        });
        break;
    }

    // Update token count
    workspace.tokenCount = calculateTokenCount(workspace);

    // Prune if necessary
    if (workspace.tokenCount > config.maxWorkspaceTokens) {
      pruneWorkspace(workspace);
      workspace.tokenCount = calculateTokenCount(workspace);
    }

    // Increment iteration
    workspace.iteration++;

    // Persist to database
    await this.persist(sessionId, workspace);

    logger.debug(
      {
        type: winner.type,
        source: winner.source,
        score: winner.score,
        tokens: workspace.tokenCount,
        iteration: workspace.iteration,
      },
      'Applied workspace update'
    );
  }

  /**
   * Serialize workspace for agent prompts
   */
  serializeForPrompt(workspace: Workspace): string {
    return serializeForPrompt(workspace);
  }

  /**
   * Persist workspace to database
   */
  private async persist(sessionId: string, workspace: Workspace): Promise<void> {
    const serialized = this.serializeWorkspace(workspace);

    await prisma.session.upsert({
      where: { id: sessionId },
      update: { workspace: JSON.stringify(serialized), updatedAt: new Date() },
      create: {
        id: sessionId,
        workspace: JSON.stringify(serialized),
        config: JSON.stringify({}),
        status: 'active',
      },
    });
  }

  /**
   * Project token count if proposal is applied
   */
  private projectTokenCount(proposal: Proposal, workspace: Workspace): number {
    // Create temporary workspace with proposal applied
    const temp = { ...workspace };
    const now = Date.now();

    switch (proposal.type) {
      case 'hypothesis':
        temp.hypotheses = [
          ...temp.hypotheses,
          {
            content: proposal.content,
            confidence: proposal.confidence || 0.5,
            source: proposal.source,
            timestamp: now,
          },
        ];
        break;

      case 'decision':
        temp.decisions = [
          ...temp.decisions,
          {
            content: proposal.content,
            rationale: proposal.rationale || '',
            source: proposal.source,
            isFinal: proposal.isFinal || false,
            timestamp: now,
          },
        ];
        break;

      // Other types don't significantly affect token count
    }

    return calculateTokenCount(temp);
  }

  /**
   * Serialize workspace for storage
   */
  private serializeWorkspace(workspace: Workspace): any {
    return {
      currentFocus: workspace.currentFocus,
      hypotheses: workspace.hypotheses,
      decisions: workspace.decisions,
      toolResults: Array.from(workspace.toolResults.entries()),
      episodicMatches: workspace.episodicMatches,
      pendingChallenges: workspace.pendingChallenges,
      tokenCount: workspace.tokenCount,
      iteration: workspace.iteration,
    };
  }

  /**
   * Deserialize workspace from storage
   */
  private deserializeWorkspace(data: any): Workspace {
    return {
      currentFocus: data.currentFocus || '',
      hypotheses: data.hypotheses || [],
      decisions: data.decisions || [],
      toolResults: new Map(data.toolResults || []),
      episodicMatches: data.episodicMatches || [],
      pendingChallenges: data.pendingChallenges || [],
      tokenCount: data.tokenCount || 0,
      iteration: data.iteration || 0,
    };
  }
}
