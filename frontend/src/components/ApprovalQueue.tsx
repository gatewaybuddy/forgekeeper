/**
 * ApprovalQueue - Display and manage pending approval requests
 *
 * Features:
 * - List of pending approvals
 * - Quick approve/reject actions
 * - Risk level indicators
 * - Auto-refresh
 * - Empty state
 *
 * Phase 8.1: T303
 */

import React, { useState } from 'react';
import { useApprovalRequests } from '../hooks/useApprovalRequests';
import { ApprovalModal } from './ApprovalModal';

interface ApprovalQueueProps {
  convId?: string;
  className?: string;
  soundEnabled?: boolean;
}

const RISK_COLORS = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const RISK_ICONS = {
  low: '✓',
  medium: '⚠',
  high: '⚠️',
  critical: '🚨',
};

export function ApprovalQueue({ convId, className = '', soundEnabled = false }: ApprovalQueueProps) {
  const { pending, loading, error, approve, reject, modify, cancel } = useApprovalRequests({
    convId,
    enabled: true,
    pollingInterval: 2000,
  });

  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);

  const currentRequest = pending.find((req) => req.id === selectedRequest);

  const handleApprove = async (requestId: string, feedback?: string) => {
    try {
      await approve(requestId, feedback);
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async (requestId: string, feedback?: string) => {
    try {
      await reject(requestId, feedback);
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const handleModify = async (
    requestId: string,
    modifications: Record<string, unknown>,
    feedback?: string
  ) => {
    try {
      await modify(requestId, modifications, feedback);
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to modify:', err);
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await cancel(requestId);
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to cancel:', err);
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

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Approvals
          {pending.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {pending.length}
            </span>
          )}
        </h2>
        {loading && (
          <div className="text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-l-4 border-red-400">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {pending.length === 0 ? (
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">No pending approvals</h3>
            <p className="text-sm text-gray-500">All caught up!</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {pending.map((request) => (
              <li
                key={request.id}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedRequest(request.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Operation */}
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {request.operation}
                      </code>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLORS[request.context.impact]}`}>
                        {RISK_ICONS[request.context.impact]} {request.context.impact}
                      </span>
                    </div>

                    {/* Task */}
                    <p className="text-sm text-gray-900 mb-1 line-clamp-1">{request.context.task}</p>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatTimeAgo(request.timestamp)}</span>
                      {request.convId && (
                        <span className="truncate">Conv: {request.convId.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(request.id);
                      }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Approve"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(request.id);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Reject"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal */}
      {currentRequest && (
        <ApprovalModal
          request={currentRequest}
          onApprove={handleApprove}
          onReject={handleReject}
          onModify={handleModify}
          onCancel={handleCancel}
          soundEnabled={soundEnabled}
        />
      )}
    </div>
  );
}
