/**
 * Identity State Schema & Validation
 *
 * Core identity data structure that enables agents to maintain
 * coherent goals, values, and self-model across context windows
 * and sessions.
 *
 * This is the foundational schema for identity persistence - the
 * differentiating feature that no other framework (CrewAI, AutoGen,
 * LangGraph, Moltbook) currently solves.
 */

import { ulid } from 'ulid';

/**
 * @typedef {Object} Goal
 * @property {string} id - Unique goal identifier
 * @property {string} description - What the goal is
 * @property {string[]} success_criteria - Measurable completion criteria
 * @property {'low'|'medium'|'high'|'critical'} priority - Goal priority
 * @property {string|null} deadline - ISO timestamp or null
 * @property {string[]} dependencies - IDs of prerequisite goals
 * @property {'active'|'completed'|'failed'|'deferred'|'abandoned'} status
 * @property {string} provenance_who - Who created this goal
 * @property {string} provenance_why - Why this goal was created
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 * @property {number} progress - 0-100 completion percentage
 * @property {string[]} associated_tasks - Task IDs linked to this goal
 * @property {Object} metadata - Additional context
 */

/**
 * @typedef {Object} Relationship
 * @property {'user'|'agent'|'system'} type - Entity type
 * @property {number} trust_level - 0-1 trust score
 * @property {string} interaction_summary - Brief relationship description
 * @property {string} last_interaction - ISO timestamp
 * @property {number} interaction_count - Total interactions
 * @property {string[]} topics - Common discussion topics
 */

/**
 * @typedef {Object} IdentityState
 * @property {string} agent_id - Unique agent identifier
 * @property {string} created_at - ISO timestamp of identity creation
 *
 * Core Identity
 * @property {string} name - Agent's name
 * @property {string} purpose - "What am I for?"
 * @property {string[]} values - Prioritized list of values
 *
 * Self-Model
 * @property {string[]} capabilities - What I can do
 * @property {string[]} limitations - What I struggle with
 * @property {string[]} learning_edges - What I'm actively improving
 *
 * Goal State
 * @property {Goal[]} active_goals - Current objectives
 * @property {Goal[]} completed_goals - History (for learning)
 * @property {Goal[]} deferred_goals - Parked for later
 *
 * Relational Context
 * @property {Object.<string, Relationship>} relationships - Entity relationships
 *
 * Continuity Markers
 * @property {string} last_active - ISO timestamp
 * @property {number} session_count - Total sessions
 * @property {number} context_windows_survived - Continuity metric
 *
 * Version & Integrity
 * @property {number} version - Schema version for migrations
 * @property {string} checksum - Integrity verification
 */

/**
 * Current schema version - increment when making breaking changes
 */
export const IDENTITY_SCHEMA_VERSION = 1;

/**
 * Valid goal statuses
 */
export const GOAL_STATUSES = ['active', 'completed', 'failed', 'deferred', 'abandoned'];

/**
 * Valid goal priorities
 */
export const GOAL_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Valid relationship types
 */
export const RELATIONSHIP_TYPES = ['user', 'agent', 'system'];

/**
 * Create a new goal with defaults
 *
 * @param {Partial<Goal>} goalData - Goal data
 * @returns {Goal} - Complete goal object
 */
export function createGoal(goalData) {
  const now = new Date().toISOString();

  return {
    id: goalData.id || `goal-${ulid()}`,
    description: goalData.description || '',
    success_criteria: goalData.success_criteria || [],
    priority: goalData.priority || 'medium',
    deadline: goalData.deadline || null,
    dependencies: goalData.dependencies || [],
    status: goalData.status || 'active',
    provenance_who: goalData.provenance_who || 'system',
    provenance_why: goalData.provenance_why || 'Unspecified',
    created_at: goalData.created_at || now,
    updated_at: goalData.updated_at || now,
    progress: goalData.progress || 0,
    associated_tasks: goalData.associated_tasks || [],
    metadata: goalData.metadata || {},
  };
}

