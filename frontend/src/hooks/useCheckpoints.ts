/**
 * useCheckpoints - React hook for managing decision checkpoints
 *
 * Features:
 * - Fetch waiting checkpoints
 * - Auto-polling for updates
 * - Resolve checkpoint with user selection
 * - Cancel checkpoint (auto-select recommendation)
 * - Filter by convId or type
 * - Get checkpoint statistics
 *
 * Phase 8.2: T305
 */

import { useState, useEffect, useCallback } from 'react';

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedEffort?: string;
  confidence?: number;
}

export interface DecisionCheckpoint {
  id: string;
  type: 'plan' | 'strategy' | 'parameter' | 'execution';
  title: string;
  description: string;
  options: DecisionOption[];
  recommendation: string;
  confidence: number;
  status: 'waiting' | 'resolved';
  timestamp: string;
  selectedOption?: string;
  reasoning?: string;
  convId?: string;
  traceId?: string;
}

export interface CheckpointStats {
  enabled: boolean;
  confidenceThreshold: number;
  total: number;
  waiting: number;
  resolved: number;
  recommendationAcceptanceRate: number;
  byType: {
    plan: number;
    strategy: number;
    parameter: number;
    execution: number;
  };
}

interface UseCheckpointsOptions {
  convId?: string;
  type?: 'plan' | 'strategy' | 'parameter' | 'execution';
  enabled?: boolean;
  pollingInterval?: number;
}

interface UseCheckpointsResult {
  waiting: DecisionCheckpoint[];
  stats: CheckpointStats | null;
  loading: boolean;
  error: string | null;
  resolve: (checkpointId: string, selectedOptionId: string, reasoning?: string) => Promise<void>;
  cancel: (checkpointId: string) => Promise<void>;
  getCheckpoint: (checkpointId: string) => Promise<DecisionCheckpoint | null>;
  refresh: () => Promise<void>;
}

export function useCheckpoints(options: UseCheckpointsOptions = {}): UseCheckpointsResult {
  const {
    convId,
    type,
    enabled = true,
    pollingInterval = 2000,
  } = options;

  const [waiting, setWaiting] = useState<DecisionCheckpoint[]>([]);
  const [stats, setStats] = useState<CheckpointStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch waiting checkpoints
  const fetchWaiting = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (convId) params.append('convId', convId);
      if (type) params.append('type', type);

      const response = await fetch(`/api/autonomous/checkpoint/waiting?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch checkpoints: ${response.statusText}`);
      }

      const data = await response.json();
      setWaiting(data.checkpoints || []);
    } catch (err) {
      console.error('Failed to fetch waiting checkpoints:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [enabled, convId, type]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    if (!enabled) return;

    try {
      const response = await fetch('/api/autonomous/checkpoint/stats');

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch checkpoint stats:', err);
    }
  }, [enabled]);

  // Resolve checkpoint
  const resolve = useCallback(
    async (checkpointId: string, selectedOptionId: string, reasoning?: string) => {
      try {
        setError(null);

        const response = await fetch('/api/autonomous/checkpoint/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkpointId,
            selectedOptionId,
            reasoning,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to resolve checkpoint: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to resolve checkpoint');
        }

        // Refresh waiting checkpoints
        await fetchWaiting();
        await fetchStats();
      } catch (err) {
        console.error('Failed to resolve checkpoint:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      }
    },
    [fetchWaiting, fetchStats]
  );

  // Cancel checkpoint
  const cancel = useCallback(
    async (checkpointId: string) => {
      try {
        setError(null);

        const response = await fetch(`/api/autonomous/checkpoint/${checkpointId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`Failed to cancel checkpoint: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to cancel checkpoint');
        }

        // Refresh waiting checkpoints
        await fetchWaiting();
        await fetchStats();
      } catch (err) {
        console.error('Failed to cancel checkpoint:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        throw err;
      }
    },
    [fetchWaiting, fetchStats]
  );

  // Get specific checkpoint
  const getCheckpoint = useCallback(async (checkpointId: string): Promise<DecisionCheckpoint | null> => {
    try {
      const response = await fetch(`/api/autonomous/checkpoint/${checkpointId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch checkpoint: ${response.statusText}`);
      }

      const data = await response.json();
      return data.checkpoint || null;
    } catch (err) {
      console.error('Failed to fetch checkpoint:', err);
      return null;
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    await Promise.all([fetchWaiting(), fetchStats()]);
  }, [fetchWaiting, fetchStats]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchWaiting();
    fetchStats();

    // Setup polling
    const interval = setInterval(() => {
      fetchWaiting();
      fetchStats();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [enabled, pollingInterval, fetchWaiting, fetchStats]);

  return {
    waiting,
    stats,
    loading,
    error,
    resolve,
    cancel,
    getCheckpoint,
    refresh,
  };
}
