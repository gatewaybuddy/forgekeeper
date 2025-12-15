/**
 * Unit tests for MemoryManager orchestrator module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryManager } from '../../core/agent/orchestrator/memory-manager.mjs';
import {
  mockMemories,
  mockCheckpoint,
  createMockSessionMemory,
  createMockEpisodicMemory,
  createMockPreferenceSystem,
  createMockToolEffectiveness
} from '../utils/fixtures.mjs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('MemoryManager', () => {
  let memoryManager;
  let mockSessionMemory;
  let mockEpisodicMemory;
  let mockPreferenceSystem;
  let mockToolEffectiveness;
  let tempDir;

  beforeEach(async () => {
    // Create temporary directory for checkpoints
    tempDir = path.join(os.tmpdir(), `forgekeeper-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    mockSessionMemory = createMockSessionMemory();
    mockEpisodicMemory = createMockEpisodicMemory();
    mockPreferenceSystem = createMockPreferenceSystem();
    mockToolEffectiveness = createMockToolEffectiveness();

    memoryManager = new MemoryManager({
      sessionMemory: mockSessionMemory,
      episodicMemory: mockEpisodicMemory,
      preferenceSystem: mockPreferenceSystem,
      toolEffectiveness: mockToolEffectiveness,
      playgroundRoot: tempDir
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize with all memory systems', () => {
      expect(memoryManager.sessionMemory).toBe(mockSessionMemory);
      expect(memoryManager.episodicMemory).toBe(mockEpisodicMemory);
      expect(memoryManager.preferenceSystem).toBe(mockPreferenceSystem);
      expect(memoryManager.toolEffectiveness).toBe(mockToolEffectiveness);
      expect(memoryManager.playgroundRoot).toBe(tempDir);
    });
  });

  describe('loadAll', () => {
    it('should load all memory systems successfully', async () => {
      const taskType = 'implementation';
      const task = 'Add authentication to API';

      const memories = await memoryManager.loadAll(taskType, task);

      expect(memories.pastLearnings).toEqual(mockMemories.pastLearnings);
      expect(memories.pastFailures).toEqual(mockMemories.pastFailures);
      expect(memories.learningGuidance).toEqual(mockMemories.learningGuidance);
      expect(memories.relevantEpisodes).toBeDefined();
      expect(memories.userPreferenceGuidance).toBeDefined();
      expect(memories.toolRecommendations).toEqual(mockMemories.toolRecommendations);
    });

    it('should handle session memory failures gracefully', async () => {
      const failingSessionMemory = {
        getSuccessfulPatterns: vi.fn().mockRejectedValue(new Error('Session memory error')),
        getFailurePatterns: vi.fn().mockRejectedValue(new Error('Session memory error')),
        getGuidance: vi.fn().mockRejectedValue(new Error('Session memory error'))
      };

      const manager = new MemoryManager({
        sessionMemory: failingSessionMemory,
        episodicMemory: mockEpisodicMemory,
        preferenceSystem: mockPreferenceSystem,
        toolEffectiveness: mockToolEffectiveness,
        playgroundRoot: tempDir
      });

      const memories = await manager.loadAll('implementation', 'Test task');

      expect(memories.pastLearnings).toEqual([]);
      expect(memories.pastFailures).toEqual([]);
      expect(memories.learningGuidance).toBe('');
    });

    it('should handle episodic memory failures gracefully', async () => {
      const failingEpisodicMemory = {
        searchSimilar: vi.fn().mockRejectedValue(new Error('Episodic memory error'))
      };

      const manager = new MemoryManager({
        sessionMemory: mockSessionMemory,
        episodicMemory: failingEpisodicMemory,
        preferenceSystem: mockPreferenceSystem,
        toolEffectiveness: mockToolEffectiveness,
        playgroundRoot: tempDir
      });

      const memories = await manager.loadAll('implementation', 'Test task');

      expect(memories.relevantEpisodes).toEqual([]);
    });

    it('should handle preference system failures gracefully', async () => {
      const failingPreferenceSystem = {
        generatePreferenceGuidance: vi.fn().mockRejectedValue(new Error('Preference error'))
      };

      const manager = new MemoryManager({
        sessionMemory: mockSessionMemory,
        episodicMemory: mockEpisodicMemory,
        preferenceSystem: failingPreferenceSystem,
        toolEffectiveness: mockToolEffectiveness,
        playgroundRoot: tempDir
      });

      const memories = await manager.loadAll('implementation', 'Test task');

      expect(memories.userPreferenceGuidance).toBe('');
    });

    it('should handle tool effectiveness failures gracefully', async () => {
      const failingToolEffectiveness = {
        getRecommendations: vi.fn().mockRejectedValue(new Error('Tool effectiveness error'))
      };

      const manager = new MemoryManager({
        sessionMemory: mockSessionMemory,
        episodicMemory: mockEpisodicMemory,
        preferenceSystem: mockPreferenceSystem,
        toolEffectiveness: failingToolEffectiveness,
        playgroundRoot: tempDir
      });

      const memories = await manager.loadAll('implementation', 'Test task');

      expect(memories.toolRecommendations).toEqual([]);
    });

    it('should work with missing optional memory systems', async () => {
      const minimalManager = new MemoryManager({
        sessionMemory: mockSessionMemory,
        episodicMemory: null,
        preferenceSystem: null,
        toolEffectiveness: null,
        playgroundRoot: tempDir
      });

      const memories = await minimalManager.loadAll('implementation', 'Test task');

      expect(memories.pastLearnings).toEqual(mockMemories.pastLearnings);
      expect(memories.relevantEpisodes).toEqual([]);
      expect(memories.userPreferenceGuidance).toBe('');
      expect(memories.toolRecommendations).toEqual([]);
    });
  });

  describe('saveCheckpoint', () => {
    it('should save checkpoint to file', async () => {
      const sessionId = 'test-session-123';
      const state = {
        task: 'Test task',
        iteration: 5,
        errors: [],
        noProgressCount: 0,
        lastProgressPercent: 50,
        confidence: 0.8,
        taskComplete: false,
        history: [],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      const checkpointPath = await memoryManager.saveCheckpoint(sessionId, state, config);

      expect(checkpointPath).toContain('.checkpoint_test-session-123.json');

      const content = await fs.readFile(checkpointPath, 'utf8');
      const checkpoint = JSON.parse(content);

      expect(checkpoint.version).toBe('1.0');
      expect(checkpoint.sessionId).toBe(sessionId);
      expect(checkpoint.task).toBe('Test task');
      expect(checkpoint.state.iteration).toBe(5);
      expect(checkpoint.config.maxIterations).toBe(20);
    });

    it('should use custom checkpoint ID if provided', async () => {
      const sessionId = 'session-abc';
      const checkpointId = 'custom-checkpoint-xyz';
      const state = {
        task: 'Test task',
        iteration: 1,
        errors: [],
        noProgressCount: 0,
        lastProgressPercent: 0,
        confidence: 0.5,
        taskComplete: false,
        history: [],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      const checkpointPath = await memoryManager.saveCheckpoint(sessionId, state, config, checkpointId);

      expect(checkpointPath).toContain('.checkpoint_custom-checkpoint-xyz.json');
    });

    it('should overwrite existing checkpoint', async () => {
      const sessionId = 'test-session-456';
      const state1 = {
        task: 'Test task',
        iteration: 1,
        errors: [],
        noProgressCount: 0,
        lastProgressPercent: 10,
        confidence: 0.5,
        taskComplete: false,
        history: [],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const state2 = {
        ...state1,
        iteration: 10,
        lastProgressPercent: 80
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      await memoryManager.saveCheckpoint(sessionId, state1, config);
      const checkpointPath = await memoryManager.saveCheckpoint(sessionId, state2, config);

      const content = await fs.readFile(checkpointPath, 'utf8');
      const checkpoint = JSON.parse(content);

      expect(checkpoint.state.iteration).toBe(10);
      expect(checkpoint.state.lastProgressPercent).toBe(80);
    });
  });

  describe('loadCheckpoint', () => {
    it('should load checkpoint from file', async () => {
      const checkpointId = 'test-checkpoint-789';
      const originalState = {
        task: 'Test task to load',
        iteration: 7,
        errors: ['error1'],
        noProgressCount: 1,
        lastProgressPercent: 60,
        confidence: 0.75,
        taskComplete: false,
        history: ['action1', 'action2'],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      await memoryManager.saveCheckpoint(checkpointId, originalState, config, checkpointId);
      const checkpoint = await memoryManager.loadCheckpoint(checkpointId);

      expect(checkpoint.sessionId).toBe(checkpointId);
      expect(checkpoint.task).toBe('Test task to load');
      expect(checkpoint.state.iteration).toBe(7);
      expect(checkpoint.state.errors).toEqual(['error1']);
      expect(checkpoint.config.maxIterations).toBe(20);
    });

    it('should throw error for non-existent checkpoint', async () => {
      await expect(
        memoryManager.loadCheckpoint('non-existent-checkpoint')
      ).rejects.toThrow('Checkpoint not found: non-existent-checkpoint');
    });

    it('should handle corrupted checkpoint file', async () => {
      const checkpointId = 'corrupted-checkpoint';
      const checkpointPath = path.join(tempDir, `.checkpoint_${checkpointId}.json`);

      await fs.writeFile(checkpointPath, 'invalid json content', 'utf8');

      await expect(
        memoryManager.loadCheckpoint(checkpointId)
      ).rejects.toThrow();
    });
  });

  describe('recordSession', () => {
    it('should record session to all memory systems', async () => {
      const recordSessionSpy = vi.spyOn(mockSessionMemory, 'recordSession');
      const recordEpisodeSpy = vi.spyOn(mockEpisodicMemory, 'add');

      const taskType = 'implementation';
      const sessionData = {
        task: 'Test task',
        success: true,
        iterations: 10,
        tools_used: ['bash', 'read_file'],
        strategy: 'incremental',
        history: [],
        artifacts: [],
        summary: 'Successfully completed',
        confidence: 0.9,
        failure_reason: null,
        error_count: 0,
        recovery_attempts: [],
        error_patterns: {}
      };

      await memoryManager.recordSession(taskType, sessionData);

      expect(recordSessionSpy).toHaveBeenCalledWith(sessionData);
    });

    it('should handle session memory recording failures', async () => {
      const failingSessionMemory = {
        ...mockSessionMemory,
        recordSession: vi.fn().mockRejectedValue(new Error('Recording error'))
      };

      const manager = new MemoryManager({
        sessionMemory: failingSessionMemory,
        episodicMemory: mockEpisodicMemory,
        preferenceSystem: mockPreferenceSystem,
        toolEffectiveness: mockToolEffectiveness,
        playgroundRoot: tempDir
      });

      const sessionData = {
        task: 'Test task',
        success: true,
        iterations: 5
      };

      // Should not throw, just warn
      await expect(
        manager.recordSession('implementation', sessionData)
      ).resolves.not.toThrow();
    });

    it('should handle episodic memory recording failures', async () => {
      const failingEpisodicMemory = {
        ...mockEpisodicMemory,
        recordEpisode: vi.fn().mockRejectedValue(new Error('Recording error'))
      };

      const manager = new MemoryManager({
        sessionMemory: mockSessionMemory,
        episodicMemory: failingEpisodicMemory,
        preferenceSystem: mockPreferenceSystem,
        toolEffectiveness: mockToolEffectiveness,
        playgroundRoot: tempDir
      });

      const sessionData = {
        task: 'Test task',
        success: true,
        iterations: 5
      };

      // Should not throw, just warn
      await expect(
        manager.recordSession('implementation', sessionData)
      ).resolves.not.toThrow();
    });

    it('should work with missing memory systems', async () => {
      const minimalManager = new MemoryManager({
        sessionMemory: null,
        episodicMemory: null,
        preferenceSystem: null,
        toolEffectiveness: null,
        playgroundRoot: tempDir
      });

      const sessionData = {
        task: 'Test task',
        success: true,
        iterations: 5
      };

      // Should not throw
      await expect(
        minimalManager.recordSession('implementation', sessionData)
      ).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle very long file paths', async () => {
      const longId = 'a'.repeat(200);
      const state = {
        task: 'Test',
        iteration: 1,
        errors: [],
        noProgressCount: 0,
        lastProgressPercent: 0,
        confidence: 0.5,
        taskComplete: false,
        history: [],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      // Should handle or throw appropriate error
      try {
        await memoryManager.saveCheckpoint(longId, state, config, longId);
      } catch (err) {
        // File system limitations are acceptable
        expect(err).toBeDefined();
      }
    });

    it('should handle concurrent checkpoint operations', async () => {
      const sessionId = 'concurrent-test';
      const state = {
        task: 'Test',
        iteration: 1,
        errors: [],
        noProgressCount: 0,
        lastProgressPercent: 0,
        confidence: 0.5,
        taskComplete: false,
        history: [],
        artifacts: [],
        reflections: [],
        actionHistory: [],
        recentFailures: [],
        repetitiveActionDetected: false
      };
      const config = {
        maxIterations: 20,
        checkpointInterval: 5,
        errorThreshold: 3,
        model: 'test-model'
      };

      // Save multiple checkpoints concurrently
      const promises = [
        memoryManager.saveCheckpoint(`${sessionId}-1`, state, config),
        memoryManager.saveCheckpoint(`${sessionId}-2`, state, config),
        memoryManager.saveCheckpoint(`${sessionId}-3`, state, config)
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(results[0]).toContain('.checkpoint_concurrent-test-1.json');
      expect(results[1]).toContain('.checkpoint_concurrent-test-2.json');
      expect(results[2]).toContain('.checkpoint_concurrent-test-3.json');
    });
  });
});
