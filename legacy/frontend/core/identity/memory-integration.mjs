/**
 * Memory Integration - Bridge Between Identity and Existing Memory Systems
 *
 * Integrates the identity persistence layer with:
 * - EpisodicMemory: Learning from past sessions
 * - UserPreferences: Coding style and workflow preferences
 * - SessionMemory: Successful patterns and failure analysis
 *
 * This creates a unified memory context that includes:
 * - Identity state (who am I, what are my goals)
 * - Episodic memories (what have I done before)
 * - User preferences (how does the user like things)
 * - Session patterns (what works, what doesn't)
 */

import path from 'path';
import { createEpisodicMemory } from '../agent/episodic-memory.mjs';
import { createSessionMemory } from '../agent/session-memory.mjs';

/**
 * @typedef {Object} UnifiedMemoryContext
 * @property {Object} identity - Identity state and continuity
 * @property {Object} episodic - Relevant past episodes
 * @property {Object} preferences - User preference guidance
 * @property {Object} patterns - Successful/failed patterns
 * @property {string} unified_prompt - Combined prompt for injection
 */

/**
 * Memory Integration Manager
 *
 * Coordinates all memory systems with identity persistence.
 */
export class MemoryIntegration {
  /**
   * @param {Object} config - Configuration
   * @param {string} config.playgroundRoot - Root for memory files
   * @param {Object} config.identitySystem - Identity system instance
   */
  constructor(config) {
    this.playgroundRoot = config.playgroundRoot || '.forgekeeper/playground';
    this.identitySystem = config.identitySystem;

    // Initialize memory stores
    this.episodicMemory = createEpisodicMemory(this.playgroundRoot);
    this.sessionMemory = createSessionMemory(this.playgroundRoot);

    this.initialized = false;
  }

  /**
   * Initialize all memory systems
   */
  async initialize() {
    if (this.initialized) return;

    await this.episodicMemory.initialize();
    await this.sessionMemory.initialize();

    if (this.identitySystem) {
      await this.identitySystem.initialize();
    }

    this.initialized = true;
    console.log('[MemoryIntegration] Initialized');
  }

  /**
   * Build unified memory context for a task
   *
   * @param {string} agentId - Agent identifier
   * @param {string} task - Current task description
   * @param {string} taskType - Task type classification
   * @returns {Promise<UnifiedMemoryContext>} - Unified context
   */
  async buildUnifiedContext(agentId, task, taskType) {
    await this.initialize();

    const context = {
      identity: null,
      episodic: null,
      preferences: null,
      patterns: null,
      unified_prompt: '',
    };

    // 1. Load identity context
    if (this.identitySystem) {
      try {
        const sessionResult = await this.identitySystem.startSession(agentId);
        context.identity = {
          state: sessionResult.identity,
          continuity: sessionResult.continuity,
          challenges: sessionResult.scout_challenges,
        };
      } catch (error) {
        console.warn('[MemoryIntegration] Identity load failed:', error.message);
      }
    }

    // 2. Search episodic memory for similar past experiences
    try {
      const episodes = await this.episodicMemory.searchSimilar(task, {
        limit: 3,
        minScore: 0.3,
        successOnly: true,
        taskType,
      });

      context.episodic = {
        relevant_episodes: episodes,
        has_similar_experience: episodes.length > 0,
        top_similarity: episodes[0]?.score || 0,
      };
    } catch (error) {
      console.warn('[MemoryIntegration] Episodic search failed:', error.message);
      context.episodic = { relevant_episodes: [], has_similar_experience: false };
    }

    // 3. Get session patterns for this task type
    try {
      const successPatterns = await this.sessionMemory.getSuccessfulPatterns(taskType);
      const failurePatterns = await this.sessionMemory.getFailurePatterns(taskType);
      const guidance = await this.sessionMemory.getGuidance(taskType);

      context.patterns = {
        successful: successPatterns.slice(0, 3),
        failed: failurePatterns.slice(0, 3),
        guidance,
        success_rate: successPatterns.length / Math.max(1, successPatterns.length + failurePatterns.length),
      };
    } catch (error) {
      console.warn('[MemoryIntegration] Pattern retrieval failed:', error.message);
      context.patterns = { successful: [], failed: [], guidance: '', success_rate: 0 };
    }

    // 4. Build unified prompt
    context.unified_prompt = this.buildUnifiedPrompt(context);

    return context;
  }

