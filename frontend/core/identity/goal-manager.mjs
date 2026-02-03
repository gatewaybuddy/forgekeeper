/**
 * Goal Manager - Goal Lifecycle Management
 *
 * Manages goal lifecycle within the identity persistence layer:
 * - Goal creation with provenance tracking
 * - Progress updates and status transitions
 * - Value alignment checking
 * - Dependency management
 * - Learning from completed/failed goals
 *
 * Integrates with:
 * - IdentityPersistenceStore for persistence
 * - EpisodicMemory for learning from outcomes
 * - DiagnosticReflection for failure analysis
 */

import {
  createGoal,
  validateGoal,
  GOAL_STATUSES,
  GOAL_PRIORITIES,
} from './identity-state.mjs';

import { EVENT_TYPES } from './identity-persistence.mjs';

/**
 * @typedef {Object} GoalAlignmentResult
 * @property {boolean} aligned - Whether goal aligns with values
 * @property {number} alignment_score - 0-1 alignment score
 * @property {string[]} supporting_values - Values that support this goal
 * @property {string[]} conflicting_values - Values that conflict with this goal
 * @property {string[]} recommendations - Recommendations for better alignment
 */

/**
 * @typedef {Object} GoalExecutionCheck
 * @property {boolean} should_execute - Whether action should proceed
 * @property {string|null} reason - Reason if should not execute
 * @property {string[]} relevant_goals - Goals this action serves
 * @property {number} goal_relevance_score - 0-1 how well action serves goals
 */

/**
 * Goal Manager
 *
 * Coordinates goal lifecycle operations with identity persistence.
 */
export class GoalManager {
  /**
   * @param {import('./identity-persistence.mjs').IdentityPersistenceStore} persistenceStore
   * @param {Object} options - Configuration options
   */
  constructor(persistenceStore, options = {}) {
    this.persistence = persistenceStore;
    this.options = {
      requireValueAlignment: options.requireValueAlignment ?? true,
      minAlignmentScore: options.minAlignmentScore ?? 0.3,
      maxActiveGoals: options.maxActiveGoals ?? 10,
      maxCriticalGoals: options.maxCriticalGoals ?? 3,
      autoTriggerDiagnostic: options.autoTriggerDiagnostic ?? true,
      ...options,
    };
  }

  /**
   * Check if a proposed goal aligns with agent's values
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} goalData - Proposed goal data
   * @returns {Promise<GoalAlignmentResult>} - Alignment analysis
   */
  async checkValueAlignment(agentId, goalData) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const values = identity.values || [];
    const goalDescription = (goalData.description || '').toLowerCase();
    const goalCriteria = (goalData.success_criteria || []).map(c => c.toLowerCase());
    const allGoalText = [goalDescription, ...goalCriteria].join(' ');

    // Simple keyword-based alignment check
    // In production, this could use embeddings or LLM analysis
    const valueKeywords = {
      helpfulness: ['help', 'assist', 'support', 'enable', 'improve', 'benefit'],
      accuracy: ['accurate', 'correct', 'precise', 'verify', 'validate', 'true'],
      transparency: ['explain', 'document', 'clear', 'open', 'communicate', 'honest'],
      continuous_improvement: ['learn', 'improve', 'optimize', 'enhance', 'grow', 'iterate'],
      efficiency: ['fast', 'efficient', 'optimize', 'streamline', 'reduce'],
      safety: ['safe', 'secure', 'protect', 'prevent', 'guard'],
      reliability: ['reliable', 'stable', 'consistent', 'dependable'],
      creativity: ['create', 'innovate', 'design', 'invent', 'novel'],
    };

    const supportingValues = [];
    const conflictingValues = [];
    let totalScore = 0;

    for (const value of values) {
      const keywords = valueKeywords[value] || [value.toLowerCase()];
      const hasSupport = keywords.some(kw => allGoalText.includes(kw));

      if (hasSupport) {
        supportingValues.push(value);
        totalScore += 1;
      }
    }

