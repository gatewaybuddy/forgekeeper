/**
 * Memory Manager for Autonomous Agent
 *
 * Coordinates all memory systems:
 * - Session memory (past learnings, patterns)
 * - Episodic memory (semantic search)
 * - User preferences
 * - Tool effectiveness tracking
 * - Checkpoint save/load
 *
 * Extracted from autonomous.mjs to improve modularity and testability.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Memory Manager - coordinates all memory subsystems
 */
export class MemoryManager {
  /**
   * @param {Object} config - Configuration object
   * @param {Object} config.sessionMemory - Session memory subsystem
   * @param {Object} config.episodicMemory - Episodic memory subsystem
   * @param {Object} config.preferenceSystem - User preference system
   * @param {Object} config.toolEffectiveness - Tool effectiveness tracker
   * @param {string} config.playgroundRoot - Workspace root directory
   */
  constructor(config) {
    this.sessionMemory = config.sessionMemory;
    this.episodicMemory = config.episodicMemory;
    this.preferenceSystem = config.preferenceSystem;
    this.toolEffectiveness = config.toolEffectiveness;
    this.playgroundRoot = config.playgroundRoot;
  }

  /**
   * Load all memories for a task
   *
   * @param {string} taskType - Detected task type
   * @param {string} task - Task description
   * @returns {Promise<Object>} All loaded memories
   */
  async loadAll(taskType, task) {
    const memories = {
      pastLearnings: [],
      pastFailures: [],
      learningGuidance: '',
      relevantEpisodes: [],
      userPreferenceGuidance: '',
      toolRecommendations: [],
    };

    // Load past learnings for this task type (successes + failures)
    try {
      memories.pastLearnings = await this.sessionMemory.getSuccessfulPatterns(taskType);
      memories.pastFailures = await this.sessionMemory.getFailurePatterns(taskType);
      memories.learningGuidance = await this.sessionMemory.getGuidance(taskType);

      if (memories.pastLearnings.length > 0) {
        console.log(`[MemoryManager] Loaded ${memories.pastLearnings.length} successful patterns for ${taskType} tasks`);
      }
      if (memories.pastFailures.length > 0) {
        console.log(`[MemoryManager] Loaded ${memories.pastFailures.length} failure patterns to avoid`);
      }
    } catch (err) {
      console.warn('[MemoryManager] Failed to load session memory:', err);
    }

    // Load user preferences
    if (this.preferenceSystem) {
      try {
        memories.userPreferenceGuidance = await this.preferenceSystem.generatePreferenceGuidance();
        if (memories.userPreferenceGuidance && memories.userPreferenceGuidance.trim().length > 0) {
          console.log('[MemoryManager] Loaded user preferences');
        }
      } catch (err) {
        console.warn('[MemoryManager] Failed to load user preferences:', err);
      }
    }

    // Search for relevant episodes using semantic similarity
    if (this.episodicMemory) {
      try {
        const similarEpisodes = await this.episodicMemory.searchSimilar(task, {
          limit: 3,
          minScore: 0.4,
          successOnly: true, // Only show successful examples
        });

        if (similarEpisodes.length > 0) {
          memories.relevantEpisodes = similarEpisodes;
          console.log(`[MemoryManager] Found ${similarEpisodes.length} relevant episodes (scores: ${similarEpisodes.map(e => e.score.toFixed(2)).join(', ')})`);
        }
      } catch (err) {
        console.warn('[MemoryManager] Failed to search episodes:', err);
      }
    }

    // Load tool recommendations from historical data
    if (this.toolEffectiveness) {
      try {
        memories.toolRecommendations = await this.toolEffectiveness.getRecommendations(taskType, {
          minSampleSize: 3,
          maxRecommendations: 5,
        });

        if (memories.toolRecommendations.length > 0) {
          console.log(`[MemoryManager] Found ${memories.toolRecommendations.length} tool recommendations for ${taskType} tasks`);
          console.log(`[MemoryManager] Top recommendation: ${memories.toolRecommendations[0].tool} (${(memories.toolRecommendations[0].successRate * 100).toFixed(0)}% success rate)`);
        }
      } catch (err) {
        console.warn('[MemoryManager] Failed to load tool recommendations:', err);
      }
    }

    return memories;
  }

