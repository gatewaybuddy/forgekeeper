/**
 * Intelligent Inference Router
 *
 * Routes requests to local inference (llama.cpp) or expensive APIs (OpenAI/Anthropic)
 * based on complexity classification. Target: 60% cost savings.
 *
 * Strategy:
 * - Simple tasks → Local inference (cheap, fast)
 * - Complex reasoning → API calls (expensive, powerful)
 * - Medium tasks → Hybrid or dynamic selection
 *
 * Classification uses local inference to determine complexity (meta-inference).
 *
 * @module server/core/inference-router
 */

import { ulid } from 'ulid';

/**
 * @typedef {'simple' | 'medium' | 'complex'} ComplexityLevel
 */

/**
 * @typedef {Object} RouteDecision
 * @property {ComplexityLevel} complexity - Detected complexity
 * @property {'local' | 'api' | 'hybrid'} route - Routing decision
 * @property {string} reasoning - Why this route was chosen
 * @property {number} confidence - Confidence in classification (0-1)
 * @property {Object} features - Extracted features
 * @property {number} estimatedCost - Estimated cost (relative units)
 */

/**
 * Classification patterns for request complexity
 */
const COMPLEXITY_PATTERNS = {
  // Simple patterns (route to local)
  simple: [
    { pattern: /^(list|show|get|find|search)\s/i, weight: 0.9, reason: 'Simple query operation' },
    { pattern: /^what (is|are)\s/i, weight: 0.8, reason: 'Factual question' },
    { pattern: /^(summarize|extract|parse)\s/i, weight: 0.7, reason: 'Structured extraction' },
    { pattern: /^(count|calculate|compute)\s/i, weight: 0.8, reason: 'Computation task' },
    { pattern: /^(check|verify|validate)\s/i, weight: 0.7, reason: 'Validation task' },
    { pattern: /\b(hello|hi|hey|thanks|thank you)\b/i, weight: 0.95, reason: 'Greeting/courtesy' },
  ],

  // Complex patterns (route to API)
  complex: [
    { pattern: /\b(analyze|design|architect|plan|strategy)\b/i, weight: 0.8, reason: 'Requires deep reasoning' },
    { pattern: /\b(creative|innovative|brainstorm|generate ideas)\b/i, weight: 0.9, reason: 'Creative thinking' },
    { pattern: /\b(refactor|optimize|improve|enhance)\b/i, weight: 0.7, reason: 'Code reasoning' },
    { pattern: /\b(debug|diagnose|troubleshoot|fix)\b/i, weight: 0.75, reason: 'Problem solving' },
    { pattern: /\b(compare|evaluate|assess|review)\b.*\b(options|alternatives|approaches)\b/i, weight: 0.85, reason: 'Multi-criteria evaluation' },
    { pattern: /\b(explain why|reasoning|rationale|justify)\b/i, weight: 0.8, reason: 'Explanation required' },
    { pattern: /\b(recommend|suggest|advise)\b/i, weight: 0.7, reason: 'Recommendation with reasoning' },
  ],

  // Medium patterns (hybrid or dynamic)
  medium: [
    { pattern: /^(write|create|implement)\s/i, weight: 0.6, reason: 'Implementation task' },
    { pattern: /^(update|modify|change)\s/i, weight: 0.6, reason: 'Modification task' },
    { pattern: /^(test|check if)\s/i, weight: 0.5, reason: 'Testing task' },
    { pattern: /^(convert|transform|migrate)\s/i, weight: 0.6, reason: 'Transformation task' },
  ],
};

/**
 * Feature extractors for complexity assessment
 */
