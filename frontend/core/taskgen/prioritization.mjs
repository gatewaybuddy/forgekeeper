/**
 * Smart Prioritization Engine
 *
 * Multi-factor scoring algorithm that calculates intelligent priority scores
 * beyond simple manual priority numbers.
 *
 * Scoring Factors:
 * 1. Base Severity (40pts max) - critical: 40, high: 30, medium: 20, low: 10
 * 2. Confidence Multiplier (0.5x to 1.5x) - scales base score
 * 3. Time Decay Boost (0-20pts) - older tasks get priority
 * 4. Analyzer Reputation (0-15pts) - trusted analyzers boost score
 * 5. Impact Estimation (0-25pts) - from evidence metrics
 *
 * Final Score Range: 0-100 points
 */

import { loadTasks } from './task-store.mjs';

// Configuration
const SEVERITY_WEIGHTS = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

const TIME_DECAY_MAX_DAYS = 30; // Max age for time decay boost
const TIME_DECAY_MAX_POINTS = 20; // Max points from age

const ANALYZER_REPUTATION_MAX_POINTS = 15;
const IMPACT_MAX_POINTS = 25;

/**
 * Calculate base severity score
 *
 * @param {string} severity - Task severity (critical, high, medium, low)
 * @returns {number} Base score (10-40)
 */
function calculateSeverityScore(severity) {
  return SEVERITY_WEIGHTS[severity] || SEVERITY_WEIGHTS.low;
}

/**
 * Calculate confidence multiplier
 *
 * @param {number} confidence - Task confidence (0-1)
 * @returns {number} Multiplier (0.5-1.5)
 */
function calculateConfidenceMultiplier(confidence) {
  // Low confidence (0-0.5): 0.5x-1.0x
  // High confidence (0.5-1.0): 1.0x-1.5x
  return 0.5 + confidence;
}

/**
 * Calculate time decay boost
 *
 * Older tasks get higher priority to prevent them from being forgotten
 *
 * @param {string} generatedAt - ISO timestamp
 * @returns {number} Boost points (0-20)
 */
function calculateTimeDecayBoost(generatedAt) {
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Linear boost: 0 days = 0pts, 30+ days = 20pts
  const boost = Math.min(ageDays / TIME_DECAY_MAX_DAYS, 1.0) * TIME_DECAY_MAX_POINTS;
  return Math.round(boost);
}

/**
 * Calculate analyzer reputation score based on historical approval rate
 *
 * @param {string} analyzer - Analyzer name
 * @param {Array} allTasks - All tasks for historical analysis
 * @returns {number} Reputation points (0-15)
 */
function calculateAnalyzerReputation(analyzer, allTasks) {
  const analyzerTasks = allTasks.filter(t => t.analyzer === analyzer);

  if (analyzerTasks.length === 0) {
    return 7.5; // Neutral score for new analyzers
  }

  // Calculate approval rate
  const approvedOrCompleted = analyzerTasks.filter(
    t => t.status === 'approved' || t.status === 'completed'
  );
  const approvalRate = approvedOrCompleted.length / analyzerTasks.length;

  // 0% approval = 0pts, 100% approval = 15pts
  return Math.round(approvalRate * ANALYZER_REPUTATION_MAX_POINTS);
}

/**
 * Build analyzer reputation map (optimization for batch calculations)
 *
 * Pre-calculates reputation for all analyzers to avoid O(n²) complexity
 *
 * @param {Array} allTasks - All tasks
 * @returns {Map} Analyzer name → reputation score
 */
