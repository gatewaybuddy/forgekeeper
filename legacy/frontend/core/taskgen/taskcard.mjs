/**
 * Task Card Schema & Validation
 *
 * Defines the structure for TGT-generated task cards and provides
 * validation utilities.
 */

import { ulid } from 'ulid';

/**
 * Task types
 */
export const TaskType = {
  CONTINUATION_ISSUE: 'continuation_issue',
  ERROR_SPIKE: 'error_spike',
  DOCUMENTATION_GAP: 'documentation_gap',
  PERFORMANCE_DEGRADATION: 'performance_degradation',
  UX_ISSUE: 'ux_issue',
};

/**
 * Task severity levels
 */
export const Severity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * Task status
 */
export const TaskStatus = {
  GENERATED: 'generated',
  APPROVED: 'approved',
  DISMISSED: 'dismissed',
  COMPLETED: 'completed',
};

/**
 * Create a new task card
 *
 * @param {Object} params - Task card parameters
 * @returns {Object} Validated task card
 */
export function createTaskCard({
  type,
  severity,
  title,
  description,
  evidence,
  suggestedFix,
  acceptanceCriteria,
  priority = 50,
  confidence = 0.7,
  metadata = {},
}) {
  // Validate required fields
  if (!Object.values(TaskType).includes(type)) {
    throw new Error(`Invalid task type: ${type}`);
  }
  if (!Object.values(Severity).includes(severity)) {
    throw new Error(`Invalid severity: ${severity}`);
  }
  if (!title || title.length === 0) {
    throw new Error('Title is required');
  }
  if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
    throw new Error('At least one acceptance criterion is required');
  }

  const now = new Date().toISOString();

  return {
    id: ulid(),
    type,
    severity,
    status: TaskStatus.GENERATED,
    title,
    description: description || title,
    evidence: {
      metric: evidence?.metric || type,
      current: evidence?.current || 'N/A',
      baseline: evidence?.baseline,
      threshold: evidence?.threshold || 'N/A',
      timeWindow: evidence?.timeWindow || '60 minutes',
      samples: evidence?.samples || [],
      ...evidence,
    },
    suggestedFix: {
      approach: suggestedFix?.approach || 'investigate',
      files: suggestedFix?.files || [],
      changes: suggestedFix?.changes || [],
      estimatedEffort: suggestedFix?.estimatedEffort || 'unknown',
      ...suggestedFix,
    },
    acceptanceCriteria,
    priority,
    confidence,
    generatedAt: now,
    generatedBy: 'TGT_v1.0',
    metadata: {
      relatedEvents: [],
      relatedCommits: [],
      relatedTasks: [],
      ...metadata,
    },
  };
}

/**
 * Validate a task card
 *
 * @param {Object} taskCard - Task card to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateTaskCard(taskCard) {
  const errors = [];

  // Required fields
  if (!taskCard.id) errors.push('Missing id');
  if (!taskCard.type || !Object.values(TaskType).includes(taskCard.type)) {
    errors.push('Invalid or missing type');
  }
  if (!taskCard.severity || !Object.values(Severity).includes(taskCard.severity)) {
    errors.push('Invalid or missing severity');
  }
  if (!taskCard.title) errors.push('Missing title');
  if (!Array.isArray(taskCard.acceptanceCriteria) || taskCard.acceptanceCriteria.length === 0) {
    errors.push('Missing or empty acceptanceCriteria');
  }

  // Priority bounds
  if (typeof taskCard.priority !== 'number' || taskCard.priority < 0 || taskCard.priority > 100) {
    errors.push('Priority must be a number between 0 and 100');
  }

  // Confidence bounds
  if (typeof taskCard.confidence !== 'number' || taskCard.confidence < 0 || taskCard.confidence > 1) {
    errors.push('Confidence must be a number between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate priority score for a task
 *
 * Priority = (severity weight) × (confidence) × (impact multiplier)
 *
 * @param {Object} taskCard - Task card
 * @returns {number} Priority score (0-100)
 */
