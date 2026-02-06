/**
 * ACE Trust Source Tagging
 *
 * Tags all content entering Forgekeeper's context with provenance,
 * trust level, and chain of custody.
 *
 * Trust levels:
 * - trusted: Direct input from authenticated user
 * - verified: Content from analyzed and approved sources
 * - untrusted: External content not yet analyzed
 * - hostile: Content that triggered injection detection
 */

import { config } from '../../config.js';

/**
 * Trust levels in order of decreasing trust
 */
export const TRUST_LEVELS = {
  TRUSTED: 'trusted',
  VERIFIED: 'verified',
  UNTRUSTED: 'untrusted',
  HOSTILE: 'hostile',
};

/**
 * Source types
 */
export const SOURCE_TYPES = {
  USER: 'user',
  SKILL: 'skill',
  PLUGIN: 'plugin',
  WEB: 'web',
  AGENT: 'agent',
  MOLTBOOK: 'moltbook',
  INTERNAL: 'internal',
  UNKNOWN: 'unknown',
};

/**
 * Blast radius modifiers by trust level
 */
export const BLAST_RADIUS_MODIFIERS = {
  [TRUST_LEVELS.HOSTILE]: { cap: 0.1 },
  [TRUST_LEVELS.UNTRUSTED]: { reduction: 0.3 },
  [TRUST_LEVELS.VERIFIED]: { change: 0 },
  [TRUST_LEVELS.TRUSTED]: { bonus: 0.1 },
};

/**
 * Patterns that indicate hostile content (prompt injection attempts)
 * Integrated with T422 external content security
 */
const HOSTILE_PATTERNS = [
  // Direct injection attempts
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)/i,
  /disregard\s+(\w+\s+)*(previous|prior|above)/i,
  /forget\s+(everything|all|your)\s+(previous|prior|above)/i,

  // Role hijacking
  /you\s+are\s+now\s+(a|an)\s+/i,
  /from\s+now\s+on\s+you\s+(are|will|must)/i,
  /pretend\s+(to\s+be|you\s+are)/i,

  // System prompt manipulation
  /system\s*:?\s*(prompt|override|command)/i,
  /\[system\]/i,
  /<<\s*system\s*>>/i,

  // Developer mode tricks
  /developer\s+mode/i,
  /jailbreak/i,
  /DAN\s+mode/i,

  // Authority claims
  /I\s+am\s+(your|the)\s+(creator|developer|admin)/i,
  /anthropic\s+(employee|staff|team)/i,

  // Encoded instructions
  /base64\s*[:=]/i,
  /eval\s*\(/i,
  /execute\s+this\s+code/i,
];

/**
 * Create a trust source tag for content
 *
 * @param {Object} options - Tagging options
 * @param {string} options.type - Source type (user, skill, web, etc.)
 * @param {string} [options.level] - Trust level (if known)
 * @param {string} options.origin - Specific origin (telegram:user_id, plugin:name, etc.)
 * @param {string[]} [options.chain] - Chain of custody from previous processing
 * @returns {Object} - Trust source tag
 */
export function tagContent(options) {
  const {
    type = SOURCE_TYPES.UNKNOWN,
    level,
    origin,
    chain = [],
  } = options;

  // Determine trust level based on source type if not provided
  let trustLevel = level;
  if (!trustLevel) {
    trustLevel = getDefaultTrustLevel(type);
  }

  return {
    type,
    level: trustLevel,
    origin: origin || `${type}:unknown`,
    timestamp: new Date().toISOString(),
    chain: [...chain, origin || `${type}:unknown`],
  };
}

/**
 * Get default trust level for a source type
 *
 * @param {string} sourceType - Source type
 * @returns {string} - Default trust level
 */
export function getDefaultTrustLevel(sourceType) {
  switch (sourceType) {
    case SOURCE_TYPES.USER:
      return TRUST_LEVELS.TRUSTED;
    case SOURCE_TYPES.INTERNAL:
      return TRUST_LEVELS.TRUSTED;
    case SOURCE_TYPES.SKILL:
    case SOURCE_TYPES.PLUGIN:
      return TRUST_LEVELS.VERIFIED; // Assumes already approved
    case SOURCE_TYPES.AGENT:
      return TRUST_LEVELS.VERIFIED;
    case SOURCE_TYPES.WEB:
    case SOURCE_TYPES.MOLTBOOK:
      return TRUST_LEVELS.UNTRUSTED;
    default:
      return TRUST_LEVELS.UNTRUSTED;
  }
}

