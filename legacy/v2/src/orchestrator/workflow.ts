/**
 * Orchestrator - Main workflow loop
 * Implements PROPOSE→CHALLENGE→REVIEW→SYNTH cycle
 */
import { WorkspaceManager, Workspace } from '../workspace/manager.js';
import { AgentRegistry, getAllAgents } from '../agents/registry.js';
import { ConsciousnessTracker } from '../metrics/consciousness.js';
import { ScoutEffectivenessTracker } from '../metrics/scout-effectiveness.js';
import { getDashboard } from '../metrics/dashboard.js';
import { publishWorkspaceUpdate } from '../gateway/resolvers/subscription.js';
import { getEpisodicMemory } from '../memory/episodic.js';
import { getContextLog } from '../memory/context-log.js';
import { extractKeywords } from '../memory/embeddings.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';
import { config } from '../utils/config.js';

export interface OrchestrateOptions {
  sessionId?: string;
  userMessage: string;
  maxIterations?: number;
}

export interface OrchestrateResult {
  sessionId: string;
  iterations: number;
  finalDecision: string | null;
  workspace: Workspace;
  metrics: {
    integrationScore: number;
    challengesIssued: number;
    attemptsMatched: number;
  };
}

export class Orchestrator {
  private workspaceManager: WorkspaceManager;
  private consciousnessTracker: ConsciousnessTracker;
  private scoutTracker: ScoutEffectivenessTracker;
  private dashboard = getDashboard();
  private episodicMemory = getEpisodicMemory();
  private contextLog = getContextLog();

  constructor(private agents: AgentRegistry) {
    this.workspaceManager = new WorkspaceManager();
    this.consciousnessTracker = new ConsciousnessTracker();
    this.scoutTracker = new ScoutEffectivenessTracker();
  }

  /**
   * Main orchestration loop
   */
  async orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
    const startTime = Date.now();
    const sessionId = options.sessionId || this.generateSessionId();
    const maxIterations = options.maxIterations || config.maxIterations;

    logger.info(
      { sessionId, userMessage: options.userMessage.slice(0, 100), maxIterations },
      'Starting orchestration'
    );

    // Start tracking
    this.consciousnessTracker.startSession();
    this.scoutTracker.reset();

    // Initialize workspace (this will create the session if it doesn't exist)
    const workspace = await this.workspaceManager.getCurrent(sessionId);
    workspace.currentFocus = options.userMessage;

    // Search for similar past sessions
    const keywords = extractKeywords(options.userMessage, 5);
    const similarSessions = await this.episodicMemory.search({
      text: options.userMessage,
      limit: 3,
      minScore: 60, // Only include successful sessions
    });

    workspace.episodicMatches = similarSessions.map((match) => ({
      sessionId: match.entry.sessionId,
      summary: match.entry.summary,
      similarity: match.similarity,
    }));

    logger.debug(
      {
        sessionId,
        keywords,
        similarCount: similarSessions.length,
        matches: similarSessions.map((m) => ({
          id: m.entry.sessionId,
          similarity: m.similarity.toFixed(2),
        })),
      },
      'Retrieved similar sessions'
    );

    // Ensure session exists before saving message
    await prisma.session.upsert({
      where: { id: sessionId },
      update: {},
      create: {
        id: sessionId,
        workspace: JSON.stringify({
          currentFocus: options.userMessage,
          hypotheses: [],
          decisions: [],
          toolResults: [],
          episodicMatches: [],
          pendingChallenges: [],
          tokenCount: 0,
          iteration: 0,
        }),
        config: JSON.stringify({}),
        status: 'active',
      },
    });

    // Save user message
    await this.saveMessage(sessionId, 'user', options.userMessage);

    // Metrics tracking
    let challengesIssued = 0;
    let attemptsMatched = 0;

    // Main loop
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.consciousnessTracker.startIteration();
      logger.debug({ iteration, sessionId }, 'Starting iteration');

      // 1. Collect proposals from all agents in parallel
      const agentArray = getAllAgents(this.agents);
      const proposals = await this.workspaceManager.collectProposals(workspace, agentArray);

      if (proposals.length === 0) {
        logger.info({ iteration }, 'No proposals collected, ending orchestration');
        break;
      }

      // 2. Score proposals
      const scoredProposals = this.workspaceManager.scoreProposals(proposals, workspace);

      logger.debug(
        {
          iteration,
          proposalCount: scoredProposals.length,
          topScores: scoredProposals.slice(0, 3).map((p) => ({
            agent: p.source,
            type: p.type,
            score: p.score.toFixed(2),
          })),
        },
        'Proposals scored'
      );

      // 3. Select winner
      const winner = this.workspaceManager.selectWinner(scoredProposals, workspace);

      if (!winner) {
        logger.warn({ iteration }, 'No winning proposal fits capacity, ending orchestration');
        break;
      }

