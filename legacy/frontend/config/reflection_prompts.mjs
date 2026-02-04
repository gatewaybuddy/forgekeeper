/**
 * Reflection Pass Configuration and Prompts
 *
 * Optional post-generation critique and refinement system.
 * After generating a response, runs a quick self-critique using a checklist,
 * then applies small corrections if needed.
 *
 * Purpose:
 * - Catch obvious errors before returning to user
 * - Improve accuracy and completeness
 * - Low cost (uses small correction budget)
 * - Fully logged for transparency
 */

/**
 * Get reflection pass configuration from environment
 */
export function getReflectionConfig() {
  return {
    enabled: process.env.FRONTEND_REFLECTION_ENABLED === '1',
    // Token budget for reflection critique (cheap, fast model ideal)
    critiqueTokens: parseInt(process.env.FRONTEND_REFLECTION_CRITIQUE_TOKENS || '256', 10),
    // Token budget for applying corrections
    correctionTokens: parseInt(process.env.FRONTEND_REFLECTION_CORRECTION_TOKENS || '512', 10),
    // Min confidence to apply corrections (0.0-1.0)
    // If reflection critique confidence < threshold, skip corrections
    minConfidence: parseFloat(process.env.FRONTEND_REFLECTION_MIN_CONFIDENCE || '0.6'),
    // Max iterations of reflection (typically 1 is enough)
    maxIterations: parseInt(process.env.FRONTEND_REFLECTION_MAX_ITER || '1', 10),
  };
}

/**
 * Default reflection checklist
 * Quick evaluation criteria for self-critique
 */
export const DEFAULT_REFLECTION_CHECKLIST = [
  'Is the answer accurate and factually correct?',
  'Does it fully address what the user asked?',
  'Is it clear and easy to understand?',
  'Are there any obvious errors or inconsistencies?',
  'Is the response complete (not cut off)?',
];

/**
 * Build reflection critique prompt
 * Asks the model to quickly evaluate its own response
 *
 * @param {string} userQuestion - Original user question
 * @param {string} generatedResponse - The response to critique
 * @param {Array<string>} checklist - Custom checklist (optional)
 * @returns {Array<Object>} Messages for critique
 */
export function buildReflectionCritiquePrompt(
  userQuestion,
  generatedResponse,
  checklist = null
) {
  const checklistItems = checklist || DEFAULT_REFLECTION_CHECKLIST;
  const checklistText = checklistItems.map((item, i) => `${i + 1}. ${item}`).join('\n');

  return [
    {
      role: 'system',
      content: [
        'You are a quality checker performing a REFLECTION PASS.',
        'Quickly evaluate the response below using the checklist.',
        'Be concise - this is a fast sanity check, not a full review.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '**Original Question:**',
        userQuestion,
        '',
        '**Generated Response:**',
        '```',
        generatedResponse,
        '```',
        '',
        '**Checklist:**',
        checklistText,
        '',
        'Provide:',
        '- Quick assessment: "PASS" or "NEEDS CORRECTION"',
        '- If needs correction: 1-2 sentence explanation of what\'s wrong',
        '- Confidence score (0.0-1.0) in your assessment',
      ].join('\n'),
    },
  ];
}

/**
 * Build correction prompt
 * If reflection critique found issues, generate corrected version
 *
 * @param {string} userQuestion - Original user question
 * @param {string} generatedResponse - Original response
 * @param {string} critique - What needs to be fixed
 * @returns {Array<Object>} Messages for correction
 */
export function buildReflectionCorrectionPrompt(
  userQuestion,
  generatedResponse,
  critique
) {
  return [
    {
      role: 'system',
      content: [
        'You are applying a REFLECTION CORRECTION.',
        'Fix the issues identified in the critique while keeping the response concise.',
        'Only change what needs to be fixed - do not rewrite everything.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '**Original Question:**',
        userQuestion,
        '',
        '**Original Response:**',
        '```',
        generatedResponse,
        '```',
        '',
        '**Issues Found:**',
        critique,
        '',
        'Provide a corrected version that addresses these issues.',
        'Keep it concise - only fix what\'s necessary.',
      ].join('\n'),
    },
  ];
}

