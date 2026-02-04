import React from 'react';

interface ProgressIndicatorProps {
  mode: 'review' | 'chunked';
  current: number;
  total: number;
  label?: string;
}

/**
 * ProgressIndicator shows the current progress for review or chunked generation modes.
 * - Review mode: "Reviewing response (pass 2 of 3)..."
 * - Chunked mode: "Writing section 3 of 5: Introduction"
 */
export function ProgressIndicator({ mode, current, total, label }: ProgressIndicatorProps) {
  // Ensure current and total are valid numbers
  const curr = Math.max(1, Math.min(current, total));
  const tot = Math.max(1, total);
  const percentage = Math.round((curr / tot) * 100);

  // Build the status message
  let message = '';
  if (mode === 'review') {
    message = `Reviewing response (pass ${curr} of ${tot})...`;
  } else if (mode === 'chunked') {
    const labelPart = label ? `: ${label}` : '';
    message = `Writing section ${curr} of ${tot}${labelPart}`;
  }

  return (
    <div
      style={{
        padding: '8px 12px',
        background: '#eff6ff',
        border: '1px solid #bae6fd',
        borderRadius: 8,
        marginBottom: 8,
      }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{
          fontSize: 12,
          color: '#075985',
          fontWeight: 500,
        }}>
          {message}
        </div>
        <div style={{
          fontSize: 11,
          color: '#0369a1',
          fontWeight: 600,
        }}>
          {percentage}%
        </div>
      </div>
      <div style={{
        width: '100%',
        height: 4,
        background: '#e0f2fe',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: '#0284c7',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
