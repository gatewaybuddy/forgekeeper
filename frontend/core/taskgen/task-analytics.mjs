/**
 * Task Analytics Module
 *
 * Provides analytics and insights for TGT (Telemetry-Driven Task Generator).
 * Analyzes historical task data to identify patterns, trends, and recommendations.
 */

import { loadTasks, getTaskStats } from './task-store.mjs';

/**
 * Calculate task generation rate over time
 *
 * @param {Object} options - Analytics options
 * @param {number} options.daysBack - Number of days to analyze (default: 7)
 * @param {string} options.taskStoragePath - Path to task storage
 * @returns {Promise<Object>} Time-series data
 */
export async function getTaskGenerationRate({ daysBack = 7, taskStoragePath } = {}) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startTime = now - (daysBack * oneDayMs);

  // Load all tasks
  const allTasks = await loadTasks({ limit: 10000 }, taskStoragePath);

  // Group tasks by day
  const tasksByDay = {};
  for (let i = 0; i < daysBack; i++) {
    const dayStart = startTime + (i * oneDayMs);
    const dayEnd = dayStart + oneDayMs;
    const dayKey = new Date(dayStart).toISOString().split('T')[0]; // YYYY-MM-DD

    tasksByDay[dayKey] = {
      date: dayKey,
      timestamp: dayStart,
      total: 0,
      byStatus: {
        generated: 0,
        approved: 0,
        dismissed: 0,
        completed: 0,
      },
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      byType: {},
    };

    // Count tasks generated on this day
    for (const task of allTasks) {
      const taskTime = new Date(task.generatedAt).getTime();
      if (taskTime >= dayStart && taskTime < dayEnd) {
        tasksByDay[dayKey].total++;
        tasksByDay[dayKey].byStatus[task.status] = (tasksByDay[dayKey].byStatus[task.status] || 0) + 1;
        tasksByDay[dayKey].bySeverity[task.severity] = (tasksByDay[dayKey].bySeverity[task.severity] || 0) + 1;
        tasksByDay[dayKey].byType[task.type] = (tasksByDay[dayKey].byType[task.type] || 0) + 1;
      }
    }
  }

  return {
    timeRange: {
      start: new Date(startTime).toISOString(),
      end: new Date(now).toISOString(),
      daysBack,
    },
    daily: Object.values(tasksByDay),
  };
}

/**
 * Calculate approval/dismissal rates
 *
 * @param {string} taskStoragePath - Path to task storage
 * @returns {Promise<Object>} Approval/dismissal metrics
 */
export async function getApprovalMetrics({ taskStoragePath } = {}) {
  const allTasks = await loadTasks({ limit: 10000 }, taskStoragePath);

  const total = allTasks.length;
  const approved = allTasks.filter(t => t.status === 'approved').length;
  const dismissed = allTasks.filter(t => t.status === 'dismissed').length;
  const generated = allTasks.filter(t => t.status === 'generated').length;

  // Calculate average time to action (approve/dismiss)
  const timesToAction = [];
  for (const task of allTasks) {
    if (task.approvedAt) {
      const generatedTime = new Date(task.generatedAt).getTime();
      const approvedTime = new Date(task.approvedAt).getTime();
      timesToAction.push(approvedTime - generatedTime);
    } else if (task.dismissedAt) {
      const generatedTime = new Date(task.generatedAt).getTime();
      const dismissedTime = new Date(task.dismissedAt).getTime();
      timesToAction.push(dismissedTime - generatedTime);
    }
  }

  const avgTimeToAction = timesToAction.length > 0
    ? timesToAction.reduce((sum, time) => sum + time, 0) / timesToAction.length
    : 0;

  return {
    total,
    approved,
    dismissed,
    generated,
    approvalRate: total > 0 ? (approved / total) * 100 : 0,
    dismissalRate: total > 0 ? (dismissed / total) * 100 : 0,
    avgTimeToActionMs: avgTimeToAction,
    avgTimeToActionHours: avgTimeToAction / (1000 * 60 * 60),
  };
}

/**
 * Get top task types by frequency
 *
 * @param {Object} options - Options
 * @param {number} options.limit - Max number of types to return (default: 5)
 * @param {string} options.taskStoragePath - Path to task storage
 * @returns {Promise<Array>} Top task types
 */
export async function getTopTaskTypes({ limit = 5, taskStoragePath } = {}) {
  const stats = await getTaskStats(taskStoragePath);

  const types = Object.entries(stats.byType || {})
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return types;
}

/**
 * Get common dismissal reasons
 *
 * @param {Object} options - Options
 * @param {number} options.limit - Max number of reasons to return (default: 5)
 * @param {string} options.taskStoragePath - Path to task storage
 * @returns {Promise<Array>} Common dismissal reasons
 */
