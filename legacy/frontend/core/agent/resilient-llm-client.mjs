/**
 * Resilient LLM Client Wrapper
 *
 * Wraps any LLM client with retry logic and health checks to handle backend restarts gracefully.
 *
 * Features:
 * - Automatic retry on connection failures
 * - Health check polling before retrying
 * - Exponential backoff
 * - Preserves original client interface
 */

import { waitForBackendHealth, checkBackendHealth } from '../../server/core/health.mjs';

/**
 * Create a resilient LLM client that handles backend restarts
 * @param {Object} client - Original LLM client
 * @param {string} apiBase - API base URL for health checks (e.g., http://localhost:8001)
 * @param {Object} options - Configuration
 * @param {number} options.maxRetries - Maximum retry attempts per call (default: 3)
 * @param {boolean} options.enableHealthCheck - Whether to check health before retrying (default: true)
 * @param {Function} options.onRetry - Callback on retry: (attempt, error) => void
 * @returns {Object} - Wrapped client with same interface
 */
export function createResilientLLMClient(client, apiBase, options = {}) {
  const {
    maxRetries = 3,
    enableHealthCheck = true,
    onRetry = null,
  } = options;

  /**
   * Wrap a function with retry logic
   */
  async function withRetry(fn, fnName) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // On retry attempts (not first), check backend health first
        if (attempt > 1 && enableHealthCheck) {
          console.log(`[ResilientLLM] Checking backend health before retry ${attempt}/${maxRetries + 1}...`);
          const isHealthy = await waitForBackendHealth(apiBase, {
            maxAttempts: 10,
            initialDelayMs: 5000,
            maxDelayMs: 20000,
            onRetry: (healthAttempt, delay) => {
              console.log(`[ResilientLLM] Backend not ready, health check ${healthAttempt}/10, retry in ${delay / 1000}s...`);
            },
          });

          if (!isHealthy) {
            console.error(`[ResilientLLM] Backend did not become healthy after waiting`);
            throw new Error('LLM backend not available after health check timeout');
          }

          console.log(`[ResilientLLM] Backend healthy, retrying ${fnName}...`);
        }

        // Execute the function
        const result = await fn();

        // Success
        if (attempt > 1) {
          console.log(`[ResilientLLM] ${fnName} succeeded on attempt ${attempt}`);
        }
        return result;

      } catch (error) {
        lastError = error;
        const isLastAttempt = (attempt === maxRetries + 1);

        // Check if it's a connection/network error (retryable)
        const isRetryable = isConnectionError(error);

        if (isRetryable && !isLastAttempt) {
          console.warn(`[ResilientLLM] ${fnName} failed (attempt ${attempt}/${maxRetries + 1}):`, error.message);

          if (onRetry) {
            onRetry(attempt, error);
          }

          // Don't sleep here - health check will handle delays
          continue;
        } else {
          // Non-retryable error or last attempt
          if (isLastAttempt) {
            console.error(`[ResilientLLM] ${fnName} failed after ${maxRetries + 1} attempts:`, error.message);
          }
          throw error;
        }
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Check if error is a connection/network error (retryable)
   */
  function isConnectionError(error) {
    if (!error) return false;

    const message = String(error.message || '').toLowerCase();
    const code = String(error.code || '').toUpperCase();

    // Network errors
    if (code === 'ECONNREFUSED') return true;
    if (code === 'ECONNRESET') return true;
    if (code === 'ETIMEDOUT') return true;
    if (code === 'ENOTFOUND') return true;
    if (code === 'ENETUNREACH') return true;

    // Fetch errors
    if (message.includes('fetch failed')) return true;
    if (message.includes('network')) return true;
    if (message.includes('connect')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('econnrefused')) return true;

    // HTTP status errors (5xx are retryable)
    if (error.status >= 500 && error.status < 600) return true;

    return false;
  }

  // Return wrapped client with same interface
  return {
    /**
     * Chat completion with retry logic
     */
    async chat(...args) {
      return withRetry(() => client.chat(...args), 'chat');
    },

    /**
     * Streaming chat completion with retry logic
     */
    async chatStream(...args) {
      return withRetry(() => client.chatStream(...args), 'chatStream');
    },

    /**
     * Direct access to original client if needed
     */
    _original: client,

    /**
     * Check backend health without retrying
     */
    async checkHealth() {
      return checkBackendHealth(apiBase);
    },

    /**
     * Wait for backend to be healthy
     */
    async waitForHealth() {
      return waitForBackendHealth(apiBase);
    },
  };
}
