/**
 * Consciousness metrics tracking
 * Implements GWT-inspired integration score and agent coordination metrics
 */
import { Workspace } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';

export interface ConsciousnessMetrics {
  integrationScore: number; // 0-100
  agentParticipation: {
    forge: number;
    loom: number;
    anvil: number;
    scout: number;
  };
  challengeActivity: {
    issued: number;
    responded: number;
    pending: number;
  };
  workspaceUtilization: {
    tokenUsage: number;
    capacity: number;
    percentUsed: number;
  };
  iterationMetrics: {
    count: number;
    avgDuration: number;
    convergenceRate: number;
  };
  coherenceScore: number; // 0-1, how well agents agree
}

export class ConsciousnessTracker {
  private iterationDurations: number[] = [];
  private startTime: number = 0;
  private iterationStartTime: number = 0;

  /**
   * Start tracking a new session
   */
  startSession(): void {
    this.startTime = Date.now();
    this.iterationDurations = [];
  }

  /**
   * Start tracking an iteration
   */
  startIteration(): void {
    this.iterationStartTime = Date.now();
  }

  /**
   * End iteration and record duration
   */
  endIteration(): void {
    if (this.iterationStartTime > 0) {
      const duration = Date.now() - this.iterationStartTime;
      this.iterationDurations.push(duration);
      this.iterationStartTime = 0;
    }
  }

  /**
   * Calculate comprehensive consciousness metrics
   */
  calculateMetrics(
    workspace: Workspace,
    challengesIssued: number,
    responsesReceived: number,
    maxCapacity: number
  ): ConsciousnessMetrics {
    // Count agent participation
    const participation = this.calculateParticipation(workspace);

    // Integration score (0-100)
    const integrationScore = this.calculateIntegrationScore(
      participation,
      challengesIssued,
      workspace.tokenCount,
      maxCapacity,
      workspace.iteration
    );

    // Challenge activity
    const pendingChallenges = workspace.pendingChallenges.filter((c) => !c.responded).length;

    // Workspace utilization
    const percentUsed = (workspace.tokenCount / maxCapacity) * 100;

    // Iteration metrics
    const avgDuration =
      this.iterationDurations.length > 0
        ? this.iterationDurations.reduce((a, b) => a + b, 0) / this.iterationDurations.length
        : 0;

    const convergenceRate = this.calculateConvergenceRate(workspace);

    // Coherence score
    const coherenceScore = this.calculateCoherence(workspace);

    const metrics: ConsciousnessMetrics = {
      integrationScore,
      agentParticipation: participation,
      challengeActivity: {
        issued: challengesIssued,
        responded: responsesReceived,
        pending: pendingChallenges,
      },
      workspaceUtilization: {
        tokenUsage: workspace.tokenCount,
        capacity: maxCapacity,
        percentUsed: Math.round(percentUsed * 10) / 10,
      },
      iterationMetrics: {
        count: workspace.iteration,
        avgDuration: Math.round(avgDuration),
        convergenceRate,
      },
      coherenceScore: Math.round(coherenceScore * 100) / 100,
    };

    logger.debug({ metrics }, 'Consciousness metrics calculated');

    return metrics;
  }

  /**
   * Calculate agent participation counts
   */
  private calculateParticipation(workspace: Workspace): {
    forge: number;
    loom: number;
    anvil: number;
    scout: number;
  } {
    const counts = {
      forge: 0,
      loom: 0,
      anvil: 0,
      scout: 0,
    };

    // Count hypotheses by agent
    for (const hypothesis of workspace.hypotheses) {
      if (hypothesis.source in counts) {
        counts[hypothesis.source as keyof typeof counts]++;
      }
    }

    // Count decisions by agent
    for (const decision of workspace.decisions) {
      if (decision.source in counts) {
        counts[decision.source as keyof typeof counts]++;
      }
    }

    return counts;
  }

  /**
   * Calculate integration score (0-100)
   * Based on: agent participation, challenge activity, workspace utilization, iteration depth
   */
  private calculateIntegrationScore(
    participation: { forge: number; loom: number; anvil: number; scout: number },
    challengesIssued: number,
    tokenCount: number,
    maxCapacity: number,
    iterations: number
  ): number {
    let score = 0;

    // 1. Agent participation (25 points)
    // All 4 agents contributing = max score
    const activeAgents = Object.values(participation).filter((count) => count > 0).length;
    const participationRate = activeAgents / 4;
    score += participationRate * 25;

    // Bonus for balanced participation
    const totalContributions = Object.values(participation).reduce((a, b) => a + b, 0);
    if (totalContributions > 0) {
      const participationValues = Object.values(participation);
      const maxParticipation = Math.max(...participationValues);
      const minParticipation = Math.min(...participationValues.filter((v) => v > 0));
      const balance = minParticipation / maxParticipation;
      score += balance * 5; // Up to 5 bonus points for balance
    }

    // 2. Challenge activity (25 points)
    // 3+ challenges = max score
    const challengeActivity = Math.min(challengesIssued / 3, 1);
    score += challengeActivity * 25;

    // 3. Workspace utilization (25 points)
    // Optimal range: 50-80% of capacity
    const utilization = tokenCount / maxCapacity;
    if (utilization >= 0.5 && utilization <= 0.8) {
      score += 25; // Optimal range
    } else if (utilization > 0.8) {
      score += 20; // High but not over capacity
    } else {
      score += utilization * 50; // Linear score for lower utilization
    }

    // 4. Iteration depth (25 points)
    // More iterations = deeper exploration
    const iterationScore = Math.min(iterations / 10, 1);
    score += iterationScore * 25;

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate convergence rate (0-1)
   * Higher when decisions are being made vs just hypotheses
   */
  private calculateConvergenceRate(workspace: Workspace): number {
    const totalContributions = workspace.hypotheses.length + workspace.decisions.length;

    if (totalContributions === 0) {
      return 0;
    }

    // Decisions weigh more heavily than hypotheses
    const decisionWeight = workspace.decisions.length * 2;
    const hypothesisWeight = workspace.hypotheses.length;

    const convergence = decisionWeight / (decisionWeight + hypothesisWeight);

    return Math.round(convergence * 100) / 100;
  }

  /**
   * Calculate coherence score (0-1)
   * How well agents agree (low challenge rate = high coherence)
   */
  private calculateCoherence(workspace: Workspace): number {
    const totalContributions = workspace.hypotheses.length + workspace.decisions.length;

    if (totalContributions === 0) {
      return 1; // No contributions = perfect coherence (neutral)
    }

    const challengeCount = workspace.pendingChallenges.length;

    // Coherence decreases with more challenges
    const coherence = 1 - Math.min(challengeCount / totalContributions, 1);

    return coherence;
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get detailed statistics
   */
  getStatistics(): {
    totalDuration: number;
    iterationCount: number;
    avgIterationDuration: number;
    minIterationDuration: number;
    maxIterationDuration: number;
  } {
    return {
      totalDuration: this.getSessionDuration(),
      iterationCount: this.iterationDurations.length,
      avgIterationDuration:
        this.iterationDurations.length > 0
          ? this.iterationDurations.reduce((a, b) => a + b, 0) / this.iterationDurations.length
          : 0,
      minIterationDuration:
        this.iterationDurations.length > 0 ? Math.min(...this.iterationDurations) : 0,
      maxIterationDuration:
        this.iterationDurations.length > 0 ? Math.max(...this.iterationDurations) : 0,
    };
  }
}
