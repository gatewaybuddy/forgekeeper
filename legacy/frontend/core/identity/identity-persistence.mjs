/**
 * Identity Persistence - JSONL Storage Layer
 *
 * Stores agent identity to `.forgekeeper/identity/{agent_id}.jsonl`
 * using an append-only log with periodic snapshots.
 *
 * Storage Model:
 * - Each identity change is appended as an event
 * - Periodic snapshots capture full state for fast loading
 * - Load reconstructs state from last snapshot + subsequent events
 * - Merge deltas on session end
 */

import fs from 'fs/promises';
import path from 'path';
import {
  createIdentityState,
  validateIdentityState,
  computeChecksum,
  mergeIdentityState,
  IDENTITY_SCHEMA_VERSION,
} from './identity-state.mjs';

/**
 * Event types for identity log
 */
export const EVENT_TYPES = {
  CREATED: 'identity_created',
  SNAPSHOT: 'identity_snapshot',
  UPDATED: 'identity_updated',
  GOAL_ADDED: 'goal_added',
  GOAL_UPDATED: 'goal_updated',
  GOAL_COMPLETED: 'goal_completed',
  GOAL_FAILED: 'goal_failed',
  GOAL_DEFERRED: 'goal_deferred',
  GOAL_ABANDONED: 'goal_abandoned',
  RELATIONSHIP_UPDATED: 'relationship_updated',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  CAPABILITY_ADDED: 'capability_added',
  LIMITATION_ADDED: 'limitation_added',
  LEARNING_EDGE_ADDED: 'learning_edge_added',
  VALUE_ADDED: 'value_added',
};

/**
 * @typedef {Object} IdentityEvent
 * @property {string} event_id - Unique event identifier
 * @property {string} event_type - Type of event
 * @property {string} agent_id - Agent this event belongs to
 * @property {string} timestamp - ISO timestamp
 * @property {Object} payload - Event-specific data
 * @property {Object|null} snapshot - Full state if this is a snapshot event
 */

/**
 * Identity Persistence Store
 *
 * Manages persistent storage and retrieval of agent identity state.
 */
export class IdentityPersistenceStore {
  /**
   * @param {string} identityRoot - Root directory for identity storage
   * @param {Object} options - Configuration options
   */
  constructor(identityRoot, options = {}) {
    this.identityRoot = identityRoot;
    this.snapshotInterval = options.snapshotInterval || 10; // Snapshot every N events
    this.cache = new Map(); // In-memory cache of loaded identities
    this.initialized = false;
  }

