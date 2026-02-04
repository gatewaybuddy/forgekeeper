/**
 * Agent Configuration Management
 *
 * Loads agent configurations from JSON file and provides CRUD operations.
 * Resolves environment variable references in configuration.
 */

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG_PATH = '.forgekeeper/conversation_spaces/agents.json';
const CONFIG_DOCKER_PATH = path.join('.forgekeeper', 'conversation_spaces', 'agents.json');

let cachedConfig = null;

/**
 * Resolve environment variable references in a string
 * Supports syntax: ${VAR} or ${VAR:-DEFAULT}
 */
function resolveEnvVar(value) {
  if (typeof value !== 'string') return value;

  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    // Handle ${VAR:-DEFAULT} syntax
    if (expr.includes(':-')) {
      const [varName, defaultVar] = expr.split(':-');
      return process.env[varName.trim()] || process.env[defaultVar.trim()] || '';
    }
    // Handle ${VAR} syntax
    return process.env[expr.trim()] || '';
  });
}

/**
 * Recursively resolve environment variables in an object
 */
function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return resolveEnvVar(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVars(value);
    }
    return resolved;
  }
  return obj;
}

/**
 * Load agents configuration from JSON file
 */
export async function loadAgentConfig(skipCache = false) {
  if (cachedConfig && !skipCache) {
    return cachedConfig;
  }

  try {
    // Try Docker path first, then host path
    let configData;
    try {
      configData = await fs.readFile(CONFIG_DOCKER_PATH, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        configData = await fs.readFile(CONFIG_PATH, 'utf8');
      } else {
        throw err;
      }
    }

    const config = JSON.parse(configData);

    // Resolve environment variables
    const resolved = resolveEnvVars(config);

    cachedConfig = resolved;
    return resolved;
  } catch (err) {
    console.error('[AgentConfig] Failed to load agent configuration:', err);
    throw err;
  }
}

/**
 * Get all enabled agents
 */
export async function getEnabledAgents() {
  const config = await loadAgentConfig();
  return config.agents.filter(agent => agent.enabled);
}

/**
 * Get a specific agent by ID
 */
export async function getAgent(agentId) {
  const config = await loadAgentConfig();
  return config.agents.find(agent => agent.id === agentId);
}

/**
 * Update an agent configuration
 */
export async function updateAgent(agentId, updates) {
  const config = await loadAgentConfig(true);
  const agentIndex = config.agents.findIndex(agent => agent.id === agentId);

  if (agentIndex === -1) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Merge updates
  config.agents[agentIndex] = {
    ...config.agents[agentIndex],
    ...updates,
    // Preserve nested objects
    prompt: { ...config.agents[agentIndex].prompt, ...(updates.prompt || {}) },
    provider: { ...config.agents[agentIndex].provider, ...(updates.provider || {}) }
  };

  // Save to file
  await saveAgentConfig(config);

  return config.agents[agentIndex];
}

/**
 * Create a new agent
 */
export async function createAgent(agentData) {
  const config = await loadAgentConfig(true);

  // Validate required fields
  const required = ['id', 'name', 'role', 'icon', 'color'];
  for (const field of required) {
    if (!agentData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Check for duplicate ID
  if (config.agents.find(agent => agent.id === agentData.id)) {
    throw new Error(`Agent ID already exists: ${agentData.id}`);
  }

  // Add defaults
  const newAgent = {
    enabled: true,
    contribution_threshold: 0.65,
    domain_keywords: [],
    channels: ['general'],
    prompt: { file: `${agentData.id}.txt`, version: 'v1' },
    provider: {
      type: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      apiKey: '${ANTHROPIC_API_KEY}',
      apiBase: 'https://api.anthropic.com'
    },
    ...agentData
  };

  config.agents.push(newAgent);

  await saveAgentConfig(config);

  return newAgent;
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId) {
  const config = await loadAgentConfig(true);
  const agentIndex = config.agents.findIndex(agent => agent.id === agentId);

  if (agentIndex === -1) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const deleted = config.agents.splice(agentIndex, 1)[0];

  await saveAgentConfig(config);

  return deleted;
}

/**
 * Save configuration to file
 */
async function saveAgentConfig(config) {
  try {
    // Try Docker path first
    let configPath = CONFIG_DOCKER_PATH;
    try {
      await fs.access(path.dirname(configPath));
    } catch {
      configPath = CONFIG_PATH;
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Clear cache
    cachedConfig = null;
  } catch (err) {
    console.error('[AgentConfig] Failed to save agent configuration:', err);
    throw err;
  }
}

/**
 * Get legacy AGENTS config format for backward compatibility
 */
export async function getLegacyAgentsConfig() {
  const config = await loadAgentConfig();
  const legacy = {};

  for (const agent of config.agents) {
    legacy[agent.id] = {
      provider: agent.provider.type,
      apiKey: agent.provider.apiKey,
      model: agent.provider.model,
      apiBase: agent.provider.apiBase
    };
  }

  return legacy;
}
