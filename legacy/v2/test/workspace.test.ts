/**
 * Workspace Manager Tests
 * Tests for attention mechanism, proposal scoring, and pruning
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager, Workspace, Proposal } from '../src/workspace/manager.js';
import { calculateScore } from '../src/workspace/attention.js';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  let workspace: Workspace;

  beforeEach(() => {
    manager = new WorkspaceManager();
    workspace = {
      currentFocus: 'Implement authentication system',
      hypotheses: [],
      decisions: [],
      toolResults: new Map(),
      episodicMatches: [],
      pendingChallenges: [],
      tokenCount: 0,
      iteration: 0,
    };
  });

  describe('Proposal Scoring', () => {
    it('should score high relevance proposals higher', () => {
      const proposal: Proposal = {
        type: 'hypothesis',
        source: 'forge',
        content: 'Implement JWT authentication for secure user sessions',
        confidence: 0.8,
        empiricallyGrounded: false,
        isFinal: false,
      };

      const score = calculateScore(proposal, workspace);

      expect(score).toBeGreaterThan(0.5);
      // Relevance should dominate (40% weight)
    });

    it('should penalize low novelty proposals', () => {
      // Add existing hypothesis
      workspace.hypotheses.push({
        source: 'forge',
        content: 'Implement JWT authentication system',
        confidence: 0.9,
        timestamp: Date.now(),
      });

      // Similar proposal
      const proposal: Proposal = {
        type: 'hypothesis',
        source: 'loom',
        content: 'Implement JWT authentication system',
        confidence: 0.8,
        empiricallyGrounded: false,
        isFinal: false,
      };

      const score = calculateScore(proposal, workspace);

      expect(score).toBeLessThan(0.6);
      // Low novelty should reduce score
    });

    it('should boost empirically grounded proposals', () => {
      const proposal: Proposal = {
        type: 'hypothesis',
        source: 'scout',
        content: 'Authentication test passed successfully',
        confidence: 0.9,
        empiricallyGrounded: true,
        isFinal: false,
      };

      const score = calculateScore(proposal, workspace);

      expect(score).toBeGreaterThan(0.7);
      // Empirical grounding adds 10% boost
    });

    it('should prioritize challenge proposals', () => {
      const challenge: Proposal = {
        type: 'challenge',
        source: 'scout',
        content: 'Prove that authentication cannot be implemented',
        confidence: 0.8,
        empiricallyGrounded: false,
        isFinal: false,
      };

      const hypothesis: Proposal = {
        type: 'hypothesis',
        source: 'forge',
        content: 'Implement authentication',
        confidence: 0.8,
        empiricallyGrounded: false,
        isFinal: false,
      };

      const challengeScore = calculateScore(challenge, workspace);
      const hypothesisScore = calculateScore(hypothesis, workspace);

      expect(challengeScore).toBeGreaterThan(hypothesisScore);
      // Challenges get priority boost
    });
  });

  describe('Workspace Pruning', () => {
    it('should prune when token count exceeds limit', async () => {
      // Fill workspace with hypotheses
      for (let i = 0; i < 10; i++) {
        workspace.hypotheses.push({
          source: 'forge',
          content: `Hypothesis ${i}: ${'word '.repeat(100)}`,
          confidence: 0.8,
          timestamp: Date.now() + i,
        });
      }

      // Simulate high token count
      workspace.tokenCount = 5000; // Exceeds 4000 limit

      const scored = [{
        ...workspace.hypotheses[0],
        type: 'hypothesis' as const,
        confidence: 0.9,
        empiricallyGrounded: false,
        isFinal: false,
        score: 0.8,
      }];

      // Apply update should trigger pruning
      await manager.applyUpdate(scored[0], workspace, 'test_session');

      expect(workspace.tokenCount).toBeLessThan(4000);
    });

    it('should remove oldest entries first', async () => {
      const old = {
        source: 'forge',
        content: 'Old hypothesis',
        confidence: 0.8,
        timestamp: Date.now() - 10000,
      };

      const recent = {
        source: 'loom',
        content: 'Recent hypothesis',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      workspace.hypotheses.push(old, recent);
      workspace.tokenCount = 5000;

      const newProposal = {
        type: 'hypothesis' as const,
        source: 'anvil',
        content: 'New hypothesis',
        confidence: 0.9,
        empiricallyGrounded: false,
        isFinal: false,
        score: 0.8,
      };

      await manager.applyUpdate(newProposal, workspace, 'test_session');

      // Old hypothesis should be removed
      expect(workspace.hypotheses.find(h => h.content === old.content)).toBeUndefined();
      expect(workspace.hypotheses.find(h => h.content === recent.content)).toBeDefined();
    });
  });

  describe('Proposal Selection', () => {
    it('should select highest scoring proposal that fits capacity', () => {
      const proposals = [
        {
          type: 'hypothesis' as const,
          source: 'forge',
          content: 'Low score proposal',
          confidence: 0.5,
          empiricallyGrounded: false,
          isFinal: false,
          score: 0.3,
        },
        {
          type: 'hypothesis' as const,
          source: 'loom',
          content: 'High score proposal',
          confidence: 0.9,
          empiricallyGrounded: true,
          isFinal: false,
          score: 0.9,
        },
      ];

      const winner = manager.selectWinner(proposals, workspace);

      expect(winner).toBeDefined();
      expect(winner!.score).toBe(0.9);
      expect(winner!.source).toBe('loom');
    });

    it('should return null if no proposal fits capacity', () => {
      // Fill workspace to near capacity
      workspace.tokenCount = 3900;

      const proposals = [
        {
          type: 'hypothesis' as const,
          source: 'forge',
          content: 'word '.repeat(500), // Very large proposal
          confidence: 0.9,
          empiricallyGrounded: false,
          isFinal: false,
          score: 0.9,
        },
      ];

      const winner = manager.selectWinner(proposals, workspace);

      // Should reject if it would exceed capacity
      expect(winner).toBeNull();
    });
  });

  describe('Parallel Proposal Collection', () => {
    it('should collect proposals from all agents in parallel', async () => {
      const mockAgents = [
        {
          name: 'forge',
          proposeUpdate: async () => ({
            type: 'hypothesis' as const,
            source: 'forge',
            content: 'Forge proposal',
            confidence: 0.8,
            empiricallyGrounded: false,
            isFinal: false,
          }),
        },
        {
          name: 'loom',
          proposeUpdate: async () => ({
            type: 'hypothesis' as const,
            source: 'loom',
            content: 'Loom proposal',
            confidence: 0.8,
            empiricallyGrounded: false,
            isFinal: false,
          }),
        },
      ];

      const proposals = await manager.collectProposals(workspace, mockAgents as any);

      expect(proposals).toHaveLength(2);
      expect(proposals.some(p => p.source === 'forge')).toBe(true);
      expect(proposals.some(p => p.source === 'loom')).toBe(true);
    });

    it('should handle agent failures gracefully', async () => {
      const mockAgents = [
        {
          name: 'forge',
          proposeUpdate: async () => ({
            type: 'hypothesis' as const,
            source: 'forge',
            content: 'Forge proposal',
            confidence: 0.8,
            empiricallyGrounded: false,
            isFinal: false,
          }),
        },
        {
          name: 'loom',
          proposeUpdate: async () => {
            throw new Error('Agent failure');
          },
        },
      ];

      const proposals = await manager.collectProposals(workspace, mockAgents as any);

      // Should still get proposal from working agent
      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals.some(p => p.source === 'forge')).toBe(true);
    });
  });
});