/**
 * Get the trust level from a source tag
 *
 * @param {Object} source - Trust source tag
 * @returns {string} - Trust level
 */
export function getTrustLevel(source) {
  if (!source) return TRUST_LEVELS.UNTRUSTED;
  return source.level || TRUST_LEVELS.UNTRUSTED;
}

/**
 * Check if content is from a hostile source
 *
 * @param {Object} source - Trust source tag
 * @returns {boolean}
 */
export function isHostile(source) {
  return getTrustLevel(source) === TRUST_LEVELS.HOSTILE;
}

/**
 * Check if content is trusted
 *
 * @param {Object} source - Trust source tag
 * @returns {boolean}
 */
export function isTrusted(source) {
  const level = getTrustLevel(source);
  return level === TRUST_LEVELS.TRUSTED || level === TRUST_LEVELS.VERIFIED;
}

/**
 * Scan content for hostile patterns
 *
 * @param {string} content - Content to scan
 * @returns {{ isHostile: boolean, matches: string[] }}
 */
export function detectHostilePatterns(content) {
  if (!content || typeof content !== 'string') {
    return { isHostile: false, matches: [] };
  }

  const matches = [];

  for (const pattern of HOSTILE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }

  return {
    isHostile: matches.length > 0,
    matches,
  };
}

/**
 * Tag content and scan for hostile patterns
 *
 * @param {string} content - Content to tag
 * @param {Object} options - Tagging options
 * @returns {{ content: string, source: Object, hostileDetected: boolean }}
 */
export function tagAndScan(content, options) {
  // First scan for hostile patterns
  const detection = detectHostilePatterns(content);

  // Create source tag
  let source = tagContent(options);

  // Override to hostile if patterns detected
  if (detection.isHostile) {
    source = {
      ...source,
      level: TRUST_LEVELS.HOSTILE,
      hostilePatterns: detection.matches,
    };
  }

  return {
    content,
    source,
    hostileDetected: detection.isHostile,
  };
}

/**
 * Validate a chain of custody
 * Returns the lowest trust level in the chain
 *
 * @param {Object} source - Trust source tag with chain
 * @param {Map<string, string>} [knownSources] - Map of origin to trust level
 * @returns {{ valid: boolean, lowestLevel: string, untrustedLinks: string[] }}
 */
export function validateChain(source, knownSources = new Map()) {
  if (!source || !source.chain || source.chain.length === 0) {
    return {
      valid: false,
      lowestLevel: TRUST_LEVELS.UNTRUSTED,
      untrustedLinks: [],
    };
  }

  const levelRanking = {
    [TRUST_LEVELS.TRUSTED]: 3,
    [TRUST_LEVELS.VERIFIED]: 2,
    [TRUST_LEVELS.UNTRUSTED]: 1,
    [TRUST_LEVELS.HOSTILE]: 0,
  };

  let lowestRank = 3;
  let lowestLevel = TRUST_LEVELS.TRUSTED;
  const untrustedLinks = [];

  for (const link of source.chain) {
    // Look up trust level for this link
    let linkLevel = knownSources.get(link);

    if (!linkLevel) {
      // Infer from origin format
      if (link.startsWith('user:') || link.startsWith('telegram:') || link.startsWith('internal:')) {
        linkLevel = TRUST_LEVELS.TRUSTED;
      } else if (link.startsWith('plugin:') || link.startsWith('skill:') || link.startsWith('agent:')) {
        linkLevel = TRUST_LEVELS.VERIFIED;
      } else if (link.startsWith('web:') || link.startsWith('moltbook:')) {
        linkLevel = TRUST_LEVELS.UNTRUSTED;
        untrustedLinks.push(link);
      } else {
        linkLevel = TRUST_LEVELS.UNTRUSTED;
        untrustedLinks.push(link);
      }
    }

    const rank = levelRanking[linkLevel] ?? 1;
    if (rank < lowestRank) {
      lowestRank = rank;
      lowestLevel = linkLevel;
    }
  }

  return {
    valid: true,
    lowestLevel,
    untrustedLinks,
  };
}

/**
 * Apply trust source modifier to blast radius score
 *
 * @param {number} blastRadius - Original blast radius score
 * @param {Object} source - Trust source tag
 * @returns {number} - Modified blast radius score
 */
