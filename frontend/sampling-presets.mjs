/**
 * Sampling Parameter Presets for vLLM
 *
 * Based on comprehensive parameter sweep testing (243 tests across 27 configs)
 * See: .forgekeeper/testing/vllm-params/FINAL_REPORT.md
 *
 * Key Findings:
 * - Best overall: R6-12K-0.7-combo (48.1% correctness, 11252ms latency)
 * - Best for structured tasks: P2-12K-0.7-0.4 (48.1% correctness)
 * - Fastest: L4-12K-0.7-4K (46.7% correctness, 10217ms latency)
 * - Temperature 0.7 optimal for most tasks
 * - Top-K had minimal impact (recommend disabled)
 * - Frequency + presence penalty combo outperformed single repetition_penalty
 */

/**
 * Intent-based sampling presets
 *
 * Each preset is optimized for a specific task category based on empirical testing.
 * Use these by specifying an intent when making requests, or override individual
 * parameters as needed.
 */
export const SAMPLING_PRESETS = {
  /**
   * DEFAULT: R6 Combo - Best Overall Performance
   *
   * Use when: No specific intent specified
   * Optimized for: General-purpose tasks, balanced correctness/speed
   * Test results: 48.1% correctness, 11252ms latency
   */
  default: {
    temperature: 0.7,
    top_p: 1.0,           // R6 didn't restrict nucleus sampling
    top_k: -1,            // Disabled (testing showed no benefit)
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
    max_tokens: 8192,
    stop: null,
    description: 'R6 combo - best overall performance across all task types'
  },

  /**
   * EXTRACT / CLASSIFY / PLAN: Structured Output Tasks
   *
   * Use when: Extracting data, classifying, planning, structured reasoning
   * Optimized for: High correctness on structured tasks
   * Test results: P2-12K-0.7-0.4 achieved 48.1% correctness (tied for best)
   *
   * vLLM Features:
   * - guided_json: Constrain output to JSON schema
   * - guided_regex: Constrain output to regex pattern
   * - stop tokens: End generation at specific markers
   */
  extract: {
    temperature: 0.7,
    top_p: 0.4,           // Narrower sampling for structured tasks
    top_k: -1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
    max_tokens: 4096,
    stop: ['</json>', '</output>', '</result>'],
    // vLLM-specific (set these in request body when needed):
    // guided_json: { ... }  // JSON schema for constrained output
    // guided_regex: '...'   // Regex pattern for format enforcement
    description: 'Structured output tasks - extraction, classification, planning'
  },

  /**
   * CODE: Deterministic Code Generation
   *
   * Use when: Generating code, technical content, API calls
   * Optimized for: Consistent, repeatable code generation
   * Higher frequency_penalty to reduce code repetition
   */
  code: {
    temperature: 0.7,
    top_p: 0.4,
    top_k: -1,
    frequency_penalty: 0.07,  // Slightly higher to prevent repetitive code patterns
    presence_penalty: 0.05,
    max_tokens: 8192,
    stop: ['```\n\n', '```\r\n\r\n', '</code>'],
    description: 'Code generation - deterministic with repetition control'
  },

  /**
   * SUMMARIZE: Faithful Summarization
   *
   * Use when: Summarizing content, creating concise responses
   * Optimized for: Accurate, concise summaries
   * Note: Testing showed 40% success across ALL configs - this is a prompt
   *       engineering problem, not a parameter problem
   */
  summarize: {
    temperature: 0.7,
    top_p: 0.4,           // 0.4 outperformed 0.6 in testing (48.1% vs 46.7%)
    top_k: -1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
    max_tokens: 1024,     // Enforce brevity
    stop: null,
    description: 'Summarization - faithful, concise summaries'
  },

  /**
   * BRAINSTORM / CREATIVE: Creative, Exploratory Tasks
   *
   * Use when: Brainstorming, creative writing, open-ended exploration
   * Optimized for: Diversity and creativity
   * Test results: temp=1.0 was 46.7% correctness (slightly lower than 0.7)
   *               but fastest (10582ms) and most diverse
   */
  creative: {
    temperature: 1.0,     // Higher temp for more randomness
    top_p: 0.95,          // Broader sampling
    top_k: -1,
    frequency_penalty: 0.0,   // No penalties - encourage exploration
    presence_penalty: 0.0,
    max_tokens: 8192,
    stop: null,
    description: 'Creative/brainstorming - diverse, exploratory outputs'
  },

  /**
   * FAST: Speed-Optimized Configuration
   *
   * Use when: Speed matters more than marginal correctness gains
   * Optimized for: Minimum latency
   * Test results: L4-12K-0.7-4K was fastest (10217ms) with 46.7% correctness
   *               Only 1.4% less accurate than best, but ~10% faster
   */
  fast: {
    temperature: 0.7,
    top_p: 1.0,
    top_k: -1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
    max_tokens: 4096,     // Lower token limit for faster generation
    stop: null,
    description: 'Speed-optimized - fastest while maintaining good correctness'
  },

  /**
   * ANALYSIS: Deep Reasoning and Analysis
   *
   * Use when: Complex analysis, multi-step reasoning, detailed explanations
   * Optimized for: Thorough, detailed responses
   * Based on default preset but with higher token limit
   */
  analysis: {
    temperature: 0.7,
    top_p: 0.4,           // Focused sampling for analytical tasks
    top_k: -1,
    frequency_penalty: 0.05,
    presence_penalty: 0.05,
    max_tokens: 12288,    // Allow longer responses
    stop: null,
    description: 'Deep analysis - thorough reasoning and detailed explanations'
  }
};