/**
 * Parse reflection critique result
 * Extracts assessment, needs_correction flag, and confidence
 *
 * @param {string} critiqueText - Response from reflection critique
 * @returns {Object} Parsed result
 */
export function parseReflectionCritique(critiqueText) {
  if (!critiqueText || typeof critiqueText !== 'string') {
    return {
      assessment: 'UNKNOWN',
      needsCorrection: false,
      confidence: 0.0,
      explanation: null,
    };
  }

  const text = critiqueText.toLowerCase();

  // Check for PASS or NEEDS CORRECTION
  const passMatch = /\b(pass|looks?\s+good|no\s+issues?|acceptable)\b/i.test(text);
  const needsCorrectionMatch = /\b(needs?\s+correction|needs?\s+fix|has\s+issues?|incorrect|inaccurate)\b/i.test(text);

  // Prefer correction signal if present (even if pass signal also present)
  const needsCorrection = needsCorrectionMatch;

  // Extract confidence score
  let confidence = 0.5; // Default
  const confMatch = critiqueText.match(/confidence[:\s]+([0-9.]+)/i);
  if (confMatch) {
    const parsed = parseFloat(confMatch[1]);
    if (!isNaN(parsed) && parsed >= 0.0 && parsed <= 1.0) {
      confidence = parsed;
    }
  }

  // Extract explanation (lines after "explanation:" or similar)
  let explanation = null;
  const explMatch = critiqueText.match(/(?:explanation|issue|problem)[:\s]+(.+)/i);
  if (explMatch) {
    explanation = explMatch[1].trim();
  } else if (needsCorrection) {
    // Fallback: use the whole critique as explanation
    explanation = critiqueText.slice(0, 200);
  }

  return {
    assessment: needsCorrection ? 'NEEDS CORRECTION' : 'PASS',
    needsCorrection,
    confidence,
    explanation,
  };
}

/**
 * Extract corrected content from reflection correction response
 *
 * @param {string} correctionText - Response from correction prompt
 * @returns {string} Corrected content
 */
export function extractCorrectedContent(correctionText) {
  if (!correctionText || typeof correctionText !== 'string') {
    return '';
  }

  // If wrapped in code fence, extract it
  const fenceMatch = correctionText.match(/```(?:\w+)?\s*\n([\s\S]+?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Otherwise return as-is
  return correctionText.trim();
}

/**
 * Create reflection event for ContextLog
 *
 * @param {string} phase - 'critique' or 'correction'
 * @param {Object} data - Event data
 * @returns {Object} ContextLog event
 */
export function createReflectionEvent(phase, data = {}) {
  const baseEvent = {
    timestamp: new Date().toISOString(),
    actor: 'system',
    act: `reflection_${phase}`,
    trace_id: data.trace_id || null,
    conv_id: data.conv_id || null,
  };

  if (phase === 'critique') {
    return {
      ...baseEvent,
      assessment: data.assessment || 'UNKNOWN',
      needs_correction: data.needsCorrection || false,
      confidence: data.confidence || 0.0,
      explanation: data.explanation || null,
      elapsed_ms: data.elapsed_ms || 0,
    };
  }

  if (phase === 'correction') {
    return {
      ...baseEvent,
      applied: data.applied || false,
      original_length: data.originalLength || 0,
      corrected_length: data.correctedLength || 0,
      elapsed_ms: data.elapsed_ms || 0,
    };
  }

  return baseEvent;
}

/**
 * Check if reflection pass is enabled
 */
export function isReflectionEnabled() {
  return getReflectionConfig().enabled;
}

/**
 * Should skip reflection based on context
 * For example: very short responses, tool-only responses, etc.
 *
 * @param {string} response - Generated response
 * @param {Object} context - Additional context
 * @returns {boolean} True if should skip reflection
 */
export function shouldSkipReflection(response, context = {}) {
  // Skip if response is very short (likely just acknowledgment)
  if (!response || response.length < 50) {
    return true;
  }

  // Skip if response is tool-only (no human-facing content)
  if (context.toolOnly) {
    return true;
  }

  // Skip if already went through review mode (avoid double-checking)
  if (context.reviewMode) {
    return true;
  }

  // Skip if response is just error message
  if (/^(error|failed|unable to)/i.test(response.trim())) {
    return true;
  }

  return false;
}