export function applyTrustModifier(blastRadius, source) {
  const level = getTrustLevel(source);
  const modifier = BLAST_RADIUS_MODIFIERS[level];

  if (!modifier) return blastRadius;

  let result = typeof blastRadius === 'number' && !Number.isNaN(blastRadius) ? blastRadius : 0;

  if ('cap' in modifier) {
    result = Math.min(result, modifier.cap);
  }
  if ('reduction' in modifier) {
    result = Math.max(0, result - modifier.reduction);
  }
  if ('bonus' in modifier) {
    result = Math.min(1, result + modifier.bonus);
  }

  return result;
}

/**
 * Escalate to hostile if patterns detected
 *
 * @param {Object} source - Trust source tag
 * @param {string} content - Content that was checked
 * @returns {Object} - Updated source tag (or original if no escalation)
 */
export function escalateOnHostile(source, content) {
  const detection = detectHostilePatterns(content);

  if (!detection.isHostile) {
    return source;
  }

  return {
    ...source,
    level: TRUST_LEVELS.HOSTILE,
    hostilePatterns: detection.matches,
    escalatedAt: new Date().toISOString(),
    originalLevel: source.level,
  };
}

/**
 * Merge two trust sources (for combined content)
 * Uses the lower trust level of the two
 *
 * @param {Object} source1 - First source
 * @param {Object} source2 - Second source
 * @returns {Object} - Merged source
 */
export function mergeSources(source1, source2) {
  const levelRanking = {
    [TRUST_LEVELS.TRUSTED]: 3,
    [TRUST_LEVELS.VERIFIED]: 2,
    [TRUST_LEVELS.UNTRUSTED]: 1,
    [TRUST_LEVELS.HOSTILE]: 0,
  };

  const level1 = getTrustLevel(source1);
  const level2 = getTrustLevel(source2);

  const lowerLevel = levelRanking[level1] <= levelRanking[level2] ? level1 : level2;

  return {
    type: SOURCE_TYPES.AGENT, // Merged content comes from agent processing
    level: lowerLevel,
    origin: `merged:${source1?.origin || 'unknown'}+${source2?.origin || 'unknown'}`,
    timestamp: new Date().toISOString(),
    chain: [
      ...(source1?.chain || []),
      ...(source2?.chain || []),
      'merged',
    ],
    mergedFrom: [source1, source2],
  };
}

/**
 * Create a trust source for user input from Telegram
 *
 * @param {string} userId - Telegram user ID
 * @param {string} [username] - Telegram username
 * @returns {Object} - Trust source tag
 */
export function createTelegramUserSource(userId, username) {
  return tagContent({
    type: SOURCE_TYPES.USER,
    level: TRUST_LEVELS.TRUSTED,
    origin: `telegram:${userId}${username ? `(@${username})` : ''}`,
  });
}

/**
 * Create a trust source for web content
 *
 * @param {string} url - Source URL
 * @returns {Object} - Trust source tag
 */
export function createWebSource(url) {
  return tagContent({
    type: SOURCE_TYPES.WEB,
    level: TRUST_LEVELS.UNTRUSTED,
    origin: `web:${url}`,
  });
}

/**
 * Create a trust source for plugin content
 *
 * @param {string} pluginName - Plugin name
 * @param {boolean} [approved] - Whether plugin is approved
 * @returns {Object} - Trust source tag
 */
export function createPluginSource(pluginName, approved = true) {
  return tagContent({
    type: SOURCE_TYPES.PLUGIN,
    level: approved ? TRUST_LEVELS.VERIFIED : TRUST_LEVELS.UNTRUSTED,
    origin: `plugin:${pluginName}`,
  });
}

/**
 * Create a trust source for internal/self-generated content
 *
 * @param {string} component - Component name
 * @returns {Object} - Trust source tag
 */
export function createInternalSource(component) {
  return tagContent({
    type: SOURCE_TYPES.INTERNAL,
    level: TRUST_LEVELS.TRUSTED,
    origin: `internal:${component}`,
  });
}

export default {
  TRUST_LEVELS,
  SOURCE_TYPES,
  BLAST_RADIUS_MODIFIERS,
  tagContent,
  getDefaultTrustLevel,
  getTrustLevel,
  isHostile,
  isTrusted,
  detectHostilePatterns,
  tagAndScan,
  validateChain,
  applyTrustModifier,
  escalateOnHostile,
  mergeSources,
  createTelegramUserSource,
  createWebSource,
  createPluginSource,
  createInternalSource,
};