function buildAnalyzerReputationMap(allTasks) {
  const reputationMap = new Map();
  const analyzerStats = new Map();

  // Single pass: Group tasks by analyzer
  for (const task of allTasks) {
    if (!task.analyzer) continue;

    if (!analyzerStats.has(task.analyzer)) {
      analyzerStats.set(task.analyzer, { total: 0, approved: 0 });
    }

    const stats = analyzerStats.get(task.analyzer);
    stats.total++;
    if (task.status === 'approved' || task.status === 'completed') {
      stats.approved++;
    }
  }

  // Calculate reputation for each analyzer
  for (const [analyzer, stats] of analyzerStats.entries()) {
    if (stats.total === 0) {
      reputationMap.set(analyzer, 7.5);
    } else {
      const approvalRate = stats.approved / stats.total;
      reputationMap.set(analyzer, Math.round(approvalRate * ANALYZER_REPUTATION_MAX_POINTS));
    }
  }

  return reputationMap;
}

/**
 * Calculate impact estimation from evidence metrics
 *
 * @param {Object} evidence - Task evidence object
 * @returns {number} Impact points (0-25)
 */
function calculateImpactScore(evidence) {
  if (!evidence || !evidence.metrics) {
    return 0; // No metrics = no impact boost
  }

  const metrics = evidence.metrics;
  let impactScore = 0;

  // Error rate impact (0-10pts)
  if (metrics.errorRate !== undefined) {
    // High error rate = high impact
    impactScore += Math.min(metrics.errorRate * 10, 10);
  }

  // User impact (0-8pts)
  if (metrics.affectedUsers !== undefined) {
    // 0 users = 0pts, 100+ users = 8pts
    impactScore += Math.min(metrics.affectedUsers / 100 * 8, 8);
  }

  // Performance impact (0-7pts)
  if (metrics.performanceDelta !== undefined) {
    // Slowdown factor: 2x = 3.5pts, 4x+ = 7pts
    const slowdownFactor = Math.max(1, metrics.performanceDelta);
    impactScore += Math.min((slowdownFactor - 1) / 3 * 7, 7);
  }

  return Math.round(Math.min(impactScore, IMPACT_MAX_POINTS));
}

/**
 * Calculate comprehensive priority score for a task
 *
 * @param {Object} task - Task object
 * @param {Array} allTasks - All tasks for context
 * @returns {number} Priority score (0-100)
 */
export function calculatePriorityScore(task, allTasks = []) {
  // 1. Base severity score
  const severityScore = calculateSeverityScore(task.severity);

  // 2. Confidence multiplier
  const confidenceMultiplier = calculateConfidenceMultiplier(task.confidence);

  // 3. Time decay boost
  const timeBoost = calculateTimeDecayBoost(task.generatedAt);

  // 4. Analyzer reputation
  const analyzerScore = calculateAnalyzerReputation(task.analyzer, allTasks);

  // 5. Impact estimation
  const impactScore = calculateImpactScore(task.evidence);

  // Calculate final score
  const baseScore = severityScore * confidenceMultiplier;
  const finalScore = Math.min(baseScore + timeBoost + analyzerScore + impactScore, 100);

  return Math.round(finalScore);
}

/**
 * Calculate priority scores for all tasks (OPTIMIZED)
 *
 * Uses pre-calculated analyzer reputation map to avoid O(n²) complexity
 *
 * @param {Array} tasks - Array of tasks
 * @returns {Array} Tasks with calculated priorityScore field
 */
export function calculateAllPriorityScores(tasks) {
  // Pre-calculate analyzer reputation once for all tasks (O(n) instead of O(n²))
  const reputationMap = buildAnalyzerReputationMap(tasks);

  return tasks.map(task => {
    // Get pre-calculated reputation or default
    const analyzerReputation = reputationMap.get(task.analyzer) || 7.5;

    // Calculate other components
    const severityScore = calculateSeverityScore(task.severity);
    const confidenceMultiplier = calculateConfidenceMultiplier(task.confidence);
    const timeBoost = calculateTimeDecayBoost(task.generatedAt);
    const impactScore = calculateImpactScore(task.evidence);

    // Calculate final score
    const baseScore = severityScore * confidenceMultiplier;
    const finalScore = Math.min(baseScore + timeBoost + analyzerReputation + impactScore, 100);

    return {
      ...task,
      priorityScore: Math.round(finalScore),
      priorityBreakdown: {
        severity: severityScore,
        confidenceMultiplier,
        timeBoost,
        analyzerReputation,
        impact: impactScore,
      },
    };
  });
}

