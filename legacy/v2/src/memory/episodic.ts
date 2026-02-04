/**
 * Episodic Memory Manager
 * Stores and retrieves past session summaries with semantic search
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { TFIDFVectorizer, cosineSimilarity, extractKeywords } from './embeddings.js';
import type { EpisodicEntry, MemoryQuery, SimilarityMatch } from './types.js';

// Memory storage path
const MEMORY_DIR = process.env.MEMORY_DIR || path.join(process.cwd(), '.forgekeeper', 'memory');
const EPISODIC_FILE = path.join(MEMORY_DIR, 'episodic.jsonl');

/**
 * Episodic Memory Manager
 * Uses TF-IDF embeddings for semantic similarity search
 */
export class EpisodicMemoryManager {
  private entries: EpisodicEntry[] = [];
  private vectorizer: TFIDFVectorizer = new TFIDFVectorizer();
  private initialized: boolean = false;

  /**
   * Initialize memory from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists
      await fs.mkdir(MEMORY_DIR, { recursive: true });

      // Load existing entries
      try {
        const content = await fs.readFile(EPISODIC_FILE, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        this.entries = lines.map((line) => JSON.parse(line));
        logger.info({ count: this.entries.length }, 'Loaded episodic memories');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          logger.info('No existing episodic memory found, starting fresh');
          this.entries = [];
        } else {
          throw error;
        }
      }

      // Fit vectorizer if we have entries
      if (this.entries.length > 0) {
        const documents = this.entries.map((e) => `${e.summary} ${e.taskType}`);
        this.vectorizer.fit(documents);

        // Generate embeddings for existing entries without them
        for (const entry of this.entries) {
          if (!entry.embedding) {
            entry.embedding = this.vectorizer.transform(`${entry.summary} ${entry.taskType}`);
          }
        }
      }

      this.initialized = true;
      logger.info({ vocabularySize: this.vectorizer.getVocabularySize() }, 'Episodic memory initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize episodic memory');
      throw error;
    }
  }

  /**
   * Add a new episodic entry
   */
  async addEntry(entry: Omit<EpisodicEntry, 'embedding' | 'keywords'>): Promise<void> {
    await this.initialize();

    try {
      // Extract keywords from summary
      const keywords = extractKeywords(`${entry.summary} ${entry.taskType}`, 10);

      // Create embedding
      const text = `${entry.summary} ${entry.taskType}`;

      // Refit vectorizer with new document
      const allDocuments = [
        ...this.entries.map((e) => `${e.summary} ${e.taskType}`),
        text,
      ];
      this.vectorizer.fit(allDocuments);

      // Regenerate embeddings for all entries
      for (const existingEntry of this.entries) {
        existingEntry.embedding = this.vectorizer.transform(
          `${existingEntry.summary} ${existingEntry.taskType}`
        );
      }

      const embedding = this.vectorizer.transform(text);

      const fullEntry: EpisodicEntry = {
        ...entry,
        embedding,
        keywords,
      };

      // Add to memory
      this.entries.push(fullEntry);

      // Append to file
      await fs.appendFile(EPISODIC_FILE, JSON.stringify(fullEntry) + '\n');

      logger.info(
        { sessionId: entry.sessionId, keywords, vocabularySize: this.vectorizer.getVocabularySize() },
        'Added episodic entry'
      );
    } catch (error) {
      logger.error({ error, sessionId: entry.sessionId }, 'Failed to add episodic entry');
      throw error;
    }
  }

  /**
   * Search for similar past sessions
   */
  async search(query: MemoryQuery): Promise<SimilarityMatch[]> {
    await this.initialize();

    if (this.entries.length === 0) {
      return [];
    }

    try {
      let filteredEntries = [...this.entries];

      // Filter by task type
      if (query.taskType) {
        filteredEntries = filteredEntries.filter((e) => e.taskType === query.taskType);
      }

      // Filter by time range
      if (query.timeRange) {
        filteredEntries = filteredEntries.filter(
          (e) => e.timestamp >= query.timeRange!.start && e.timestamp <= query.timeRange!.end
        );
      }

      // Filter by minimum score
      if (query.minScore !== undefined) {
        filteredEntries = filteredEntries.filter((e) => e.integrationScore >= query.minScore!);
      }

      if (filteredEntries.length === 0) {
        return [];
      }

      // Semantic search if text query provided
      if (query.text) {
        const queryVector = this.vectorizer.transform(query.text);
        const queryKeywords = extractKeywords(query.text, 10);

        const similarities = filteredEntries
          .map((entry) => {
            const similarity = entry.embedding
              ? cosineSimilarity(queryVector, entry.embedding)
              : 0;

            // Find matched keywords
            const matchedKeywords = entry.keywords.filter((k) => queryKeywords.includes(k));

            return {
              entry,
              similarity,
              matchedKeywords,
            };
          })
          .filter((m) => m.similarity > 0.1) // Minimum similarity threshold
          .sort((a, b) => b.similarity - a.similarity);

        const limit = query.limit || 5;
        return similarities.slice(0, limit);
      }

      // No text query - return most recent entries
      const limit = query.limit || 5;
      const sorted = filteredEntries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      return sorted.map((entry) => ({
        entry,
        similarity: 1.0,
        matchedKeywords: entry.keywords,
      }));
    } catch (error) {
      logger.error({ error, query }, 'Failed to search episodic memory');
      throw error;
    }
  }

  /**
   * Get all entries for a specific session
   */
  async getBySessionId(sessionId: string): Promise<EpisodicEntry | null> {
    await this.initialize();
    return this.entries.find((e) => e.sessionId === sessionId) || null;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    vocabularySize: number;
    averageScore: number;
    successRate: number;
  }> {
    await this.initialize();

    if (this.entries.length === 0) {
      return {
        totalEntries: 0,
        vocabularySize: 0,
        averageScore: 0,
        successRate: 0,
      };
    }

    const averageScore =
      this.entries.reduce((sum, e) => sum + e.integrationScore, 0) / this.entries.length;

    const successCount = this.entries.filter((e) => e.outcome === 'success').length;
    const successRate = successCount / this.entries.length;

    return {
      totalEntries: this.entries.length,
      vocabularySize: this.vectorizer.getVocabularySize(),
      averageScore,
      successRate,
    };
  }

  /**
   * Clear all episodic memories
   */
  async clear(): Promise<void> {
    this.entries = [];
    this.vectorizer = new TFIDFVectorizer();
    this.initialized = false;

    try {
      await fs.unlink(EPISODIC_FILE);
      logger.info('Cleared episodic memory');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error({ error }, 'Failed to clear episodic memory file');
      }
    }
  }
}

// Singleton instance
let instance: EpisodicMemoryManager | null = null;

export function getEpisodicMemory(): EpisodicMemoryManager {
  if (!instance) {
    instance = new EpisodicMemoryManager();
  }
  return instance;
}