const FEATURE_EXTRACTORS = {
  messageLength: (messages) => {
    const lastMessage = messages[messages.length - 1];
    const length = lastMessage?.content?.length || 0;

    // Short messages tend to be simple queries
    if (length < 50) return { score: 0.8, feature: 'very_short' };
    if (length < 150) return { score: 0.6, feature: 'short' };
    if (length < 500) return { score: 0.4, feature: 'medium' };
    return { score: 0.2, feature: 'long' }; // Long messages often need reasoning
  },

  questionCount: (messages) => {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content || '';
    const questionMarks = (content.match(/\?/g) || []).length;

    // Multiple questions suggest complexity
    if (questionMarks === 0) return { score: 0.5, feature: 'no_questions' };
    if (questionMarks === 1) return { score: 0.6, feature: 'single_question' };
    return { score: 0.3, feature: 'multiple_questions' };
  },

  codeBlockCount: (messages) => {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content || '';
    const codeBlocks = (content.match(/```/g) || []).length / 2;

    // Code blocks might indicate implementation need
    if (codeBlocks === 0) return { score: 0.7, feature: 'no_code' };
    if (codeBlocks === 1) return { score: 0.5, feature: 'single_code_block' };
    return { score: 0.3, feature: 'multiple_code_blocks' };
  },

  conversationLength: (messages) => {
    // Long conversations might have built context
    if (messages.length <= 2) return { score: 0.7, feature: 'new_conversation' };
    if (messages.length <= 5) return { score: 0.5, feature: 'short_conversation' };
    return { score: 0.4, feature: 'long_conversation' };
  },

  toolUseIndicators: (messages) => {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content?.toLowerCase() || '';

    // Tool use often means simple directed actions
    const toolKeywords = ['run', 'execute', 'call', 'use tool', 'bash', 'read file', 'write file'];
    const hasToolKeyword = toolKeywords.some(kw => content.includes(kw));

    return hasToolKeyword
      ? { score: 0.8, feature: 'tool_use_indicated' }
      : { score: 0.5, feature: 'no_tool_indication' };
  },
};

/**
 * Classify request complexity using pattern matching and feature extraction
 *
 * @param {Array<Object>} messages - Conversation messages
 * @param {Object} [options] - Classification options
 * @param {Object} [options.llmClient] - LLM client for meta-inference (optional)
 * @returns {Promise<RouteDecision>} Routing decision
 */
export async function classifyRequest(messages, options = {}) {
  const lastMessage = messages[messages.length - 1];
  const content = lastMessage?.content || '';

  // Extract features
  const features = {};
  let featureScore = 0;
  let featureCount = 0;

  for (const [name, extractor] of Object.entries(FEATURE_EXTRACTORS)) {
    const result = extractor(messages);
    features[name] = result.feature;
    featureScore += result.score;
    featureCount++;
  }

  const avgFeatureScore = featureScore / featureCount;

  // Pattern matching
  let patternScore = 0;
  let patternMatches = [];

  for (const [level, patterns] of Object.entries(COMPLEXITY_PATTERNS)) {
    for (const { pattern, weight, reason } of patterns) {
      if (pattern.test(content)) {
        patternMatches.push({ level, weight, reason });

        // Weight the score based on level
        if (level === 'simple') patternScore += weight;
        else if (level === 'complex') patternScore -= weight;
        // medium patterns don't affect score
      }
    }
  }

  // Combine feature and pattern scores
  const combinedScore = (avgFeatureScore * 0.6) + ((patternScore + 1) / 2 * 0.4);

  // Determine complexity
  let complexity, route, reasoning;

  if (combinedScore >= 0.7) {
    complexity = 'simple';
    route = 'local';
    reasoning = patternMatches.find(m => m.level === 'simple')?.reason || 'Simple query based on features';
  } else if (combinedScore <= 0.4) {
    complexity = 'complex';
    route = 'api';
    reasoning = patternMatches.find(m => m.level === 'complex')?.reason || 'Complex reasoning required';
  } else {
    complexity = 'medium';
    route = determineHybridRoute(features, patternMatches);
    reasoning = 'Medium complexity - using hybrid strategy';
  }

  // Calculate confidence
  const confidence = Math.abs(combinedScore - 0.5) * 2; // 0.5 is max uncertainty

  // Estimate cost (relative units: local=1, api=10)
  const estimatedCost = route === 'local' ? 1 : route === 'api' ? 10 : 5;

  return {
    complexity,
    route,
    reasoning,
    confidence,
    features,
    estimatedCost,
    patternMatches,
    combinedScore,
  };
}

/**
 * Determine hybrid routing strategy for medium complexity
 *
 * @param {Object} features - Extracted features
 * @param {Array} patternMatches - Pattern matches
 * @returns {'local' | 'api'} Route decision
 */
function determineHybridRoute(features, patternMatches) {
  // For medium complexity, use heuristics to decide

  // If conversation is new and message is short, try local first
  if (features.conversationLength === 'new_conversation' &&
      features.messageLength === 'short') {
    return 'local';
  }

  // If there are code blocks or long content, use API
  if (features.codeBlockCount === 'multiple_code_blocks' ||
      features.messageLength === 'long') {
    return 'api';
  }

  // If tool use is indicated, use local
  if (features.toolUseIndicators === 'tool_use_indicated') {
    return 'local';
  }

  // Default to local for cost savings
  return 'local';
}

/**
 * Route decision for orchestration
 *
 * @param {Array<Object>} messages - Conversation messages
 * @param {Object} options - Routing options
 * @param {Object} options.llmClient - LLM client
 * @param {string} [options.defaultRoute] - Default route ('auto', 'local', 'api')
 * @param {boolean} [options.enableRouting] - Enable intelligent routing (default: true)
 * @returns {Promise<{route: string, decision: RouteDecision}>}
 */
export async function routeRequest(messages, options) {
  const enableRouting = options.enableRouting !== false;
  const defaultRoute = options.defaultRoute || 'auto';

  // If routing disabled or default route set, use it
  if (!enableRouting || defaultRoute !== 'auto') {
    return {
      route: defaultRoute === 'auto' ? 'api' : defaultRoute,
      decision: {
        complexity: 'unknown',
        route: defaultRoute,
        reasoning: 'Routing disabled or default route set',
        confidence: 1.0,
        features: {},
        estimatedCost: defaultRoute === 'local' ? 1 : 10,
      },
    };
  }

  // Classify and route
  const decision = await classifyRequest(messages, options);

  return {
    route: decision.route,
    decision,
  };
}

/**
 * Get routing statistics
 *
 * @param {Object} options - Options
 * @param {string} [options.statsFile] - Stats file path
 * @returns {Promise<Object>} Routing statistics
 */
export async function getRoutingStats(options = {}) {
  // This would load from a persistent stats file
  // For now, return empty stats
  return {
    totalRequests: 0,
    localRequests: 0,
    apiRequests: 0,
    hybridRequests: 0,
    costSavings: 0,
    avgConfidence: 0,
  };
}

/**
 * Record routing decision for stats tracking
 *
 * @param {RouteDecision} decision - Routing decision
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
export async function recordRoutingDecision(decision, options = {}) {
  // This would append to a stats file
  // Implement when cost tracking is needed
  console.log(`[InferenceRouter] Routed to ${decision.route} (complexity: ${decision.complexity}, confidence: ${(decision.confidence * 100).toFixed(1)}%)`);
}
