/**
 * Episodic Memory - Semantic Search for Past Sessions
 * (Phase 5, Option A)
 *
 * Enables the autonomous agent to find relevant past experiences
 * through semantic similarity search, not just keyword matching.
 *
 * Architecture:
 * - Built on top of SessionMemoryStore (JSONL storage)
 * - Uses ChromaDB for vector storage and similarity search
 * - Embeds session summaries for semantic retrieval
 * - Integrates with autonomous agent for context-aware learning
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

/**
 * Simple embedding function using TF-IDF-like approach
 * (Lightweight, no external dependencies, good for local inference)
 *
 * This can be upgraded to transformers.js or sentence-transformers later,
 * but for now we prioritize simplicity and local execution.
 */
class SimpleEmbedder {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.initialized = false;
  }

  /**
   * Tokenize text into terms
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2); // Filter short terms
  }

  /**
   * Build vocabulary and IDF from corpus
   */
  async buildVocabulary(documents) {
    const termDocCounts = new Map();
    const totalDocs = documents.length;

    // Count document frequency for each term
    for (const doc of documents) {
      const terms = new Set(this.tokenize(doc));
      for (const term of terms) {
        termDocCounts.set(term, (termDocCounts.get(term) || 0) + 1);
      }
    }

    // Calculate IDF for each term
    let vocabIndex = 0;
    for (const [term, docFreq] of termDocCounts) {
      this.vocabulary.set(term, vocabIndex++);
      this.idf.set(term, Math.log(totalDocs / docFreq));
    }

    this.initialized = true;
  }

  /**
   * Convert text to embedding vector
   * Returns a fixed-size vector (384 dimensions to match common models)
   */
  embed(text) {
    if (!this.initialized) {
      throw new Error('Embedder not initialized. Call buildVocabulary first.');
    }

    const terms = this.tokenize(text);
    const termCounts = new Map();

    // Count term frequencies
    for (const term of terms) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }

    // Calculate TF-IDF vector
    const vectorSize = 384; // Fixed size for compatibility
    const vector = new Array(vectorSize).fill(0);

    for (const [term, count] of termCounts) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex !== undefined && vocabIndex < vectorSize) {
        const tf = count / terms.length;
        const idf = this.idf.get(term) || 0;
        vector[vocabIndex] = tf * idf;
      }
    }

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (mag1 * mag2);
  }
}

/**
 * @typedef {Object} Episode
 * @property {string} episode_id - Unique ID
 * @property {string} task - Original task description
 * @property {string} task_type - Classified task type
 * @property {boolean} success - Whether completed successfully
 * @property {number} iterations - Iteration count
 * @property {Array<string>} tools_used - Tools used
 * @property {string} strategy - Strategy description
 * @property {Array} history - Iteration-by-iteration actions
 * @property {Array} artifacts - Created artifacts
 * @property {string} summary - Human-readable summary
 * @property {number} confidence - Final confidence score
 * @property {string} timestamp - ISO-8601
 * @property {Array<number>} embedding - Vector embedding
 * @property {Array<Object>} error_recoveries - Error recovery patterns
 * @property {Object} error_categories_encountered - Error categories and counts
 */

/**
 * Episodic Memory Store
 *
 * Stores and retrieves episodes (past sessions) using semantic similarity.
 * Built on top of JSONL storage with in-memory vector index.
 */
export class EpisodicMemoryStore {
  constructor(playgroundRoot) {
    this.playgroundRoot = playgroundRoot;
    this.episodesFile = path.join(playgroundRoot, '.episodic_memory.jsonl');
    this.embedder = new SimpleEmbedder();
    this.episodes = []; // In-memory cache
    this.initialized = false;
  }

  /**
   * Initialize the episodic memory store
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.playgroundRoot, { recursive: true });

      // Create episodes file if it doesn't exist
      try {
        await fs.access(this.episodesFile);
      } catch {
        await fs.writeFile(this.episodesFile, '', 'utf8');
      }

      // Load existing episodes
      await this.loadEpisodes();

      // Build vocabulary from existing episodes
      if (this.episodes.length > 0) {
        const corpus = this.episodes.map(ep => this.episodeToText(ep));
        await this.embedder.buildVocabulary(corpus);

        // Re-embed episodes if they don't have embeddings
        let needsSave = false;
        for (const episode of this.episodes) {
          if (!episode.embedding) {
            episode.embedding = this.embedder.embed(this.episodeToText(episode));
            needsSave = true;
          }
        }

        if (needsSave) {
          await this.saveEpisodes();
        }
      }

      this.initialized = true;
      console.log(`[EpisodicMemory] Initialized with ${this.episodes.length} episodes`);
    } catch (error) {
      console.error('[EpisodicMemory] Initialization failed:', error);
    }
  }

  /**
   * Load episodes from JSONL file
   */
  async loadEpisodes() {
    try {
      const content = await fs.readFile(this.episodesFile, 'utf8');
      if (!content.trim()) {
        this.episodes = [];
        return;
      }

      this.episodes = content
        .trim()
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(ep => ep !== null);
    } catch (error) {
      console.error('[EpisodicMemory] Failed to load episodes:', error);
      this.episodes = [];
    }
  }