export async function getCommonDismissalReasons({ limit = 5, taskStoragePath } = {}) {
  const allTasks = await loadTasks({ status: 'dismissed', limit: 10000 }, taskStoragePath);

  // Group by dismissal reason
  const reasons = {};
  for (const task of allTasks) {
    if (task.dismissalReason) {
      const reason = task.dismissalReason.trim();
      if (reason) {
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
    }
  }

  const topReasons = Object.entries(reasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return topReasons;
}

/**
 * Calculate task priority distribution
 *
 * @param {string} taskStoragePath - Path to task storage
 * @returns {Promise<Object>} Priority distribution
 */
export async function getPriorityDistribution({ taskStoragePath } = {}) {
  const allTasks = await loadTasks({ limit: 10000 }, taskStoragePath);

  const distribution = {
    veryHigh: 0,  // priority >= 80
    high: 0,      // priority 60-79
    medium: 0,    // priority 40-59
    low: 0,       // priority 20-39
    veryLow: 0,   // priority < 20
  };

  for (const task of allTasks) {
    const priority = task.priority || 0;
    if (priority >= 80) distribution.veryHigh++;
    else if (priority >= 60) distribution.high++;
    else if (priority >= 40) distribution.medium++;
    else if (priority >= 20) distribution.low++;
    else distribution.veryLow++;
  }

  return distribution;
}

/**
 * Get comprehensive analytics dashboard data
 *
 * @param {Object} options - Analytics options
 * @param {number} options.daysBack - Number of days to analyze (default: 7)
 * @param {string} options.taskStoragePath - Path to task storage
 * @returns {Promise<Object>} Complete analytics data
 */
export async function getAnalyticsDashboard({ daysBack = 7, taskStoragePath } = {}) {
  const [
    generationRate,
    approvalMetrics,
    topTypes,
    dismissalReasons,
    priorityDistribution,
    currentStats,
  ] = await Promise.all([
    getTaskGenerationRate({ daysBack, taskStoragePath }),
    getApprovalMetrics({ taskStoragePath }),
    getTopTaskTypes({ limit: 5, taskStoragePath }),
    getCommonDismissalReasons({ limit: 5, taskStoragePath }),
    getPriorityDistribution({ taskStoragePath }),
    getTaskStats(taskStoragePath),
  ]);

  // Calculate trends
  const dailyData = generationRate.daily;
  const recentDays = dailyData.slice(-3); // Last 3 days
  const previousDays = dailyData.slice(-6, -3); // 3 days before that

  const recentAvg = recentDays.reduce((sum, day) => sum + day.total, 0) / recentDays.length;
  const previousAvg = previousDays.length > 0
    ? previousDays.reduce((sum, day) => sum + day.total, 0) / previousDays.length
    : recentAvg;

  const trend = previousAvg > 0
    ? ((recentAvg - previousAvg) / previousAvg) * 100
    : 0;

  return {
    overview: {
      totalTasks: currentStats.total,
      generatedTasks: currentStats.byStatus.generated || 0,
      approvedTasks: currentStats.byStatus.approved || 0,
      dismissedTasks: currentStats.byStatus.dismissed || 0,
      approvalRate: approvalMetrics.approvalRate,
      dismissalRate: approvalMetrics.dismissalRate,
      avgTimeToActionHours: approvalMetrics.avgTimeToActionHours,
      trend: {
        value: trend,
        direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
        description: trend > 0
          ? `${trend.toFixed(1)}% increase in task generation`
          : trend < 0
          ? `${Math.abs(trend).toFixed(1)}% decrease in task generation`
          : 'Stable task generation rate',
      },
    },
    timeSeries: generationRate,
    topTypes,
    dismissalReasons,
    priorityDistribution,
    severityDistribution: currentStats.bySeverity,
    recommendations: generateRecommendations({
      approvalMetrics,
      topTypes,
      priorityDistribution,
      trend,
    }),
  };
}

/**
 * Generate recommendations based on analytics
 *
 * @param {Object} data - Analytics data
 * @returns {Array} Recommendations
 */
function generateRecommendations({ approvalMetrics, topTypes, priorityDistribution, trend }) {
  const recommendations = [];

  // Low approval rate
  if (approvalMetrics.approvalRate < 30) {
    recommendations.push({
      type: 'low_approval_rate',
      severity: 'high',
      title: 'Low Approval Rate Detected',
      description: `Only ${approvalMetrics.approvalRate.toFixed(1)}% of tasks are being approved. Consider adjusting analyzer thresholds or reviewing task quality.`,
      action: 'Review analyzer configuration in .env',
    });
  }

  // High dismissal rate
  if (approvalMetrics.dismissalRate > 50) {
    recommendations.push({
      type: 'high_dismissal_rate',
      severity: 'medium',
      title: 'High Dismissal Rate',
      description: `${approvalMetrics.dismissalRate.toFixed(1)}% of tasks are being dismissed. This may indicate false positives or overly sensitive analyzers.`,
      action: 'Review common dismissal reasons and adjust analyzer thresholds',
    });
  }

  // Too many very high priority tasks
  const veryHighRatio = priorityDistribution.veryHigh /
    (priorityDistribution.veryHigh + priorityDistribution.high + priorityDistribution.medium + priorityDistribution.low + priorityDistribution.veryLow);

  if (veryHighRatio > 0.4) {
    recommendations.push({
      type: 'priority_inflation',
      severity: 'low',
      title: 'Priority Inflation',
      description: `${(veryHighRatio * 100).toFixed(1)}% of tasks have very high priority. Consider adjusting priority calculation to better differentiate task importance.`,
      action: 'Review priority calculation in taskcard.mjs',
    });
  }

  // Rapid task generation increase
  if (trend > 50) {
    recommendations.push({
      type: 'rapid_increase',
      severity: 'medium',
      title: 'Rapid Increase in Task Generation',
      description: `Task generation has increased by ${trend.toFixed(1)}% recently. This may indicate emerging system issues.`,
      action: 'Review recent tasks for patterns indicating underlying problems',
    });
  }

  // Rapid task generation decrease
  if (trend < -50) {
    recommendations.push({
      type: 'rapid_decrease',
      severity: 'low',
      title: 'Significant Decrease in Task Generation',
      description: `Task generation has decreased by ${Math.abs(trend).toFixed(1)}% recently. System improvements may be taking effect, or analyzers may need adjustment.`,
      action: 'Verify that analyzers are detecting genuine issues',
    });
  }

  return recommendations;
}
