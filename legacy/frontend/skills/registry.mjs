/**
 * Skills Registry (T502)
 *
 * Centralized registry for managing loaded skills.
 * Provides query, search, and caching functionality.
 *
 * @module skills/registry
 */

import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import path from 'node:path';
import {
  loadAllSkills,
  reloadSkills,
  getSkillByName,
  searchSkillsByTags,
  searchSkillsByDescription,
  formatSkillsForPrompt
} from './loader.mjs';

/**
 * Skills Registry
 *
 * Singleton class that manages all loaded skills
 */
export class SkillsRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = options;
    this.skills = [];
    this.initialized = false;
    this.lastLoadTime = null;
    this.watcher = null;

    // Configuration
    this.projectSkillsDir = options.projectSkillsDir || path.resolve(process.cwd(), '.claude/skills');
    this.enableHotReload = options.enableHotReload !== false; // Default: enabled
    this.reloadDebounceMs = options.reloadDebounceMs || 500;
    this.reloadTimer = null;
  }

  /**
   * Initialize the registry by loading all skills
   */
  async initialize() {
    if (this.initialized) {
      console.log('[Skills Registry] Already initialized');
      return;
    }

    console.log('[Skills Registry] Initializing...');

    try {
      // Load skills
      this.skills = await loadAllSkills(this.options);
      this.lastLoadTime = Date.now();
      this.initialized = true;

      // Start hot-reload watcher if enabled
      if (this.enableHotReload) {
        await this.startWatcher();
      }

      this.emit('initialized', { skillCount: this.skills.length });
      console.log(`[Skills Registry] Initialized with ${this.skills.length} skills`);

    } catch (error) {
      console.error('[Skills Registry] Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start file watcher for hot-reload
   */
  async startWatcher() {
    try {
      console.log(`[Skills Registry] Starting watcher on ${this.projectSkillsDir}`);

      this.watcher = watch(
        this.projectSkillsDir,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          // Only reload for SKILL.md files
          if (filename.includes('SKILL.md')) {
            console.log(`[Skills Registry] Detected change in ${filename}, scheduling reload...`);
            this.scheduleReload();
          }
        }
      );

      console.log('[Skills Registry] Hot-reload enabled');

    } catch (error) {
      console.warn('[Skills Registry] Failed to start watcher:', error.message);
      // Non-fatal, continue without hot-reload
    }
  }

  /**
   * Schedule a reload (with debounce to avoid rapid reloads)
   */
  scheduleReload() {
    // Clear existing timer
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    // Schedule new reload
    this.reloadTimer = setTimeout(async () => {
      try {
        await this.reload();
      } catch (error) {
        console.error('[Skills Registry] Reload failed:', error);
        this.emit('reload-error', error);
      }
    }, this.reloadDebounceMs);
  }

  /**
   * Reload all skills
   */
  async reload() {
    console.log('[Skills Registry] Reloading skills...');

    try {
      const oldCount = this.skills.length;
      this.skills = await reloadSkills(this.options);
      const newCount = this.skills.length;
      this.lastLoadTime = Date.now();

      this.emit('reloaded', {
        oldCount,
        newCount,
        added: Math.max(0, newCount - oldCount),
        removed: Math.max(0, oldCount - newCount)
      });

      console.log(`[Skills Registry] Reloaded: ${oldCount} → ${newCount} skills`);

    } catch (error) {
      console.error('[Skills Registry] Reload failed:', error);
      this.emit('reload-error', error);
      throw error;
    }
  }

  /**
   * Shutdown the registry
   */
  async shutdown() {
    console.log('[Skills Registry] Shutting down...');

    // Stop watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear reload timer
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    this.initialized = false;
    this.emit('shutdown');
    console.log('[Skills Registry] Shutdown complete');
  }

  /**
   * Get all skills
   *
   * @returns {Array} All loaded skills
   */
  getAll() {
    return this.skills;
  }

  /**
   * Get skill by name
   *
   * @param {string} name - Skill name
   * @returns {Object|null} Skill or null if not found
   */
  get(name) {
    return getSkillByName(this.skills, name);
  }

  /**
   * Search skills by tags
   *
   * @param {Array<string>} tags - Tags to search for
   * @returns {Array} Matching skills
   */
  searchByTags(tags) {
    return searchSkillsByTags(this.skills, tags);
  }

  /**
   * Search skills by description
   *
   * @param {string} query - Search query
   * @returns {Array} Matching skills
   */
  searchByDescription(query) {
    return searchSkillsByDescription(this.skills, query);
  }

  /**
   * Find skills relevant to a user message
   *
   * @param {string} message - User message
   * @returns {Array} Relevant skills
   */
  findRelevantSkills(message) {
    if (!message || typeof message !== 'string') {
      return [];
    }

    // Search by description
    const matches = this.searchByDescription(message);

    // Sort by relevance (simple keyword matching)
    const lowerMessage = message.toLowerCase();
    matches.sort((a, b) => {
      const aScore = this.calculateRelevanceScore(a, lowerMessage);
      const bScore = this.calculateRelevanceScore(b, lowerMessage);
      return bScore - aScore;
    });

    return matches;
  }

  /**
   * Calculate relevance score for a skill given a message
   *
   * @param {Object} skill - Skill to score
   * @param {string} lowerMessage - Lowercased user message
   * @returns {number} Relevance score
   */
  calculateRelevanceScore(skill, lowerMessage) {
    let score = 0;

    const lowerDesc = skill.description.toLowerCase();
    const lowerName = skill.name.toLowerCase();

    // Name match
    if (lowerMessage.includes(lowerName)) {
      score += 10;
    }

    // Description keywords match
    const descWords = lowerDesc.split(/\s+/);
    for (const word of descWords) {
      if (word.length > 3 && lowerMessage.includes(word)) {
        score += 1;
      }
    }

    // Tag match
    if (Array.isArray(skill.tags)) {
      for (const tag of skill.tags) {
        if (lowerMessage.includes(tag.toLowerCase())) {
          score += 5;
        }
      }
    }

    return score;
  }

  /**
   * Format skills for system prompt
   *
   * @param {Array} skills - Skills to format (defaults to all)
   * @returns {string} Formatted skills block
   */
  formatForPrompt(skills = null) {
    const skillsToFormat = skills || this.skills;
    return formatSkillsForPrompt(skillsToFormat);
  }

  /**
   * Get registry statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    const tagCounts = {};
    for (const skill of this.skills) {
      if (Array.isArray(skill.tags)) {
        for (const tag of skill.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    return {
      totalSkills: this.skills.length,
      enabledSkills: this.skills.filter(s => s.enabled).length,
      disabledSkills: this.skills.filter(s => !s.enabled).length,
      tags: tagCounts,
      lastLoadTime: this.lastLoadTime,
      hotReloadEnabled: this.enableHotReload,
      initialized: this.initialized
    };
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get the singleton registry instance
 *
 * @param {Object} options - Configuration options (only used on first call)
 * @returns {SkillsRegistry} Registry instance
 */
export function getRegistry(options = {}) {
  if (!registryInstance) {
    registryInstance = new SkillsRegistry(options);
  }
  return registryInstance;
}

/**
 * Initialize the singleton registry
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<SkillsRegistry>} Initialized registry
 */
export async function initializeRegistry(options = {}) {
  const registry = getRegistry(options);
  if (!registry.initialized) {
    await registry.initialize();
  }
  return registry;
}

/**
 * Shutdown the singleton registry
 */
export async function shutdownRegistry() {
  if (registryInstance) {
    await registryInstance.shutdown();
    registryInstance = null;
  }
}
