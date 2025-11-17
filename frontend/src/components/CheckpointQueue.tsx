/**
 * CheckpointQueue - Display and manage pending decision checkpoints
 *
 * Features:
 * - List of waiting checkpoints
 * - Quick view/select actions
 * - Confidence indicators
 * - Type/risk badges
 * - Auto-refresh
 * - Empty state
 * - Statistics display
 *
 * Phase 8.2: T305
 */

import React, { useState } from 'react';
import { useCheckpoints } from '../hooks/useCheckpoints';
import { CheckpointModal } from './CheckpointModal';

interface CheckpointQueueProps {
  convId?: string;
  className?: string;
  soundEnabled?: boolean;
}

const TYPE_LABELS = {
  plan: 'Plan',
  strategy: 'Strategy',
  parameter: 'Parameter',
  execution: 'Execution',
};

const TYPE_COLORS = {
  plan: 'bg-blue-100 text-blue-800',
  strategy: 'bg-purple-100 text-purple-800',
  parameter: 'bg-indigo-100 text-indigo-800',
  execution: 'bg-orange-100 text-orange-800',
};

const CONFIDENCE_COLORS = {
  high: 'text-green-600',
  medium: 'text-yellow-600',
  low: 'text-red-600',
};

export function CheckpointQueue({
  convId,
  className = '',
  soundEnabled = false,
}: CheckpointQueueProps) {
  const { waiting, stats, loading, error, resolve, cancel } = useCheckpoints({
    convId,
    enabled: true,
    pollingInterval: 2000,
  });

  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);

  const currentCheckpoint = waiting.find((cp) => cp.id === selectedCheckpoint);

  const handleResolve = async (
    checkpointId: string,
    selectedOptionId: string,
    reasoning?: string
  ) => {
    try {
      await resolve(checkpointId, selectedOptionId, reasoning);
      setSelectedCheckpoint(null);
    } catch (err) {
      console.error('Failed to resolve checkpoint:', err);
    }
  };

  const handleCancel = async (checkpointId: string) => {
    try {
      await cancel(checkpointId);
      setSelectedCheckpoint(null);
    } catch (err) {
      console.error('Failed to cancel checkpoint:', err);
    }
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getConfidenceLevel = (confidence: number): 'high' | 'medium' | 'low' => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          Decision Checkpoints
          {waiting.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">
              {waiting.length}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {stats && stats.enabled && (
            <div className="text-xs text-gray-500">
              Acceptance: {stats.recommendationAcceptanceRate}%
            </div>
          )}
          {loading && (
            <div className="text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-l-4 border-red-400">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Statistics Bar */}
      {stats && stats.enabled && waiting.length === 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-gray-600">Total: {stats.total}</span>
              <span className="text-gray-600">Resolved: {stats.resolved}</span>
              <span className="text-gray-600">Threshold: {(stats.confidenceThreshold * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-700">Plan: {stats.byType.plan}</span>
              <span className="text-purple-700">Strategy: {stats.byType.strategy}</span>
              <span className="text-indigo-700">Parameter: {stats.byType.parameter}</span>
              <span className="text-orange-700">Execution: {stats.byType.execution}</span>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {waiting.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No pending checkpoints</h3>
            <p className="text-sm text-gray-500">
              {stats?.enabled
                ? 'The agent will pause for your input when confidence is low'
                : 'Checkpoints are currently disabled'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {waiting.map((checkpoint) => {
              const confidenceLevel = getConfidenceLevel(checkpoint.confidence);
              const recommendedOption = checkpoint.options.find(
                (opt) => opt.id === checkpoint.recommendation
              );

              return (
                <li
                  key={checkpoint.id}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedCheckpoint(checkpoint.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Type and Confidence */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[checkpoint.type]}`}
                        >
                          {TYPE_LABELS[checkpoint.type]}
                        </span>
                        <span className={`text-xs font-medium ${CONFIDENCE_COLORS[confidenceLevel]}`}>
                          {(checkpoint.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>

                      {/* Title */}
                      <p className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                        {checkpoint.title}
                      </p>

                      {/* Options Count and Recommendation */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                        <span>{checkpoint.options.length} options</span>
                        {recommendedOption && (
                          <span className="text-green-600">
                            Recommends: {recommendedOption.label}
                          </span>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatTimeAgo(checkpoint.timestamp)}</span>
                        {checkpoint.convId && (
                          <span className="truncate">Conv: {checkpoint.convId.slice(0, 8)}...</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action */}
                    <div className="ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCheckpoint(checkpoint.id);
                        }}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Review and Decide"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal */}
      {currentCheckpoint && (
        <CheckpointModal
          checkpoint={currentCheckpoint}
          onResolve={handleResolve}
          onCancel={handleCancel}
          soundEnabled={soundEnabled}
        />
      )}
    </div>
  );
}