  /**
   * Save all episodes back to JSONL file
   * (Used when re-embedding or updating episodes)
   */
  async saveEpisodes() {
    try {
      const lines = this.episodes.map(ep => JSON.stringify(ep)).join('\n');
      await fs.writeFile(this.episodesFile, lines + (lines ? '\n' : ''), 'utf8');
    } catch (error) {
      console.error('[EpisodicMemory] Failed to save episodes:', error);
    }
  }

  /**
   * Convert episode to searchable text
   */
  episodeToText(episode) {
    const parts = [
      episode.task,
      episode.task_type,
      episode.strategy || '',
      episode.summary || '',
      (episode.tools_used || []).join(' '),
    ];
    return parts.filter(Boolean).join(' ');
  }

  /**
   * Record a new episode from a completed session
   *
   * @param {Object} sessionResult - Result from autonomous agent
   */
  async recordEpisode(sessionResult) {
    await this.initialize();

    const episode = {
      episode_id: ulid(),
      task: sessionResult.task || '',
      task_type: sessionResult.task_type || 'unknown',
      success: sessionResult.completed || false,
      iterations: sessionResult.iterations || 0,
      tools_used: sessionResult.tools_used || [],
      strategy: sessionResult.strategy || '',
      history: sessionResult.history || [],
      artifacts: sessionResult.artifacts || [],
      summary: sessionResult.summary || '',
      confidence: sessionResult.confidence || 0,
      timestamp: new Date().toISOString(),
      failure_reason: sessionResult.failure_reason || null,
      error_count: sessionResult.error_count || 0,
      // [Phase 4] Error recovery patterns
      error_recoveries: sessionResult.error_recoveries || [],
      error_categories_encountered: sessionResult.error_categories_encountered || {},
    };

    // Generate embedding
    const text = this.episodeToText(episode);

    // Rebuild vocabulary if this is first episode or periodically
    if (this.episodes.length === 0 || this.episodes.length % 10 === 0) {
      const corpus = [...this.episodes.map(ep => this.episodeToText(ep)), text];
      await this.embedder.buildVocabulary(corpus);

      // Re-embed existing episodes with new vocabulary
      for (const ep of this.episodes) {
        ep.embedding = this.embedder.embed(this.episodeToText(ep));
      }
    }

    episode.embedding = this.embedder.embed(text);

    // Add to cache
    this.episodes.push(episode);

    // Append to file
    try {
      await fs.appendFile(this.episodesFile, JSON.stringify(episode) + '\n', 'utf8');
      console.log(`[EpisodicMemory] Recorded episode: ${episode.episode_id} (${episode.task_type})`);
    } catch (error) {
      console.error('[EpisodicMemory] Failed to record episode:', error);
    }
  }

