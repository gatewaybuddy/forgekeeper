// Guardrail helpers for redaction and preview truncation
// Enhanced for T21: Comprehensive sensitive data redaction

const DEFAULT_MAX_PREVIEW = Number(process.env.TOOLS_LOG_MAX_PREVIEW || '4096');

/**
 * Comprehensive redaction patterns for sensitive data.
 * Each pattern returns a replacement string for matched content.
 */
const REDACTION_PATTERNS = [
  // API Keys and Service Tokens
  { pattern: /sk_live_[A-Za-z0-9_-]{24,}/gi, replacement: '<redacted:stripe-live-key>' },
  { pattern: /sk_test_[A-Za-z0-9_-]{24,}/gi, replacement: '<redacted:stripe-test-key>' },
  { pattern: /pk_live_[A-Za-z0-9_-]{24,}/gi, replacement: '<redacted:stripe-pub-key>' },
  { pattern: /sk-[A-Za-z0-9]{20,}/gi, replacement: '<redacted:openai-key>' }, // OpenAI
  { pattern: /sk-ant-[A-Za-z0-9_-]{10,}/gi, replacement: '<redacted:anthropic-key>' }, // Anthropic (relaxed length)
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '<redacted:aws-access-key>' }, // AWS Access Key
  { pattern: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}/gi, replacement: '<redacted:aws-secret-key>' },
  { pattern: /AIza[0-9A-Za-z_-]{20,}/g, replacement: '<redacted:google-api-key>' }, // Google API
  { pattern: /ya29\.[0-9A-Za-z_-]{10,}/g, replacement: '<redacted:google-oauth>' }, // Google OAuth
  { pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: '<redacted:github-pat>' }, // GitHub Personal Access Token
  { pattern: /gho_[A-Za-z0-9]{20,}/g, replacement: '<redacted:github-oauth>' }, // GitHub OAuth
  { pattern: /github_pat_[A-Za-z0-9_]{50,}/g, replacement: '<redacted:github-pat-v2>' }, // GitHub PAT v2

  // Generic API tokens and secrets
  { pattern: /\b(api[_-]?key|apikey|api[_-]?token|auth[_-]?token|access[_-]?token|secret[_-]?key|private[_-]?key)["\s:=]+([A-Za-z0-9_\-]{16,})/gi, replacement: '<redacted:api-credential>' },
  { pattern: /bearer\s+[A-Za-z0-9_\-\.]{20,}/gi, replacement: 'Bearer <redacted:bearer-token>' },

  // JWT Tokens (three base64 segments separated by dots)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '<redacted:jwt-token>' },

  // SSH Private Keys
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi, replacement: '<redacted:ssh-private-key>' },
  { pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+OPENSSH\s+PRIVATE\s+KEY-----/gi, replacement: '<redacted:openssh-key>' },

  // Passwords in various formats
  { pattern: /\b(password|passwd|pwd)["\s:=]+([^\s"',]{6,})/gi, replacement: (match, key) => `${key}=<redacted:password>` },

  // Database Connection Strings
  { pattern: /(mongodb(\+srv)?|mysql|postgresql|postgres):\/\/[^\s:@]+:[^\s@]+@/gi, replacement: (match, proto) => `${proto}://<redacted:db-creds>@` },
  { pattern: /(https?:\/\/)([^\s:@]+):([^\s@]+)@/gi, replacement: (match, proto) => `${proto}<redacted:url-creds>@` },

  // Credit Card Numbers (basic patterns - Visa, MasterCard, Amex, Discover)
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, replacement: '<redacted:credit-card>' },

  // Email Addresses
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '<redacted:email>' },

  // Phone Numbers (US format - basic patterns)
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '<redacted:phone>' },

  // Social Security Numbers (US)
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '<redacted:ssn>' },

  // IP Addresses (optional - can be useful for debugging, but might be sensitive)
  { pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, replacement: '<redacted:ip>', enabled: false }, // Disabled by default

  // Environment variable assignments with sensitive keys
  { pattern: /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|STRIPE_SECRET_KEY|DATABASE_URL|DB_PASSWORD|REDIS_PASSWORD|SESSION_SECRET|JWT_SECRET|ENCRYPTION_KEY)\s*=\s*[^\s\n]+/gi, replacement: (match, key) => `${key}=<redacted:env-secret>` },
];

