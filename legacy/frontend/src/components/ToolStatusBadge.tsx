import React from 'react';

export type ToolStatus = 'success' | 'error' | 'rate_limited' | 'timeout' | 'validation_error' | 'gated';

export interface ToolStatusBadgeProps {
  status: ToolStatus;
  toolName: string;
  elapsedMs?: number;
  errorMessage?: string;
}

const STATUS_CONFIG: Record<ToolStatus, { icon: string; color: string; bgColor: string; label: string }> = {
  success: {
    icon: '✓',
    color: '#fff',
    bgColor: '#10b981',
    label: 'Success'
  },
  error: {
    icon: '✕',
    color: '#fff',
    bgColor: '#ef4444',
    label: 'Error'
  },
  rate_limited: {
    icon: '⏱',
    color: '#000',
    bgColor: '#f59e0b',
    label: 'Rate Limited'
  },
  timeout: {
    icon: '⌛',
    color: '#fff',
    bgColor: '#f97316',
    label: 'Timeout'
  },
  validation_error: {
    icon: '⚠',
    color: '#fff',
    bgColor: '#ef4444',
    label: 'Validation Error'
  },
  gated: {
    icon: '🔒',
    color: '#fff',
    bgColor: '#dc2626',
    label: 'Gated'
  }
};

export default function ToolStatusBadge({ status, toolName, elapsedMs, errorMessage }: ToolStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  const ariaLabel = errorMessage
    ? `Tool ${toolName} ${config.label.toLowerCase()}: ${errorMessage}`
    : `Tool ${toolName} ${config.label.toLowerCase()}${elapsedMs ? ` in ${elapsedMs}ms` : ''}`;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 6,
        background: config.bgColor,
        color: config.color,
        fontSize: 11,
        fontWeight: 600,
        animation: 'fadeIn 0.3s ease-in',
      }}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
      {elapsedMs !== undefined && (
        <span style={{ fontSize: 10, opacity: 0.9 }}>
          {elapsedMs}ms
        </span>
      )}
    </div>
  );
}
