/**
 * Identity Continuity - Cross-Session Coherence
 *
 * Generates "continuity prompts" injected at session start to maintain
 * agent coherence across context windows and sessions.
 *
 * Features:
 * - Summarizes what changed since last session
 * - Flags goal drift or value conflicts
 * - Integrates with MIP (Metrics-Informed Prompting)
 * - Provides structured context for session resumption
 */

import {
  getIdentitySummary,
  detectIdentityIssues,
  GOAL_PRIORITIES,
} from './identity-state.mjs';

import { EVENT_TYPES } from './identity-persistence.mjs';

/**
 * @typedef {Object} ContinuityContext
 * @property {string} identity_summary - Core identity recap
 * @property {string} session_context - What happened last session
 * @property {string[]} active_goals_summary - Current goal focus
 * @property {string[]} recent_changes - Changes since last session
 * @property {string[]} warnings - Issues requiring attention
 * @property {string[]} recommendations - Suggested focus areas
 * @property {string} continuity_prompt - Full prompt for injection
 */

/**
 * Generate a session context summary from recent events
 *
 * @param {Array} events - Identity events from persistence
 * @param {number} lookbackCount - How many events to consider
 * @returns {string[]} - Recent changes summary
 */
export function summarizeRecentChanges(events, lookbackCount = 20) {
  const changes = [];
  const recentEvents = events.slice(-lookbackCount);

  // Group events by type
  const eventGroups = {};
  for (const event of recentEvents) {
    if (!eventGroups[event.event_type]) {
      eventGroups[event.event_type] = [];
    }
    eventGroups[event.event_type].push(event);
  }

  // Summarize goal changes
  const goalCompletions = eventGroups[EVENT_TYPES.GOAL_COMPLETED] || [];
  const goalFailures = eventGroups[EVENT_TYPES.GOAL_FAILED] || [];
  const goalAdditions = eventGroups[EVENT_TYPES.GOAL_ADDED] || [];

  if (goalCompletions.length > 0) {
    changes.push(`Completed ${goalCompletions.length} goal(s)`);
  }
  if (goalFailures.length > 0) {
    changes.push(`Failed ${goalFailures.length} goal(s) - review may be needed`);
  }
  if (goalAdditions.length > 0) {
    changes.push(`Added ${goalAdditions.length} new goal(s)`);
  }

  // Summarize capability/limitation updates
  const capabilitiesAdded = eventGroups[EVENT_TYPES.CAPABILITY_ADDED] || [];
  const limitationsAdded = eventGroups[EVENT_TYPES.LIMITATION_ADDED] || [];
  const learningEdgesAdded = eventGroups[EVENT_TYPES.LEARNING_EDGE_ADDED] || [];

  if (capabilitiesAdded.length > 0) {
    const caps = capabilitiesAdded.map(e => e.payload.capability).slice(-3);
    changes.push(`Discovered capabilities: ${caps.join(', ')}`);
  }
  if (limitationsAdded.length > 0) {
    const lims = limitationsAdded.map(e => e.payload.limitation).slice(-3);
    changes.push(`Identified limitations: ${lims.join(', ')}`);
  }
  if (learningEdgesAdded.length > 0) {
    const edges = learningEdgesAdded.map(e => e.payload.learning_edge).slice(-3);
    changes.push(`Learning focus: ${edges.join(', ')}`);
  }

  // Session count
  const sessionStarts = eventGroups[EVENT_TYPES.SESSION_STARTED] || [];
  if (sessionStarts.length > 1) {
    changes.push(`${sessionStarts.length} sessions since last major checkpoint`);
  }

  return changes;
}

/**
 * Generate warnings based on identity state
 *
 * @param {Object} state - Identity state
 * @param {Array} events - Recent events
 * @returns {string[]} - Warning messages
 */
