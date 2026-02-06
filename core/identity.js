// Identity loader - shared utility for loading personality/imperatives
// Consolidates duplicated loading logic from autonomous.js, claude.js, inner-life.js, intent-translator.js
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const IMPERATIVES_PATH = join(PERSONALITY_PATH, 'identity/imperatives.json');
const GOALS_PATH = join(PERSONALITY_PATH, 'identity/goals.json');

// Cache to avoid repeated file reads
let cachedImperatives = null;
let imperativesLoadedAt = 0;
const CACHE_MS = 60000; // Refresh every minute

/**
 * Load imperatives/identity from personality repo.
 * Cached for 60 seconds to avoid repeated file reads.
 *
 * @param {object} options
 * @param {boolean} options.noCache - Bypass cache
 * @returns {object|null} Parsed imperatives or null
 */
export function loadImperatives({ noCache = false } = {}) {
  const now = Date.now();
  if (!noCache && cachedImperatives && (now - imperativesLoadedAt) < CACHE_MS) {
    return cachedImperatives;
  }

  if (!existsSync(IMPERATIVES_PATH)) {
    return null;
  }

  try {
    cachedImperatives = JSON.parse(readFileSync(IMPERATIVES_PATH, 'utf-8'));
    imperativesLoadedAt = now;
    return cachedImperatives;
  } catch (error) {
    console.error('[Identity] Failed to load imperatives:', error.message);
    return null;
  }
}

// Goals cache (same pattern as imperatives)
let cachedGoals = null;
let goalsLoadedAt = 0;

/**
 * Load personal goals from personality repo.
 * Cached for 60 seconds to avoid repeated file reads.
 *
 * @param {object} options
 * @param {boolean} options.noCache - Bypass cache
 * @returns {object|null} Parsed goals or null
 */
export function loadPersonalGoals({ noCache = false } = {}) {
  const now = Date.now();
  if (!noCache && cachedGoals && (now - goalsLoadedAt) < CACHE_MS) {
    return cachedGoals;
  }

  if (!existsSync(GOALS_PATH)) return null;
  try {
    cachedGoals = JSON.parse(readFileSync(GOALS_PATH, 'utf-8'));
    goalsLoadedAt = now;
    return cachedGoals;
  } catch (error) {
    console.error('[Identity] Failed to load goals:', error.message);
    return null;
  }
}

/** Get the personality base path */
export function getPersonalityPath() {
  return PERSONALITY_PATH;
}

export default { loadImperatives, loadPersonalGoals, getPersonalityPath };
