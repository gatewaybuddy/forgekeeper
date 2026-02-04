/**
 * PlanApprovalModal - Two-Phase Mode Plan Review and Approval
 *
 * Displays the generated plan from Phase 1 and allows user to:
 * - Review the detailed plan
 * - Edit the plan before execution
 * - Approve to proceed to Phase 2
 * - Cancel to abort
 *
 * Features:
 * - Markdown rendering for plan content
 * - Editable text area with syntax highlighting
 * - Clear approval/cancel actions
 * - Visual indicators for phase status
 */

import React, { useState, useEffect } from 'react';

interface PlanApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: string;
  reasoning?: string | null;
  onApprove: (editedPlan: string | null) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function PlanApprovalModal({
  isOpen,
  onClose,
  plan,
  reasoning,
  onApprove,
  onCancel,
  loading = false,
}: PlanApprovalModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPlan, setEditedPlan] = useState(plan);

  // Reset edited plan when modal opens with new plan
  useEffect(() => {
    setEditedPlan(plan);
    setIsEditing(false);
  }, [plan]);

  if (!isOpen) return null;

  const handleApprove = () => {
    const finalPlan = isEditing && editedPlan !== plan ? editedPlan : null;
    onApprove(finalPlan);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedPlan(plan);
    onCancel();
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      // Save edits
      setIsEditing(false);
    } else {
      // Enter edit mode
      setIsEditing(true);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Two-Phase Mode: Plan Review
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Phase 1 - Review the generated plan before execution
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Phase indicator */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                This is Phase 1. Review the plan below, make edits if needed, then approve to proceed to Phase 2 (execution).
              </span>
            </div>
          </div>

          {/* Reasoning (if available) */}
          {reasoning && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Reasoning (Internal Analysis)
              </h3>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 whitespace-pre-wrap font-mono">
                {reasoning}
              </div>
            </div>
          )}

          {/* Plan content */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Generated Plan
              </h3>
              <button
                onClick={handleToggleEdit}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {isEditing ? '✓ Done Editing' : '✎ Edit Plan'}
              </button>
            </div>

            {isEditing ? (
              <textarea
                value={editedPlan}
                onChange={(e) => setEditedPlan(e.target.value)}
                className="w-full h-96 p-3 border border-gray-300 rounded-md font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Edit the plan here..."
              />
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                  {editedPlan}
                </pre>
              </div>
            )}
          </div>

          {/* Edit indicator */}
          {editedPlan !== plan && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-yellow-800">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                <span>You've edited the plan. The edited version will be used in Phase 2.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
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
                Executing...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Approve & Execute (Phase 2)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