/**
 * Create a new relationship with defaults
 *
 * @param {Partial<Relationship>} relationshipData - Relationship data
 * @returns {Relationship} - Complete relationship object
 */
export function createRelationship(relationshipData) {
  return {
    type: relationshipData.type || 'user',
    trust_level: relationshipData.trust_level ?? 0.5,
    interaction_summary: relationshipData.interaction_summary || '',
    last_interaction: relationshipData.last_interaction || new Date().toISOString(),
    interaction_count: relationshipData.interaction_count || 0,
    topics: relationshipData.topics || [],
  };
}

/**
 * Create a new identity state with defaults
 *
 * @param {Partial<IdentityState>} identityData - Identity data
 * @returns {IdentityState} - Complete identity state
 */
export function createIdentityState(identityData = {}) {
  const now = new Date().toISOString();
  const agentId = identityData.agent_id || `agent-${ulid()}`;

  return {
    // Core identification
    agent_id: agentId,
    created_at: identityData.created_at || now,

    // Core identity
    name: identityData.name || 'Unnamed Agent',
    purpose: identityData.purpose || 'General-purpose assistant',
    values: identityData.values || [
      'helpfulness',
      'accuracy',
      'transparency',
      'continuous_improvement',
    ],

    // Self-model
    capabilities: identityData.capabilities || [],
    limitations: identityData.limitations || [],
    learning_edges: identityData.learning_edges || [],

    // Goal state
    active_goals: (identityData.active_goals || []).map(createGoal),
    completed_goals: (identityData.completed_goals || []).map(createGoal),
    deferred_goals: (identityData.deferred_goals || []).map(createGoal),

    // Relational context
    relationships: identityData.relationships || {},

    // Continuity markers
    last_active: identityData.last_active || now,
    session_count: identityData.session_count || 0,
    context_windows_survived: identityData.context_windows_survived || 0,

    // Version & integrity
    version: IDENTITY_SCHEMA_VERSION,
    checksum: null, // Computed on save
  };
}

/**
 * Validate a goal object
 *
 * @param {Goal} goal - Goal to validate
 * @returns {{ valid: boolean, errors: string[] }} - Validation result
 */
