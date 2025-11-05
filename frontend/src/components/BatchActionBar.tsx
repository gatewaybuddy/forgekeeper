/**
 * Batch Action Bar Component
 *
 * Displays when tasks are selected, allows bulk approve/dismiss operations
 */

import React, { useState } from 'react';

interface BatchActionBarProps {
  selectedCount: number;
  onApproveSelected: () => Promise<void>;
  onDismissSelected: () => Promise<void>;
  onClearSelection: () => void;
}

export default function BatchActionBar({
  selectedCount,
  onApproveSelected,
  onDismissSelected,
  onClearSelection,
}: BatchActionBarProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [processing, setProcessing] = useState(false);

  if (selectedCount === 0) return null;

  async function handleApprove() {
    setProcessing(true);
    try {
      await onApproveSelected();
      setShowApproveConfirm(false);
    } finally {
      setProcessing(false);
    }
  }

  async function handleDismiss() {
    setProcessing(true);
    try {
      await onDismissSelected();
      setShowDismissConfirm(false);
      setDismissReason('');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      {/* Action Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#1f2937',
          padding: '16px 24px',
          boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>
            {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClearSelection}
            disabled={processing}
            style={{
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              background: '#4b5563',
              color: '#ffffff',
              opacity: processing ? 0.5 : 1,
            }}
          >
            Cancel
          </button>

          <button
            onClick={() => setShowDismissConfirm(true)}
            disabled={processing}
            style={{
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              background: '#ef4444',
              color: '#ffffff',
              opacity: processing ? 0.5 : 1,
            }}
          >
            ✕ Dismiss Selected ({selectedCount})
          </button>

          <button
            onClick={() => setShowApproveConfirm(true)}
            disabled={processing}
            style={{
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              background: '#10b981',
              color: '#ffffff',
              opacity: processing ? 0.5 : 1,
            }}
          >
            ✓ Approve Selected ({selectedCount})
          </button>
        </div>
      </div>

      {/* Approve Confirmation Modal */}
      {showApproveConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !processing && setShowApproveConfirm(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>
              Approve {selectedCount} {selectedCount === 1 ? 'Task' : 'Tasks'}?
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
              Are you sure you want to approve {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'}?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApproveConfirm(false)}
                disabled={processing}
                style={{
                  border: '1px solid #d1d5db',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  background: '#ffffff',
                  color: '#374151',
                  opacity: processing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={processing}
                style={{
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  background: '#10b981',
                  color: '#ffffff',
                  opacity: processing ? 0.5 : 1,
                }}
              >
                {processing ? 'Approving...' : `Approve ${selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss Confirmation Modal */}
      {showDismissConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !processing && setShowDismissConfirm(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>
              Dismiss {selectedCount} {selectedCount === 1 ? 'Task' : 'Tasks'}?
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
              Are you sure you want to dismiss {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'}?
              This action cannot be undone.
            </p>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Reason (optional)
              </label>
              <textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Why are these tasks being dismissed?"
                disabled={processing}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                  outline: 'none',
                  opacity: processing ? 0.5 : 1,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDismissConfirm(false);
                  setDismissReason('');
                }}
                disabled={processing}
                style={{
                  border: '1px solid #d1d5db',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  background: '#ffffff',
                  color: '#374151',
                  opacity: processing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDismiss}
                disabled={processing}
                style={{
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  background: '#ef4444',
                  color: '#ffffff',
                  opacity: processing ? 0.5 : 1,
                }}
              >
                {processing ? 'Dismissing...' : `Dismiss ${selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
