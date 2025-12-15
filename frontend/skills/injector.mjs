/**
 * Skills Injector (T503)
 *
 * Handles injection of relevant skills into conversation prompts.
 * Analyzes user messages and determines which skills should be made
 * available to the AI.
 *
 * @module skills/injector
 */

import { getRegistry } from './registry.mjs';

/**
 * Skill injection strategies
 */
const STRATEGIES = {
  // Always inject all skills (useful for testing)
  ALL: 'all',

  // Only inject skills relevant to the current message
  RELEVANT: 'relevant',

  // Only inject skills matching specific tags
  TAGGED: 'tagged',

  // Never inject skills
  NONE: 'none'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  strategy: STRATEGIES.RELEVANT,
  maxSkills: 5, // Maximum number of skills to inject
  minRelevanceScore: 3, // Minimum score for relevance matching
  tags: [], // Tags to filter by (for TAGGED strategy)
  enabled: true
};

/**
 * Skills Injector
 *
 * Manages skill injection into conversation prompts
 */
export class SkillsInjector {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = getRegistry();
  }

  /**
   * Analyze message and determine which skills to inject
   *
   * @param {string} userMessage - User's message
   * @returns {Array} Skills to inject
   */
  analyzeMessage(userMessage) {
    if (!this.config.enabled) {
      return [];
    }

    const { strategy, maxSkills, minRelevanceScore, tags } = this.config;

    let candidateSkills = [];

    switch (strategy) {
      case STRATEGIES.ALL:
        candidateSkills = this.registry.getAll();
        break;

      case STRATEGIES.RELEVANT:
        candidateSkills = this.registry.findRelevantSkills(userMessage);
        // Filter by minimum relevance score
        candidateSkills = candidateSkills.filter(skill => {
          const score = this.registry.calculateRelevanceScore(
            skill,
            userMessage.toLowerCase()
          );
          return score >= minRelevanceScore;
        });
        break;

      case STRATEGIES.TAGGED:
        if (tags && tags.length > 0) {
          candidateSkills = this.registry.searchByTags(tags);
        }
        break;

      case STRATEGIES.NONE:
      default:
        candidateSkills = [];
        break;
    }

    // Limit number of skills
    const selectedSkills = candidateSkills.slice(0, maxSkills);

    return selectedSkills;
  }

  /**
   * Inject skills into system message
   *
   * @param {string} systemMessage - Original system message
   * @param {Array} skills - Skills to inject
   * @returns {string} Modified system message with skills
   */
  injectIntoSystemMessage(systemMessage, skills) {
    if (!skills || skills.length === 0) {
      return systemMessage;
    }

    const skillsBlock = this.registry.formatForPrompt(skills);

    // Append skills block to system message
    return `${systemMessage}\n\n${skillsBlock}`;
  }

  /**
   * Process a conversation and inject relevant skills
   *
   * @param {Array} messages - Conversation messages
   * @returns {Object} Processing result
   */
  processConversation(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { messages, skills: [] };
    }

    // Find the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return { messages, skills: [] };
    }

    // Analyze message to find relevant skills
    const skills = this.analyzeMessage(lastUserMessage.content);

    if (skills.length === 0) {
      return { messages, skills: [] };
    }

    // Find or create system message
    const systemMessageIndex = messages.findIndex(m => m.role === 'system');
    const modifiedMessages = [...messages];

    if (systemMessageIndex !== -1) {
      // Inject into existing system message
      const systemMessage = modifiedMessages[systemMessageIndex];
      modifiedMessages[systemMessageIndex] = {
        ...systemMessage,
        content: this.injectIntoSystemMessage(systemMessage.content, skills)
      };
    } else {
      // Create new system message with skills
      const skillsBlock = this.registry.formatForPrompt(skills);
      modifiedMessages.unshift({
        role: 'system',
        content: `You are an AI assistant with access to specialized skills.\n\n${skillsBlock}`
      });
    }

    return {
      messages: modifiedMessages,
      skills,
      injected: true,
      skillNames: skills.map(s => s.name)
    };
  }

  /**
   * Update configuration
   *
   * @param {Object} config - New configuration
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   *
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get statistics about skill injection
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      strategy: this.config.strategy,
      maxSkills: this.config.maxSkills,
      totalSkillsAvailable: this.registry.getAll().length
    };
  }
}

/**
 * Create a skills injector instance
 *
 * @param {Object} config - Configuration
 * @returns {SkillsInjector} Injector instance
 */
export function createInjector(config = {}) {
  return new SkillsInjector(config);
}

/**
 * Quick helper: Inject skills into messages array
 *
 * @param {Array} messages - Conversation messages
 * @param {Object} config - Injector configuration
 * @returns {Object} Processing result
 */
export function injectSkills(messages, config = {}) {
  const injector = createInjector(config);
  return injector.processConversation(messages);
}

export { STRATEGIES };
