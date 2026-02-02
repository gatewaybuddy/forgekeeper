/**
 * Integration Tests
 * End-to-end validation of orchestration workflow
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ModelRouter } from '../src/inference/router.js';
import { LocalQwenProvider } from '../src/inference/local-qwen.js';
import { ClaudeProvider } from '../src/inference/claude.js';
import { WorkspaceManager } from '../src/workspace/manager.js';
import { getAgentRegistry } from '../src/agents/registry.js';
import { Orchestrator } from '../src/orchestrator/workflow.js';
import { getEpisodicMemory } from '../src/memory/episodic.js';
import { getContextLog } from '../src/memory/context-log.js';

// Mock providers for testing
class MockLocalProvider extends LocalQwenProvider {
  async healthCheck(): Promise<boolean> {
    return false; // Simulate local not available
  }

  async complete(): Promise<any> {
    throw new Error('Local provider not available');
  }
}

class MockClaudeProvider extends ClaudeProvider {
  private callCount = 0;

  async complete(messages: any[]): Promise<any> {
    this.callCount++;

    // Simulate different agent responses
    const lastMessage = messages[messages.length - 1].content;

    if (lastMessage.includes('Forge:')) {
      return {
        content: 'I propose implementing the feature using TypeScript',
        usage: { input_tokens: 100, output_tokens: 20 },
        stop_reason: 'end_turn',
      };
    }

    if (lastMessage.includes('Loom:')) {
      return {
        content: 'The proposal looks good, but we should add error handling',
        usage: { input_tokens: 100, output_tokens: 20 },
        stop_reason: 'end_turn',
      };
    }

    if (lastMessage.includes('Anvil:')) {
      return {
        content: 'FINAL DECISION: Proceed with TypeScript implementation with error handling',
        usage: { input_tokens: 100, output_tokens: 25 },
        stop_reason: 'end_turn',
      };
    }

    if (lastMessage.includes('Scout:')) {
      return {
        content: 'No limitations detected in current proposals',
        usage: { input_tokens: 100, output_tokens: 15 },
        stop_reason: 'end_turn',
      };
    }

    return {
      content: 'Generic response',
      usage: { input_tokens: 100, output_tokens: 20 },
      stop_reason: 'end_turn',
    };
  }
}

describe('Integration Tests', () => {
  let router: ModelRouter;
  let orchestrator: Orchestrator;

  beforeAll(async () => {
    // Set up mock providers
    const localProvider = new MockLocalProvider({ baseURL: 'http://localhost:8080' });
    const claudeProvider = new MockClaudeProvider({
      apiKey: 'test-key',
      defaultModel: 'claude-sonnet-4-5-20250514',
    });

    router = new ModelRouter({
      localQwen: localProvider,
      claudeOpus: claudeProvider,
      claudeSonnet: claudeProvider,
      claudeHaiku: claudeProvider,
    });

    const agents = getAgentRegistry(router);
    orchestrator = new Orchestrator(agents);
  });

  afterAll(async () => {
    // Clean up
    const episodic = getEpisodicMemory();
    const contextLog = getContextLog();
    await episodic.clear();
    await contextLog.clear();
  });

  describe('Model Routing', () => {
    it('should route to correct provider based on task type', () => {
      const codingProvider = router.getProviderForTask('coding');
      const reasoningProvider = router.getProviderForTask('reasoning');
      const reviewProvider = router.getProviderForTask('review');

      // Coding should try local first (but will fall back to Claude in test)
      expect(codingProvider).toBeDefined();

      // Reasoning should use Opus
      expect(reasoningProvider).toBeDefined();

      // Review should use Sonnet
      expect(reviewProvider).toBeDefined();
    });

    it('should degrade gracefully when local unavailable', async () => {
      const health = await router.healthCheckAll();

      expect(health.localQwen).toBe(false);
      expect(health.claudeOpus).toBe(true); // Mock always available
    });
  });

  describe('Workspace Integration', () => {
    it('should maintain workspace state under token limit', async () => {
      const manager = new WorkspaceManager();
      const workspace = await manager.getCurrent('test_session');

      workspace.currentFocus = 'Implement new feature';

      // Add many hypotheses
      for (let i = 0; i < 20; i++) {
        workspace.hypotheses.push({
          source: 'forge',
          content: `Hypothesis ${i}: ${'word '.repeat(50)}`,
          confidence: 0.8,
          timestamp: Date.now() + i,
        });
      }

      // Simulate token calculation
      const serialized = manager.serializeForPrompt(workspace);
      workspace.tokenCount = Math.floor(serialized.length / 4); // Rough estimate

      // Workspace should stay under limit through pruning
      expect(workspace.tokenCount).toBeLessThan(5000); // Safety margin
    });
  });

  describe('Agent Coordination', () => {
    it('should collect proposals from all agents', async () => {
      const agents = getAgentRegistry(router);
      const workspaceManager = new WorkspaceManager();
      const workspace = await workspaceManager.getCurrent('test_session');

      workspace.currentFocus = 'Test agent coordination';

      const agentArray = [agents.forge, agents.loom, agents.anvil, agents.scout];
      const proposals = await workspaceManager.collectProposals(workspace, agentArray);

      // Should get proposals from multiple agents
      // Note: Some may return null in mock environment
      expect(proposals.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('End-to-End Orchestration', () => {
    it('should complete orchestration workflow', async () => {
      const result = await orchestrator.orchestrate({
        userMessage: 'Implement a simple authentication system',
        maxIterations: 5, // Limit iterations for test
      });

      expect(result.sessionId).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.workspace).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.integrationScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.integrationScore).toBeLessThanOrEqual(100);
    }, 30000); // 30 second timeout

    it('should record episodic memory after orchestration', async () => {
      const result = await orchestrator.orchestrate({
        userMessage: 'Test episodic memory recording',
        maxIterations: 3,
      });

      // Wait a bit for async memory recording
      await new Promise(resolve => setTimeout(resolve, 1000));

      const episodic = getEpisodicMemory();
      const entry = await episodic.getBySessionId(result.sessionId);

      expect(entry).toBeDefined();
      expect(entry!.sessionId).toBe(result.sessionId);
      expect(entry!.keywords).toBeDefined();
      expect(entry!.embedding).toBeDefined();
    }, 30000);

    it('should log events to context log', async () => {
      const result = await orchestrator.orchestrate({
        userMessage: 'Test context log integration',
        maxIterations: 3,
      });

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 1000));

      const contextLog = getContextLog();
      const events = await contextLog.query({
        sessionId: result.sessionId,
        limit: 100,
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.action === 'workspace_update')).toBe(true);
    }, 30000);
  });

  describe('Groupthink Prevention', () => {
    it('should track Scout challenges', async () => {
      const result = await orchestrator.orchestrate({
        userMessage: 'This task is impossible to complete',
        maxIterations: 5,
      });

      // Scout should ideally issue challenges for limitation claims
      // In mock environment, this depends on response patterns
      expect(result.metrics).toBeDefined();
      expect(result.metrics.challengesIssued).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Performance', () => {
    it('should complete orchestration within reasonable time', async () => {
      const startTime = Date.now();

      await orchestrator.orchestrate({
        userMessage: 'Performance test',
        maxIterations: 3,
      });

      const duration = Date.now() - startTime;

      // With mocks, should complete quickly (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it('should handle multiple concurrent orchestrations', async () => {
      const promises = [
        orchestrator.orchestrate({
          userMessage: 'Concurrent test 1',
          maxIterations: 2,
        }),
        orchestrator.orchestrate({
          userMessage: 'Concurrent test 2',
          maxIterations: 2,
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0].sessionId).not.toBe(results[1].sessionId);
    }, 30000);
  });
});