  /**
   * Save checkpoint to resume later
   *
   * @param {string} sessionId - Session ID
   * @param {Object} state - Current agent state
   * @param {Object} config - Agent configuration
   * @param {string} checkpointId - Optional checkpoint ID (defaults to sessionId)
   * @returns {Promise<string>} Path to checkpoint file
   */
  async saveCheckpoint(sessionId, state, config, checkpointId = null) {
    const id = checkpointId || sessionId;
    const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${id}.json`);

    const checkpoint = {
      version: '1.0',
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      task: state.task,
      state: {
        iteration: state.iteration,
        errors: state.errors,
        noProgressCount: state.noProgressCount,
        lastProgressPercent: state.lastProgressPercent,
        confidence: state.confidence,
        taskComplete: state.taskComplete,
        history: state.history,
        artifacts: state.artifacts,
        reflections: state.reflections,
        actionHistory: state.actionHistory,
        recentFailures: state.recentFailures,
        repetitiveActionDetected: state.repetitiveActionDetected,
      },
      config: {
        maxIterations: config.maxIterations,
        checkpointInterval: config.checkpointInterval,
        errorThreshold: config.errorThreshold,
        model: config.model,
      },
    };

    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
    console.log(`[MemoryManager] Checkpoint saved: ${checkpointPath}`);

    return checkpointPath;
  }

  /**
   * Load checkpoint to resume session
   *
   * @param {string} checkpointId - Checkpoint ID or session ID
   * @returns {Promise<Object>} Loaded checkpoint data
   */
  async loadCheckpoint(checkpointId) {
    const checkpointPath = path.join(this.playgroundRoot, `.checkpoint_${checkpointId}.json`);

    try {
      const content = await fs.readFile(checkpointPath, 'utf8');
      const checkpoint = JSON.parse(content);

      console.log(`[MemoryManager] Checkpoint loaded: ${checkpointPath}`);
      console.log(`[MemoryManager] Resume from iteration ${checkpoint.state.iteration}`);

      return checkpoint;
    } catch (error) {
      console.error(`[MemoryManager] Failed to load checkpoint:`, error);
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
  }

  /**
   * Record session to memory for learning
   *
   * @param {string} taskType - Detected task type
   * @param {Object} sessionData - Session data to record
   * @returns {Promise<void>}
   */
  async recordSession(taskType, sessionData) {
    // Record to session memory
    if (this.sessionMemory) {
      try {
        await this.sessionMemory.recordSession(sessionData);
        console.log(`[MemoryManager] Session recorded to session memory`);
      } catch (err) {
        console.warn('[MemoryManager] Failed to record session memory:', err);
      }
    }

    // Record to episodic memory for semantic search
    if (this.episodicMemory) {
      try {
        await this.episodicMemory.recordEpisode({
          task: sessionData.task,
          task_type: taskType,
          completed: sessionData.success,
          iterations: sessionData.iterations,
          tools_used: sessionData.tools_used,
          strategy: sessionData.strategy,
          history: sessionData.history || [],
          artifacts: sessionData.artifacts || [],
          summary: sessionData.summary || '',
          confidence: sessionData.confidence,
          failure_reason: sessionData.failure_reason,
          error_count: sessionData.error_count,
          error_recoveries: sessionData.recovery_attempts || [],
          error_categories_encountered: sessionData.error_patterns || {},
        });
        console.log(`[MemoryManager] Episode recorded to episodic memory`);
      } catch (err) {
        console.warn('[MemoryManager] Failed to record episode:', err);
      }
    }
  }
}
