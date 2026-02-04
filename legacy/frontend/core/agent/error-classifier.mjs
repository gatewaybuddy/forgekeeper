/**
 * Error Classification System
 * [T304] Enhanced error classification for autonomous agent failures
 *
 * Classifies errors into actionable categories with confidence scores
 * and suggested recovery strategies.
 */

// Error category definitions
export const ERROR_CATEGORIES = {
  TOOL_NOT_FOUND: 'tool_not_found',
  COMMAND_NOT_FOUND: 'command_not_found',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_ARGUMENTS: 'invalid_arguments',
  TIMEOUT: 'timeout',
  OUTPUT_TOO_LARGE: 'output_too_large',
  RATE_LIMITED: 'rate_limited',
  NETWORK_ERROR: 'network_error',
  SYNTAX_ERROR: 'syntax_error',
  ENVIRONMENT_MISSING: 'environment_missing',
  FILE_NOT_FOUND: 'file_not_found',
  DIRECTORY_NOT_FOUND: 'directory_not_found',
  DISK_FULL: 'disk_full',
  UNKNOWN: 'unknown',
};

// Error severity levels
export const ERROR_SEVERITY = {
  RECOVERABLE: 'recoverable',
  USER_ACTION_REQUIRED: 'user_action_required',
  FATAL: 'fatal',
};

/**
 * Error pattern definitions for classification
 */
const ERROR_PATTERNS = [
  // Command/Binary not found
  {
    category: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'exitCode', value: 127 },
      { type: 'stderr', regex: /command not found|not found/i },
      { type: 'stderr', regex: /bash:.*not found/i },
      { type: 'stderr', regex: /sh:.*not found/i },
      { type: 'message', regex: /bash error.*not found/i },
    ],
    confidence: 0.95,
    description: 'Command or binary not available in environment',
    recoveryHint: 'Try alternative command, install binary, or use different approach',
  },

  // Tool not in allowlist
  {
    category: ERROR_CATEGORIES.TOOL_NOT_FOUND,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'message', regex: /Unknown tool/i },
      { type: 'message', regex: /Tool not found/i },
      { type: 'message', regex: /not in allowlist/i },
    ],
    confidence: 1.0,
    description: 'Requested tool not available or not in allowlist',
    recoveryHint: 'Check available tools and use alternative',
  },

  // Permission denied
  {
    category: ERROR_CATEGORIES.PERMISSION_DENIED,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'code', value: 'EACCES' },
      { type: 'code', value: 'EPERM' },
      { type: 'message', regex: /permission denied/i },
      { type: 'stderr', regex: /Permission denied/i },
      { type: 'stderr', regex: /access denied/i },
    ],
    confidence: 0.95,
    description: 'Insufficient permissions for operation',
    recoveryHint: 'Check sandbox boundaries, try allowed directory, or request user permissions',
  },

  // File not found
  {
    category: ERROR_CATEGORIES.FILE_NOT_FOUND,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'code', value: 'ENOENT' },
      { type: 'message', regex: /no such file/i },
      { type: 'stderr', regex: /No such file or directory/i },
    ],
    confidence: 0.9,
    description: 'File or directory does not exist',
    recoveryHint: 'Verify path, check if file was created, or create file first',
  },

  // Timeout
  {
    category: ERROR_CATEGORIES.TIMEOUT,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'code', value: 'ETIMEDOUT' },
      { type: 'message', regex: /timeout|timed out/i },
      { type: 'signal', value: 'SIGTERM' },
      { type: 'signal', value: 'SIGKILL' },
    ],
    confidence: 0.9,
    description: 'Operation exceeded time limit',
    recoveryHint: 'Reduce scope, increase timeout, or break into smaller operations',
  },

  // Invalid arguments / validation error
  {
    category: ERROR_CATEGORIES.INVALID_ARGUMENTS,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'message', regex: /Missing required parameter/i },
      { type: 'message', regex: /should be.*got/i },
      { type: 'message', regex: /invalid.*argument/i },
      { type: 'message', regex: /Failed to parse/i },
    ],
    confidence: 1.0,
    description: 'Tool parameters incorrect or malformed',
    recoveryHint: 'Check parameter schema and provide correct types',
  },

  // Syntax error
  {
    category: ERROR_CATEGORIES.SYNTAX_ERROR,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'stderr', regex: /syntax error/i },
      { type: 'stderr', regex: /unexpected.*token/i },
      { type: 'stderr', regex: /SyntaxError/i },
    ],
    confidence: 0.85,
    description: 'Code or command syntax is invalid',
    recoveryHint: 'Fix syntax, check for typos, or use simpler command',
  },

  // Network errors
  {
    category: ERROR_CATEGORIES.NETWORK_ERROR,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'code', value: 'ENOTFOUND' },
      { type: 'code', value: 'ECONNREFUSED' },
      { type: 'code', value: 'ECONNRESET' },
      { type: 'message', regex: /network.*error/i },
      { type: 'message', regex: /connection.*refused/i },
      { type: 'message', regex: /DNS.*failed/i },
    ],
    confidence: 0.9,
    description: 'Network connection or DNS failure',
    recoveryHint: 'Check connectivity, retry, or use cached data',
  },

  // Disk full
  {
    category: ERROR_CATEGORIES.DISK_FULL,
    severity: ERROR_SEVERITY.USER_ACTION_REQUIRED,
    patterns: [
      { type: 'code', value: 'ENOSPC' },
      { type: 'message', regex: /no space left/i },
      { type: 'stderr', regex: /disk full/i },
    ],
    confidence: 1.0,
    description: 'No space left on device',
    recoveryHint: 'Clean up files or request user to free disk space',
  },

  // Rate limited
  {
    category: ERROR_CATEGORIES.RATE_LIMITED,
    severity: ERROR_SEVERITY.RECOVERABLE,
    patterns: [
      { type: 'message', regex: /rate limit/i },
      { type: 'message', regex: /too many requests/i },
      { type: 'message', regex: /429/i },
    ],
    confidence: 0.95,
    description: 'Too many requests / rate limited',
    recoveryHint: 'Wait and retry, or reduce request frequency',
  },
];

