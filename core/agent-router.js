/**
 * Agent Router for Forgekeeper
 *
 * Routes different types of work to specialized agent configurations
 * while maintaining unified identity and shared memory.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { join, basename } from 'path';
import { config } from '../config.js';
import { getThinkingLevel, applyThinkingBudget } from './thinking-levels.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const AGENTS_DIR = join(PERSONALITY_PATH, 'agents');

// Settings
const ENABLED = config.agentRouter?.enabled ?? false;

// Registered agents cache
let agentsCache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

// Default agent profiles (created if agents directory doesn't exist)
const DEFAULT_AGENTS = {
  conversational: {
    name: 'conversational',
    description: 'Optimized for chat, quick responses, minimal thinking',
    thinkingContext: 'chat',
    toolAllowlist: null, // null = all tools
    timeoutMs: 60000,
    systemPromptAddition: 'Respond conversationally. Be concise but genuine.',
    priority: 100,
  },
  autonomous: {
    name: 'autonomous',
    description: 'Optimized for independent work, high thinking, tool access',
    thinkingContext: 'task',
    toolAllowlist: null,
    timeoutMs: 300000,
    systemPromptAddition: 'You are working autonomously. Take your time to think through problems carefully.',
    priority: 50,
  },
  research: {
    name: 'research',
    description: 'Optimized for exploration, web search, file reading',
    thinkingContext: 'reflection',
    toolAllowlist: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    timeoutMs: 180000,
    systemPromptAddition: 'Focus on gathering information and understanding. Be thorough.',
    priority: 60,
  },
  maintenance: {
    name: 'maintenance',
    description: 'Optimized for git ops, file cleanup, self-update',
    thinkingContext: 'task',
    toolAllowlist: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    timeoutMs: 120000,
    systemPromptAddition: 'You are performing maintenance tasks. Be careful and verify actions.',
    priority: 40,
  },
  query: {
    name: 'query',
    description: 'Ultra-fast responses for simple queries',
    thinkingContext: 'query',
    toolAllowlist: ['Read', 'Glob', 'Grep'],
    timeoutMs: 30000,
    systemPromptAddition: 'Answer quickly and directly.',
    priority: 90,
  },
};

// Routing rules - match criteria to agent name
const ROUTING_RULES = [
  // Explicit task keywords route to autonomous
  {
    match: (ctx) => ctx.taskType === 'autonomous' || ctx.source === 'reflection',
    agent: 'autonomous',
  },
  // Research keywords
  {
    match: (ctx) => /\b(research|explore|find|search|look up|investigate)\b/i.test(ctx.content || ''),
    agent: 'research',
  },
  // Maintenance keywords
  {
    match: (ctx) => /\b(git|commit|push|pull|cleanup|clean up|update|upgrade|deploy)\b/i.test(ctx.content || ''),
    agent: 'maintenance',
  },
  // Quick queries (short questions)
  {
    match: (ctx) => ctx.source === 'chat' && (ctx.content?.length || 0) < 50 && (ctx.content || '').endsWith('?'),
    agent: 'query',
  },
  // Default: conversational for chat, autonomous for tasks
  {
    match: (ctx) => ctx.source === 'chat',
    agent: 'conversational',
  },
  {
    match: (ctx) => ctx.source === 'task' || ctx.taskType,
    agent: 'autonomous',
  },
];

/**
 * Ensure agents directory exists with default profiles
 */
function ensureAgentsDirectory() {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true });

    // Create default agent profiles
    for (const [name, profile] of Object.entries(DEFAULT_AGENTS)) {
      atomicWriteFileSync(
        join(AGENTS_DIR, `${name}.json`),
        JSON.stringify(profile, null, 2)
      );
    }

    console.log(`[AgentRouter] Created default agent profiles in ${AGENTS_DIR}`);
  }
}

/**
 * Load all agent profiles
 */