/**
 * Truncate text to max bytes with clear marker.
 *
 * @param {string|object} text - Text to truncate
 * @param {number} maxBytes - Maximum bytes (default from env)
 * @returns {string} Truncated text with marker if truncated
 */
export function truncatePreview(text, maxBytes = DEFAULT_MAX_PREVIEW) {
  try {
    if (text == null || text === undefined || text === '') return '';
    const str = String(text);
    if (!str || str === 'null' || str === 'undefined') return '';
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return buf.toString('utf8');
    const slice = buf.subarray(0, maxBytes).toString('utf8');
    return `${slice} [TRUNCATED] (${buf.length} bytes)`;
  } catch {
    return '';
  }
}

/**
 * Redact sensitive data from input using comprehensive pattern matching.
 * Handles both strings and objects (by serializing to JSON first).
 *
 * @param {string|object} input - Input to redact
 * @param {boolean} aggressive - If true, redacts more aggressively (default: false)
 * @returns {string} Redacted and truncated output
 */
export function redactPreview(input, aggressive = false) {
  try {
    // Convert input to string
    const str = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

    // Apply all redaction patterns
    let out = str;
    for (const rule of REDACTION_PATTERNS) {
      // Skip disabled patterns
      if (rule.enabled === false) continue;

      // Apply pattern replacement
      if (typeof rule.replacement === 'function') {
        out = out.replace(rule.pattern, rule.replacement);
      } else {
        out = out.replace(rule.pattern, rule.replacement);
      }
    }

    // Aggressive mode: redact any long alphanumeric strings that might be secrets
    if (aggressive) {
      // Redact any 32+ character alphanumeric strings (likely hashes or keys)
      out = out.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted:long-string>');
    }

    // Truncate after redaction
    return truncatePreview(out);
  } catch (err) {
    console.error('[Redaction] Error during redaction:', err.message);
    return truncatePreview(String(input || ''));
  }
}

/**
 * Deep redaction for nested objects.
 * Recursively redacts sensitive keys in object structures.
 *
 * @param {object} obj - Object to redact
 * @param {Array<string>} sensitiveKeys - Keys to redact (default: common sensitive keys)
 * @returns {object} New object with redacted values
 */
export function redactObject(obj, sensitiveKeys = null) {
  const defaultSensitiveKeys = [
    'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
    'access_token', 'refresh_token', 'auth_token', 'bearer', 'authorization',
    'private_key', 'secret_key', 'encryption_key', 'ssn', 'credit_card',
    'cvv', 'pin', 'otp', 'session_id', 'cookie', 'jwt'
  ];

  const keys = sensitiveKeys || defaultSensitiveKeys;
  const keySet = new Set(keys.map(k => k.toLowerCase()));

  function redactValue(value, key) {
    const keyLower = String(key || '').toLowerCase();

    // Check if key matches sensitive pattern
    if (keySet.has(keyLower) || keys.some(pattern => keyLower.includes(pattern))) {
      return '<redacted>';
    }

    // Recursively process nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return redactObjectRecursive(value);
    }

    // Recursively process arrays
    if (Array.isArray(value)) {
      return value.map((item, idx) => redactValue(item, idx));
    }

    return value;
  }

  function redactObjectRecursive(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactValue(value, key);
    }
    return result;
  }

  return redactObjectRecursive(obj);
}

/**
 * Check if input contains sensitive data (for warnings).
 *
 * @param {string|object} input - Input to check
 * @returns {boolean} True if sensitive data detected
 */
export function containsSensitiveData(input) {
  try {
    const str = typeof input === 'string' ? input : JSON.stringify(input);

    // Check for common sensitive patterns
    const sensitivePatterns = [
      /sk_live_/i,
      /sk-[A-Za-z0-9]{20}/,
      /AKIA[0-9A-Z]{16}/,
      /-----BEGIN.*PRIVATE KEY-----/,
      /password\s*[=:]/i,
      /api[_-]?key\s*[=:]/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(str));
  } catch {
    return false;
  }
}