/**
 * Get sampling preset by intent name
 * @param {string} intent - Intent name (default, extract, code, summarize, creative, fast, analysis)
 * @returns {object} Sampling parameters for the intent
 */
export function getPreset(intent = 'default') {
  const preset = SAMPLING_PRESETS[intent];
  if (!preset) {
    console.warn(`Unknown intent "${intent}", falling back to default`);
    return SAMPLING_PRESETS.default;
  }
  return { ...preset };  // Return copy to prevent mutation
}

/**
 * Merge preset with custom overrides
 * @param {string} intent - Base intent preset
 * @param {object} overrides - Custom parameter overrides
 * @returns {object} Merged sampling parameters
 */
export function mergePreset(intent, overrides = {}) {
  const preset = getPreset(intent);

  // Remove description before merging (not a sampling param)
  const { description, ...samplingParams } = preset;

  return {
    ...samplingParams,
    ...overrides
  };
}

/**
 * Detect intent from user prompt (heuristic-based)
 *
 * This is a simple heuristic. For production, consider:
 * - Fine-tuned classifier
 * - Explicit intent parameter from user
 * - Context-aware detection
 *
 * @param {string} prompt - User prompt text
 * @returns {string} Detected intent
 */
export function detectIntent(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  // Extract keywords
  if (lowerPrompt.match(/extract|parse|list all|find all|get.*from|identify/)) {
    return 'extract';
  }

  // Code keywords
  if (lowerPrompt.match(/write.*code|implement|function|class|api|script|debug/)) {
    return 'code';
  }

  // Summarize keywords
  if (lowerPrompt.match(/summarize|summary|tldr|brief|concise|in short/)) {
    return 'summarize';
  }

  // Creative keywords
  if (lowerPrompt.match(/brainstorm|creative|imagine|story|poem|idea|invent/)) {
    return 'creative';
  }

  // Analysis keywords
  if (lowerPrompt.match(/analyze|explain|why|how does|reasoning|because|detailed/)) {
    return 'analysis';
  }

  // Default fallback
  return 'default';
}

/**
 * Apply vLLM-specific extensions to request
 *
 * vLLM supports several extensions beyond standard OpenAI API:
 * - guided_json: Constrain output to JSON schema
 * - guided_regex: Constrain output to regex pattern
 * - guided_choice: Force selection from list of options
 *
 * See: https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
 *
 * @param {object} baseParams - Base sampling parameters
 * @param {object} guidedOptions - vLLM guided decoding options
 * @returns {object} Parameters with vLLM extensions
 */
export function applyGuidedDecoding(baseParams, guidedOptions = {}) {
  const extended = { ...baseParams };

  if (guidedOptions.json) {
    extended.guided_json = guidedOptions.json;
  }

  if (guidedOptions.regex) {
    extended.guided_regex = guidedOptions.regex;
  }

  if (guidedOptions.choice) {
    extended.guided_choice = guidedOptions.choice;
  }

  if (guidedOptions.grammar) {
    extended.guided_grammar = guidedOptions.grammar;
  }

  return extended;
}

/**
 * List all available presets with descriptions
 * @returns {object} Map of intent names to descriptions
 */
export function listPresets() {
  const presets = {};
  for (const [name, config] of Object.entries(SAMPLING_PRESETS)) {
    presets[name] = config.description;
  }
  return presets;
}

export default SAMPLING_PRESETS;