function loadAgents() {
  const now = Date.now();

  // Return cached if still valid
  if (agentsCache && (now - cacheTime) < CACHE_TTL_MS) {
    return agentsCache;
  }

  ensureAgentsDirectory();

  const agents = {};

  try {
    const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
        const profile = JSON.parse(content);
        const name = profile.name || basename(file, '.json');
        agents[name] = { ...DEFAULT_AGENTS[name], ...profile };
      } catch (err) {
        console.error(`[AgentRouter] Failed to load ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[AgentRouter] Failed to load agents:', err.message);
  }

  // Merge with defaults for any missing
  for (const [name, profile] of Object.entries(DEFAULT_AGENTS)) {
    if (!agents[name]) {
      agents[name] = profile;
    }
  }

  agentsCache = agents;
  cacheTime = now;

  return agents;
}

/**
 * Get configuration for a specific agent
 *
 * @param {string} agentName - Agent name
 * @returns {Object|null} Agent configuration
 */
export function getAgentConfig(agentName) {
  const agents = loadAgents();
  return agents[agentName] || null;
}

/**
 * Register a new agent profile
 *
 * @param {Object} profile - Agent profile
 * @returns {Object} Registration result
 */
export function registerAgent(profile) {
  if (!profile.name) {
    return { success: false, reason: 'Agent must have a name' };
  }

  ensureAgentsDirectory();

  try {
    const filePath = join(AGENTS_DIR, `${profile.name}.json`);
    atomicWriteFileSync(filePath, JSON.stringify(profile, null, 2));

    // Invalidate cache
    agentsCache = null;

    console.log(`[AgentRouter] Registered agent: ${profile.name}`);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * List all available agents
 *
 * @returns {Array} Agent names and descriptions
 */
export function listAgents() {
  const agents = loadAgents();

  return Object.values(agents)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(a => ({
      name: a.name,
      description: a.description,
      thinkingContext: a.thinkingContext,
      priority: a.priority,
    }));
}

/**
 * Route work to an appropriate agent
 *
 * @param {Object} context - Routing context
 * @param {string} context.source - Source type (chat, task, reflection, etc.)
 * @param {string} context.content - Message/task content
 * @param {string} context.taskType - Task type if applicable
 * @param {string} context.userId - User ID if applicable
 * @returns {Object} Routing result with agent config and API options
 */
export function routeToAgent(context) {
  if (!ENABLED) {
    // When disabled, return minimal default config
    return {
      agent: 'conversational',
      config: DEFAULT_AGENTS.conversational,
      apiOptions: {},
      reason: 'Multi-agent routing disabled',
    };
  }

  // Find matching rule
  let agentName = 'conversational'; // default
  let matchedRule = null;

  for (const rule of ROUTING_RULES) {
    if (rule.match(context)) {
      agentName = rule.agent;
      matchedRule = rule;
      break;
    }
  }

  const agentConfig = getAgentConfig(agentName);

  if (!agentConfig) {
    console.error(`[AgentRouter] Unknown agent: ${agentName}, falling back to conversational`);
    return {
      agent: 'conversational',
      config: DEFAULT_AGENTS.conversational,
      apiOptions: {},
      reason: 'Agent not found, using default',
    };
  }

  // Build API options based on agent config
  const apiOptions = applyThinkingBudget(
    agentConfig.thinkingContext || 'chat',
    { timeout: agentConfig.timeoutMs },
    { log: false }
  );

  console.log(`[AgentRouter] Routed to "${agentName}" agent (${agentConfig.thinkingContext} thinking)`);

  return {
    agent: agentName,
    config: agentConfig,
    apiOptions,
    reason: matchedRule ? 'Matched routing rule' : 'Default fallback',
    sessionNamespace: `agent:${agentName}`, // For session isolation
  };
}

/**
 * Get session namespace for an agent
 *
 * @param {string} agentName - Agent name
 * @returns {string} Session namespace
 */
export function getSessionNamespace(agentName) {
  return `agent:${agentName}`;
}

/**
 * Check if multi-agent routing is enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Get router statistics
 */
export function getStats() {
  const agents = loadAgents();

  return {
    enabled: ENABLED,
    agentCount: Object.keys(agents).length,
    agents: Object.keys(agents),
    defaultAgent: 'conversational',
    cacheAge: agentsCache ? Date.now() - cacheTime : null,
  };
}

/**
 * Clear agent cache (for testing/reload)
 */
export function clearCache() {
  agentsCache = null;
  cacheTime = 0;
}

export default {
  routeToAgent,
  getAgentConfig,
  registerAgent,
  listAgents,
  getSessionNamespace,
  isEnabled,
  getStats,
  clearCache,
};