      // Track Scout challenges
      if (winner.type === 'challenge' && winner.source === 'scout') {
        challengesIssued++;
      }

      // Track attempts (responses to challenges)
      if (winner.type === 'response') {
        attemptsMatched++;
      }

      // 4. Apply update
      await this.workspaceManager.applyUpdate(winner, workspace, sessionId);

      // Publish workspace update for real-time subscriptions
      publishWorkspaceUpdate(sessionId, workspace);

      // 5. Log event (both Prisma and ContextLog)
      await this.logEvent(sessionId, 'workspace_update', {
        winner: {
          source: winner.source,
          type: winner.type,
          content: winner.content.slice(0, 200),
          score: winner.score,
        },
        allProposals: scoredProposals.map((p) => ({
          source: p.source,
          type: p.type,
          score: p.score,
        })),
      }, winner.source, iteration);

      // Log to context log for telemetry
      await this.contextLog.append({
        sessionId,
        actor: winner.source,
        action: 'workspace_update',
        data: {
          type: winner.type,
          score: winner.score,
          proposalCount: scoredProposals.length,
        },
        iteration,
      });

      // 6. Check for final decision
      if (winner.type === 'decision' && winner.isFinal) {
        logger.info({ iteration, decision: winner.content }, 'Final decision reached');
        break;
      }

      // 7. Log iteration metrics
      await this.logIterationMetrics(sessionId, iteration, workspace);

      // End iteration tracking
      this.consciousnessTracker.endIteration();

      // Calculate and publish current metrics
      const currentMetrics = this.consciousnessTracker.calculateMetrics(
        workspace,
        challengesIssued,
        attemptsMatched,
        config.maxWorkspaceTokens
      );

      const scoutMetrics = this.scoutTracker.calculateMetrics(workspace);

