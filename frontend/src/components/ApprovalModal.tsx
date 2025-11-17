/**
 * ApprovalModal - Human-in-the-loop approval for critical autonomous operations
 *
 * Features:
 * - Real-time approval request display
 * - Risk level visualization with color coding
 * - Operation context and reasoning
 * - Alternative suggestions
 * - Keyboard shortcuts (A=approve, R=reject, M=modify)
 * - Modification interface
 * - Countdown timer
 * - Sound notifications (optional)
 *
 * Phase 8.1: T303
 */

import React, { useState, useEffect, useCallback } from 'react';

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

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  onApprove: (requestId: string, feedback?: string) => void;
  onReject: (requestId: string, feedback?: string) => void;
  onModify: (requestId: string, modifications: Record<string, unknown>, feedback?: string) => void;
  onCancel: (requestId: string) => void;
  soundEnabled?: boolean;
}

const RISK_COLORS = {
  low: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

const RISK_ICONS = {
  low: '✓',
  medium: '⚠',
  high: '⚠️',
  critical: '🚨',
};

export function ApprovalModal({
  request,
  onApprove,
  onReject,
  onModify,
  onCancel,
  soundEnabled = false,
}: ApprovalModalProps) {
  const [feedback, setFeedback] = useState('');
  const [showModify, setShowModify] = useState(false);
  const [modifications, setModifications] = useState<Record<string, unknown>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [soundPlayed, setSoundPlayed] = useState(false);

  // Calculate time remaining
  useEffect(() => {
    if (!request) {
      setTimeRemaining(0);
      return;
    }

    const startTime = new Date(request.timestamp).getTime();
    const endTime = startTime + request.timeoutMs;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0) {
        // Timeout occurred
        clearInterval(interval);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [request]);

  // Play notification sound when new request appears
  useEffect(() => {
    if (request && soundEnabled && !soundPlayed) {
      // Play a simple beep sound
      try {
        const audioContext = new (window.AudioContext || (window as  any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        setSoundPlayed(true);
      } catch (e) {
        console.warn('[ApprovalModal] Could not play sound:', e);
      }
    }

    if (!request) {
      setSoundPlayed(false);
    }
  }, [request, soundEnabled, soundPlayed]);

  // Keyboard shortcuts
  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (!request) return;

      // Only respond to shortcuts if not typing in a text field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          handleApprove();
          break;
        case 'r':
          e.preventDefault();
          handleReject();
          break;
        case 'm':
          e.preventDefault();
          setShowModify(!showModify);
          break;
        case 'escape':
          e.preventDefault();
          if (showModify) {
            setShowModify(false);
          }
          break;
      }
    },
    [request, showModify]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  const handleApprove = () => {
    if (!request) return;
    onApprove(request.id, feedback || undefined);
    setFeedback('');
    setShowModify(false);
  };

  const handleReject = () => {
    if (!request) return;
    onReject(request.id, feedback || undefined);
    setFeedback('');
    setShowModify(false);
  };

  const handleModifySubmit = () => {
    if (!request) return;
    onModify(request.id, modifications, feedback || undefined);
    setFeedback('');
    setModifications({});
    setShowModify(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!request) {
    return null;
  }

  const riskColor = RISK_COLORS[request.context.impact];
  const riskIcon = RISK_ICONS[request.context.impact];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Approval Required</h2>
              <p className="text-sm text-gray-500 mt-1">
                Operation: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{request.operation}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Timer */}
              <div className={`text-sm font-mono ${timeRemaining < 60 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                {formatTime(timeRemaining)}
              </div>
              {/* Risk Badge */}
              <div className={`px-3 py-1 rounded-full text-sm font-medium border ${riskColor}`}>
                {riskIcon} {request.context.impact.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Task */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Task</h3>
            <p className="text-gray-900">{request.context.task}</p>
          </div>

          {/* Reasoning */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Reasoning</h3>
            <p className="text-gray-900">{request.context.reasoning}</p>
          </div>

          {/* Alternatives */}
          {request.context.alternatives && request.context.alternatives.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Alternatives</h3>
              <ul className="list-disc list-inside space-y-1">
                {request.context.alternatives.map((alt, idx) => (
                  <li key={idx} className="text-gray-900">
                    {alt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback */}
          <div>
            <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
              Feedback (Optional)
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add any comments or feedback..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Modification Interface */}
          {showModify && (
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Modifications</h3>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Modify the operation parameters below:
                </p>
                <textarea
                  value={JSON.stringify(modifications, null, 2)}
                  onChange={(e) => {
                    try {
                      setModifications(JSON.parse(e.target.value));
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  placeholder='{"key": "value"}'
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                  rows={6}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 sticky bottom-0">
          <div className="flex items-center justify-between">
            {/* Keyboard Hints */}
            <div className="text-xs text-gray-500 space-x-3">
              <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">A</kbd> Approve</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">R</kbd> Reject</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">M</kbd> Modify</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {showModify ? (
                <>
                  <button
                    onClick={() => setShowModify(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel Modify
                  </button>
                  <button
                    onClick={handleModifySubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Submit Modifications
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleReject}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setShowModify(true)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Modify
                  </button>
                  <button
                    onClick={handleApprove}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
