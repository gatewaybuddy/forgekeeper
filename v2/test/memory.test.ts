/**
 * Memory System Tests
 * Tests for episodic memory and TF-IDF embeddings
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { EpisodicMemoryManager } from '../src/memory/episodic.js';
import { TFIDFVectorizer, cosineSimilarity, extractKeywords, tokenize } from '../src/memory/embeddings.js';

describe('TF-IDF Embeddings', () => {
  describe('tokenize', () => {
    it('should lowercase and remove punctuation', () => {
      const text = 'Hello, World! This is a TEST.';
      const tokens = tokenize(text);

      expect(tokens).not.toContain('Hello');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('should filter stop words', () => {
      const text = 'the quick brown fox';
      const tokens = tokenize(text);

      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
    });

    it('should filter short words', () => {
      const text = 'a an and I am go';
      const tokens = tokenize(text);

      // All words are ≤2 chars or stop words
      expect(tokens).toHaveLength(0);
    });
  });

  describe('extractKeywords', () => {
    it('should extract most frequent terms', () => {
      const text = 'authentication login user session authentication login';
      const keywords = extractKeywords(text, 5);

      expect(keywords).toContain('authentication');
      expect(keywords).toContain('login');
      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('should respect maxKeywords limit', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
      const keywords = extractKeywords(text, 3);

      expect(keywords).toHaveLength(3);
    });
  });

  describe('TFIDFVectorizer', () => {
    let vectorizer: TFIDFVectorizer;

    beforeEach(() => {
      vectorizer = new TFIDFVectorizer();
    });

    it('should build vocabulary from documents', () => {
      const documents = [
        'authentication login system',
        'database connection pool',
        'user authentication module',
      ];

      vectorizer.fit(documents);

      expect(vectorizer.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should produce vectors of correct length', () => {
      const documents = [
        'authentication login system',
        'database connection pool',
      ];

      vectorizer.fit(documents);
      const vector = vectorizer.transform('authentication system');

      expect(vector).toHaveLength(vectorizer.getVocabularySize());
    });

    it('should assign higher scores to unique terms', () => {
      const documents = [
        'common common common common',
        'unique term here',
      ];

      vectorizer.fit(documents);
      const vector1 = vectorizer.transform('common');
      const vector2 = vectorizer.transform('unique');

      const sum1 = vector1.reduce((a, b) => a + b, 0);
      const sum2 = vector2.reduce((a, b) => a + b, 0);

      // Unique terms should have higher TF-IDF scores
      expect(sum2).toBeGreaterThan(sum1);
    });

    it('should handle fitTransform convenience method', () => {
      const documents = [
        'authentication login',
        'database connection',
      ];

      const vectors = vectorizer.fitTransform(documents);

      expect(vectors).toHaveLength(2);
      expect(vectors[0]).toHaveLength(vectorizer.getVocabularySize());
      expect(vectors[1]).toHaveLength(vectorizer.getVocabularySize());
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4];
      const similarity = cosineSimilarity(vec, vec);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });

    it('should return 0 for different length vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });

    it('should return values between 0 and 1 for similar vectors', () => {
      const vec1 = [1, 2, 3, 4];
      const vec2 = [1, 2, 3, 5];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });
});

describe('EpisodicMemoryManager', () => {
  let manager: EpisodicMemoryManager;
  const testMemoryDir = '/tmp/forgekeeper-test-memory';

  beforeEach(async () => {
    // Use test directory
    process.env.MEMORY_DIR = testMemoryDir;
    manager = new EpisodicMemoryManager();
    await manager.initialize();
  });

  afterEach(async () => {
    // Clean up
    await manager.clear();
    try {
      await fs.rm(testMemoryDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('addEntry', () => {
    it('should add episodic entry with embedding', async () => {
      await manager.addEntry({
        sessionId: 'test_session_1',
        timestamp: Date.now(),
        summary: 'Fixed authentication bug in login flow',
        taskType: 'bug_fix',
        outcome: 'success',
        integrationScore: 75,
        challengesIssued: 2,
        iterations: 8,
        agentParticipation: {
          forge: 3,
          loom: 2,
          anvil: 2,
          scout: 1,
        },
      });

      const entry = await manager.getBySessionId('test_session_1');

      expect(entry).toBeDefined();
      expect(entry!.sessionId).toBe('test_session_1');
      expect(entry!.embedding).toBeDefined();
      expect(entry!.keywords).toBeDefined();
      expect(entry!.keywords.length).toBeGreaterThan(0);
    });

    it('should extract keywords from summary', async () => {
      await manager.addEntry({
        sessionId: 'test_session_2',
        timestamp: Date.now(),
        summary: 'Implemented user authentication with JWT tokens',
        taskType: 'feature',
        outcome: 'success',
        integrationScore: 80,
        challengesIssued: 1,
        iterations: 6,
        agentParticipation: {
          forge: 4,
          loom: 1,
          anvil: 1,
          scout: 0,
        },
      });

      const entry = await manager.getBySessionId('test_session_2');

      expect(entry!.keywords).toContain('authentication');
      expect(entry!.keywords).toContain('user');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Add test entries
      await manager.addEntry({
        sessionId: 'session_auth_1',
        timestamp: Date.now(),
        summary: 'Fixed authentication bug in login flow',
        taskType: 'bug_fix',
        outcome: 'success',
        integrationScore: 75,
        challengesIssued: 2,
        iterations: 8,
        agentParticipation: { forge: 3, loom: 2, anvil: 2, scout: 1 },
      });

      await manager.addEntry({
        sessionId: 'session_db_1',
        timestamp: Date.now(),
        summary: 'Optimized database query performance',
        taskType: 'refactor',
        outcome: 'success',
        integrationScore: 70,
        challengesIssued: 1,
        iterations: 5,
        agentParticipation: { forge: 2, loom: 1, anvil: 2, scout: 0 },
      });

      await manager.addEntry({
        sessionId: 'session_auth_2',
        timestamp: Date.now(),
        summary: 'Implemented JWT authentication system',
        taskType: 'feature',
        outcome: 'success',
        integrationScore: 85,
        challengesIssued: 0,
        iterations: 7,
        agentParticipation: { forge: 4, loom: 1, anvil: 2, scout: 0 },
      });
    });

    it('should find semantically similar sessions', async () => {
      const results = await manager.search({
        text: 'authentication problem',
        limit: 3,
      });

      expect(results.length).toBeGreaterThan(0);
      // Authentication-related sessions should rank higher
      const authSessions = results.filter(r => r.entry.summary.includes('authentication'));
      expect(authSessions.length).toBeGreaterThan(0);
    });

    it('should filter by task type', async () => {
      const results = await manager.search({
        taskType: 'bug_fix',
        limit: 10,
      });

      expect(results.every(r => r.entry.taskType === 'bug_fix')).toBe(true);
    });

    it('should filter by minimum score', async () => {
      const results = await manager.search({
        minScore: 80,
        limit: 10,
      });

      expect(results.every(r => r.entry.integrationScore >= 80)).toBe(true);
    });

    it('should return most recent when no text query', async () => {
      const results = await manager.search({
        limit: 2,
      });

      expect(results).toHaveLength(2);
      // Should be sorted by timestamp desc
      expect(results[0].entry.timestamp).toBeGreaterThanOrEqual(results[1].entry.timestamp);
    });

    it('should respect limit parameter', async () => {
      const results = await manager.search({
        limit: 1,
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await manager.addEntry({
        sessionId: 'session_1',
        timestamp: Date.now(),
        summary: 'Success 1',
        taskType: 'feature',
        outcome: 'success',
        integrationScore: 80,
        challengesIssued: 1,
        iterations: 5,
        agentParticipation: { forge: 3, loom: 1, anvil: 1, scout: 0 },
      });

      await manager.addEntry({
        sessionId: 'session_2',
        timestamp: Date.now(),
        summary: 'Failure 1',
        taskType: 'bug_fix',
        outcome: 'failure',
        integrationScore: 40,
        challengesIssued: 0,
        iterations: 3,
        agentParticipation: { forge: 2, loom: 1, anvil: 0, scout: 0 },
      });
    });

    it('should calculate stats correctly', async () => {
      const stats = await manager.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.averageScore).toBe(60); // (80 + 40) / 2
      expect(stats.successRate).toBe(0.5); // 1 success out of 2
      expect(stats.vocabularySize).toBeGreaterThan(0);
    });
  });
});
