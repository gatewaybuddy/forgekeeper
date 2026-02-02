/**
 * @module consciousness/episodic-memory-integration
 * @description Integrates consciousness system with existing EpisodicMemory
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 87%
 *
 * Dependencies:
 * - ../agent/episodic-memory (existing implementation)
 *
 * Integration points:
 * - Called by: DreamEngine, ShortTermMemory
 * - Uses: EpisodicMemoryStore for LTM persistence
 *
 * Tests:
 * - unit: __tests__/unit/episodic-memory-integration.test.mjs
 */

import { EpisodicMemoryStore } from '../agent/episodic-memory.mjs'

/**
 * EpisodicMemoryIntegration - Adapter for consciousness system
 */
export class EpisodicMemoryIntegration {
  /**
   * Create episodic memory integration
   *
   * @param {object} options - Configuration
   * @param {string} options.playgroundRoot - Storage directory
   * @param {object} options.episodicMemory - Existing EpisodicMemory instance (optional)
   */
  constructor(options = {}) {
    const playgroundRoot = options.playgroundRoot || '.forgekeeper/consciousness/memory'

    // Use provided instance or create new one
    this.episodicMemory = options.episodicMemory || new EpisodicMemoryStore(playgroundRoot)

    this.initialized = false
  }

  /**
   * Initialize episodic memory
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return

    await this.episodicMemory.initialize()
    this.initialized = true

    console.log('[EpisodicMemoryIntegration] Initialized')
  }

  /**
   * Store memory from consciousness system
   *
   * @param {object} memory - Memory to store
   * @param {object} metadata - Additional metadata
   * @returns {Promise<string>} Episode ID
   */
  async storeMemory(memory, metadata = {}) {
    await this.initialize()

    // Convert consciousness memory format to episodic memory format
    const sessionResult = {
      task: memory.content || memory.thought || memory.summary || 'Autonomous thought',
      task_type: memory.type || 'autonomous-thought',
      completed: true, // Consciousness memories are completed thoughts
      iterations: 1,
      tools_used: metadata.toolsUsed || [],
      strategy: metadata.strategy || 'autonomous-consciousness',
      history: metadata.history || [],
      artifacts: metadata.artifacts || [],
      summary: memory.summary || this.generateSummary(memory),
      confidence: memory.importance || 0.5,
      error_count: 0,
      error_recoveries: [],
      error_categories_encountered: {}
    }

    await this.episodicMemory.recordEpisode(sessionResult)

    // The episode ID is generated internally by recordEpisode
    // Get the most recent episode ID
    const recent = await this.episodicMemory.getRecentEpisodes(1)
    return recent.length > 0 ? recent[0].episode_id : null
  }

  /**
   * Generate summary from memory
   *
   * @param {object} memory - Memory object
   * @returns {string} Summary
   */
  generateSummary(memory) {
    const parts = []

    if (memory.thought) parts.push(`Thought: ${memory.thought}`)
    if (memory.response) parts.push(`Response: ${memory.response}`)
    if (memory.content) parts.push(memory.content)

    return parts.join(' | ').slice(0, 200)
  }

  /**
   * Search for relevant memories
   *
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<array>} Relevant memories
   */
  async searchRelevant(query, options = {}) {
    await this.initialize()

    const results = await this.episodicMemory.searchSimilar(query, {
      limit: options.limit || 5,
      minScore: options.minScore || 0.3,
      successOnly: options.successOnly !== false // Default true
    })

    // Convert episodic memory format to consciousness memory format
    return results.map(result => ({
      id: result.episode.episode_id,
      content: result.episode.task,
      summary: result.episode.summary,
      type: result.episode.task_type,
      timestamp: result.episode.timestamp,
      importance: result.episode.confidence,
      relevanceScore: result.score,
      metadata: {
        success: result.episode.success,
        iterations: result.episode.iterations,
        toolsUsed: result.episode.tools_used,
        strategy: result.episode.strategy
      }
    }))
  }

  /**
   * Get recent memories
   *
   * @param {number} limit - Max memories
   * @returns {Promise<array>} Recent memories
   */
  async getRecentMemories(limit = 10) {
    await this.initialize()

    const episodes = await this.episodicMemory.getRecentEpisodes(limit)

    return episodes.map(ep => ({
      id: ep.episode_id,
      content: ep.task,
      summary: ep.summary,
      type: ep.task_type,
      timestamp: ep.timestamp,
      importance: ep.confidence,
      metadata: {
        success: ep.success,
        iterations: ep.iterations,
        toolsUsed: ep.tools_used
      }
    }))
  }

  /**
   * Get memory statistics
   *
   * @returns {Promise<object>} Statistics
   */
  async getStats() {
    await this.initialize()

    return await this.episodicMemory.getStatistics()
  }

  /**
   * Store consolidated memory from dream cycle
   *
   * @param {object} memory - Consolidated memory
   * @param {object} consolidationResult - Consolidation evaluation
   * @returns {Promise<string>} Episode ID
   */
  async storeConsolidatedMemory(memory, consolidationResult) {
    await this.initialize()

    const metadata = {
      strategy: 'dream-consolidation',
      artifacts: [{
        type: 'consolidation-result',
        promotionScore: consolidationResult.promotionScore,
        factorScores: consolidationResult.factorScores,
        reasoning: consolidationResult.reasoning
      }]
    }

    return await this.storeMemory(memory, metadata)
  }

  /**
   * Find similar memories to current thought
   *
   * @param {string} thought - Current thought
   * @param {object} options - Search options
   * @returns {Promise<array>} Similar memories
   */
  async findSimilarThoughts(thought, options = {}) {
    await this.initialize()

    return await this.searchRelevant(thought, {
      limit: options.limit || 3,
      minScore: options.minScore || 0.4,
      successOnly: true
    })
  }

  /**
   * Get memory by ID
   *
   * @param {string} episodeId - Episode ID
   * @returns {Promise<object|null>} Memory
   */
  async getMemory(episodeId) {
    await this.initialize()

    const allEpisodes = await this.episodicMemory.getRecentEpisodes(1000) // Load all
    const episode = allEpisodes.find(ep => ep.episode_id === episodeId)

    if (!episode) return null

    return {
      id: episode.episode_id,
      content: episode.task,
      summary: episode.summary,
      type: episode.task_type,
      timestamp: episode.timestamp,
      importance: episode.confidence,
      metadata: {
        success: episode.success,
        iterations: episode.iterations,
        toolsUsed: episode.tools_used,
        strategy: episode.strategy,
        history: episode.history
      }
    }
  }
}
