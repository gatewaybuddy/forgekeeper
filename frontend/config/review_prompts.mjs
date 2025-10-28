// Review prompt templates for self-review iteration feature
// Provides default review questions and prompt builders for both Harmony and OpenAI protocols

/**
 * Default review questions used to evaluate response quality.
 * These questions guide the model to assess completeness, accuracy, and quality.
 */
export const DEFAULT_REVIEW_QUESTIONS = [
  'Is this response satisfactory for the prompt?',
  'Does this response fully address all aspects of the user\'s question?',
  'Are there any errors, inconsistencies, repetitions, or areas that need improvement?',
  'Is this response complete, or was it cut off mid-thought?',
  'Rate this response on a scale of 0.0 to 1.0 (where 1.0 is perfect)',
];

/**
 * Build a review prompt for Harmony protocol models.
 *
 * @param {string} userQuestion - Original user question
 * @param {string} generatedResponse - The response to review
 * @param {Array<string>} questions - Custom review questions (optional, uses defaults if not provided)
 * @returns {Array<Object>} Messages array for Harmony protocol
 */
export function buildHarmonyReviewPrompt(userQuestion, generatedResponse, questions = null) {
  const reviewQuestions = questions || DEFAULT_REVIEW_QUESTIONS;
  const questionsList = reviewQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const systemMessage = 'You are a quality reviewer. Evaluate the following response for completeness, accuracy, and quality.';

  const userMessage = [
    'Original question:',
    userQuestion,
    '',
    'Generated response:',
    generatedResponse,
    '',
    'Review questions:',
    questionsList,
    '',
    'Provide:',
    '- Quality score (0.0 to 1.0)',
    '- Brief critique (2-3 sentences)',
    '- Specific improvements needed (if score < 0.7)',
  ].join('\n');

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build a review prompt for OpenAI-style models.
 *
 * @param {string} userQuestion - Original user question
 * @param {string} generatedResponse - The response to review
 * @param {Array<string>} questions - Custom review questions (optional)
 * @returns {Array<Object>} Messages array for OpenAI protocol
 */
export function buildOpenAIReviewPrompt(userQuestion, generatedResponse, questions = null) {
  // Same structure works for OpenAI-style APIs
  return buildHarmonyReviewPrompt(userQuestion, generatedResponse, questions);
}

/**
 * Build a regeneration prompt with critique feedback.
 * This prompt is used when the quality score is below threshold and we need to regenerate.
 *
 * @param {Array<Object>} originalMessages - Original conversation messages
 * @param {string} critique - The critique from the review
 * @param {number} qualityScore - The quality score received
 * @returns {Array<Object>} Messages array with critique injected
 */
export function buildRegenerationPrompt(originalMessages, critique, qualityScore) {
  const messages = [...originalMessages];

  const feedbackMessage = [
    'Your previous response received a quality score of ' + qualityScore.toFixed(2) + '.',
    'Review feedback:',
    critique,
    '',
    'Please regenerate the response addressing the feedback above.',
  ].join('\n');

  // Add as a developer message for Harmony, or system message for OpenAI
  messages.push({ role: 'developer', content: feedbackMessage });

  return messages;
}

/**
 * Extract quality score from review response.
 * Looks for patterns like "Quality score: 0.85" or "Score: 0.85" or "0.85/1.0"
 *
 * @param {string} reviewText - The review response text
 * @returns {number|null} Extracted score (0.0-1.0) or null if not found
 */
export function extractQualityScore(reviewText) {
  if (!reviewText || typeof reviewText !== 'string') return null;

  const text = reviewText.toLowerCase();

  // Pattern 1: "quality score: 0.85" or "score: 0.85"
  const pattern1 = /(?:quality\s+)?score\s*:?\s*([0-9]*\.?[0-9]+)/i;
  const match1 = text.match(pattern1);
  if (match1 && match1[1]) {
    const score = parseFloat(match1[1]);
    if (!isNaN(score) && score >= 0.0 && score <= 1.0) return score;
  }

  // Pattern 2: "0.85/1.0" or "0.85 / 1.0"
  const pattern2 = /([0-9]*\.?[0-9]+)\s*\/\s*1\.0/;
  const match2 = text.match(pattern2);
  if (match2 && match2[1]) {
    const score = parseFloat(match2[1]);
    if (!isNaN(score) && score >= 0.0 && score <= 1.0) return score;
  }

  // Pattern 3: Standalone decimal between 0 and 1 (e.g., "I rate this 0.85")
  const pattern3 = /\b([0-9]*\.?[0-9]+)\b/g;
  const matches = [...text.matchAll(pattern3)];
  for (const m of matches) {
    const score = parseFloat(m[1]);
    if (!isNaN(score) && score >= 0.0 && score <= 1.0) {
      // Prefer scores that appear after keywords
      const before = text.slice(Math.max(0, m.index - 20), m.index);
      if (/rate|score|quality|rating/i.test(before)) {
        return score;
      }
    }
  }

  // Last resort: return first valid score found
  for (const m of matches) {
    const score = parseFloat(m[1]);
    if (!isNaN(score) && score >= 0.0 && score <= 1.0) return score;
  }

  return null;
}

/**
 * Extract critique text from review response.
 * Looks for the critique section in the review.
 *
 * @param {string} reviewText - The review response text
 * @returns {string} Extracted critique or the full text if no specific critique section found
 */
export function extractCritique(reviewText) {
  if (!reviewText || typeof reviewText !== 'string') return '';

  const text = reviewText.trim();

  // Look for "Critique:" section
  const critiquePattern = /critique\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n[A-Z][a-z]+\s*:|$)/i;
  const match = text.match(critiquePattern);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Look for "Feedback:" section
  const feedbackPattern = /feedback\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n[A-Z][a-z]+\s*:|$)/i;
  const match2 = text.match(feedbackPattern);
  if (match2 && match2[1]) {
    return match2[1].trim();
  }

  // Look for "Improvements:" section
  const improvementsPattern = /improvements?\s*(?:needed)?\s*:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n[A-Z][a-z]+\s*:|$)/i;
  const match3 = text.match(improvementsPattern);
  if (match3 && match3[1]) {
    return match3[1].trim();
  }

  // Return full text if no specific section found
  return text;
}

