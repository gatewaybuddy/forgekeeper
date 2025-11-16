import React, { useState, useEffect } from 'react';

export type ToolErrorType = 'rate_limited' | 'gated' | 'validation' | 'timeout' | 'generic';

export interface ToolErrorDetails {
  retryAfter?: number;
  allowedTools?: string[];
  validationErrors?: string[];
  message?: string;
}

export interface ToolErrorActionProps {
  errorType: ToolErrorType;
  errorDetails: ToolErrorDetails;
  onRetry?: () => void;
  onViewLogs?: () => void;
}

export default function ToolErrorAction({ errorType, errorDetails, onRetry, onViewLogs }: ToolErrorActionProps) {
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (errorType === 'rate_limited' && typeof errorDetails.retryAfter === 'number') {
      setRetryCountdown(errorDetails.retryAfter);
      const interval = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [errorType, errorDetails.retryAfter]);

  const renderActionContent = () => {
    switch (errorType) {
      case 'rate_limited':
        return (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
              This tool has been rate-limited. Please wait before retrying.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {retryCountdown !== null ? (
                <button
                  disabled
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    background: '#f3f4f6',
                    color: '#9ca3af',
                    cursor: 'not-allowed',
                  }}
                  aria-label={`Retry available in ${retryCountdown} seconds`}
                >
                  Retry in {retryCountdown}s
                </button>
              ) : (
                onRetry && (
                  <button
                    onClick={onRetry}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid #10b981',
                      background: '#10b981',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    aria-label="Retry tool call"
                  >
                    Retry now
                  </button>
                )
              )}
              <a
                href="/metrics"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: '#3b82f6',
                  textDecoration: 'underline',
                }}
              >
                View rate limits
              </a>
            </div>
          </div>
        );

      case 'gated':
        return (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
              This tool is not in the allowlist. Only the following tools are currently enabled:
            </p>
            {errorDetails.allowedTools && errorDetails.allowedTools.length > 0 && (
              <ul style={{ margin: '4px 0 8px 16px', padding: 0, fontSize: 12, color: '#6b7280' }}>
                {errorDetails.allowedTools.map((tool, i) => (
                  <li key={i} style={{ listStyle: 'disc' }}>{tool}</li>
                ))}
              </ul>
            )}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                // Could open a modal or navigate to settings
                alert('Please configure tool allowlist in Settings → Tools');
              }}
              style={{
                fontSize: 12,
                color: '#3b82f6',
                textDecoration: 'underline',
              }}
            >
              Configure allowed tools
            </a>
          </div>
        );

      case 'validation':
        return (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
              Tool arguments failed validation:
            </p>
            {errorDetails.validationErrors && errorDetails.validationErrors.length > 0 && (
              <ul style={{ margin: '4px 0 8px 16px', padding: 0, fontSize: 12, color: '#dc2626' }}>
                {errorDetails.validationErrors.map((err, i) => (
                  <li key={i} style={{ listStyle: 'disc' }}>{err}</li>
                ))}
              </ul>
            )}
            <a
              href="/api/tools"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: '#3b82f6',
                textDecoration: 'underline',
              }}
            >
              View tool schemas
            </a>
          </div>
        );

      case 'timeout':
        return (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
              Tool execution timed out. Try reducing the scope or complexity of the operation.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onRetry && (
                <button
                  onClick={onRetry}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #10b981',
                    background: '#10b981',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  aria-label="Retry tool call with smaller scope"
                >
                  Retry with smaller scope
                </button>
              )}
              {onViewLogs && (
                <button
                  onClick={onViewLogs}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #6b7280',
                    background: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                  aria-label="View diagnostics logs"
                >
                  View logs
                </button>
              )}
            </div>
          </div>
        );

      case 'generic':
      default:
        return (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
              {errorDetails.message || 'An error occurred while executing this tool.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onRetry && (
                <button
                  onClick={onRetry}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #10b981',
                    background: '#10b981',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  aria-label="Retry tool call"
                >
                  Retry
                </button>
              )}
              {onViewLogs && (
                <button
                  onClick={onViewLogs}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #6b7280',
                    background: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                  aria-label="View diagnostics logs"
                >
                  View logs
                </button>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div
      role="alert"
      style={{
        marginTop: 8,
        padding: 12,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 8,
        animation: 'fadeIn 0.3s ease-in',
      }}
    >
      {renderActionContent()}
    </div>
  );
}
