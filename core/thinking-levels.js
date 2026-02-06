/**
 * Thinking Levels Module for Forgekeeper
 *
 * Routes different types of cognitive work to appropriate thinking depths.
 * Higher thinking levels encourage more thorough analysis in Claude prompts.
 *
 * Thinking levels control extended thinking budget allocation:
 *   off     - No extended thinking (budget: 0)
 *   minimal - Light touch (budget: 1024)
 *   low     - Brief consideration (budget: 4096)
 *   medium  - Standard analysis (budget: 10000)
 *   high    - Deep analysis (budget: 16000)
 *   xhigh   - Maximum depth (budget: 32000)
 *
 * Environment variable overrides:
 *   FK_THINKING_LEVEL_CHAT     - Override for chat context
 *   FK_THINKING_LEVEL_REFLECTION - Override for reflection context
 *   FK_THINKING_LEVEL_TASK     - Override for task context
 *   FK_THINKING_LEVEL_PLANNING - Override for planning context
 *   FK_THINKING_LEVEL_QUERY    - Override for query context
 */

import { config } from '../config.js';

/**
 * Thinking level definitions
 */
export const THINKING_LEVELS = {
  off: {
    name: 'off',
    budget: 0,
    description: 'No extended thinking',
  },
  minimal: {
    name: 'minimal',
    budget: 1024,
    description: 'Light touch - quick responses',
  },
  low: {
    name: 'low',
    budget: 4096,
    description: 'Brief consideration',
  },
  medium: {
    name: 'medium',
    budget: 10000,
    description: 'Standard analysis',
  },
  high: {
    name: 'high',
    budget: 16000,
    description: 'Deep analysis',
  },
  xhigh: {
    name: 'xhigh',
    budget: 32000,
    description: 'Maximum depth thinking',
  },
};

/**
 * Default thinking levels for each context type
 */
const DEFAULT_CONTEXT_LEVELS = {
  chat: 'minimal',
  reflection: 'medium',
  task: 'high',
  planning: 'xhigh',
  query: 'off',
};

/**
 * Valid context types
 */
const VALID_CONTEXTS = Object.keys(DEFAULT_CONTEXT_LEVELS);

/**
 * Valid thinking level names
 */
const VALID_LEVELS = Object.keys(THINKING_LEVELS);

/**
 * Get the environment variable name for a context type
 *
 * @param {string} context - Context type (chat, reflection, task, planning, query)
 * @returns {string} Environment variable name
 */
function getEnvVarName(context) {
  return `FK_THINKING_LEVEL_${context.toUpperCase()}`;
}

/**
 * Get the thinking level for a given context
 *
 * @param {string} context - Context type (chat, reflection, task, planning, query)
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.log=true] - Whether to log the thinking level used
 * @returns {Object} Thinking level object with name, budget, and description
 */
export function getThinkingLevel(context, options = {}) {
  const { log = true } = options;

  // Validate context
  if (!VALID_CONTEXTS.includes(context)) {
    console.warn(`[ThinkingLevels] Unknown context: "${context}", using default "chat"`);
    context = 'chat';
  }

  // Check for environment variable override
  const envVarName = getEnvVarName(context);
  const envOverride = process.env[envVarName];

  let levelName;

  if (envOverride) {
    // Validate the override
    if (VALID_LEVELS.includes(envOverride)) {
      levelName = envOverride;
      if (log) {
        console.log(`[ThinkingLevels] Context "${context}" using override level "${levelName}" (from ${envVarName})`);
      }
    } else {
      console.warn(`[ThinkingLevels] Invalid level "${envOverride}" in ${envVarName}, using default`);
      levelName = DEFAULT_CONTEXT_LEVELS[context];
    }
  } else {
    levelName = DEFAULT_CONTEXT_LEVELS[context];
  }

  const level = THINKING_LEVELS[levelName];

  if (log) {
    console.log(`[ThinkingLevels] Context "${context}" -> level "${levelName}" (budget: ${level.budget})`);
  }

  return { ...level };
}

/**
 * Apply thinking budget to Claude API options
 *
 * @param {string} context - Context type (chat, reflection, task, planning, query)
 * @param {Object} [apiOptions={}] - Existing API options to extend
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.log=true] - Whether to log the thinking level used
 * @returns {Object} API options with thinking budget applied
 */
export function applyThinkingBudget(context, apiOptions = {}, options = {}) {
  const level = getThinkingLevel(context, options);

  // If thinking is off, don't add any thinking-related options
  if (level.budget === 0) {
    return { ...apiOptions };
  }

  // Apply the thinking budget
  return {
    ...apiOptions,
    thinking: {
      type: 'enabled',
      budget_tokens: level.budget,
    },
  };
}

/**
 * Get all available thinking levels
 *
 * @returns {Object} Map of level names to level objects
 */
export function getAllLevels() {
  return { ...THINKING_LEVELS };
}

/**
 * Get all default context mappings
 *
 * @returns {Object} Map of context types to default level names
 */
export function getDefaultContextLevels() {
  return { ...DEFAULT_CONTEXT_LEVELS };
}

/**
 * Get valid context types
 *
 * @returns {string[]} Array of valid context type names
 */
export function getValidContexts() {
  return [...VALID_CONTEXTS];
}

/**
 * Get valid thinking level names
 *
 * @returns {string[]} Array of valid thinking level names
 */
export function getValidLevels() {
  return [...VALID_LEVELS];
}

/**
 * Check if a context type is valid
 *
 * @param {string} context - Context type to check
 * @returns {boolean} True if valid
 */
export function isValidContext(context) {
  return VALID_CONTEXTS.includes(context);
}

/**
 * Check if a thinking level name is valid
 *
 * @param {string} level - Level name to check
 * @returns {boolean} True if valid
 */
export function isValidLevel(level) {
  return VALID_LEVELS.includes(level);
}

// Export for testing
export const _internal = {
  DEFAULT_CONTEXT_LEVELS,
  VALID_CONTEXTS,
  VALID_LEVELS,
  getEnvVarName,
};

export default {
  THINKING_LEVELS,
  getThinkingLevel,
  applyThinkingBudget,
  getAllLevels,
  getDefaultContextLevels,
  getValidContexts,
  getValidLevels,
  isValidContext,
  isValidLevel,
};
