/**
 * Scout effectiveness tracking
 * Measures impact of Scout agent on preventing learned helplessness
 */
import { logger } from '../utils/logger.js';
import { Workspace, Challenge } from '../workspace/manager.js';

export interface ScoutMetrics {
  challengesIssued: number;
  challengesResponded: number;
  attemptsCatalyzed: number; // Responses that included empirical attempts
  limitationsOverturned: number; // Successful attempts after challenges
  averageResponseTime: number; // ms between challenge and response
  successRate: number; // Percent of challenges that led to successful attempts
  topChallengedAgents: Array<{ agent: string; count: number }>;
}

export class ScoutEffectivenessTracker {
  private challengeTimestamps: Map<string, number> = new Map();
  private responseTimes: number[] = [];
  private successfulAttempts: number = 0;
  private attemptsCatalyzed: number = 0;

  /**
   * Record a new challenge issued by Scout
   */
  recordChallenge(challenge: Challenge): void {
    const challengeId = `${challenge.from}-${challenge.to}-${challenge.timestamp}`;
    this.challengeTimestamps.set(challengeId, challenge.timestamp);

    logger.debug(
      {
        from: challenge.from,
        to: challenge.to,
        target: challenge.targetHypothesis?.slice(0, 50),
      },
      'Scout challenge recorded'
    );
  }

  /**
   * Record a response to a Scout challenge
   */
  recordResponse(challenge: Challenge, responseContent: string, wasSuccessful: boolean): void {
    const challengeId = `${challenge.from}-${challenge.to}-${challenge.timestamp}`;
    const challengeTime = this.challengeTimestamps.get(challengeId);

    if (challengeTime) {
      const responseTime = Date.now() - challengeTime;
      this.responseTimes.push(responseTime);
    }

    // Check if response includes empirical attempt
    if (this.isEmpiricalAttempt(responseContent)) {
      this.attemptsCatalyzed++;

      if (wasSuccessful) {
        this.successfulAttempts++;
      }
    }

    logger.debug(
      {
        challenge: challenge.content.slice(0, 50),
        empirical: this.isEmpiricalAttempt(responseContent),
        successful: wasSuccessful,
      },
      'Scout challenge response recorded'
    );
  }

  /**
   * Calculate comprehensive Scout effectiveness metrics
   */
  calculateMetrics(workspace: Workspace): ScoutMetrics {
    const allChallenges = workspace.pendingChallenges.filter((c) => c.from === 'scout');
    const respondedChallenges = allChallenges.filter((c) => c.responded);

    // Count challenges by target agent
    const challengesByAgent = new Map<string, number>();
    for (const challenge of allChallenges) {
      const count = challengesByAgent.get(challenge.to) || 0;
      challengesByAgent.set(challenge.to, count + 1);
    }

    const topChallenged = Array.from(challengesByAgent.entries())
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);

    const averageResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

    const successRate =
      this.attemptsCatalyzed > 0 ? (this.successfulAttempts / this.attemptsCatalyzed) * 100 : 0;

    return {
      challengesIssued: allChallenges.length,
      challengesResponded: respondedChallenges.length,
      attemptsCatalyzed: this.attemptsCatalyzed,
      limitationsOverturned: this.successfulAttempts,
      averageResponseTime: Math.round(averageResponseTime),
      successRate: Math.round(successRate * 10) / 10,
      topChallengedAgents: topChallenged,
    };
  }

  /**
   * Check if content represents an empirical attempt
   */
  private isEmpiricalAttempt(content: string): boolean {
    const lowerContent = content.toLowerCase();

    // Look for execution indicators
    const executionPatterns = [
      /executed/,
      /ran/,
      /tested/,
      /attempted/,
      /tried/,
      /output:/,
      /result:/,
      /error:/,
      /exception:/,
      /success/,
      /failed with/,
    ];

    return executionPatterns.some((pattern) => pattern.test(lowerContent));
  }

  /**
   * Get baseline comparison data
   * (For comparison with systems without Scout)
   */
  getBaselineComparison(): {
    withScout: {
      attemptRate: number;
      successRate: number;
    };
    improvement: string;
  } {
    // This would ideally compare with historical data
    // For now, we report current metrics
    return {
      withScout: {
        attemptRate: this.attemptsCatalyzed,
        successRate:
          this.attemptsCatalyzed > 0
            ? (this.successfulAttempts / this.attemptsCatalyzed) * 100
            : 0,
      },
      improvement: 'Scout active - tracking empirical attempts',
    };
  }

  /**
   * Reset tracker for new session
   */
  reset(): void {
    this.challengeTimestamps.clear();
    this.responseTimes = [];
    this.successfulAttempts = 0;
    this.attemptsCatalyzed = 0;
  }
}