export function generateWarnings(state, events) {
  const warnings = [];

  // Use built-in issue detection
  const issues = detectIdentityIssues(state);
  warnings.push(...issues.conflicts);
  warnings.push(...issues.drifts);

  // Check for rapid goal changes (potential instability)
  const recentEvents = events.slice(-50);
  const goalChanges = recentEvents.filter(e =>
    [EVENT_TYPES.GOAL_ADDED, EVENT_TYPES.GOAL_COMPLETED, EVENT_TYPES.GOAL_FAILED,
     EVENT_TYPES.GOAL_DEFERRED, EVENT_TYPES.GOAL_ABANDONED].includes(e.event_type)
  );

  if (goalChanges.length > 10) {
    warnings.push(`High goal churn (${goalChanges.length} changes in recent history) - consider stabilizing priorities`);
  }

  // Check for long time gaps
  if (state.last_active) {
    const lastActive = new Date(state.last_active);
    const now = new Date();
    const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);

    if (daysSinceActive > 7) {
      warnings.push(`${Math.floor(daysSinceActive)} days since last active - context may be stale`);
    }
  }

  // Check for overdue deadlines
  for (const goal of state.active_goals || []) {
    if (goal.deadline) {
      const deadline = new Date(goal.deadline);
      const now = new Date();
      if (deadline < now) {
        warnings.push(`Goal "${goal.description.slice(0, 50)}..." is past deadline`);
      }
    }
  }

  return warnings;
}

/**
 * Generate focus recommendations based on state
 *
 * @param {Object} state - Identity state
 * @returns {string[]} - Recommendations
 */
export function generateRecommendations(state) {
  const recommendations = [];

  // Prioritize critical goals
  const criticalGoals = (state.active_goals || []).filter(g => g.priority === 'critical');
  if (criticalGoals.length > 0) {
    const topCritical = criticalGoals[0];
    recommendations.push(`Priority: ${topCritical.description} (${topCritical.progress}% complete)`);
  }

  // Check for deferred goals that could be reactivated
  const deferredGoals = state.deferred_goals || [];
  if (deferredGoals.length > 3) {
    recommendations.push(`${deferredGoals.length} deferred goals - consider reviewing and prioritizing`);
  }

  // Suggest addressing learning edges
  const learningEdges = state.learning_edges || [];
  if (learningEdges.length > 0) {
    recommendations.push(`Focus area: ${learningEdges[0]} (active learning edge)`);
  }

  // Relationship maintenance
  const relationships = state.relationships || {};
  const staleRelationships = Object.entries(relationships).filter(([_, rel]) => {
    if (!rel.last_interaction) return false;
    const daysSince = (new Date() - new Date(rel.last_interaction)) / (1000 * 60 * 60 * 24);
    return daysSince > 7 && rel.type === 'user';
  });

  if (staleRelationships.length > 0) {
    recommendations.push(`${staleRelationships.length} user relationship(s) may need attention`);
  }

  return recommendations;
}

/**
 * Generate the full continuity prompt for session start
 *
 * @param {Object} state - Identity state
 * @param {Array} events - Identity events
 * @param {Object} options - Generation options
 * @returns {ContinuityContext} - Complete continuity context
 */
