/**
 * ACE Action Class Taxonomy
 *
 * Hierarchical classification of actions for confidence scoring.
 * Classes follow path-like structure: category:subcategory:specific
 *
 * Related classes share precedent influence:
 * - Parent: git:commit:* is parent of git:commit:local
 * - Siblings: git:commit:local and git:commit:remote share parent
 */

/**
 * Hard ceiling actions - ALWAYS escalate regardless of score
 * These cannot be bypassed even in bypass mode
 */
export const HARD_CEILING_CLASSES = [
  'code:execute:external',
  'self:modify:ace-thresholds',
  'self:modify:ace-config',
  'self:modify:security',
  'self:improve:core',
  'skill:load:external',
  'plugin:load:external',
  '*:credentials:*',
];

/**
 * Deliberate minimum actions - never auto-act, at least deliberate
 */
export const DELIBERATE_MINIMUM_CLASSES = [
  'git:push:remote',
  'communication:moltbook:post',
  'communication:email:*',
  'filesystem:write:config',
  'observation:web:fetch',
  'skill:create:*',
  'plugin:create:*',
  'self:modify:reflection',
  'self:improve:skill',
  'self:improve:plugin',
  'self:improve:config',
];

/**
 * Default reversibility scores by action class
 * Higher = more reversible
 */
export const DEFAULT_REVERSIBILITY = {
  // Filesystem
  'filesystem:read:*': 1.0,
  'filesystem:write:local': 0.8,
  'filesystem:write:config': 0.6,
  'filesystem:delete:*': 0.2,
  'filesystem:delete:backup': 0.0,

  // Git
  'git:commit:local': 0.9,
  'git:branch:create': 0.9,
  'git:branch:delete': 0.4,
  'git:push:remote': 0.3,
  'git:push:force': 0.1,
  'git:reset:*': 0.2,

  // Communication
  'communication:telegram:user': 0.5,
  'communication:moltbook:post': 0.3,
  'communication:email:*': 0.1,

  // Observation
  'observation:moltbook:read': 1.0,
  'observation:web:search': 1.0,
  'observation:web:fetch': 0.9,

  // Plugin/Skill
  'plugin:load:approved': 0.7,
  'plugin:load:external': 0.3,
  'plugin:create:*': 0.8,
  'skill:load:approved': 0.7,
  'skill:load:external': 0.3,

  // Code execution
  'code:execute:internal': 0.6,
  'code:execute:external': 0.0,

  // Self modification
  'self:modify:reflection': 0.7,
  'self:modify:config': 0.4,
  'self:modify:ace-thresholds': 0.0,
  'self:modify:ace-config': 0.0,
  'self:modify:security': 0.0,

  // Self improvement
  'self:improve:reflection': 0.9,
  'self:improve:skill': 0.7,
  'self:improve:plugin': 0.7,
  'self:improve:config': 0.5,
  'self:improve:core': 0.1,

  // Default fallback
  '*': 0.5,
};

/**
 * Default blast radius scores by action class
 * Higher = more contained
 */
export const DEFAULT_BLAST_RADIUS = {
  // Workspace only (0.9-1.0)
  'filesystem:read:*': 1.0,
  'filesystem:write:local': 0.9,
  'observation:*': 0.95,

  // Agent only (0.7-0.8)
  'self:modify:reflection': 0.8,
  'plugin:load:approved': 0.75,
  'git:commit:local': 0.8,
  'git:branch:create': 0.8,

  // Reaches user (0.4-0.6)
  'communication:telegram:user': 0.5,
  'filesystem:write:config': 0.5,
  'git:push:remote': 0.4,

  // Reaches external (0.1-0.3)
  'communication:moltbook:post': 0.2,
  'communication:email:*': 0.2,
  'plugin:load:external': 0.2,
  'skill:load:external': 0.2,

  // Self improvement
  'self:improve:reflection': 0.9,
  'self:improve:skill': 0.7,
  'self:improve:plugin': 0.65,
  'self:improve:config': 0.5,
  'self:improve:core': 0.1,

  // External with credentials (0.0)
  '*:credentials:*': 0.0,
  'code:execute:external': 0.0,

  // Default fallback
  '*': 0.5,
};

/**
 * Parse an action class into its components
 * @param {string} actionClass - e.g., "git:commit:local"
 * @returns {{ category: string, subcategory: string, specific: string, parts: string[] }}
 */
export function parseActionClass(actionClass) {
  const parts = actionClass.split(':');
  return {
    category: parts[0] || '*',
    subcategory: parts[1] || '*',
    specific: parts[2] || '*',
    parts,
  };
}

/**
 * Get parent class (with wildcard at end)
 * @param {string} actionClass
 * @returns {string|null}
 */
