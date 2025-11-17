/**
 * useApprovalRequests - Hook for managing approval requests
 *
 * Features:
 * - Polls for pending approvals
 * - Provides approve/reject/modify functions
 * - Real-time updates
 * - Error handling
 *
 * Phase 8.1: T303
 */

import { useState, useEffect, useCallback } from 'react';

interface ApprovalRequest {
  id: string;
  timestamp: string;
  operation: string;
  context: {
    task: string;
    reasoning: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    alternatives?: string[];
  };
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'timeout';
  timeoutMs: number;
  convId?: string;
  traceId?: string;
}

interface UseApprovalRequestsOptions {
  pollingInterval?: number; // milliseconds
  enabled?: boolean;
  convId?: string;
}

interface UseApprovalRequestsReturn {
  pending: ApprovalRequest[];
  loading: boolean;
  error: string | null;
  approve: (requestId: string, feedback?: string) => Promise<void>;
  reject: (requestId: string, feedback?: string) => Promise<void>;
  modify: (requestId: string, modifications: Record<string, unknown>, feedback?: string) => Promise<void>;
  cancel: (requestId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useApprovalRequests(
  options: UseApprovalRequestsOptions = {}
): UseApprovalRequestsReturn {
  const {
    pollingInterval = 2000, // Poll every 2 seconds
    enabled = true,
    convId,
  } = options;

  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pending approvals
  const fetchPending = useCallback(async () => {
    if (!enabled) return;

    try {
      const url = convId
        ? `/api/autonomous/approval/pending?convId=${encodeURIComponent(convId)}`
        : '/api/autonomous/approval/pending';

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.ok) {
        setPending(data.pending || []);
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to fetch pending approvals');
      }
    } catch (err) {
      console.error('[useApprovalRequests] Fetch error:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [enabled, convId]);

  // Polling effect
  useEffect(() => {
    if (!enabled) {
      setPending([]);
      return;
    }

    // Initial fetch
    fetchPending();

    // Set up polling
    const interval = setInterval(fetchPending, pollingInterval);

    return () => clearInterval(interval);
  }, [enabled, pollingInterval, fetchPending]);

  // Approve a request
  const approve = useCallback(async (requestId: string, feedback?: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/autonomous/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          decision: 'approve',
          feedback,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Failed to approve request');
      }

      // Refresh pending list
      await fetchPending();
    } catch (err) {
      console.error('[useApprovalRequests] Approve error:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPending]);

  // Reject a request
  const reject = useCallback(async (requestId: string, feedback?: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/autonomous/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          decision: 'reject',
          feedback,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Failed to reject request');
      }

      // Refresh pending list
      await fetchPending();
    } catch (err) {
      console.error('[useApprovalRequests] Reject error:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPending]);

  // Modify a request
  const modify = useCallback(
    async (requestId: string, modifications: Record<string, unknown>, feedback?: string) => {
      setLoading(true);
      try {
        const response = await fetch('/api/autonomous/approval/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            decision: 'modify',
            modifications,
            feedback,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.ok) {
          throw new Error(data.message || 'Failed to modify request');
        }

        // Refresh pending list
        await fetchPending();
      } catch (err) {
        console.error('[useApprovalRequests] Modify error:', err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPending]
  );

  // Cancel a request
  const cancel = useCallback(async (requestId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/autonomous/approval/${requestId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || 'Failed to cancel request');
      }

      // Refresh pending list
      await fetchPending();
    } catch (err) {
      console.error('[useApprovalRequests] Cancel error:', err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchPending]);

  return {
    pending,
    loading,
    error,
    approve,
    reject,
    modify,
    cancel,
    refresh: fetchPending,
  };
}