      this.dashboard.updateMetrics(sessionId, {
        consciousness: currentMetrics,
        scout: scoutMetrics,
        timestamp: Date.now(),
        sessionId,
      });
    }

    const duration = Date.now() - startTime;

    // Calculate final integration score
    const integrationScore = this.calculateIntegrationScore(workspace, challengesIssued);

    // Save final metrics
    await this.saveMetricsSnapshot(sessionId, workspace, challengesIssued, attemptsMatched);

    // Update session status
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'completed' },
    });

    // Record episodic memory entry
    await this.recordEpisodicEntry(sessionId, workspace, options.userMessage, integrationScore, challengesIssued);

    logger.info(
      {
        sessionId,
        iterations: workspace.iteration,
        duration,
        integrationScore,
        challengesIssued,
      },
      'Orchestration complete'
    );

    // Extract final decision if any
    const finalDecision = workspace.decisions.find((d) => d.isFinal);

    return {
      sessionId,
      iterations: workspace.iteration,
      finalDecision: finalDecision?.content || null,
      workspace,
      metrics: {
        integrationScore,
        challengesIssued,
        attemptsMatched,
      },
    };
  }

  /**
   * Calculate integration score (0-100)
   */
  private calculateIntegrationScore(workspace: Workspace, challengesIssued: number): number {
    let score = 0;

    // Agent participation (25 points)
    const agentSources = new Set(
      [...workspace.hypotheses, ...workspace.decisions].map((item) => item.source)
    );
    const participationRate = agentSources.size / 4; // 4 agents
    score += participationRate * 25;

    // Challenge activity (25 points)
    const challengeActivity = Math.min(challengesIssued / 3, 1); // 3+ challenges = max
    score += challengeActivity * 25;

    // Workspace utilization (25 points)
    const utilization = workspace.tokenCount / config.maxWorkspaceTokens;
    score += Math.min(utilization, 1) * 25;

    // Iteration depth (25 points)
    const iterationDepth = Math.min(workspace.iteration / config.maxIterations, 1);
    score += iterationDepth * 25;

    return Math.round(score);
  }

  /**
   * Save message to database
   */
  private async saveMessage(
    sessionId: string,
    role: string,
    content: string
  ): Promise<void> {
    await prisma.message.create({
      data: {
        sessionId,
        role,
        content,
        source: role === 'user' ? 'user' : null,
      },
    });
  }

  /**
   * Log event to database
   */
  private async logEvent(
    sessionId: string,
    type: string,
    data: any,
    actor: string | null,
    iteration: number
  ): Promise<void> {
    await prisma.event.create({
      data: {
        sessionId,
        type,
        data: JSON.stringify(data),
        actor,
        iteration,
      },
    });
  }

  /**
   * Log iteration metrics
   */
  private async logIterationMetrics(
    sessionId: string,
    iteration: number,
    workspace: Workspace
  ): Promise<void> {
    await this.logEvent(
      sessionId,
      'iteration_metrics',
      {
        hypotheses: workspace.hypotheses.length,
        decisions: workspace.decisions.length,
        toolResults: workspace.toolResults.size,
        tokenCount: workspace.tokenCount,
      },
      'system',
      iteration
    );
  }

  /**
   * Save metrics snapshot
   */
  private async saveMetricsSnapshot(
    sessionId: string,
    workspace: Workspace,
    challengesIssued: number,
    attemptsMatched: number
  ): Promise<void> {
    // Count agent participation
    const agentCounts: Record<string, number> = {
      forge: 0,
      loom: 0,
      anvil: 0,
      scout: 0,
    };

    for (const hypothesis of workspace.hypotheses) {
      if (hypothesis.source in agentCounts) {
        agentCounts[hypothesis.source]++;
      }
    }

    for (const decision of workspace.decisions) {
      if (decision.source in agentCounts) {
        agentCounts[decision.source]++;
      }
    }

    const integrationScore = this.calculateIntegrationScore(workspace, challengesIssued);

    await prisma.metricSnapshot.create({
      data: {
        sessionId,
        integrationScore,
        agentParticipation: JSON.stringify(agentCounts),
        challengesIssued,
        responsesReceived: attemptsMatched,
        limitationsOverturned: 0, // TODO: Track this
        tokenUsage: workspace.tokenCount,
        hypothesesCount: workspace.hypotheses.length,
        decisionsCount: workspace.decisions.length,
        iterationCount: workspace.iteration,
        avgIterationDuration: 0, // TODO: Track this
        scoutChallenges: challengesIssued,
        attemptsCatalyzed: attemptsMatched,
        successfulAttempts: 0, // TODO: Track this
      },
    });
  }

  /**
   * Record episodic memory entry
   */
  private async recordEpisodicEntry(
    sessionId: string,
    workspace: Workspace,
    userMessage: string,
    integrationScore: number,
    challengesIssued: number
  ): Promise<void> {
    try {
      // Determine outcome based on final decision
      const finalDecision = workspace.decisions.find((d) => d.isFinal);
      let outcome: 'success' | 'failure' | 'partial' = 'partial';

      if (finalDecision) {
        // Check if final decision indicates success or failure
        const successKeywords = ['completed', 'success', 'done', 'achieved', 'resolved'];
        const failureKeywords = ['failed', 'error', 'impossible', 'cannot', 'unable'];

        const content = finalDecision.content.toLowerCase();
        const hasSuccess = successKeywords.some((k) => content.includes(k));
        const hasFailure = failureKeywords.some((k) => content.includes(k));

        if (hasSuccess && !hasFailure) {
          outcome = 'success';
        } else if (hasFailure) {
          outcome = 'failure';
        }
      }

      // Generate summary
      const summary = finalDecision?.content.slice(0, 200) || userMessage.slice(0, 200);

      // Determine task type
      const taskType = this.detectTaskType(userMessage);

      // Collect files changed (from tool results)
      const filesChanged: string[] = [];
      for (const [toolName, result] of workspace.toolResults.entries()) {
        if (toolName.includes('write_file') || toolName.includes('edit_file')) {
          const data = typeof result === 'object' ? result : {};
          if ('file' in data || 'path' in data) {
            filesChanged.push((data as any).file || (data as any).path);
          }
        }
      }

      // Collect tools used
      const toolsUsed = Array.from(workspace.toolResults.keys());

      // Count agent participation
      const agentParticipation = {
        forge: 0,
        loom: 0,
        anvil: 0,
        scout: 0,
      };

      for (const hypothesis of workspace.hypotheses) {
        if (hypothesis.source in agentParticipation) {
          (agentParticipation as any)[hypothesis.source]++;
        }
      }

      for (const decision of workspace.decisions) {
        if (decision.source in agentParticipation) {
          (agentParticipation as any)[decision.source]++;
        }
      }

      // Save to episodic memory
      await this.episodicMemory.addEntry({
        sessionId,
        timestamp: Date.now(),
        summary,
        taskType,
        outcome,
        integrationScore,
        challengesIssued,
        iterations: workspace.iteration,
        filesChanged: filesChanged.length > 0 ? filesChanged : undefined,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        agentParticipation,
      });

      logger.info(
        { sessionId, outcome, taskType, integrationScore },
        'Recorded episodic memory entry'
      );
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to record episodic memory entry');
      // Don't throw - memory recording is non-critical
    }
  }

  /**
   * Detect task type from user message
   */
  private detectTaskType(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) {
      return 'bug_fix';
    }

    if (lower.includes('add') || lower.includes('implement') || lower.includes('create')) {
      return 'feature';
    }

    if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
      return 'refactor';
    }

    if (lower.includes('test')) {
      return 'testing';
    }

    if (lower.includes('document') || lower.includes('explain')) {
      return 'documentation';
    }

    return 'general';
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