    // Check for potentially conflicting patterns
    const conflictPatterns = {
      helpfulness: ['harm', 'damage', 'destroy', 'hinder'],
      accuracy: ['guess', 'assume', 'fabricate'],
      transparency: ['hide', 'obscure', 'deceive'],
      safety: ['risk', 'dangerous', 'unsafe'],
    };

    for (const value of values) {
      const patterns = conflictPatterns[value] || [];
      const hasConflict = patterns.some(p => allGoalText.includes(p));
      if (hasConflict) {
        conflictingValues.push(value);
        totalScore -= 0.5;
      }
    }

    const alignmentScore = Math.max(0, Math.min(1, totalScore / Math.max(values.length, 1)));
    const aligned = alignmentScore >= this.options.minAlignmentScore && conflictingValues.length === 0;

    const recommendations = [];
    if (!aligned) {
      if (conflictingValues.length > 0) {
        recommendations.push(`Goal may conflict with values: ${conflictingValues.join(', ')}`);
      }
      if (supportingValues.length === 0) {
        recommendations.push('Consider how this goal serves your core values');
      }
    }

    return {
      aligned,
      alignment_score: alignmentScore,
      supporting_values: supportingValues,
      conflicting_values: conflictingValues,
      recommendations,
    };
  }

  /**
   * Add a new goal to an agent's identity
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} goalData - Goal data
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Created goal and alignment info
   */
  async addGoal(agentId, goalData, options = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    // Check alignment if required
    let alignmentResult = null;
    if (this.options.requireValueAlignment && !options.skipAlignmentCheck) {
      alignmentResult = await this.checkValueAlignment(agentId, goalData);

      if (!alignmentResult.aligned && !options.forceAdd) {
        throw new Error(
          `Goal does not align with values (score: ${alignmentResult.alignment_score.toFixed(2)}). ` +
          `${alignmentResult.recommendations.join(' ')} Use forceAdd: true to override.`
        );
      }
    }

    // Check capacity limits
    const activeGoals = identity.active_goals || [];
    if (activeGoals.length >= this.options.maxActiveGoals) {
      throw new Error(
        `Maximum active goals (${this.options.maxActiveGoals}) reached. ` +
        'Complete or defer existing goals first.'
      );
    }

    // Check critical goal limit
    if (goalData.priority === 'critical') {
      const criticalCount = activeGoals.filter(g => g.priority === 'critical').length;
      if (criticalCount >= this.options.maxCriticalGoals) {
        throw new Error(
          `Maximum critical goals (${this.options.maxCriticalGoals}) reached. ` +
          'This prevents priority inflation.'
        );
      }
    }

    // Check dependencies exist
    const dependencies = goalData.dependencies || [];
    for (const depId of dependencies) {
      const depExists = activeGoals.some(g => g.id === depId) ||
                       (identity.completed_goals || []).some(g => g.id === depId);
      if (!depExists) {
        throw new Error(`Dependency goal not found: ${depId}`);
      }
    }

    // Create the goal
    const goal = createGoal({
      ...goalData,
      metadata: {
        ...goalData.metadata,
        alignment_score: alignmentResult?.alignment_score,
        supporting_values: alignmentResult?.supporting_values,
        session_created: identity.session_count,
        session_last_progress: identity.session_count,
      },
    });

    // Validate
    const validation = validateGoal(goal);
    if (!validation.valid) {
      throw new Error(`Invalid goal: ${validation.errors.join(', ')}`);
    }

    // Persist
    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_ADDED, { goal });

    console.log(`[GoalManager] Added goal "${goal.description}" for ${agentId}`);

    return {
      goal,
      alignment: alignmentResult,
    };
  }

  /**
   * Update goal progress
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {number} progress - New progress (0-100)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Updated goal
   */
  async updateProgress(agentId, goalId, progress, metadata = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const goal = (identity.active_goals || []).find(g => g.id === goalId);
    if (!goal) {
      throw new Error(`Active goal not found: ${goalId}`);
    }

    if (progress < 0 || progress > 100) {
      throw new Error('Progress must be between 0 and 100');
    }

    const updates = {
      progress,
      updated_at: new Date().toISOString(),
      metadata: {
        ...goal.metadata,
        ...metadata,
        session_last_progress: identity.session_count,
      },
    };

    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_UPDATED, {
      goal_id: goalId,
      updates,
    });

    console.log(`[GoalManager] Updated progress for goal ${goalId}: ${progress}%`);

    return { ...goal, ...updates };
  }

  /**
   * Mark goal as completed
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {Object} completionData - Completion details
   * @returns {Promise<Object>} - Completed goal
   */
  async completeGoal(agentId, goalId, completionData = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const goal = (identity.active_goals || []).find(g => g.id === goalId);
    if (!goal) {
      throw new Error(`Active goal not found: ${goalId}`);
    }

    const updates = {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      completion_summary: completionData.summary || null,
      metadata: {
        ...goal.metadata,
        ...completionData.metadata,
        sessions_to_complete: identity.session_count - (goal.metadata?.session_created || 0),
      },
    };

    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_COMPLETED, {
      goal_id: goalId,
      updates,
    });

    console.log(`[GoalManager] Completed goal "${goal.description}" for ${agentId}`);

    return { ...goal, ...updates };
  }

  /**
   * Mark goal as failed with diagnostic reflection
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {Object} failureData - Failure details
   * @returns {Promise<Object>} - Failed goal with analysis
   */
  async failGoal(agentId, goalId, failureData = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const goal = (identity.active_goals || []).find(g => g.id === goalId);
    if (!goal) {
      throw new Error(`Active goal not found: ${goalId}`);
    }

    // Generate diagnostic reflection (5 Whys style)
    const diagnostic = this.generateDiagnosticReflection(goal, failureData);

    const updates = {
      status: 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: failureData.reason || 'Unspecified',
      failure_analysis: diagnostic,
      metadata: {
        ...goal.metadata,
        ...failureData.metadata,
        sessions_attempted: identity.session_count - (goal.metadata?.session_created || 0),
      },
    };

    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_FAILED, {
      goal_id: goalId,
      updates,
    });

    console.log(`[GoalManager] Failed goal "${goal.description}" for ${agentId}: ${failureData.reason}`);

    return { ...goal, ...updates, diagnostic };
  }

  /**
   * Generate diagnostic reflection for failed goal
   *
   * @param {Object} goal - Failed goal
   * @param {Object} failureData - Failure details
   * @returns {Object} - Diagnostic analysis
   */
  generateDiagnosticReflection(goal, failureData) {
    const whys = [];

    // First why: Direct failure reason
    whys.push({
      level: 1,
      question: 'Why did this goal fail?',
      answer: failureData.reason || 'Unknown reason',
    });

    // Second why: Underlying cause
    if (failureData.blockers && failureData.blockers.length > 0) {
      whys.push({
        level: 2,
        question: 'Why were these blockers not anticipated?',
        answer: `Blockers encountered: ${failureData.blockers.join(', ')}`,
      });
    }

    // Third why: Resource/capability gap
    if (goal.progress < 50) {
      whys.push({
        level: 3,
        question: 'Why was so little progress made?',
        answer: 'Possible capability gap or incorrect approach',
      });
    }

    // Fourth why: Planning issues
    if (!goal.success_criteria || goal.success_criteria.length === 0) {
      whys.push({
        level: 4,
        question: 'Why were success criteria unclear?',
        answer: 'Goal may have been poorly defined',
      });
    }

    // Fifth why: Root cause hypothesis
    const rootCauses = [];
    if (failureData.tool_failures) {
      rootCauses.push('Tool execution failures');
    }
    if (failureData.timeout) {
      rootCauses.push('Time/resource constraints');
    }
    if (failureData.dependency_failure) {
      rootCauses.push('Dependent goals incomplete');
    }
    if (rootCauses.length === 0) {
      rootCauses.push('Requires further investigation');
    }

    whys.push({
      level: 5,
      question: 'What is the root cause?',
      answer: rootCauses.join('; '),
    });

    // Generate recommendations
    const recommendations = [];
    if (goal.progress > 0) {
      recommendations.push('Consider breaking goal into smaller sub-goals');
    }
    if (failureData.blockers) {
      recommendations.push('Address identified blockers before retry');
    }
    recommendations.push('Review approach and consider alternatives');

    return {
      whys,
      root_cause_hypothesis: rootCauses,
      recommendations,
      should_retry: goal.priority === 'critical' || goal.priority === 'high',
      retry_approach: failureData.retry_suggestion || 'Try alternative approach',
    };
  }

  /**
   * Defer a goal for later
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {Object} deferData - Deferral details
   * @returns {Promise<Object>} - Deferred goal
   */
  async deferGoal(agentId, goalId, deferData = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const goal = (identity.active_goals || []).find(g => g.id === goalId);
    if (!goal) {
      throw new Error(`Active goal not found: ${goalId}`);
    }

    const updates = {
      status: 'deferred',
      deferred_at: new Date().toISOString(),
      defer_reason: deferData.reason || 'Deferred for later',
      defer_until: deferData.until || null,
      metadata: {
        ...goal.metadata,
        ...deferData.metadata,
      },
    };

    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_DEFERRED, {
      goal_id: goalId,
      updates,
    });

    console.log(`[GoalManager] Deferred goal "${goal.description}" for ${agentId}`);

    return { ...goal, ...updates };
  }

  /**
   * Reactivate a deferred goal
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @returns {Promise<Object>} - Reactivated goal
   */
  async reactivateGoal(agentId, goalId) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    const goal = (identity.deferred_goals || []).find(g => g.id === goalId);
    if (!goal) {
      throw new Error(`Deferred goal not found: ${goalId}`);
    }

    // Check capacity
    const activeGoals = identity.active_goals || [];
    if (activeGoals.length >= this.options.maxActiveGoals) {
      throw new Error(`Maximum active goals reached. Cannot reactivate.`);
    }

    // Move from deferred to active
    const updates = {
      status: 'active',
      reactivated_at: new Date().toISOString(),
      metadata: {
        ...goal.metadata,
        reactivation_count: (goal.metadata?.reactivation_count || 0) + 1,
      },
    };

    // Remove from deferred, add to active via update event
    await this.persistence.appendEvent(agentId, EVENT_TYPES.UPDATED, {
      deferred_goals: identity.deferred_goals.filter(g => g.id !== goalId),
      active_goals: [...activeGoals, { ...goal, ...updates }],
    });

    console.log(`[GoalManager] Reactivated goal "${goal.description}" for ${agentId}`);

    return { ...goal, ...updates };
  }

  /**
   * Abandon a goal
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {Object} abandonData - Abandonment details
   * @returns {Promise<Object>} - Abandoned goal
   */
  async abandonGoal(agentId, goalId, abandonData = {}) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    // Check both active and deferred
    let goal = (identity.active_goals || []).find(g => g.id === goalId);
    let source = 'active';

    if (!goal) {
      goal = (identity.deferred_goals || []).find(g => g.id === goalId);
      source = 'deferred';
    }

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const updates = {
      status: 'abandoned',
      abandoned_at: new Date().toISOString(),
      abandon_reason: abandonData.reason || 'Goal abandoned',
      metadata: {
        ...goal.metadata,
        abandoned_from: source,
      },
    };

    await this.persistence.appendEvent(agentId, EVENT_TYPES.GOAL_ABANDONED, {
      goal_id: goalId,
      updates,
    });

    console.log(`[GoalManager] Abandoned goal "${goal.description}" for ${agentId}`);

    return { ...goal, ...updates };
  }

  /**
   * Check if an action serves active goals
   *
   * @param {string} agentId - Agent identifier
   * @param {string} actionDescription - Description of proposed action
   * @returns {Promise<GoalExecutionCheck>} - Execution check result
   */
  async checkActionServesGoals(agentId, actionDescription) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      return {
        should_execute: true,
        reason: 'No identity to check against',
        relevant_goals: [],
        goal_relevance_score: 0,
      };
    }

    const activeGoals = identity.active_goals || [];
    if (activeGoals.length === 0) {
      return {
        should_execute: true,
        reason: 'No active goals to check against',
        relevant_goals: [],
        goal_relevance_score: 0,
      };
    }

    const actionLower = actionDescription.toLowerCase();
    const relevantGoals = [];
    let totalRelevance = 0;

    for (const goal of activeGoals) {
      const goalText = [
        goal.description,
        ...(goal.success_criteria || []),
      ].join(' ').toLowerCase();

      // Simple keyword overlap check
      const actionWords = actionLower.split(/\s+/).filter(w => w.length > 3);
      const goalWords = goalText.split(/\s+/).filter(w => w.length > 3);

      const overlap = actionWords.filter(w => goalWords.includes(w)).length;
      const relevance = overlap / Math.max(actionWords.length, 1);

      if (relevance > 0.1) {
        relevantGoals.push({
          goal_id: goal.id,
          description: goal.description,
          relevance_score: relevance,
        });
        totalRelevance += relevance;
      }
    }

    const avgRelevance = relevantGoals.length > 0
      ? totalRelevance / relevantGoals.length
      : 0;

    return {
      should_execute: relevantGoals.length > 0 || avgRelevance >= 0,
      reason: relevantGoals.length > 0
        ? `Action serves ${relevantGoals.length} goal(s)`
        : 'Action does not clearly serve any active goal',
      relevant_goals: relevantGoals,
      goal_relevance_score: Math.min(1, avgRelevance),
    };
  }

  /**
   * Get goals ordered by priority and urgency
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object[]>} - Sorted goals
   */
  async getPrioritizedGoals(agentId) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      return [];
    }

    const activeGoals = [...(identity.active_goals || [])];

    // Score each goal
    const scoredGoals = activeGoals.map(goal => {
      let score = 0;

      // Priority weight
      const priorityWeights = { critical: 100, high: 70, medium: 40, low: 10 };
      score += priorityWeights[goal.priority] || 0;

      // Deadline urgency
      if (goal.deadline) {
        const daysUntilDeadline = (new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24);
        if (daysUntilDeadline < 0) {
          score += 50; // Overdue
        } else if (daysUntilDeadline < 1) {
          score += 30; // Due today
        } else if (daysUntilDeadline < 7) {
          score += 15; // Due this week
        }
      }

      // Progress bonus (favor goals with momentum)
      if (goal.progress > 0 && goal.progress < 100) {
        score += Math.min(20, goal.progress / 5);
      }

      // Dependencies unmet penalty
      const unmetDeps = (goal.dependencies || []).filter(depId =>
        !identity.completed_goals?.some(g => g.id === depId)
      );
      score -= unmetDeps.length * 10;

      return { ...goal, priority_score: score };
    });

    // Sort by score descending
    return scoredGoals.sort((a, b) => b.priority_score - a.priority_score);
  }

  /**
   * Prune stale goals at session end
   *
   * @param {string} agentId - Agent identifier
   * @param {number} staleSessions - Sessions without progress to consider stale
   * @returns {Promise<Object[]>} - Stale goals identified
   */
  async identifyStaleGoals(agentId, staleSessions = 5) {
    const identity = await this.persistence.loadIdentity(agentId);
    if (!identity) {
      return [];
    }

    const staleGoals = [];
    const currentSession = identity.session_count || 0;

    for (const goal of identity.active_goals || []) {
      const lastProgressSession = goal.metadata?.session_last_progress || goal.metadata?.session_created || 0;
      const sessionsSinceProgress = currentSession - lastProgressSession;

      if (sessionsSinceProgress >= staleSessions) {
        staleGoals.push({
          ...goal,
          sessions_stale: sessionsSinceProgress,
          recommendation: goal.progress === 0
            ? 'Consider abandoning (no progress)'
            : 'Consider deferring or breaking into smaller goals',
        });
      }
    }

    return staleGoals;
  }
}

/**
 * Create a goal manager instance
 *
 * @param {import('./identity-persistence.mjs').IdentityPersistenceStore} persistenceStore
 * @param {Object} options
 * @returns {GoalManager}
 */
export function createGoalManager(persistenceStore, options = {}) {
  return new GoalManager(persistenceStore, options);
}

export default {
  GoalManager,
  createGoalManager,
};