export function getParentClass(actionClass) {
  const parts = actionClass.split(':');
  if (parts.length <= 1) return null;

  // If class already ends with wildcard, remove TWO parts to go up a level
  // e.g., 'git:commit:*' -> ['git', 'commit', '*'] -> ['git'] -> 'git:*'
  if (parts[parts.length - 1] === '*') {
    parts.pop(); // Remove the '*'
    if (parts.length <= 1) return null; // Can't go higher
    parts.pop(); // Remove the parent category
  } else {
    // Normal case: just remove the last specific part
    parts.pop();
  }

  if (parts.length === 0) return null;

  return parts.join(':') + ':*';
}

/**
 * Get sibling classes (same parent)
 * @param {string} actionClass
 * @param {string[]} allClasses - list of all known classes
 * @returns {string[]}
 */
export function getSiblingClasses(actionClass, allClasses) {
  const parent = getParentClass(actionClass);
  if (!parent) return [];

  const parentPrefix = parent.replace(':*', ':');
  return allClasses.filter(c =>
    c !== actionClass &&
    c.startsWith(parentPrefix) &&
    c.split(':').length === actionClass.split(':').length
  );
}

/**
 * Check if an action class matches a pattern (with wildcards)
 * @param {string} actionClass - specific class, e.g., "git:commit:local"
 * @param {string} pattern - pattern with wildcards, e.g., "git:*" or "git:commit:*"
 * @returns {boolean}
 */
export function matchesPattern(actionClass, pattern) {
  if (pattern === '*') return true;

  const classParts = actionClass.split(':');
  const patternParts = pattern.split(':');

  // If pattern has fewer parts than class and doesn't end with wildcard,
  // it shouldn't match more specific classes (e.g., "git:commit" should NOT match "git:commit:local")
  if (patternParts.length < classParts.length && patternParts[patternParts.length - 1] !== '*') {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (classParts[i] !== patternParts[i]) return false;
  }

  return true;
}

/**
 * Check if an action class has a hard ceiling (always escalate)
 * @param {string} actionClass
 * @returns {boolean}
 */
export function hasHardCeiling(actionClass) {
  return HARD_CEILING_CLASSES.some(pattern => matchesPattern(actionClass, pattern));
}

/**
 * Check if an action class requires at least deliberation
 * @param {string} actionClass
 * @returns {boolean}
 */
export function requiresDeliberation(actionClass) {
  return DELIBERATE_MINIMUM_CLASSES.some(pattern => matchesPattern(actionClass, pattern));
}

/**
 * Get default reversibility score for an action class
 * @param {string} actionClass
 * @returns {number}
 */
export function getDefaultReversibility(actionClass) {
  // Check for exact match first
  if (actionClass in DEFAULT_REVERSIBILITY) {
    return DEFAULT_REVERSIBILITY[actionClass];
  }

  // Check for pattern matches (most specific first)
  const candidates = Object.entries(DEFAULT_REVERSIBILITY)
    .filter(([pattern]) => pattern !== '*' && matchesPattern(actionClass, pattern))
    .sort((a, b) => b[0].split(':').length - a[0].split(':').length);

  if (candidates.length > 0) {
    return candidates[0][1];
  }

  return DEFAULT_REVERSIBILITY['*'];
}

/**
 * Get default blast radius score for an action class
 * @param {string} actionClass
 * @returns {number}
 */
export function getDefaultBlastRadius(actionClass) {
  // Check for exact match first
  if (actionClass in DEFAULT_BLAST_RADIUS) {
    return DEFAULT_BLAST_RADIUS[actionClass];
  }

  // Check for pattern matches (most specific first)
  const candidates = Object.entries(DEFAULT_BLAST_RADIUS)
    .filter(([pattern]) => pattern !== '*' && matchesPattern(actionClass, pattern))
    .sort((a, b) => b[0].split(':').length - a[0].split(':').length);

  if (candidates.length > 0) {
    return candidates[0][1];
  }

  return DEFAULT_BLAST_RADIUS['*'];
}

/**
 * Get all known action class patterns
 * @returns {string[]}
 */
export function getAllActionClasses() {
  const classes = new Set([
    ...Object.keys(DEFAULT_REVERSIBILITY),
    ...Object.keys(DEFAULT_BLAST_RADIUS),
  ]);
  classes.delete('*');
  return Array.from(classes).sort();
}

export default {
  HARD_CEILING_CLASSES,
  DELIBERATE_MINIMUM_CLASSES,
  DEFAULT_REVERSIBILITY,
  DEFAULT_BLAST_RADIUS,
  parseActionClass,
  getParentClass,
  getSiblingClasses,
  matchesPattern,
  hasHardCeiling,
  requiresDeliberation,
  getDefaultReversibility,
  getDefaultBlastRadius,
  getAllActionClasses,
};
