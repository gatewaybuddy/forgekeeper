/**
 * CheckpointModal - Display decision checkpoint and capture user selection
 *
 * Features:
 * - Display checkpoint with title, description, and options
 * - Show pros/cons/risk/effort for each option
 * - Highlight recommended option
 * - Confidence indicator
 * - Reasoning input for selection
 * - Keyboard shortcuts (1-5 for options, Enter to confirm)
 * - Countdown timer
 * - Sound notification
 *
 * Phase 8.2: T305
 */

import React, { useState, useEffect, useCallback } from 'react';

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
  convId?: string;
  traceId?: string;
}

interface CheckpointModalProps {
  checkpoint: DecisionCheckpoint;
  onResolve: (checkpointId: string, selectedOptionId: string, reasoning?: string) => Promise<void>;
  onCancel: (checkpointId: string) => Promise<void>;
  soundEnabled?: boolean;
}

const RISK_COLORS = {
  low: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high: 'bg-red-100 text-red-800 border-red-300',
};

const RISK_ICONS = {
  low: '✓',
  medium: '⚠',
  high: '⚠️',
};

const TYPE_LABELS = {
  plan: 'Plan Decision',
  strategy: 'Strategy Choice',
  parameter: 'Parameter Selection',
  execution: 'Execution Approval',
};

const TYPE_COLORS = {
  plan: 'bg-blue-100 text-blue-800',
  strategy: 'bg-purple-100 text-purple-800',
  parameter: 'bg-indigo-100 text-indigo-800',
  execution: 'bg-orange-100 text-orange-800',
};

export function CheckpointModal({
  checkpoint,
  onResolve,
  onCancel,
  soundEnabled = false,
}: CheckpointModalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Initialize with recommendation
  useEffect(() => {
    if (checkpoint) {
      setSelectedOption(checkpoint.recommendation);
      setReasoning('');
      setShowReasoning(false);
      setSubmitting(false);
    }
  }, [checkpoint]);

  // Countdown timer (5 minutes)
  useEffect(() => {
    if (!checkpoint) return;

    const createdTime = new Date(checkpoint.timestamp).getTime();
    const duration = 5 * 60 * 1000; // 5 minutes
    const endTime = createdTime + duration;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0 && !submitting) {
        // Auto-cancel when time expires
        handleCancel();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [checkpoint, submitting]);

  // Sound notification
  useEffect(() => {
    if (!checkpoint || !soundEnabled) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (err) {
      console.warn('Audio notification failed:', err);
    }
  }, [checkpoint, soundEnabled]);

  // Keyboard shortcuts
  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (!checkpoint || submitting) return;

      // Number keys 1-5 select options
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= checkpoint.options.length) {
        setSelectedOption(checkpoint.options[num - 1].id);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'enter':
          if (selectedOption && !showReasoning) {
            handleConfirm();
          }
          break;
        case 'r':
          setShowReasoning(!showReasoning);
          break;
        case 'escape':
          handleCancel();
          break;
      }
    },
    [checkpoint, selectedOption, showReasoning, submitting]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  const handleConfirm = async () => {
    if (!selectedOption || submitting) return;

    setSubmitting(true);
    try {
      await onResolve(checkpoint.id, selectedOption, reasoning.trim() || undefined);
    } catch (err) {
      console.error('Failed to resolve checkpoint:', err);
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      await onCancel(checkpoint.id);
    } catch (err) {
      console.error('Failed to cancel checkpoint:', err);
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const recommendedOption = checkpoint.options.find((opt) => opt.id === checkpoint.recommendation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[checkpoint.type]}`}>
                  {TYPE_LABELS[checkpoint.type]}
                </span>
                <span className={`text-sm font-medium ${getConfidenceColor(checkpoint.confidence)}`}>
                  {(checkpoint.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">{checkpoint.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{checkpoint.description}</p>
            </div>
            <div className="ml-4 flex flex-col items-end gap-1">
              <div className="text-lg font-mono font-semibold text-gray-900">
                {formatTime(timeRemaining)}
              </div>
              <div className="text-xs text-gray-500">remaining</div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {checkpoint.options.map((option, idx) => {
              const isSelected = selectedOption === option.id;
              const isRecommended = option.id === checkpoint.recommendation;

              return (
                <div
                  key={option.id}
                  onClick={() => setSelectedOption(option.id)}
                  className={`
                    border-2 rounded-lg p-4 cursor-pointer transition-all
                    ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}
                  `}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium
                        ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}
                      `}>
                        {idx + 1}
                      </div>
                      <h3 className="font-semibold text-gray-900">{option.label}</h3>
                      {isRecommended && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {option.estimatedEffort && (
                        <span className="text-xs text-gray-500">Est: {option.estimatedEffort}</span>
                      )}
                      <span className={`px-2 py-0.5 border rounded text-xs font-medium ${RISK_COLORS[option.riskLevel]}`}>
                        {RISK_ICONS[option.riskLevel]} {option.riskLevel}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mb-3">{option.description}</p>

                  <div className="grid grid-cols-2 gap-4">
                    {option.pros.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-green-700 mb-1">Pros</h4>
                        <ul className="text-xs text-gray-600 space-y-0.5">
                          {option.pros.map((pro, i) => (
                            <li key={i} className="flex items-start">
                              <span className="text-green-600 mr-1">+</span>
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {option.cons.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-red-700 mb-1">Cons</h4>
                        <ul className="text-xs text-gray-600 space-y-0.5">
                          {option.cons.map((con, i) => (
                            <li key={i} className="flex items-start">
                              <span className="text-red-600 mr-1">-</span>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reasoning Input */}
          {showReasoning && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reasoning (optional)
              </label>
              <textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder="Why did you choose this option?"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">1-{checkpoint.options.length}</kbd> Select option
              {' · '}
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">R</kbd> Add reasoning
              {' · '}
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">Enter</kbd> Confirm
              {' · '}
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">Esc</kbd> Cancel
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                disabled={submitting}
              >
                {showReasoning ? 'Hide' : 'Add'} Reasoning
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                disabled={submitting}
              >
                Cancel (auto-select)
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedOption || submitting}
                className={`
                  px-6 py-2 rounded font-medium text-white transition-colors
                  ${selectedOption && !submitting
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-300 cursor-not-allowed'}
                `}
              >
                {submitting ? 'Confirming...' : 'Confirm Selection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
