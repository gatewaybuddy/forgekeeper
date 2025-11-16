// Auto-detection heuristics for review and chunked modes (T210)
// Automatically enables appropriate orchestration mode based on question complexity

/**
 * Heuristic patterns for detecting when to use chunked mode
 */
const CHUNKED_PATTERNS = {
  comprehensive: [
    /comprehensive\s+(analysis|overview|guide|explanation)/i,
    /in\s+detail/i,
    /detailed\s+(analysis|explanation|guide)/i,
    /step[\s-]*by[\s-]*step/i,
    /walkthrough/i,
    /complete\s+guide/i,
    /thorough\s+(explanation|analysis)/i,
  ],
  multiPart: [
    /explain\s+.+\s+and\s+.+\s+and/i, // Multiple "and" suggesting multi-part
    /compare\s+.+\s+(?:and|with|to)/i,
    /differences?\s+between/i,
    /pros\s+and\s+cons/i,
    /advantages?\s+and\s+disadvantages?/i,
  ],
  lengthy: [
    /write\s+a\s+(long|extensive|comprehensive)/i,
    /create\s+a\s+(complete|full|comprehensive)/i,
    /generate\s+a\s+(detailed|comprehensive|extensive)/i,
  ],
  tutorial: [
    /how\s+to\s+.+\s+(from\s+scratch|complete)/i,
    /tutorial/i,
    /beginner'?s?\s+guide/i,
    /getting\s+started\s+with/i,
  ],
};

/**
 * Heuristic patterns for detecting when to use review mode
 */
const REVIEW_PATTERNS = {
  highStakes: [
    /production/i,
    /deploy(ment|ing)?/i,
    /critical/i,
    /important/i,
    /security/i,
    /vulnerabilit(y|ies)/i,
    /must\s+be\s+(correct|accurate)/i,
  ],
  technical: [
    /algorithm/i,
    /implementation/i,
    /optimization/i,
    /performance/i,
    /benchmark/i,
    /specification/i,
    /requirement/i,
  ],
  accuracy: [
    /correct(ly|ness)?/i,
    /accurate(ly)?/i,
    /precise(ly)?/i,
    /exact(ly)?/i,
    /verify/i,
    /validate/i,
    /ensure/i,
  ],
  code: [
    /debug/i,
    /fix\s+(bug|error|issue)/i,
    /troubleshoot/i,
    /diagnose/i,
    /code\s+review/i,
  ],
};

/**
 * Detect if question should use chunked mode
 *
 * @param {string} question - User question text
 * @param {Object} context - Additional context (message count, etc)
 * @returns {Object} { shouldUse: boolean, reason: string, confidence: number }
 */
export function detectChunkedMode(question, context = {}) {
  if (!question || typeof question !== 'string') {
    return { shouldUse: false, reason: 'No question provided', confidence: 0.0 };
  }

  const text = String(question).toLowerCase();
  const matches = [];
  let totalScore = 0;

  // Check each pattern category
  for (const [category, patterns] of Object.entries(CHUNKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matches.push({ category, pattern: pattern.source });

        // Weight different categories
        const weight = {
          comprehensive: 0.4,
          multiPart: 0.3,
          lengthy: 0.35,
          tutorial: 0.35,
        }[category] || 0.3;

        totalScore += weight;
      }
    }
  }

  // Additional scoring factors
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 50) {
    totalScore += 0.2; // Long questions often need chunked responses
    matches.push({ category: 'length', pattern: `${wordCount} words` });
  }

  // Check for list indicators
  const listIndicators = ['1.', '2.', '3.', 'first', 'second', 'third', 'finally'];
  const hasListIndicators = listIndicators.some(ind => text.includes(ind));
  if (hasListIndicators) {
    totalScore += 0.15;
    matches.push({ category: 'structure', pattern: 'list indicators' });
  }

  // Normalize score to 0-1 range
  const confidence = Math.min(1.0, totalScore);
  const threshold = Number(process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD || '0.3');
  const shouldUse = confidence >= threshold;

  const reason = shouldUse
    ? `Detected ${matches.length} chunked indicators: ${matches.map(m => m.category).join(', ')}`
    : 'No strong chunked indicators detected';

  return {
    shouldUse,
    reason,
    confidence: Number(confidence.toFixed(2)),
    matches: matches.length > 0 ? matches : undefined,
  };
}

/**
 * Detect if question should use review mode
 *
 * @param {string} question - User question text
 * @param {Object} context - Additional context (previous incomplete, etc)
 * @returns {Object} { shouldUse: boolean, reason: string, confidence: number }
 */
