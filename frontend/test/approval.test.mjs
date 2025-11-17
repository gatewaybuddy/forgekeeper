/**
 * Unit Tests for Approval System (T301)
 *
 * Tests the approval request/response workflow, queue management,
 * and ContextLog integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestApproval,
  respondToApproval,
  getPendingApprovals,
  getApprovalRequest,
  cancelApprovalRequest,
  getApprovalStats,
  cleanupOldRequests,
} from '../server.approval.mjs';

describe('Approval System (T301)', () => {
  beforeEach(() => {
    // Enable collaboration for tests
    process.env.AUTONOMOUS_ENABLE_COLLABORATION = '1';
  });

  describe('Request Approval', () => {
    it('should create and queue an approval request', async () => {
      const operation = 'git_commit';
      const context = {
        task: 'Commit changes to production',
        reasoning: 'All tests passing, ready to commit',
        impact: 'high',
        alternatives: ['Create PR instead', 'Defer commit'],
      };

      // Request approval with short timeout for testing
      const requestPromise = requestApproval(operation, context, {
        timeoutMs: 5000,
        convId: 'test-conv-1',
        traceId: 'test-trace-1',
      });

      // Check it's in pending queue
      const pending = getPendingApprovals();
      expect(pending.length).toBeGreaterThan(0);

      const request = pending[0];
      expect(request.operation).toBe(operation);
      expect(request.context.task).toBe(context.task);
      expect(request.status).toBe('pending');

      // Approve it
      const approved = respondToApproval(request.id, 'approve', {
        feedback: 'Looks good, proceed',
      });
      expect(approved).toBe(true);

      // Wait for promise to resolve
      const response = await requestPromise;
      expect(response.decision).toBe('approve');
      expect(response.feedback).toBe('Looks good, proceed');
    });

    it('should timeout if no response received', async () => {
      const operation = 'file_delete';
      const context = {
        task: 'Delete old files',
        reasoning: 'Cleanup required',
        impact: 'medium',
      };

      // Request with very short timeout
      const requestPromise = requestApproval(operation, context, {
        timeoutMs: 100, // 100ms
        convId: 'test-conv-timeout',
      });

      // Don't respond - let it timeout
      await expect(requestPromise).rejects.toThrow('timed out');

      // Check it's marked as timeout
      const stats = getApprovalStats();
      expect(stats.timeout).toBeGreaterThan(0);
    });

    it('should handle approval with modifications', async () => {
      const operation = 'deploy';
      const context = {
        task: 'Deploy to production',
        reasoning: 'New features ready',
        impact: 'critical',
      };

      const requestPromise = requestApproval(operation, context, {
        timeoutMs: 5000,
        convId: 'test-conv-modify',
      });

      const pending = getPendingApprovals({ convId: 'test-conv-modify' });
      expect(pending.length).toBe(1);

      const request = pending[0];
      const modified = respondToApproval(request.id, 'modify', {
        feedback: 'Deploy to staging first',
        modifications: {
          environment: 'staging',
        },
      });
      expect(modified).toBe(true);

      const response = await requestPromise;
      expect(response.decision).toBe('modify');
      expect(response.modifications.environment).toBe('staging');
    });

    it('should handle rejection', async () => {
      const operation = 'database_drop';
      const context = {
        task: 'Drop test database',
        reasoning: 'Cleanup',
        impact: 'high',
      };

      const requestPromise = requestApproval(operation, context, {
        timeoutMs: 5000,
        convId: 'test-conv-reject',
      });

      const pending = getPendingApprovals({ convId: 'test-conv-reject' });
      const request = pending[0];

      const rejected = respondToApproval(request.id, 'reject', {
        feedback: 'Too risky, manual review needed',
      });
      expect(rejected).toBe(true);

      const response = await requestPromise;
      expect(response.decision).toBe('reject');
      expect(response.feedback).toBe('Too risky, manual review needed');
    });
  });

  describe('Queue Management', () => {
    it('should get pending approvals', async () => {
      const context = {
        task: 'Test operation',
        reasoning: 'Testing',
        impact: 'low',
      };

      // Create multiple requests
      const req1 = requestApproval('op1', context, { timeoutMs: 5000, convId: 'conv-a' });
      const req2 = requestApproval('op2', context, { timeoutMs: 5000, convId: 'conv-a' });
      const req3 = requestApproval('op3', context, { timeoutMs: 5000, convId: 'conv-b' });

      // Get all pending
      const allPending = getPendingApprovals();
      expect(allPending.length).toBeGreaterThanOrEqual(3);

      // Get pending for specific conversation
      const convAPending = getPendingApprovals({ convId: 'conv-a' });
      expect(convAPending.length).toBeGreaterThanOrEqual(2);

      // Cleanup - approve all
      for (const req of allPending) {
        respondToApproval(req.id, 'approve');
      }

      await Promise.allSettled([req1, req2, req3]);
    });

    it('should get specific approval request by ID', async () => {
      const context = {
        task: 'Specific test',
        reasoning: 'Testing get by ID',
        impact: 'low',
      };

      const requestPromise = requestApproval('test_op', context, { timeoutMs: 5000 });

      const pending = getPendingApprovals();
      const requestId = pending[pending.length - 1].id;

      const request = getApprovalRequest(requestId);
      expect(request).toBeDefined();
      expect(request.id).toBe(requestId);
      expect(request.operation).toBe('test_op');

      // Cleanup
      respondToApproval(requestId, 'approve');
      await requestPromise;
    });

    it('should cancel pending approval request', async () => {
      const context = {
        task: 'Cancellable operation',
        reasoning: 'Testing cancellation',
        impact: 'low',
      };

      const requestPromise = requestApproval('cancel_test', context, { timeoutMs: 5000 });

      const pending = getPendingApprovals();
      const requestId = pending[pending.length - 1].id;

      const cancelled = cancelApprovalRequest(requestId);
      expect(cancelled).toBe(true);

      // Request promise should reject
      await expect(requestPromise).rejects.toThrow('cancelled');

      // Should no longer be in pending queue
      const request = getApprovalRequest(requestId);
      expect(request.status).toBe('rejected');
    });
  });

  describe('Statistics', () => {
    it('should track approval statistics', async () => {
      const context = {
        task: 'Stats test',
        reasoning: 'Testing stats',
        impact: 'low',
      };

      const initialStats = getApprovalStats();

      // Create and approve a request
      const req1 = requestApproval('stats_op1', context, { timeoutMs: 5000 });
      const pending1 = getPendingApprovals();
      respondToApproval(pending1[pending1.length - 1].id, 'approve');
      await req1;

      // Create and reject a request
      const req2 = requestApproval('stats_op2', context, { timeoutMs: 5000 });
      const pending2 = getPendingApprovals();
      respondToApproval(pending2[pending2.length - 1].id, 'reject');
      await req2;

      const finalStats = getApprovalStats();
      expect(finalStats.approved).toBeGreaterThan(initialStats.approved);
      expect(finalStats.rejected).toBeGreaterThan(initialStats.rejected);
      expect(finalStats.enabled).toBe(true);
    });
  });

  describe('Auto-Approval (Collaboration Disabled)', () => {
    it('should auto-approve when collaboration is disabled', async () => {
      // Disable collaboration
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '0';

      const context = {
        task: 'Auto-approve test',
        reasoning: 'Testing auto-approval',
        impact: 'high',
      };

      const response = await requestApproval('auto_op', context, { timeoutMs: 5000 });

      expect(response.decision).toBe('approve');
      expect(response.requestId).toBe('auto-approved');
      expect(response.feedback).toContain('auto-approved');

      // Re-enable for other tests
      process.env.AUTONOMOUS_ENABLE_COLLABORATION = '1';
    });
  });

  describe('Error Handling', () => {
    it('should reject response to non-existent request', () => {
      const success = respondToApproval('non-existent-id', 'approve');
      expect(success).toBe(false);
    });

    it('should not allow double-response to same request', async () => {
      const context = {
        task: 'Double response test',
        reasoning: 'Testing double response',
        impact: 'low',
      };

      const requestPromise = requestApproval('double_test', context, { timeoutMs: 5000 });

      const pending = getPendingApprovals();
      const requestId = pending[pending.length - 1].id;

      // First response should succeed
      const firstResponse = respondToApproval(requestId, 'approve');
      expect(firstResponse).toBe(true);

      await requestPromise;

      // Second response should fail
      const secondResponse = respondToApproval(requestId, 'reject');
      expect(secondResponse).toBe(false);
    });

    it('should not cancel already-resolved request', async () => {
      const context = {
        task: 'Cancel resolved test',
        reasoning: 'Testing cancel after resolve',
        impact: 'low',
      };

      const requestPromise = requestApproval('cancel_resolved', context, { timeoutMs: 5000 });

      const pending = getPendingApprovals();
      const requestId = pending[pending.length - 1].id;

      // Approve it first
      respondToApproval(requestId, 'approve');
      await requestPromise;

      // Try to cancel - should fail
      const cancelled = cancelApprovalRequest(requestId);
      expect(cancelled).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old completed requests', async () => {
      const context = {
        task: 'Cleanup test',
        reasoning: 'Testing cleanup',
        impact: 'low',
      };

      // Create and immediately resolve a request
      const requestPromise = requestApproval('cleanup_test', context, { timeoutMs: 5000 });
      const pending = getPendingApprovals();
      const requestId = pending[pending.length - 1].id;

      respondToApproval(requestId, 'approve');
      await requestPromise;

      // Cleanup requests older than 0ms (all completed requests)
      const cleared = cleanupOldRequests(0);
      expect(cleared).toBeGreaterThanOrEqual(1);

      // Request should no longer exist
      const request = getApprovalRequest(requestId);
      expect(request).toBeUndefined();
    });
  });
});
