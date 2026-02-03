/**
 * Identity Persistence Layer
 *
 * A comprehensive identity management system that enables agents to maintain
 * coherent goals, values, and self-model across context windows and sessions.
 *
 * This is the differentiating feature that no other framework (CrewAI, AutoGen,
 * LangGraph, Moltbook) currently solves.
 *
 * Modules:
 * - identity-state: Core schema and validation
 * - identity-persistence: JSONL storage layer
 * - identity-continuity: Cross-session coherence
 * - goal-manager: Goal lifecycle management
 * - scout-monitor: Adversarial self-monitoring
 * - memory-integration: Bridge to episodic/session memory
 *
 * @module identity
 */

// Re-export everything from identity-state
export {
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
} from './identity-state.mjs';

// Re-export everything from identity-persistence
export {
  EVENT_TYPES,
  IdentityPersistenceStore,
  createIdentityPersistence,
} from './identity-persistence.mjs';

// Re-export everything from identity-continuity
export {
  summarizeRecentChanges,
  generateWarnings,
  generateRecommendations,
  generateContinuityContext,
  generateCompactContinuityPrompt,
  generateWhoAmIResponse,
  detectIdentityDrift,
  generateMIPIntegrationHints,
} from './identity-continuity.mjs';

// Re-export everything from goal-manager
export {
  GoalManager,
  createGoalManager,
} from './goal-manager.mjs';

// Re-export everything from scout-monitor
export {
  ScoutMonitor,
  createScoutMonitor,
} from './scout-monitor.mjs';

// Re-export everything from memory-integration
export {
  MemoryIntegration,
  createMemoryIntegration,
} from './memory-integration.mjs';

// Import for createIdentitySystem
import { createIdentityPersistence } from './identity-persistence.mjs';
import { createGoalManager } from './goal-manager.mjs';
import { createScoutMonitor } from './scout-monitor.mjs';
import { generateContinuityContext } from './identity-continuity.mjs';

/**
 * Create a fully configured identity system
 *
 * @param {Object} config - Configuration options
 * @param {string} config.identityRoot - Root directory for identity storage
 * @param {Object} config.persistenceOptions - Options for IdentityPersistenceStore
 * @param {Object} config.goalManagerOptions - Options for GoalManager
 * @param {Object} config.scoutOptions - Options for ScoutMonitor
 * @param {Object} config.contextLogger - Optional ContextLog instance
 * @returns {Object} - Configured identity system components
 */
export function createIdentitySystem(config = {}) {
  const {
    identityRoot = '.forgekeeper/identity',
    persistenceOptions = {},
    goalManagerOptions = {},
    scoutOptions = {},
    contextLogger = null,
  } = config;

  // Create persistence store
  const persistence = createIdentityPersistence(identityRoot, persistenceOptions);

  // Create goal manager
  const goalManager = createGoalManager(persistence, goalManagerOptions);

  // Create scout monitor
  const scout = createScoutMonitor({
    ...scoutOptions,
    contextLogger,
  });

  return {
    persistence,
    goalManager,
    scout,

    /**
     * Initialize all components
     */
    async initialize() {
      await persistence.initialize();
      await scout.initialize();
    },

    /**
     * Create or load an agent identity
     *
     * @param {string} agentId - Agent identifier
     * @param {Object} defaultData - Default identity data if creating new
     * @returns {Promise<Object>} - Identity state
     */
    async getOrCreateIdentity(agentId, defaultData = {}) {
      const exists = await persistence.identityExists(agentId);

      if (exists) {
        return persistence.loadIdentity(agentId);
      }

      return persistence.createIdentity({
        agent_id: agentId,
        ...defaultData,
      });
    },

    /**
     * Start a session with full continuity context
     *
     * @param {string} agentId - Agent identifier
     * @returns {Promise<Object>} - Session context
     */
    async startSession(agentId) {
      const identity = await persistence.startSession(agentId);
      const events = await persistence.readEvents(agentId);

      const continuity = generateContinuityContext(identity, events);

      // Run scout audit
      const scoutResults = await scout.runMonitoringCycle(identity);

      return {
        identity,
        continuity,
        scout_challenges: scoutResults.challenges,
        pending_challenges: scout.getPendingChallenges(),
      };
    },

    /**
     * End a session with updates
     *
     * @param {string} agentId - Agent identifier
     * @param {Object} updates - Session-end updates
     * @returns {Promise<Object>} - Final identity state
     */
    async endSession(agentId, updates = {}) {
      return persistence.endSession(agentId, updates);
    },
  };
}