export function generateContinuityContext(state, events = [], options = {}) {
  const {
    verbose = false,
    includeFullHistory = false,
    maxGoals = 5,
  } = options;

  // Core identity summary
  const identitySummary = getIdentitySummary(state);

  // Recent changes
  const recentChanges = summarizeRecentChanges(events);

  // Active goals summary
  const activeGoalsSummary = (state.active_goals || [])
    .sort((a, b) => GOAL_PRIORITIES.indexOf(b.priority) - GOAL_PRIORITIES.indexOf(a.priority))
    .slice(0, maxGoals)
    .map(g => {
      const deadline = g.deadline ? ` (due: ${new Date(g.deadline).toLocaleDateString()})` : '';
      return `[${g.priority.toUpperCase()}] ${g.description} - ${g.progress}%${deadline}`;
    });

  // Warnings and recommendations
  const warnings = generateWarnings(state, events);
  const recommendations = generateRecommendations(state);

  // Session context
  const sessionContext = state.session_count > 1
    ? `This is session #${state.session_count}. ${state.context_windows_survived} context windows survived.`
    : 'This is our first session.';

  // Build the continuity prompt
  const promptParts = [];

  promptParts.push('=== IDENTITY CONTINUITY CONTEXT ===\n');
  promptParts.push(identitySummary);
  promptParts.push('');
  promptParts.push(sessionContext);

  if (recentChanges.length > 0) {
    promptParts.push('\n--- Recent Changes ---');
    recentChanges.forEach(change => promptParts.push(`- ${change}`));
  }

  if (activeGoalsSummary.length > 0) {
    promptParts.push('\n--- Active Goals ---');
    activeGoalsSummary.forEach(goal => promptParts.push(`- ${goal}`));
  }

  if (warnings.length > 0) {
    promptParts.push('\n--- Attention Required ---');
    warnings.forEach(warning => promptParts.push(`! ${warning}`));
  }

  if (recommendations.length > 0) {
    promptParts.push('\n--- Recommendations ---');
    recommendations.forEach(rec => promptParts.push(`> ${rec}`));
  }

  if (verbose && includeFullHistory) {
    const completedCount = (state.completed_goals || []).length;
    const failedCount = (state.completed_goals || []).filter(g => g.status === 'failed').length;
    promptParts.push(`\n--- Historical Context ---`);
    promptParts.push(`Completed goals: ${completedCount - failedCount}`);
    promptParts.push(`Failed goals: ${failedCount}`);
    promptParts.push(`Deferred goals: ${(state.deferred_goals || []).length}`);
  }

  promptParts.push('\n=== END CONTINUITY CONTEXT ===');

  return {
    identity_summary: identitySummary,
    session_context: sessionContext,
    active_goals_summary: activeGoalsSummary,
    recent_changes: recentChanges,
    warnings,
    recommendations,
    continuity_prompt: promptParts.join('\n'),
  };
}

/**
 * Generate a compact continuity prompt (for limited context windows)
 *
 * @param {Object} state - Identity state
 * @returns {string} - Compact prompt
 */
export function generateCompactContinuityPrompt(state) {
  const lines = [];

  lines.push(`[Identity: ${state.name} | Session #${state.session_count}]`);
  lines.push(`Purpose: ${state.purpose}`);

  const topGoal = (state.active_goals || [])
    .sort((a, b) => GOAL_PRIORITIES.indexOf(b.priority) - GOAL_PRIORITIES.indexOf(a.priority))[0];

  if (topGoal) {
    lines.push(`Focus: ${topGoal.description} (${topGoal.progress}%)`);
  }

  const issues = detectIdentityIssues(state);
  if (issues.conflicts.length > 0 || issues.drifts.length > 0) {
    lines.push(`Attention: ${issues.conflicts.length + issues.drifts.length} issue(s) detected`);
  }

  return lines.join(' | ');
}

/**
 * Generate a "Who am I?" response for identity verification
 *
 * @param {Object} state - Identity state
 * @returns {string} - Identity response
 */
export function generateWhoAmIResponse(state) {
  const lines = [];

  lines.push(`I am ${state.name}.`);
  lines.push('');
  lines.push(`**Purpose:** ${state.purpose}`);
  lines.push('');

  if (state.values.length > 0) {
    lines.push(`**Core Values:** ${state.values.join(', ')}`);
    lines.push('');
  }

  if (state.capabilities.length > 0) {
    lines.push(`**What I can do:**`);
    state.capabilities.slice(0, 5).forEach(cap => lines.push(`- ${cap}`));
    lines.push('');
  }

  if (state.limitations.length > 0) {
    lines.push(`**Known limitations:**`);
    state.limitations.slice(0, 3).forEach(lim => lines.push(`- ${lim}`));
    lines.push('');
  }

  if (state.active_goals.length > 0) {
    lines.push(`**Currently working on:**`);
    const topGoals = state.active_goals
      .sort((a, b) => GOAL_PRIORITIES.indexOf(b.priority) - GOAL_PRIORITIES.indexOf(a.priority))
      .slice(0, 3);
    topGoals.forEach(g => lines.push(`- ${g.description} (${g.progress}% complete)`));
    lines.push('');
  }

  lines.push(`**Experience:** ${state.session_count} sessions, ${state.context_windows_survived} context windows survived`);

  const relationshipCount = Object.keys(state.relationships || {}).length;
  if (relationshipCount > 0) {
    lines.push(`**Relationships:** ${relationshipCount} known entities`);
  }

  return lines.join('\n');
}