/**
 * Get review configuration from environment variables with defaults.
 *
 * @returns {Object} Configuration object
 */
export function getReviewConfig() {
  return {
    enabled: (process.env.FRONTEND_ENABLE_REVIEW || '0') === '1',
    iterations: Number(process.env.FRONTEND_REVIEW_ITERATIONS || '3'),
    threshold: Number(process.env.FRONTEND_REVIEW_THRESHOLD || '0.7'),
    maxRegenerations: Number(process.env.FRONTEND_REVIEW_MAX_REGENERATIONS || '2'),
    evalTokens: Number(process.env.FRONTEND_REVIEW_EVAL_TOKENS || '512'),
    mode: process.env.FRONTEND_REVIEW_MODE || 'always', // always, never, on_error, on_incomplete, on_complex
  };
}

/**
 * Determine if review should be triggered based on mode and context.
 *
 * @param {string} mode - Review mode (always, never, on_error, on_incomplete, on_complex)
 * @param {Object} context - Context object with response, error, etc.
 * @returns {boolean} Whether to trigger review
 */
export function shouldTriggerReview(mode, context = {}) {
  if (mode === 'always') return true;
  if (mode === 'never') return false;

  if (mode === 'on_error') {
    return !!(context.error || context.hasError);
  }

  if (mode === 'on_incomplete') {
    // Check if response appears incomplete
    const text = context.response || '';
    if (!text || text.length < 32) return true;
    const last = text.slice(-1);
    if (!'.!?'.includes(last)) return true;
    const ticks = (text.match(/```/g) || []).length;
    return (ticks % 2 === 1);
  }

  if (mode === 'on_complex') {
    // Check if original question is complex
    const question = context.question || '';
    const complexKeywords = [
      'explain in detail',
      'comprehensive',
      'step by step',
      'analyze',
      'compare and contrast',
      'evaluate',
      'multiple parts',
      'several aspects',
    ];
    return complexKeywords.some(kw => question.toLowerCase().includes(kw));
  }

  return false;
}