/**
 * Classify an error with confidence score
 *
 * @param {Object} failureContext - Context including error, tool, etc.
 * @returns {Object} Classification result
 */
export function classifyError(failureContext) {
  const { error, toolCall } = failureContext;

  if (!error) {
    return {
      category: ERROR_CATEGORIES.UNKNOWN,
      severity: ERROR_SEVERITY.RECOVERABLE,
      confidence: 0,
      description: 'No error information available',
      recoveryHint: 'Unable to determine failure cause',
    };
  }

  const errorMsg = error.message || '';
  const errorCode = error.code;
  const exitCode = typeof errorCode === 'number' ? errorCode : null;
  const stderr = error.stderr || '';
  const stdout = error.stdout || '';
  const signal = error.signal || null;

  // Try to match against patterns
  let bestMatch = null;
  let highestConfidence = 0;

  for (const pattern of ERROR_PATTERNS) {
    let matchCount = 0;
    let totalPatterns = pattern.patterns.length;

    for (const p of pattern.patterns) {
      let matches = false;

      switch (p.type) {
        case 'exitCode':
          matches = exitCode === p.value;
          break;

        case 'code':
          matches = errorCode === p.value || String(errorCode).toUpperCase() === String(p.value).toUpperCase();
          break;

        case 'signal':
          matches = signal === p.value;
          break;

        case 'message':
          matches = p.regex.test(errorMsg);
          break;

        case 'stderr':
          matches = p.regex.test(stderr);
          break;

        case 'stdout':
          matches = p.regex.test(stdout);
          break;
      }

      if (matches) {
        matchCount++;
      }
    }

    // Calculate match confidence (at least one pattern must match)
    if (matchCount > 0) {
      const matchRatio = matchCount / totalPatterns;
      const confidence = pattern.confidence * matchRatio;

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          category: pattern.category,
          severity: pattern.severity,
          confidence,
          description: pattern.description,
          recoveryHint: pattern.recoveryHint,
        };
      }
    }
  }

  // If no pattern matched, return unknown
  if (!bestMatch) {
    return {
      category: ERROR_CATEGORIES.UNKNOWN,
      severity: ERROR_SEVERITY.RECOVERABLE,
      confidence: 0.3,
      description: `Unclassified error: ${errorMsg.substring(0, 100)}`,
      recoveryHint: 'Try alternative approach or ask user for help',
    };
  }

  return bestMatch;
}