  /**
   * Initialize the persistence store
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.identityRoot, { recursive: true });
      this.initialized = true;
      console.log(`[IdentityPersistence] Initialized at ${this.identityRoot}`);
    } catch (error) {
      console.error('[IdentityPersistence] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get the file path for an agent's identity log
   *
   * @param {string} agentId - Agent identifier
   * @returns {string} - File path
   */
  getIdentityPath(agentId) {
    // Sanitize agent ID for filesystem safety
    const safeId = agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.identityRoot, `${safeId}.jsonl`);
  }

  /**
   * Generate a unique event ID
   *
   * @returns {string} - Event ID
   */
  generateEventId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `evt-${ts}-${rand}`;
  }

  /**
   * Append an event to the identity log
   *
   * @param {string} agentId - Agent identifier
   * @param {string} eventType - Type of event
   * @param {Object} payload - Event payload
   * @param {Object|null} snapshot - Full state snapshot (if snapshot event)
   */
  async appendEvent(agentId, eventType, payload, snapshot = null) {
    await this.initialize();

    const event = {
      event_id: this.generateEventId(),
      event_type: eventType,
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      payload,
      snapshot,
    };

    const filePath = this.getIdentityPath(agentId);

    try {
      await fs.appendFile(filePath, JSON.stringify(event) + '\n', 'utf8');

      // Update cache if it exists for this agent
      if (this.cache.has(agentId)) {
        const cachedState = this.cache.get(agentId);
        const updatedState = this.applyEvent(cachedState, event);
        this.cache.set(agentId, updatedState);
      }

      return event;
    } catch (error) {
      console.error(`[IdentityPersistence] Failed to append event for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Read all events from an identity log
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<IdentityEvent[]>} - Array of events
   */
  async readEvents(agentId) {
    await this.initialize();

    const filePath = this.getIdentityPath(agentId);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.trim()) return [];

      return content
        .trim()
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(e => e !== null);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      console.error(`[IdentityPersistence] Failed to read events for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Reconstruct identity state from event log
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<import('./identity-state.mjs').IdentityState|null>} - Reconstructed state or null
   */
  async loadIdentity(agentId) {
    await this.initialize();

    // Check cache first
    if (this.cache.has(agentId)) {
      console.log(`[IdentityPersistence] Cache hit for ${agentId}`);
      return this.cache.get(agentId);
    }

    const events = await this.readEvents(agentId);
    if (events.length === 0) {
      return null; // No identity exists
    }

    // Find the last snapshot
    let state = null;
    let startIndex = 0;

    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].snapshot) {
        state = events[i].snapshot;
        startIndex = i + 1;
        break;
      }
    }

    // If no snapshot, start from creation event
    if (!state) {
      const creationEvent = events.find(e => e.event_type === EVENT_TYPES.CREATED);
      if (creationEvent) {
        state = creationEvent.payload;
      } else {
        console.error(`[IdentityPersistence] No creation event found for ${agentId}`);
        return null;
      }
    }

    // Apply subsequent events
    for (let i = startIndex; i < events.length; i++) {
      state = this.applyEvent(state, events[i]);
    }

    // Cache the reconstructed state
    this.cache.set(agentId, state);

    console.log(`[IdentityPersistence] Loaded identity ${agentId} from ${events.length} events`);
    return state;
  }

  /**
   * Apply an event to identity state
   *
   * @param {Object} state - Current state
   * @param {IdentityEvent} event - Event to apply
   * @returns {Object} - Updated state
   */
  applyEvent(state, event) {
    const { event_type, payload, timestamp } = event;

    switch (event_type) {
      case EVENT_TYPES.UPDATED:
        return mergeIdentityState(state, payload);

      case EVENT_TYPES.GOAL_ADDED: {
        const updatedGoals = [...(state.active_goals || []), payload.goal];
        return { ...state, active_goals: updatedGoals, last_active: timestamp };
      }

      case EVENT_TYPES.GOAL_UPDATED: {
        const updateGoalInList = (list) =>
          list.map(g => (g.id === payload.goal_id ? { ...g, ...payload.updates } : g));
        return {
          ...state,
          active_goals: updateGoalInList(state.active_goals || []),
          deferred_goals: updateGoalInList(state.deferred_goals || []),
          last_active: timestamp,
        };
      }

      case EVENT_TYPES.GOAL_COMPLETED: {
        const goal = (state.active_goals || []).find(g => g.id === payload.goal_id);
        if (goal) {
          const completedGoal = { ...goal, status: 'completed', progress: 100, ...payload.updates };
          return {
            ...state,
            active_goals: state.active_goals.filter(g => g.id !== payload.goal_id),
            completed_goals: [...(state.completed_goals || []), completedGoal],
            last_active: timestamp,
          };
        }
        return state;
      }

      case EVENT_TYPES.GOAL_FAILED: {
        const goal = (state.active_goals || []).find(g => g.id === payload.goal_id);
        if (goal) {
          const failedGoal = { ...goal, status: 'failed', ...payload.updates };
          return {
            ...state,
            active_goals: state.active_goals.filter(g => g.id !== payload.goal_id),
            completed_goals: [...(state.completed_goals || []), failedGoal],
            last_active: timestamp,
          };
        }
        return state;
      }

      case EVENT_TYPES.GOAL_DEFERRED: {
        const goal = (state.active_goals || []).find(g => g.id === payload.goal_id);
        if (goal) {
          const deferredGoal = { ...goal, status: 'deferred', ...payload.updates };
          return {
            ...state,
            active_goals: state.active_goals.filter(g => g.id !== payload.goal_id),
            deferred_goals: [...(state.deferred_goals || []), deferredGoal],
            last_active: timestamp,
          };
        }
        return state;
      }

      case EVENT_TYPES.GOAL_ABANDONED: {
        const goal = (state.active_goals || []).find(g => g.id === payload.goal_id) ||
                     (state.deferred_goals || []).find(g => g.id === payload.goal_id);
        if (goal) {
          const abandonedGoal = { ...goal, status: 'abandoned', ...payload.updates };
          return {
            ...state,
            active_goals: (state.active_goals || []).filter(g => g.id !== payload.goal_id),
            deferred_goals: (state.deferred_goals || []).filter(g => g.id !== payload.goal_id),
            completed_goals: [...(state.completed_goals || []), abandonedGoal],
            last_active: timestamp,
          };
        }
        return state;
      }

      case EVENT_TYPES.RELATIONSHIP_UPDATED: {
        const relationships = { ...state.relationships };
        relationships[payload.entity_id] = {
          ...(relationships[payload.entity_id] || {}),
          ...payload.relationship,
          last_interaction: timestamp,
        };
        return { ...state, relationships, last_active: timestamp };
      }

      case EVENT_TYPES.SESSION_STARTED:
        return {
          ...state,
          session_count: (state.session_count || 0) + 1,
          last_active: timestamp,
        };

      case EVENT_TYPES.SESSION_ENDED:
        return {
          ...state,
          context_windows_survived: (state.context_windows_survived || 0) + 1,
          last_active: timestamp,
        };

      case EVENT_TYPES.CAPABILITY_ADDED:
        return {
          ...state,
          capabilities: [...new Set([...(state.capabilities || []), payload.capability])],
          last_active: timestamp,
        };

      case EVENT_TYPES.LIMITATION_ADDED:
        return {
          ...state,
          limitations: [...new Set([...(state.limitations || []), payload.limitation])],
          last_active: timestamp,
        };

      case EVENT_TYPES.LEARNING_EDGE_ADDED:
        return {
          ...state,
          learning_edges: [...new Set([...(state.learning_edges || []), payload.learning_edge])],
          last_active: timestamp,
        };

      case EVENT_TYPES.VALUE_ADDED:
        return {
          ...state,
          values: [...new Set([...(state.values || []), payload.value])],
          last_active: timestamp,
        };

      default:
        // Unknown event type, return state unchanged
        return state;
    }
  }

  /**
   * Create a new identity
   *
   * @param {Partial<import('./identity-state.mjs').IdentityState>} identityData - Initial identity data
   * @returns {Promise<import('./identity-state.mjs').IdentityState>} - Created identity
   */
  async createIdentity(identityData) {
    await this.initialize();

    const identity = createIdentityState(identityData);
    const validation = validateIdentityState(identity);

    if (!validation.valid) {
      throw new Error(`Invalid identity state: ${validation.errors.join(', ')}`);
    }

    identity.checksum = computeChecksum(identity);

    // Create the identity log with creation event
    await this.appendEvent(identity.agent_id, EVENT_TYPES.CREATED, identity, identity);

    // Cache it
    this.cache.set(identity.agent_id, identity);

    console.log(`[IdentityPersistence] Created identity: ${identity.agent_id} (${identity.name})`);
    return identity;
  }

  /**
   * Save identity state (creates snapshot if needed)
   *
   * @param {import('./identity-state.mjs').IdentityState} state - Identity state to save
   * @param {boolean} forceSnapshot - Force a snapshot regardless of interval
   * @returns {Promise<void>}
   */
  async saveIdentity(state, forceSnapshot = false) {
    await this.initialize();

    const validation = validateIdentityState(state);
    if (!validation.valid) {
      throw new Error(`Invalid identity state: ${validation.errors.join(', ')}`);
    }

    state.checksum = computeChecksum(state);

    // Check if we need a snapshot
    const events = await this.readEvents(state.agent_id);
    const eventsSinceSnapshot = this.countEventsSinceLastSnapshot(events);

    if (forceSnapshot || eventsSinceSnapshot >= this.snapshotInterval) {
      // Write a snapshot event
      await this.appendEvent(state.agent_id, EVENT_TYPES.SNAPSHOT, {}, state);
      console.log(`[IdentityPersistence] Snapshot created for ${state.agent_id}`);
    } else {
      // Write an update event (delta would be computed if we had previous state)
      await this.appendEvent(state.agent_id, EVENT_TYPES.UPDATED, state);
    }

    // Update cache
    this.cache.set(state.agent_id, state);
  }

  /**
   * Count events since last snapshot
   *
   * @param {IdentityEvent[]} events - Event array
   * @returns {number} - Count of events since last snapshot
   */
  countEventsSinceLastSnapshot(events) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].snapshot) {
        return events.length - 1 - i;
      }
    }
    return events.length;
  }

  /**
   * Start a session for an agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<import('./identity-state.mjs').IdentityState>} - Updated identity
   */
  async startSession(agentId) {
    let identity = await this.loadIdentity(agentId);

    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    await this.appendEvent(agentId, EVENT_TYPES.SESSION_STARTED, {});

    identity = this.applyEvent(identity, {
      event_type: EVENT_TYPES.SESSION_STARTED,
      timestamp: new Date().toISOString(),
      payload: {},
    });

    this.cache.set(agentId, identity);
    console.log(`[IdentityPersistence] Session started for ${agentId} (session #${identity.session_count})`);

    return identity;
  }

  /**
   * End a session for an agent
   *
   * @param {string} agentId - Agent identifier
   * @param {Partial<import('./identity-state.mjs').IdentityState>} updates - Session-end updates
   * @returns {Promise<import('./identity-state.mjs').IdentityState>} - Updated identity
   */
  async endSession(agentId, updates = {}) {
    let identity = await this.loadIdentity(agentId);

    if (!identity) {
      throw new Error(`Identity not found: ${agentId}`);
    }

    // Apply any updates
    if (Object.keys(updates).length > 0) {
      identity = mergeIdentityState(identity, updates);
      await this.appendEvent(agentId, EVENT_TYPES.UPDATED, updates);
    }

    // Record session end
    await this.appendEvent(agentId, EVENT_TYPES.SESSION_ENDED, {});

    identity = this.applyEvent(identity, {
      event_type: EVENT_TYPES.SESSION_ENDED,
      timestamp: new Date().toISOString(),
      payload: {},
    });

    // Save with potential snapshot
    await this.saveIdentity(identity);

    console.log(`[IdentityPersistence] Session ended for ${agentId} (context windows survived: ${identity.context_windows_survived})`);
    return identity;
  }

  /**
   * List all known agent identities
   *
   * @returns {Promise<string[]>} - Array of agent IDs
   */
  async listIdentities() {
    await this.initialize();

    try {
      const files = await fs.readdir(this.identityRoot);
      return files
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace('.jsonl', ''));
    } catch (error) {
      console.error('[IdentityPersistence] Failed to list identities:', error);
      return [];
    }
  }

  /**
   * Check if an identity exists
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} - Whether identity exists
   */
  async identityExists(agentId) {
    await this.initialize();

    const filePath = this.getIdentityPath(agentId);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an identity (use with caution)
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} - Whether deletion succeeded
   */
  async deleteIdentity(agentId) {
    await this.initialize();

    const filePath = this.getIdentityPath(agentId);

    try {
      await fs.unlink(filePath);
      this.cache.delete(agentId);
      console.log(`[IdentityPersistence] Deleted identity: ${agentId}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Already deleted
      }
      console.error(`[IdentityPersistence] Failed to delete identity ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics about identity storage
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} - Storage statistics
   */
  async getStatistics(agentId) {
    const events = await this.readEvents(agentId);

    const stats = {
      total_events: events.length,
      snapshot_count: events.filter(e => e.snapshot).length,
      events_since_last_snapshot: this.countEventsSinceLastSnapshot(events),
      event_types: {},
      first_event: events[0]?.timestamp || null,
      last_event: events[events.length - 1]?.timestamp || null,
    };

    for (const event of events) {
      stats.event_types[event.event_type] = (stats.event_types[event.event_type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Invalidate cache for an agent
   *
   * @param {string} agentId - Agent identifier
   */
  invalidateCache(agentId) {
    this.cache.delete(agentId);
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Create an identity persistence store
 *
 * @param {string} identityRoot - Root directory
 * @param {Object} options - Options
 * @returns {IdentityPersistenceStore}
 */
export function createIdentityPersistence(identityRoot, options = {}) {
  return new IdentityPersistenceStore(identityRoot, options);
}

export default {
  EVENT_TYPES,
  IdentityPersistenceStore,
  createIdentityPersistence,
};