export function validateGoal(goal) {
  const errors = [];

  if (!goal.id || typeof goal.id !== 'string') {
    errors.push('Goal must have a string id');
  }

  if (!goal.description || typeof goal.description !== 'string') {
    errors.push('Goal must have a string description');
  }

  if (!Array.isArray(goal.success_criteria)) {
    errors.push('Goal success_criteria must be an array');
  }

  if (!GOAL_PRIORITIES.includes(goal.priority)) {
    errors.push(`Goal priority must be one of: ${GOAL_PRIORITIES.join(', ')}`);
  }

  if (!GOAL_STATUSES.includes(goal.status)) {
    errors.push(`Goal status must be one of: ${GOAL_STATUSES.join(', ')}`);
  }

  if (typeof goal.progress !== 'number' || goal.progress < 0 || goal.progress > 100) {
    errors.push('Goal progress must be a number between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an identity state object
 *
 * @param {IdentityState} state - Identity state to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }} - Validation result
 */
export function validateIdentityState(state) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!state.agent_id || typeof state.agent_id !== 'string') {
    errors.push('Identity must have a string agent_id');
  }

  if (!state.name || typeof state.name !== 'string') {
    errors.push('Identity must have a string name');
  }

  if (!state.purpose || typeof state.purpose !== 'string') {
    errors.push('Identity must have a string purpose');
  }

  // Arrays
  if (!Array.isArray(state.values)) {
    errors.push('Identity values must be an array');
  } else if (state.values.length === 0) {
    warnings.push('Identity has no defined values');
  }

  if (!Array.isArray(state.capabilities)) {
    errors.push('Identity capabilities must be an array');
  }

  if (!Array.isArray(state.limitations)) {
    errors.push('Identity limitations must be an array');
  }

  if (!Array.isArray(state.learning_edges)) {
    errors.push('Identity learning_edges must be an array');
  }

  // Goal arrays
  for (const goalList of ['active_goals', 'completed_goals', 'deferred_goals']) {
    if (!Array.isArray(state[goalList])) {
      errors.push(`Identity ${goalList} must be an array`);
    } else {
      for (const goal of state[goalList]) {
        const goalValidation = validateGoal(goal);
        if (!goalValidation.valid) {
          errors.push(...goalValidation.errors.map(e => `${goalList}: ${e}`));
        }
      }
    }
  }

  // Relationships
  if (typeof state.relationships !== 'object' || state.relationships === null) {
    errors.push('Identity relationships must be an object');
  } else {
    for (const [entityId, rel] of Object.entries(state.relationships)) {
      if (!RELATIONSHIP_TYPES.includes(rel.type)) {
        errors.push(`Relationship ${entityId} has invalid type: ${rel.type}`);
      }
      if (typeof rel.trust_level !== 'number' || rel.trust_level < 0 || rel.trust_level > 1) {
        errors.push(`Relationship ${entityId} has invalid trust_level: ${rel.trust_level}`);
      }
    }
  }

  // Continuity markers
  if (typeof state.session_count !== 'number' || state.session_count < 0) {
    errors.push('Identity session_count must be a non-negative number');
  }

  if (typeof state.context_windows_survived !== 'number' || state.context_windows_survived < 0) {
    errors.push('Identity context_windows_survived must be a non-negative number');
  }

  // Version check
  if (state.version !== IDENTITY_SCHEMA_VERSION) {
    warnings.push(`Identity version ${state.version} differs from current ${IDENTITY_SCHEMA_VERSION}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Compute checksum for identity state integrity verification
 * Uses a simple hash of key identity fields
 *
 * @param {IdentityState} state - Identity state
 * @returns {string} - Checksum string
 */
export function computeChecksum(state) {
  const critical = {
    agent_id: state.agent_id,
    name: state.name,
    purpose: state.purpose,
    values: state.values,
    session_count: state.session_count,
    active_goals_count: state.active_goals?.length || 0,
  };

  // Simple checksum using JSON and char codes
  const str = JSON.stringify(critical);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `cksum-${Math.abs(hash).toString(16)}`;
}

/**
 * Merge identity state delta into existing state
 * Used for incremental updates without full state replacement
 *
 * @param {IdentityState} base - Base identity state
 * @param {Partial<IdentityState>} delta - Changes to apply
 * @returns {IdentityState} - Merged state
 */
export function mergeIdentityState(base, delta) {
  const merged = { ...base };
  const now = new Date().toISOString();

  // Simple field overwrites
  const simpleFields = [
    'name', 'purpose', 'last_active', 'session_count', 'context_windows_survived',
  ];
  for (const field of simpleFields) {
    if (delta[field] !== undefined) {
      merged[field] = delta[field];
    }
  }

  // Array unions (add new items, don't remove)
  const arrayFields = ['values', 'capabilities', 'limitations', 'learning_edges'];
  for (const field of arrayFields) {
    if (delta[field] && Array.isArray(delta[field])) {
      merged[field] = [...new Set([...base[field] || [], ...delta[field]])];
    }
  }

  // Goal array merges (more complex - merge by ID)
  for (const goalField of ['active_goals', 'completed_goals', 'deferred_goals']) {
    if (delta[goalField] && Array.isArray(delta[goalField])) {
      const baseGoals = new Map((base[goalField] || []).map(g => [g.id, g]));

      for (const deltaGoal of delta[goalField]) {
        if (baseGoals.has(deltaGoal.id)) {
          // Merge existing goal
          baseGoals.set(deltaGoal.id, { ...baseGoals.get(deltaGoal.id), ...deltaGoal, updated_at: now });
        } else {
          // Add new goal
          baseGoals.set(deltaGoal.id, createGoal({ ...deltaGoal, created_at: now }));
        }
      }

      merged[goalField] = Array.from(baseGoals.values());
    }
  }

  // Relationship merges
  if (delta.relationships && typeof delta.relationships === 'object') {
    merged.relationships = { ...base.relationships };
    for (const [entityId, relDelta] of Object.entries(delta.relationships)) {
      if (merged.relationships[entityId]) {
        merged.relationships[entityId] = {
          ...merged.relationships[entityId],
          ...relDelta,
          last_interaction: now,
        };
      } else {
        merged.relationships[entityId] = createRelationship(relDelta);
      }
    }
  }

  // Update timestamp
  merged.last_active = now;

  return merged;
}

/**
 * Extract a summary of identity for prompt injection
 *
 * @param {IdentityState} state - Identity state
 * @returns {string} - Concise identity summary
 */
export function getIdentitySummary(state) {
  const lines = [];

  lines.push(`I am ${state.name}.`);
  lines.push(`Purpose: ${state.purpose}`);

  if (state.values.length > 0) {
    lines.push(`Core values: ${state.values.slice(0, 5).join(', ')}`);
  }

  if (state.capabilities.length > 0) {
    lines.push(`Capabilities: ${state.capabilities.slice(0, 5).join(', ')}`);
  }

  if (state.limitations.length > 0) {
    lines.push(`Known limitations: ${state.limitations.slice(0, 3).join(', ')}`);
  }

  if (state.active_goals.length > 0) {
    const topGoals = state.active_goals
      .sort((a, b) => GOAL_PRIORITIES.indexOf(b.priority) - GOAL_PRIORITIES.indexOf(a.priority))
      .slice(0, 3);
    lines.push(`Active goals: ${topGoals.map(g => g.description).join('; ')}`);
  }

  lines.push(`Sessions: ${state.session_count}, Context windows survived: ${state.context_windows_survived}`);

  return lines.join('\n');
}

/**
 * Detect potential goal drift or value conflicts
 *
 * @param {IdentityState} state - Identity state
 * @returns {{ conflicts: string[], drifts: string[] }} - Detected issues
 */
export function detectIdentityIssues(state) {
  const conflicts = [];
  const drifts = [];

  // Check for stale active goals (no progress in recent sessions)
  const staleThreshold = 5; // sessions without progress
  for (const goal of state.active_goals) {
    // Check if goal has metadata tracking session_last_progress
    if (goal.metadata?.session_last_progress !== undefined) {
      const sessionsSinceProgress = state.session_count - goal.metadata.session_last_progress;
      if (sessionsSinceProgress >= staleThreshold && goal.progress < 100) {
        drifts.push(`Goal "${goal.description}" has had no progress for ${sessionsSinceProgress} sessions`);
      }
    }
  }

  // Check for conflicting goals (same priority, incompatible)
  const criticalGoals = state.active_goals.filter(g => g.priority === 'critical');
  if (criticalGoals.length > 3) {
    conflicts.push(`Too many critical goals (${criticalGoals.length}) may indicate priority inflation`);
  }

  // Check for abandoned learning edges (in limitations but also learning_edges)
  for (const edge of state.learning_edges) {
    if (state.limitations.includes(edge)) {
      drifts.push(`"${edge}" is marked as both a limitation and learning edge - needs resolution`);
    }
  }

  // Check for relationship trust decay
  for (const [entityId, rel] of Object.entries(state.relationships)) {
    if (rel.trust_level < 0.3 && rel.interaction_count > 10) {
      conflicts.push(`Low trust (${rel.trust_level.toFixed(2)}) with ${entityId} despite ${rel.interaction_count} interactions`);
    }
  }

  return { conflicts, drifts };
}

export default {
  IDENTITY_SCHEMA_VERSION,
  GOAL_STATUSES,
  GOAL_PRIORITIES,
  RELATIONSHIP_TYPES,
  createGoal,
  createRelationship,
  createIdentityState,
  validateGoal,
  validateIdentityState,
  computeChecksum,
  mergeIdentityState,
  getIdentitySummary,
  detectIdentityIssues,
};