/**
 * Get detailed error information for logging
 *
 * @param {Object} failureContext
 * @returns {Object} Detailed error info
 */
export function getErrorDetails(failureContext) {
  const { error, toolCall } = failureContext;

  if (!error) {
    return {
      hasDetails: false,
      summary: 'No error information',
    };
  }

  const classification = classifyError(failureContext);

  return {
    hasDetails: true,
    summary: error.message,
    code: error.code,
    exitCode: typeof error.code === 'number' ? error.code : null,
    signal: error.signal,
    stdout: error.stdout ? truncate(error.stdout, 500) : null,
    stderr: error.stderr ? truncate(error.stderr, 500) : null,
    command: error.command || toolCall?.function?.arguments?.command || toolCall?.function?.arguments?.script,
    classification,
  };
}

/**
 * Check if error is recoverable
 *
 * @param {Object} classification
 * @returns {boolean}
 */
export function isRecoverable(classification) {
  return classification.severity === ERROR_SEVERITY.RECOVERABLE;
}

/**
 * Check if error requires user action
 *
 * @param {Object} classification
 * @returns {boolean}
 */
export function requiresUserAction(classification) {
  return classification.severity === ERROR_SEVERITY.USER_ACTION_REQUIRED;
}

/**
 * Get recovery difficulty estimate
 *
 * @param {Object} classification
 * @returns {string} 'easy' | 'medium' | 'hard' | 'impossible'
 */
export function getRecoveryDifficulty(classification) {
  if (classification.severity === ERROR_SEVERITY.FATAL) {
    return 'impossible';
  }

  if (classification.severity === ERROR_SEVERITY.USER_ACTION_REQUIRED) {
    return 'hard';
  }

  // Recoverable errors - classify by category
  switch (classification.category) {
    case ERROR_CATEGORIES.INVALID_ARGUMENTS:
    case ERROR_CATEGORIES.SYNTAX_ERROR:
      return 'easy'; // Just fix the parameters

    case ERROR_CATEGORIES.TOOL_NOT_FOUND:
    case ERROR_CATEGORIES.COMMAND_NOT_FOUND:
      return 'medium'; // Need alternative tool/command

    case ERROR_CATEGORIES.PERMISSION_DENIED:
    case ERROR_CATEGORIES.TIMEOUT:
    case ERROR_CATEGORIES.NETWORK_ERROR:
      return 'medium'; // Need different approach

    case ERROR_CATEGORIES.DISK_FULL:
    case ERROR_CATEGORIES.ENVIRONMENT_MISSING:
      return 'hard'; // May need user intervention

    default:
      return 'medium';
  }
}

/**
 * Truncate text to max length
 *
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '... (truncated)';
}

/**
 * Create error classifier instance
 *
 * @returns {Object} Classifier interface
 */
export function createErrorClassifier() {
  return {
    classify: classifyError,
    getDetails: getErrorDetails,
    isRecoverable,
    requiresUserAction,
    getRecoveryDifficulty,
    ERROR_CATEGORIES,
    ERROR_SEVERITY,
  };
}