export function detectReviewMode(question, context = {}) {
  if (!question || typeof question !== 'string') {
    return { shouldUse: false, reason: 'No question provided', confidence: 0.0 };
  }

  const text = String(question).toLowerCase();
  const matches = [];
  let totalScore = 0;

  // Check each pattern category
  for (const [category, patterns] of Object.entries(REVIEW_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        matches.push({ category, pattern: pattern.source });

        // Weight different categories
        const weight = {
          highStakes: 0.5,
          technical: 0.3,
          accuracy: 0.4,
          code: 0.35,
        }[category] || 0.3;

        totalScore += weight;
      }
    }
  }

  // Context-based scoring
  if (context.previousIncomplete) {
    totalScore += 0.4; // Previous response was incomplete
    matches.push({ category: 'context', pattern: 'previous incomplete response' });
  }

  if (context.previousContinuations > 1) {
    totalScore += 0.3; // Multiple continuations suggest complexity
    matches.push({ category: 'context', pattern: `${context.previousContinuations} previous continuations` });
  }

  if (context.messageCount > 5) {
    totalScore += 0.15; // Long conversations might benefit from review
    matches.push({ category: 'context', pattern: `${context.messageCount} messages in conversation` });
  }

  // Normalize score to 0-1 range
  const confidence = Math.min(1.0, totalScore);
  const threshold = Number(process.env.FRONTEND_AUTO_REVIEW_THRESHOLD || '0.5');
  const shouldUse = confidence >= threshold;

  const reason = shouldUse
    ? `Detected ${matches.length} review indicators: ${matches.map(m => m.category).join(', ')}`
    : 'No strong review indicators detected';

  return {
    shouldUse,
    reason,
    confidence: Number(confidence.toFixed(2)),
    matches: matches.length > 0 ? matches : undefined,
  };
}

/**
 * Auto-detect and recommend orchestration mode
 *
 * @param {string} question - User question text
 * @param {Object} context - Additional context
 * @returns {Object} { mode: string, reason: string, confidence: number, alternatives: Array }
 */
export function detectOrchestrationMode(question, context = {}) {
  const chunked = detectChunkedMode(question, context);
  const review = detectReviewMode(question, context);

  // Determine primary mode (prioritize chunked over review if both detected)
  let mode = 'standard';
  let confidence = 0.0;
  let reason = 'No auto-detection triggers found';

  if (chunked.shouldUse && review.shouldUse) {
    // Both detected - choose higher confidence
    if (chunked.confidence >= review.confidence) {
      mode = 'chunked';
      confidence = chunked.confidence;
      reason = chunked.reason + ' (also detected review indicators)';
    } else {
      mode = 'review';
      confidence = review.confidence;
      reason = review.reason + ' (also detected chunked indicators)';
    }
  } else if (chunked.shouldUse) {
    mode = 'chunked';
    confidence = chunked.confidence;
    reason = chunked.reason;
  } else if (review.shouldUse) {
    mode = 'review';
    confidence = review.confidence;
    reason = review.reason;
  }

  return {
    mode,
    reason,
    confidence,
    alternatives: [
      { mode: 'standard', confidence: 1.0 - Math.max(chunked.confidence, review.confidence) },
      { mode: 'chunked', confidence: chunked.confidence, reason: chunked.reason },
      { mode: 'review', confidence: review.confidence, reason: review.reason },
    ].sort((a, b) => b.confidence - a.confidence),
    detection: {
      chunked,
      review,
    },
  };
}

/**
 * Check if auto-detection is enabled for a given mode
 *
 * @param {string} mode - Mode to check ('review' or 'chunked')
 * @returns {boolean}
 */
export function isAutoDetectionEnabled(mode) {
  if (mode === 'review') {
    return process.env.FRONTEND_AUTO_REVIEW === '1';
  } else if (mode === 'chunked') {
    return process.env.FRONTEND_AUTO_CHUNKED === '1';
  }
  return false;
}

/**
 * Get auto-detection configuration
 *
 * @returns {Object} Configuration object
 */
export function getAutoDetectionConfig() {
  return {
    review: {
      enabled: process.env.FRONTEND_AUTO_REVIEW === '1',
      threshold: Number(process.env.FRONTEND_AUTO_REVIEW_THRESHOLD || '0.5'),
    },
    chunked: {
      enabled: process.env.FRONTEND_AUTO_CHUNKED === '1',
      threshold: Number(process.env.FRONTEND_AUTO_CHUNKED_THRESHOLD || '0.3'),
    },
  };
}