export function calculatePriority(taskCard) {
  const severityWeights = {
    [Severity.CRITICAL]: 100,
    [Severity.HIGH]: 75,
    [Severity.MEDIUM]: 50,
    [Severity.LOW]: 25,
  };

  const baseScore = severityWeights[taskCard.severity] || 50;
  const confidenceMultiplier = taskCard.confidence || 0.7;

  // Impact multiplier based on evidence
  let impactMultiplier = 1.0;

  // If evidence shows high numbers, increase priority
  if (taskCard.evidence) {
    const { current, baseline } = taskCard.evidence;

    // Try to extract numeric ratio if possible
    if (typeof current === 'string' && current.includes('%')) {
      const percent = parseFloat(current.replace('%', ''));
      if (percent > 30) impactMultiplier = 1.2;
      if (percent > 50) impactMultiplier = 1.5;
    }

    // If we have baseline comparison
    if (baseline && typeof baseline === 'string') {
      const baselineNum = parseFloat(baseline.replace('%', '').replace('ms', ''));
      const currentNum = parseFloat(current.replace('%', '').replace('ms', ''));
      if (!isNaN(baselineNum) && !isNaN(currentNum) && baselineNum > 0) {
        const ratio = currentNum / baselineNum;
        if (ratio > 2) impactMultiplier = 1.3;
        if (ratio > 3) impactMultiplier = 1.5;
      }
    }
  }

  const finalScore = Math.min(100, Math.round(baseScore * confidenceMultiplier * impactMultiplier));
  return finalScore;
}

/**
 * Sort tasks by priority
 *
 * @param {Array<Object>} tasks - Array of task cards
 * @returns {Array<Object>} Sorted tasks (highest priority first)
 */
export function sortTasksByPriority(tasks) {
  return tasks.sort((a, b) => {
    // Primary sort: priority (descending)
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    // Secondary sort: confidence (descending)
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    // Tertiary sort: generatedAt (most recent first)
    return new Date(b.generatedAt) - new Date(a.generatedAt);
  });
}

/**
 * Filter tasks by criteria
 *
 * @param {Array<Object>} tasks - Array of task cards
 * @param {Object} criteria - Filter criteria
 * @returns {Array<Object>} Filtered tasks
 */
export function filterTasks(tasks, criteria = {}) {
  let filtered = tasks;

  if (criteria.status) {
    const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
    filtered = filtered.filter(t => statuses.includes(t.status));
  }

  if (criteria.severity) {
    const severities = Array.isArray(criteria.severity) ? criteria.severity : [criteria.severity];
    filtered = filtered.filter(t => severities.includes(t.severity));
  }

  if (criteria.type) {
    const types = Array.isArray(criteria.type) ? criteria.type : [criteria.type];
    filtered = filtered.filter(t => types.includes(t.type));
  }

  if (criteria.minPriority !== undefined) {
    filtered = filtered.filter(t => t.priority >= criteria.minPriority);
  }

  if (criteria.minConfidence !== undefined) {
    filtered = filtered.filter(t => t.confidence >= criteria.minConfidence);
  }

  return filtered;
}

/**
 * Format task card for display
 *
 * @param {Object} taskCard - Task card
 * @returns {string} Formatted task card
 */
export function formatTaskCard(taskCard) {
  const severityEmoji = {
    [Severity.CRITICAL]: '🔴',
    [Severity.HIGH]: '🟠',
    [Severity.MEDIUM]: '🟡',
    [Severity.LOW]: '🟢',
  };

  const lines = [
    `${severityEmoji[taskCard.severity]} ${taskCard.severity.toUpperCase()}`,
    taskCard.title,
    '',
    'Evidence:',
    ...Object.entries(taskCard.evidence)
      .filter(([key]) => !['samples', 'metric'].includes(key))
      .map(([key, value]) => `  • ${key}: ${value}`),
  ];

  if (taskCard.suggestedFix) {
    lines.push('');
    lines.push('Suggested Fix:');
    lines.push(`  Approach: ${taskCard.suggestedFix.approach}`);
    if (taskCard.suggestedFix.files.length > 0) {
      lines.push(`  Files: ${taskCard.suggestedFix.files.join(', ')}`);
    }
  }

  if (taskCard.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('Acceptance Criteria:');
    taskCard.acceptanceCriteria.forEach(criterion => {
      lines.push(`  ✓ ${criterion}`);
    });
  }

  lines.push('');
  lines.push(`Priority: ${taskCard.priority} | Confidence: ${(taskCard.confidence * 100).toFixed(0)}%`);

  return lines.join('\n');
}

export default {
  TaskType,
  Severity,
  TaskStatus,
  createTaskCard,
  validateTaskCard,
  calculatePriority,
  sortTasksByPriority,
  filterTasks,
  formatTaskCard,
};