/**
 * Detect if significant identity drift has occurred
 *
 * @param {Object} previousState - Previous identity state
 * @param {Object} currentState - Current identity state
 * @returns {{ drifted: boolean, driftScore: number, details: string[] }}
 */
export function detectIdentityDrift(previousState, currentState) {
  const details = [];
  let driftScore = 0;

  // Name change (critical)
  if (previousState.name !== currentState.name) {
    driftScore += 50;
    details.push(`Name changed: "${previousState.name}" -> "${currentState.name}"`);
  }

  // Purpose change (critical)
  if (previousState.purpose !== currentState.purpose) {
    driftScore += 40;
    details.push(`Purpose changed: "${previousState.purpose}" -> "${currentState.purpose}"`);
  }

  // Value changes (significant)
  const previousValues = new Set(previousState.values || []);
  const currentValues = new Set(currentState.values || []);
  const removedValues = [...previousValues].filter(v => !currentValues.has(v));
  const addedValues = [...currentValues].filter(v => !previousValues.has(v));

  if (removedValues.length > 0) {
    driftScore += removedValues.length * 10;
    details.push(`Values removed: ${removedValues.join(', ')}`);
  }
  if (addedValues.length > 2) {
    driftScore += addedValues.length * 5;
    details.push(`Many new values added: ${addedValues.join(', ')}`);
  }

  // Goal stability check
  const previousActiveGoalIds = new Set((previousState.active_goals || []).map(g => g.id));
  const currentActiveGoalIds = new Set((currentState.active_goals || []).map(g => g.id));

  const abandonedWithoutCompletion = [...previousActiveGoalIds].filter(id => {
    if (currentActiveGoalIds.has(id)) return false;
    const inCompleted = (currentState.completed_goals || []).some(g => g.id === id);
    const inDeferred = (currentState.deferred_goals || []).some(g => g.id === id);
    return !inCompleted && !inDeferred;
  });

  if (abandonedWithoutCompletion.length > 0) {
    driftScore += abandonedWithoutCompletion.length * 8;
    details.push(`${abandonedWithoutCompletion.length} goals disappeared without resolution`);
  }

  return {
    drifted: driftScore > 30,
    driftScore,
    details,
  };
}

/**
 * Generate MIP (Metrics-Informed Prompting) integration hints
 *
 * @param {Object} state - Identity state
 * @param {Object} metricsContext - Optional metrics from MIP
 * @returns {string[]} - Prompting hints
 */
export function generateMIPIntegrationHints(state, metricsContext = {}) {
  const hints = [];

  // Identity-based hints
  if (state.limitations.includes('verbose_responses')) {
    hints.push('HINT: Keep responses concise - known tendency for verbosity');
  }

  if (state.limitations.includes('incomplete_code')) {
    hints.push('HINT: Ensure all code blocks are complete before finishing');
  }

  // Goal-focused hints
  const activeGoals = state.active_goals || [];
  if (activeGoals.length > 0) {
    const topGoal = activeGoals.sort((a, b) =>
      GOAL_PRIORITIES.indexOf(b.priority) - GOAL_PRIORITIES.indexOf(a.priority)
    )[0];
    hints.push(`FOCUS: Current priority is "${topGoal.description}"`);
  }

  // Learning edge hints
  const learningEdges = state.learning_edges || [];
  if (learningEdges.includes('error_handling')) {
    hints.push('LEARNING: Practicing better error handling');
  }
  if (learningEdges.includes('testing')) {
    hints.push('LEARNING: Include tests when appropriate');
  }

  // Metrics-based hints (from MIP if available)
  if (metricsContext.continuation_rate > 0.2) {
    hints.push('ALERT: High continuation rate detected - be more thorough');
  }
  if (metricsContext.error_rate > 0.1) {
    hints.push('ALERT: Elevated error rate - double-check before executing');
  }

  return hints;
}

export default {
  summarizeRecentChanges,
  generateWarnings,
  generateRecommendations,
  generateContinuityContext,
  generateCompactContinuityPrompt,
  generateWhoAmIResponse,
  detectIdentityDrift,
  generateMIPIntegrationHints,
};