  /**
   * Search for similar episodes using semantic similarity
   *
   * @param {string} query - Query text (e.g., current task)
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} - Similar episodes with scores
   */
  async searchSimilar(query, options = {}) {
    await this.initialize();

    const {
      limit = 5,
      minScore = 0.3,
      successOnly = false,
      taskType = null,
    } = options;

    if (this.episodes.length === 0) {
      return [];
    }

    // Embed query
    const queryEmbedding = this.embedder.embed(query);

    // Calculate similarities
    const results = this.episodes
      .map(episode => ({
        episode,
        score: this.embedder.cosineSimilarity(queryEmbedding, episode.embedding),
      }))
      .filter(result => {
        if (result.score < minScore) return false;
        if (successOnly && !result.episode.success) return false;
        if (taskType && result.episode.task_type !== taskType) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Get statistics about episodic memory
   */
  async getStatistics() {
    await this.initialize();

    const stats = {
      total_episodes: this.episodes.length,
      successful: this.episodes.filter(ep => ep.success).length,
      failed: this.episodes.filter(ep => !ep.success).length,
      by_task_type: {},
    };

    for (const episode of this.episodes) {
      const type = episode.task_type || 'unknown';
      if (!stats.by_task_type[type]) {
        stats.by_task_type[type] = { total: 0, success: 0, avg_iterations: 0 };
      }
      stats.by_task_type[type].total++;
      if (episode.success) stats.by_task_type[type].success++;
    }

    // Calculate average iterations per task type
    for (const type in stats.by_task_type) {
      const episodes = this.episodes.filter(ep => ep.task_type === type);
      const totalIterations = episodes.reduce((sum, ep) => sum + (ep.iterations || 0), 0);
      stats.by_task_type[type].avg_iterations = episodes.length > 0
        ? Math.round(totalIterations / episodes.length)
        : 0;
    }

    return stats;
  }

  /**
   * Get recent episodes
   *
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getRecentEpisodes(limit = 10) {
    await this.initialize();
    return this.episodes.slice(-limit).reverse();
  }

  /**
   * Search for episodes with successful recovery for a specific error category
   *
   * @param {string} errorCategory - Error category to search for
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} - Episodes with successful recoveries
   */
  async searchByErrorRecovery(errorCategory, options = {}) {
    await this.initialize();

    const { limit = 5, minConfidence = 0.7 } = options;

    const relevantEpisodes = this.episodes
      .filter(episode => {
        if (!episode.error_recoveries || episode.error_recoveries.length === 0) {
          return false;
        }

        // Check if this episode has a successful recovery for the error category
        return episode.error_recoveries.some(
          recovery =>
            recovery.error_category === errorCategory &&
            recovery.recovery_succeeded === true &&
            (recovery.confidence || 0) >= minConfidence
        );
      })
      .map(episode => ({
        episode_id: episode.episode_id,
        task: episode.task,
        task_type: episode.task_type,
        success: episode.success,
        iterations: episode.iterations,
        timestamp: episode.timestamp,
        recoveries: episode.error_recoveries.filter(
          r => r.error_category === errorCategory && r.recovery_succeeded
        ),
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return relevantEpisodes;
  }

  /**
   * Get error category statistics across all episodes
   *
   * @returns {Promise<Object>}
   */
  async getErrorCategoryStats() {
    await this.initialize();

    const stats = {};

    for (const episode of this.episodes) {
      if (!episode.error_categories_encountered) continue;

      for (const [category, count] of Object.entries(episode.error_categories_encountered)) {
        if (!stats[category]) {
          stats[category] = {
            total_episodes: 0,
            total_occurrences: 0,
            successful_episodes: 0,
            failed_episodes: 0,
            recovery_success_count: 0,
            recovery_attempt_count: 0,
          };
        }

        stats[category].total_episodes++;
        stats[category].total_occurrences += count;

        if (episode.success) {
          stats[category].successful_episodes++;
        } else {
          stats[category].failed_episodes++;
        }

        // Track recovery success rate
        if (episode.error_recoveries) {
          for (const recovery of episode.error_recoveries) {
            if (recovery.error_category === category) {
              stats[category].recovery_attempt_count++;
              if (recovery.recovery_succeeded) {
                stats[category].recovery_success_count++;
              }
            }
          }
        }
      }
    }

    // Calculate recovery success rates
    for (const category in stats) {
      if (stats[category].recovery_attempt_count > 0) {
        stats[category].recovery_success_rate =
          stats[category].recovery_success_count / stats[category].recovery_attempt_count;
      } else {
        stats[category].recovery_success_rate = 0;
      }
    }

    return stats;
  }

  /**
   * Get most common error patterns and their successful recovery strategies
   *
   * @param {number} limit - How many patterns to return
   * @returns {Promise<Array<Object>>}
   */
  async getCommonErrorPatterns(limit = 10) {
    await this.initialize();

    const patterns = {};

    for (const episode of this.episodes) {
      if (!episode.error_recoveries || episode.error_recoveries.length === 0) continue;

      for (const recovery of episode.error_recoveries) {
        if (!recovery.recovery_succeeded) continue;

        const key = recovery.error_category;
        if (!patterns[key]) {
          patterns[key] = {
            error_category: key,
            occurrences: 0,
            successful_strategies: {},
          };
        }

        patterns[key].occurrences++;

        const strategy = recovery.strategy_name || 'unknown';
        if (!patterns[key].successful_strategies[strategy]) {
          patterns[key].successful_strategies[strategy] = {
            count: 0,
            avg_iterations: 0,
            total_iterations: 0,
          };
        }

        const stratData = patterns[key].successful_strategies[strategy];
        stratData.count++;
        stratData.total_iterations += recovery.iterations_to_success || 1;
        stratData.avg_iterations = stratData.total_iterations / stratData.count;
      }
    }

    // Convert to array and sort by occurrence
    const patternArray = Object.values(patterns)
      .map(p => ({
        ...p,
        top_strategy: Object.entries(p.successful_strategies)
          .sort((a, b) => b[1].count - a[1].count)[0],
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);

    return patternArray;
  }
}

/**
 * Create episodic memory store instance
 *
 * @param {string} playgroundRoot
 * @returns {EpisodicMemoryStore}
 */
export function createEpisodicMemory(playgroundRoot) {
  return new EpisodicMemoryStore(playgroundRoot);
}
