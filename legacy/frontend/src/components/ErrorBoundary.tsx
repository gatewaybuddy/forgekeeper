/**
 * ErrorBoundary Component (T500)
 *
 * React error boundary for catching and handling component errors gracefully.
 * Logs errors to ContextLog and displays user-friendly fallback UI.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 *
 * @module ErrorBoundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to ContextLog
    this.logErrorToContextLog(error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to console for development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Store error info in state
    this.setState({
      errorInfo,
    });
  }

  /**
   * Log error to ContextLog for telemetry tracking
   */
  async logErrorToContextLog(error: Error, errorInfo: ErrorInfo) {
    try {
      const errorEvent = {
        actor: 'system',
        act: 'error',
        name: 'react_error_boundary',
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      };

      // Send to ContextLog endpoint
      await fetch('/api/contextlog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorEvent),
      });
    } catch (logError) {
      // Silently fail if logging fails (don't compound errors)
      console.error('Failed to log error to ContextLog:', logError);
    }
  }

  /**
   * Reset error boundary state
   */
  resetError = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="error-boundary" style={styles.container}>
          <div style={styles.content}>
            <h2 style={styles.title}>⚠️ Something went wrong</h2>
            <p style={styles.message}>
              We've encountered an unexpected error. The error has been logged and
              our team will investigate.
            </p>

            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error details</summary>
                <div style={styles.errorDetails}>
                  <p style={styles.errorMessage}>
                    <strong>Error:</strong> {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre style={styles.stack}>{this.state.error.stack}</pre>
                  )}
                  {this.state.errorInfo && (
                    <>
                      <p style={styles.label}>
                        <strong>Component Stack:</strong>
                      </p>
                      <pre style={styles.componentStack}>
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}

            <div style={styles.actions}>
              <button onClick={this.resetError} style={styles.button}>
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ ...styles.button, ...styles.reloadButton }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inline styles for error boundary (to avoid CSS dependency issues)
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
  },
  content: {
    maxWidth: '600px',
    padding: '30px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '24px',
    fontWeight: 600,
    color: '#d32f2f',
  },
  message: {
    margin: '0 0 20px 0',
    fontSize: '16px',
    lineHeight: '1.5',
    color: '#333',
  },
  details: {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 600,
    marginBottom: '10px',
  },
  errorDetails: {
    marginTop: '10px',
  },
  errorMessage: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    color: '#666',
  },
  label: {
    margin: '10px 0 5px 0',
    fontSize: '14px',
    color: '#666',
  },
  stack: {
    margin: 0,
    padding: '10px',
    fontSize: '12px',
    fontFamily: 'monospace',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '200px',
  },
  componentStack: {
    margin: 0,
    padding: '10px',
    fontSize: '12px',
    fontFamily: 'monospace',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '150px',
  },
  actions: {
    display: 'flex',
    gap: '10px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'white',
    backgroundColor: '#1976d2',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  reloadButton: {
    backgroundColor: '#757575',
  },
};

export default ErrorBoundary;