  /**
   * Build the unified prompt from all context sources
   *
   * @param {UnifiedMemoryContext} context - Context data
   * @returns {string} - Unified prompt
   */
  buildUnifiedPrompt(context) {
    const sections = [];

    // Identity section
    if (context.identity?.continuity?.continuity_prompt) {
      sections.push(context.identity.continuity.continuity_prompt);
    }

    // Scout challenges
    if (context.identity?.challenges?.length > 0) {
      sections.push('\n--- Active Scout Challenges ---');
      for (const challenge of context.identity.challenges.slice(0, 2)) {
        sections.push(`! [${challenge.severity.toUpperCase()}] ${challenge.description}`);
      }
    }

    // Episodic memory section
    if (context.episodic?.relevant_episodes?.length > 0) {
      sections.push('\n--- Relevant Past Experience ---');
      for (const ep of context.episodic.relevant_episodes) {
        const episode = ep.episode;
        sections.push(`- ${episode.task} (${episode.success ? 'success' : 'failed'}, ${(ep.score * 100).toFixed(0)}% similar)`);
        if (episode.strategy) {
          sections.push(`  Strategy: ${episode.strategy}`);
        }
      }
    }

    // Pattern guidance
    if (context.patterns?.guidance) {
      sections.push('\n--- Historical Patterns ---');
      sections.push(context.patterns.guidance);
    }

    return sections.join('\n');
  }

  /**
   * Record session completion and update all memory systems
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} sessionResult - Session result data
   */
  async recordSessionCompletion(agentId, sessionResult) {
    await this.initialize();

    const {
      task,
      taskType,
      success,
      iterations,
      toolsUsed,
      strategy,
      confidence,
      errorRecoveries,
      errorPatterns,
    } = sessionResult;

    // 1. Record to session memory
    try {
      await this.sessionMemory.recordSession({
        task_type: taskType,
        success,
        iterations,
        tools_used: toolsUsed || [],
        strategy: strategy || '',
        confidence: confidence || 0,
        task,
        diagnostic_reflections: sessionResult.diagnosticReflections || [],
        recovery_attempts: sessionResult.recoveryAttempts || [],
        error_patterns: errorPatterns || {},
      });
    } catch (error) {
      console.warn('[MemoryIntegration] Session record failed:', error.message);
    }

    // 2. Record to episodic memory
    try {
      await this.episodicMemory.recordEpisode({
        task,
        task_type: taskType,
        completed: success,
        iterations,
        tools_used: toolsUsed || [],
        strategy: strategy || '',
        confidence: confidence || 0,
        error_recoveries: errorRecoveries || [],
        error_categories_encountered: errorPatterns || {},
        summary: sessionResult.summary || '',
        history: sessionResult.history || [],
        artifacts: sessionResult.artifacts || [],
      });
    } catch (error) {
      console.warn('[MemoryIntegration] Episode record failed:', error.message);
    }

    // 3. Update identity with learnings
    if (this.identitySystem) {
      try {
        const updates = {};

        // Add new capability if task was successful and novel
        if (success && taskType && !sessionResult.hadPriorExperience) {
          updates.capabilities = [taskType];
        }

        // Add limitation if task failed multiple times
        if (!success && iterations > 10) {
          updates.limitations = [`${taskType}_under_pressure`];
        }

        // Add learning edge if partial success
        if (success && confidence < 0.7) {
          updates.learning_edges = [taskType];
        }

        await this.identitySystem.endSession(agentId, updates);
      } catch (error) {
        console.warn('[MemoryIntegration] Identity update failed:', error.message);
      }
    }
  }

  /**
   * Update goal based on task outcome
   *
   * @param {string} agentId - Agent identifier
   * @param {string} goalId - Goal identifier
   * @param {Object} outcome - Task outcome
   */
  async updateGoalFromOutcome(agentId, goalId, outcome) {
    if (!this.identitySystem?.goalManager) {
      console.warn('[MemoryIntegration] No goal manager available');
      return;
    }

    const goalManager = this.identitySystem.goalManager;

    try {
      if (outcome.success) {
        // Update progress
        const newProgress = Math.min(100, (outcome.progress || 0) + 10);
        await goalManager.updateProgress(agentId, goalId, newProgress);

        // Complete if fully done
        if (newProgress >= 100 || outcome.goalCompleted) {
          await goalManager.completeGoal(agentId, goalId, {
            summary: outcome.summary || 'Completed via task execution',
          });
        }
      } else if (outcome.failed) {
        await goalManager.failGoal(agentId, goalId, {
          reason: outcome.failureReason || 'Task execution failed',
          blockers: outcome.blockers || [],
        });
      }
    } catch (error) {
      console.warn('[MemoryIntegration] Goal update failed:', error.message);
    }
  }

  /**
   * Get memory statistics
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} - Combined statistics
   */
  async getStatistics(agentId) {
    await this.initialize();

    const stats = {
      identity: null,
      episodic: null,
      session: null,
    };

    if (this.identitySystem) {
      try {
        stats.identity = await this.identitySystem.persistence.getStatistics(agentId);
      } catch {
        stats.identity = { error: 'Not available' };
      }
    }

    try {
      stats.episodic = await this.episodicMemory.getStatistics();
    } catch {
      stats.episodic = { error: 'Not available' };
    }

    try {
      stats.session = await this.sessionMemory.getStatistics();
    } catch {
      stats.session = { error: 'Not available' };
    }

    return stats;
  }
}

/**
 * Create memory integration instance
 *
 * @param {Object} config - Configuration
 * @returns {MemoryIntegration}
 */
export function createMemoryIntegration(config) {
  return new MemoryIntegration(config);
}

export default {
  MemoryIntegration,
  createMemoryIntegration,
};