/**
 * Reprioritize all tasks in the system
 *
 * Recalculates priority scores and updates tasks
 *
 * @returns {Promise<Object>} Summary of reprioritization
 */
export async function reprioritizeAllTasks() {
  const tasks = await loadTasks();

  // Only reprioritize active tasks (generated, approved)
  const activeTasks = tasks.filter(t =>
    t.status === 'generated' || t.status === 'approved'
  );

  // Calculate new scores
  const reprioritized = calculateAllPriorityScores(activeTasks);

  // Find tasks with significant priority changes
  const changes = reprioritized
    .map(task => {
      const oldScore = task.priorityScore || 0;
      const newScore = calculatePriorityScore(task, tasks);
      return {
        taskId: task.id,
        title: task.title,
        oldScore,
        newScore,
        delta: newScore - oldScore,
      };
    })
    .filter(change => Math.abs(change.delta) >= 5) // Only significant changes
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    totalTasks: activeTasks.length,
    recalculated: reprioritized.length,
    significantChanges: changes.length,
    changes: changes.slice(0, 10), // Top 10 changes
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get priority category from score
 *
 * @param {number} score - Priority score (0-100)
 * @returns {Object} Category info
 */
export function getPriorityCategory(score) {
  if (score >= 80) {
    return {
      level: 'urgent',
      label: 'Urgent',
      color: '#dc2626',
      bgColor: '#fee2e2',
      description: 'Requires immediate attention',
    };
  } else if (score >= 60) {
    return {
      level: 'high',
      label: 'High',
      color: '#ea580c',
      bgColor: '#fed7aa',
      description: 'Should be addressed soon',
    };
  } else if (score >= 40) {
    return {
      level: 'medium',
      label: 'Medium',
      color: '#ca8a04',
      bgColor: '#fef3c7',
      description: 'Normal priority',
    };
  } else if (score >= 20) {
    return {
      level: 'low',
      label: 'Low',
      color: '#2563eb',
      bgColor: '#dbeafe',
      description: 'Can be deferred',
    };
  } else {
    return {
      level: 'minimal',
      label: 'Minimal',
      color: '#64748b',
      bgColor: '#f1f5f9',
      description: 'Low impact or uncertain',
    };
  }
}

/**
 * Sort tasks by calculated priority score
 *
 * @param {Array} tasks - Array of tasks
 * @param {string} order - 'desc' (highest first) or 'asc' (lowest first)
 * @returns {Array} Sorted tasks
 */
export function sortByPriorityScore(tasks, order = 'desc') {
  const tasksWithScores = calculateAllPriorityScores(tasks);

  return tasksWithScores.sort((a, b) => {
    if (order === 'desc') {
      return b.priorityScore - a.priorityScore;
    } else {
      return a.priorityScore - b.priorityScore;
    }
  });
}

/**
 * Get priority distribution statistics
 *
 * @param {Array} tasks - Array of tasks
 * @returns {Object} Distribution stats
 */
export function getPriorityDistribution(tasks) {
  const tasksWithScores = calculateAllPriorityScores(tasks);

  const distribution = {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
    minimal: 0,
  };

  tasksWithScores.forEach(task => {
    const category = getPriorityCategory(task.priorityScore);
    distribution[category.level]++;
  });

  return {
    total: tasksWithScores.length,
    distribution,
    averageScore: tasksWithScores.length > 0
      ? Math.round(
          tasksWithScores.reduce((sum, t) => sum + t.priorityScore, 0) /
          tasksWithScores.length
        )
      : 0,
  };
}

export default {
  calculatePriorityScore,
  calculateAllPriorityScores,
  reprioritizeAllTasks,
  getPriorityCategory,
  sortByPriorityScore,
  getPriorityDistribution,
};
