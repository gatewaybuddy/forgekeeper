// Health check utilities for LLM backend with retry logic
// Handles backend restarts gracefully with configurable polling

import fetch from 'node-fetch';

/**
 * Wait for LLM backend to be healthy with exponential backoff
 * @param {string} apiBase - Base URL for the LLM API (e.g., http://localhost:8001)
 * @param {Object} options - Configuration options
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 15)
 * @param {number} options.initialDelayMs - Initial delay between attempts (default: 5000ms)
 * @param {number} options.maxDelayMs - Maximum delay between attempts (default: 20000ms)
 * @param {Function} options.onRetry - Callback on each retry: (attempt, nextDelay) => void
 * @returns {Promise<boolean>} - True if backend is healthy, false if max attempts exceeded
 */
export async function waitForBackendHealth(apiBase, options = {}) {
  const {
    maxAttempts = 15,
    initialDelayMs = 5000,
    maxDelayMs = 20000,
    onRetry = null,
  } = options;

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      // Try health endpoint first
      const healthUrl = `${apiBase}/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        timeout: 5000,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        console.log(`[Health Check] Backend healthy after ${attempt} attempt(s)`);
        return true;
      }
    } catch (healthError) {
      // Health endpoint failed, try /v1/models as fallback
      try {
        const modelsUrl = `${apiBase}/v1/models`;
        const response = await fetch(modelsUrl, {
          method: 'GET',
          timeout: 5000,
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          console.log(`[Health Check] Backend healthy (via /v1/models) after ${attempt} attempt(s)`);
          return true;
        }
      } catch (modelsError) {
        // Both endpoints failed
      }
    }

    // Not healthy yet
    if (attempt < maxAttempts) {
      if (onRetry) {
        onRetry(attempt, currentDelay);
      } else {
        console.log(`[Health Check] Attempt ${attempt}/${maxAttempts} failed, retrying in ${currentDelay / 1000}s...`);
      }

      await new Promise(resolve => setTimeout(resolve, currentDelay));

      // Exponential backoff with cap
      currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
    }
  }

  console.error(`[Health Check] Backend not healthy after ${maxAttempts} attempts`);
  return false;
}

/**
 * Quick health check without retries
 * @param {string} apiBase - Base URL for the LLM API
 * @returns {Promise<boolean>} - True if healthy, false otherwise
 */
export async function checkBackendHealth(apiBase) {
  try {
    const healthUrl = `${apiBase}/health`;
    const response = await fetch(healthUrl, {
      method: 'GET',
      timeout: 3000,
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      return true;
    }

    // Fallback to /v1/models
    const modelsUrl = `${apiBase}/v1/models`;
    const modelsResponse = await fetch(modelsUrl, {
      method: 'GET',
      timeout: 3000,
      signal: AbortSignal.timeout(3000),
    });

    return modelsResponse.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for backend with progress logging
 * @param {string} apiBase - Base URL for the LLM API
 * @param {string} context - Context string for logging (e.g., "autonomous session")
 * @returns {Promise<boolean>} - True if healthy, false if timeout
 */
export async function waitForBackendWithProgress(apiBase, context = 'operation') {
  console.log(`[Health Check] Waiting for LLM backend for ${context}...`);

  const isHealthy = await waitForBackendHealth(apiBase, {
    maxAttempts: 15,
    initialDelayMs: 5000,
    maxDelayMs: 20000,
    onRetry: (attempt, nextDelay) => {
      const elapsed = attempt * 10; // Rough estimate
      console.log(`[Health Check] Backend not ready, attempt ${attempt}/15 (${elapsed}s elapsed). Next check in ${nextDelay / 1000}s...`);
    },
  });

  if (isHealthy) {
    console.log(`[Health Check] ✓ Backend ready for ${context}`);
  } else {
    console.error(`[Health Check] ✗ Backend did not become healthy within timeout for ${context}`);
  }

  return isHealthy;
}
