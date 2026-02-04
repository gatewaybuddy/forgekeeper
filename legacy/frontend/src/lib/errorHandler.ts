/**
 * Error Handler Utilities (T500)
 *
 * Comprehensive error handling system with classification, logging,
 * retry logic, and user-friendly message mapping.
 *
 * @module errorHandler
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  operation: string;
  userId?: string;
  conversationId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Custom application error class with severity and user messaging
 */
export class AppError extends Error {
  severity: ErrorSeverity;
  userMessage: string;
  context?: ErrorContext;
  originalError?: Error;
  timestamp: string;

  constructor(
    message: string,
    severity: ErrorSeverity = 'medium',
    userMessage?: string,
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.severity = severity;
    this.userMessage = userMessage || this.getDefaultUserMessage(message);
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Map technical error messages to user-friendly messages
   */
  private getDefaultUserMessage(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Network errors
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('connection')
    ) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }

    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return 'The operation took too long. Please try again.';
    }

    // Not found errors
    if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
      return 'The requested resource was not found.';
    }

    // Permission errors
    if (
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('403')
    ) {
      return 'You do not have permission to perform this action.';
    }

    // Server errors
    if (lowerMessage.includes('500') || lowerMessage.includes('server error')) {
      return 'Server error occurred. Please try again later.';
    }

    // Validation errors
    if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
      return 'Invalid input. Please check your data and try again.';
    }

    // Rate limiting
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    // Generic error
    return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Wrap an async operation with comprehensive error handling
 *
 * @param operation - Name of the operation for logging
 * @param fn - Async function to execute
 * @param context - Additional context for error logging
 * @returns Promise with the result of fn
 * @throws AppError with user-friendly message
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Partial<ErrorContext>
): Promise<T> {
  const fullContext: ErrorContext = {
    operation,
    ...context,
  };

  try {
    return await fn();
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            error instanceof Error ? error.message : String(error),
            'medium',
            undefined,
            fullContext,
            error instanceof Error ? error : undefined
          );

    // Log to ContextLog
    await logErrorToContextLog(appError);

    throw appError;
  }
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of retry attempts (default: 3)
 * @param delayMs - Initial delay in milliseconds (default: 1000)
 * @param shouldRetry - Optional function to determine if error is retryable
 * @returns Promise with the result of fn
 * @throws AppError after all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  shouldRetry?: (error: Error) => boolean
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError)) {
        throw new AppError(
          lastError.message,
          'high',
          'Operation failed and cannot be retried.',
          undefined,
          lastError
        );
      }

      if (attempt < maxAttempts) {
        // Exponential backoff with jitter
        const backoff = delayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * backoff; // Add up to 30% jitter
        await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
      }
    }
  }

  throw new AppError(
    `Operation failed after ${maxAttempts} attempts: ${lastError!.message}`,
    'high',
    'The operation failed multiple times. Please try again later.',
    undefined,
    lastError
  );
}

/**
 * Log error to ContextLog for telemetry tracking
 *
 * @param error - AppError to log
 */
async function logErrorToContextLog(error: AppError): Promise<void> {
  try {
    const errorEvent = {
      actor: 'system',
      act: 'error',
      name: error.context?.operation || 'unknown_operation',
      error: error.message,
      severity: error.severity,
      user_message: error.userMessage,
      trace_id: error.context?.traceId,
      conv_id: error.context?.conversationId,
      user_id: error.context?.userId,
      metadata: {
        ...error.context?.metadata,
        stack: error.stack,
        original_error: error.originalError?.message,
        timestamp: error.timestamp,
      },
    };

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
 * Check if an error is retryable (network/timeout errors)
 *
 * @param error - Error to check
 * @returns true if error should be retried
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT')
  );
}

/**
 * Classify error severity based on error type
 *
 * @param error - Error to classify
 * @returns ErrorSeverity
 */
export function classifyErrorSeverity(error: Error): ErrorSeverity {
  const message = error.message.toLowerCase();

  // Critical errors
  if (
    message.includes('security') ||
    message.includes('unauthorized access') ||
    message.includes('data corruption')
  ) {
    return 'critical';
  }

  // High severity errors
  if (
    message.includes('500') ||
    message.includes('server error') ||
    message.includes('database') ||
    message.includes('fatal')
  ) {
    return 'high';
  }

  // Low severity errors
  if (
    message.includes('validation') ||
    message.includes('invalid input') ||
    message.includes('not found')
  ) {
    return 'low';
  }

  // Default to medium severity
  return 'medium';
}

/**
 * Create error toast notification (requires toast library)
 *
 * @param error - Error to display
 * @param toastFn - Toast notification function
 */
export function showErrorToast(
  error: Error,
  toastFn?: (message: string, options?: { type: string }) => void
): void {
  if (!toastFn) {
    console.warn('Toast function not provided, error not displayed:', error);
    return;
  }

  const message = error instanceof AppError ? error.userMessage : error.message;

  toastFn(message, { type: 'error' });
}

/**
 * Safe async wrapper that never throws
 *
 * @param fn - Async function to execute
 * @param defaultValue - Default value to return on error
 * @returns Promise with result or default value
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('SafeAsync caught error:', error);
    return defaultValue;
  }
}

/**
 * Error handler middleware for fetch requests
 *
 * @param response - Fetch response
 * @returns Promise with response if OK
 * @throws AppError if response not OK
 */
export async function handleFetchResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let userMessage: string | undefined;

    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
      if (errorData.message) {
        userMessage = errorData.message;
      }
    } catch {
      // If response is not JSON, use default message
    }

    const severity = response.status >= 500 ? 'high' : 'medium';

    throw new AppError(errorMessage, severity, userMessage);
  }

  return response;
}

/**
 * Example usage patterns
 */

// Example 1: Basic error handling with retry
/*
const fetchData = async (url: string) => {
  return await withRetry(
    async () => {
      const response = await fetch(url);
      return await handleFetchResponse(response);
    },
    3,
    1000,
    isRetryableError
  );
};
*/

// Example 2: Error handling with context
/*
const sendMessage = async (message: string, conversationId: string) => {
  return await withErrorHandling(
    'send_message',
    async () => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      await handleFetchResponse(response);
      return await response.json();
    },
    { conversationId, operation: 'send_message' }
  );
};
*/

// Example 3: Safe async with default value
/*
const getHistory = async (): Promise<Message[]> => {
  return await safeAsync(
    async () => {
      const response = await fetch('/api/history');
      await handleFetchResponse(response);
      return await response.json();
    },
    [] // Default to empty array on error
  );
};
*/

export default {
  AppError,
  withErrorHandling,
  withRetry,
  isRetryableError,
  classifyErrorSeverity,
  showErrorToast,
  safeAsync,
  handleFetchResponse,
};
