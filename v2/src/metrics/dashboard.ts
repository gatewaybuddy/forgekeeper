/**
 * Dashboard metrics aggregator
 * Provides real-time metrics for GraphQL subscriptions and queries
 */
import { EventEmitter } from 'events';
import { ConsciousnessMetrics } from './consciousness.js';
import { ScoutMetrics } from './scout-effectiveness.js';
import { logger } from '../utils/logger.js';

export interface DashboardMetrics {
  consciousness: ConsciousnessMetrics;
  scout: ScoutMetrics;
  timestamp: number;
  sessionId: string;
}

export interface SystemMetrics {
  activeSessions: number;
  totalSessions: number;
  averageIntegrationScore: number;
  totalChallenges: number;
  uptime: number;
}

export class DashboardAggregator extends EventEmitter {
  private currentMetrics: Map<string, DashboardMetrics> = new Map();
  private startTime: number = Date.now();

  constructor() {
    super();
  }

  /**
   * Update metrics for a session
   */
  updateMetrics(sessionId: string, metrics: DashboardMetrics): void {
    this.currentMetrics.set(sessionId, metrics);

    // Emit event for real-time subscriptions
    this.emit('metrics-updated', {
      sessionId,
      metrics,
    });

    logger.debug(
      {
        sessionId,
        integrationScore: metrics.consciousness.integrationScore,
        challenges: metrics.scout.challengesIssued,
      },
      'Dashboard metrics updated'
    );
  }

  /**
   * Get current metrics for a session
   */
  getSessionMetrics(sessionId: string): DashboardMetrics | null {
    return this.currentMetrics.get(sessionId) || null;
  }

  /**
   * Get all active session metrics
   */
  getAllSessionMetrics(): Map<string, DashboardMetrics> {
    return new Map(this.currentMetrics);
  }

  /**
   * Get aggregated system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const sessions = Array.from(this.currentMetrics.values());

    const activeSessions = sessions.filter((m) => {
      const age = Date.now() - m.timestamp;
      return age < 5 * 60 * 1000; // Active in last 5 minutes
    }).length;

    const averageIntegrationScore =
      sessions.length > 0
        ? sessions.reduce((sum, m) => sum + m.consciousness.integrationScore, 0) / sessions.length
        : 0;

    const totalChallenges = sessions.reduce((sum, m) => sum + m.scout.challengesIssued, 0);

    return {
      activeSessions,
      totalSessions: this.currentMetrics.size,
      averageIntegrationScore: Math.round(averageIntegrationScore),
      totalChallenges,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Clear metrics for a session
   */
  clearSession(sessionId: string): void {
    this.currentMetrics.delete(sessionId);

    this.emit('session-cleared', { sessionId });

    logger.debug({ sessionId }, 'Session metrics cleared');
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.currentMetrics.clear();
    this.emit('all-cleared');
    logger.info('All dashboard metrics cleared');
  }

  /**
   * Get metrics for top performing sessions
   */
  getTopSessions(limit: number = 5): Array<{ sessionId: string; metrics: DashboardMetrics }> {
    const sessions = Array.from(this.currentMetrics.entries());

    return sessions
      .sort((a, b) => b[1].consciousness.integrationScore - a[1].consciousness.integrationScore)
      .slice(0, limit)
      .map(([sessionId, metrics]) => ({ sessionId, metrics }));
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeSessions: number;
    averageScore: number;
  } {
    const system = this.getSystemMetrics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (system.averageIntegrationScore < 40) {
      status = 'unhealthy';
    } else if (system.averageIntegrationScore < 60) {
      status = 'degraded';
    }

    return {
      status,
      activeSessions: system.activeSessions,
      averageScore: system.averageIntegrationScore,
    };
  }
}

// Singleton instance
let dashboardInstance: DashboardAggregator | null = null;

export function getDashboard(): DashboardAggregator {
  if (!dashboardInstance) {
    dashboardInstance = new DashboardAggregator();
  }
  return dashboardInstance;
}
