import React from 'react';

interface ModeToggleProps {
  reviewAvailable: boolean;
  chunkedAvailable: boolean;
  reviewEnabled: boolean;
  chunkedEnabled: boolean;
  onReviewChange: (enabled: boolean) => void;
  onChunkedChange: (enabled: boolean) => void;
}

/**
 * ModeToggle component provides UI controls for enabling/disabling review and chunked modes.
 * Only shows toggles for features that are available on the backend.
 */
export function ModeToggle({
  reviewAvailable,
  chunkedAvailable,
  reviewEnabled,
  chunkedEnabled,
  onReviewChange,
  onChunkedChange,
}: ModeToggleProps) {
  // Don't render if neither feature is available
  if (!reviewAvailable && !chunkedAvailable) {
    return null;
  }

  return (
    <div style={{
      padding: '8px 12px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      marginBottom: 8,
    }}>
      <div style={{
        fontWeight: 600,
        fontSize: 12,
        color: '#475569',
        marginBottom: 6,
      }}>
        Generation Modes
      </div>
      <div style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {reviewAvailable && (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontSize: 13,
            color: '#334155',
          }}>
            <input
              type="checkbox"
              checked={reviewEnabled}
              onChange={(e) => onReviewChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
              aria-label="Enable review mode"
            />
            <span>Review Mode</span>
            <span
              style={{
                fontSize: 11,
                color: '#64748b',
                fontStyle: 'italic',
              }}
              title="Automatically review and improve responses before delivery"
            >
              (iterative refinement)
            </span>
          </label>
        )}

        {chunkedAvailable && (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontSize: 13,
            color: '#334155',
          }}>
            <input
              type="checkbox"
              checked={chunkedEnabled}
              onChange={(e) => onChunkedChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
              aria-label="Enable chunked mode"
            />
            <span>Chunked Mode</span>
            <span
              style={{
                fontSize: 11,
                color: '#64748b',
                fontStyle: 'italic',
              }}
              title="Break down long responses into structured sections"
            >
              (structured sections)
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
