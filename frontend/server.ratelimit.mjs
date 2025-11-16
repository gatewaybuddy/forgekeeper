/**
 * T22: Token Bucket Rate Limiter
 *
 * Lightweight in-memory rate limiter using token bucket algorithm.
 * Prevents runaway tool loops by throttling chat-to-tool traffic at the API boundary.
 *
 * Features:
 * - Token bucket algorithm (configurable capacity and refill rate)
 * - Per-request token consumption
 * - Automatic refill over time
 * - Enable/disable flag
 * - Metrics integration
 */

/**
 * Token Bucket Rate Limiter Class
 *
 * The token bucket algorithm allows for burst traffic up to the bucket capacity,
 * then enforces a steady rate of refill_rate tokens per second.
 */
class TokenBucket {
  /**
   * @param {number} capacity - Maximum tokens (burst size)
   * @param {number} refillRate - Tokens per second
   */
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Attempt to consume tokens
   * @param {number} tokens - Number of tokens to consume
   * @returns {boolean} - True if tokens were consumed, false if insufficient
   */
  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Get current token count (after refill)
   * @returns {number} - Current tokens available
   */
  getCurrentTokens() {
    this.refill();
    return this.tokens;
  }

  /**
   * Calculate retry-after time in seconds
   * @param {number} tokensNeeded - Tokens needed for request
   * @returns {number} - Seconds until enough tokens are available
   */
  getRetryAfter(tokensNeeded = 1) {
    this.refill();
    const deficit = tokensNeeded - this.tokens;
    if (deficit <= 0) return 0;
    return Math.ceil(deficit / this.refillRate);
  }
}

/**
 * Rate Limiter Manager
 *
 * Manages rate limiting configuration and bucket instances
 */
class RateLimiter {
  constructor() {
    // Load configuration from environment
    this.enabled = String(process.env.RATE_LIMIT_ENABLED || '1') === '1';
    this.capacity = Number(process.env.RATE_LIMIT_CAPACITY || '100');
    this.refillRate = Number(process.env.RATE_LIMIT_REFILL_RATE || '10');
    this.costPerRequest = Number(process.env.RATE_LIMIT_COST_PER_REQUEST || '1');

    // Single global bucket (could be extended to per-IP buckets)
    this.bucket = new TokenBucket(this.capacity, this.refillRate);

    // Metrics
    this.metrics = {
      hits: 0, // Number of 429 responses
      totalRequests: 0,
      totalTokensConsumed: 0,
    };
  }

  /**
   * Check if request is allowed
   * @returns {{ allowed: boolean, retryAfter: number, currentTokens: number }}
   */
  checkRequest() {
    if (!this.enabled) {
      return { allowed: true, retryAfter: 0, currentTokens: this.capacity };
    }

    this.metrics.totalRequests += 1;

    const allowed = this.bucket.consume(this.costPerRequest);
    const currentTokens = this.bucket.getCurrentTokens();
    const retryAfter = allowed ? 0 : this.bucket.getRetryAfter(this.costPerRequest);

    if (!allowed) {
      this.metrics.hits += 1;
    } else {
      this.metrics.totalTokensConsumed += this.costPerRequest;
    }

    return { allowed, retryAfter, currentTokens };
  }

  /**
   * Get current metrics
   * @returns {object}
   */
  getMetrics() {
    return {
      enabled: this.enabled,
      hits: this.metrics.hits,
      totalRequests: this.metrics.totalRequests,
      totalTokensConsumed: this.metrics.totalTokensConsumed,
      currentTokens: Math.floor(this.bucket.getCurrentTokens()),
      capacity: this.capacity,
      refillRate: this.refillRate,
      costPerRequest: this.costPerRequest,
    };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      totalRequests: 0,
      totalTokensConsumed: 0,
    };
  }

  /**
   * Reset bucket to full capacity (for testing)
   */
  resetBucket() {
    this.bucket = new TokenBucket(this.capacity, this.refillRate);
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Express middleware for rate limiting
 *
 * Usage:
 *   app.post('/api/chat', rateLimitMiddleware, (req, res) => { ... });
 */
export function rateLimitMiddleware(req, res, next) {
  const { allowed, retryAfter, currentTokens } = rateLimiter.checkRequest();

  if (!allowed) {
    res.setHeader('Retry-After', retryAfter);
    res.setHeader('X-RateLimit-Limit', rateLimiter.capacity);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);

    return res.status(429).json({
      error: 'Rate limit exceeded',
      retry_after: retryAfter,
      message: `Too many requests. Please wait ${retryAfter} seconds.`,
    });
  }

  // Add rate limit headers to successful responses
  res.setHeader('X-RateLimit-Limit', rateLimiter.capacity);
  res.setHeader('X-RateLimit-Remaining', Math.floor(currentTokens));

  next();
}

/**
 * Get current rate limit metrics
 * @returns {object}
 */
export function getRateLimitMetrics() {
  return rateLimiter.getMetrics();
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter() {
  rateLimiter.resetMetrics();
  rateLimiter.resetBucket();
}

export default rateLimiter;
