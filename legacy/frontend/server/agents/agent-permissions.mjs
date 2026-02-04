/**
 * Agent Permission Presets
 *
 * Defines tool access levels for different agent permission modes.
 * Implements principle of least privilege with gradual capability expansion.
 */

/**
 * Permission level presets
 */
export const PERMISSION_LEVELS = {
  // Level 0: No tools (conversation only)
  NONE: {
    id: 'none',
    name: 'None',
    description: 'No tool access - conversation only',
    icon: '🚫',
    allowed_tools: []
  },

  // Level 1: Read-only + self-tuning
  READ_ONLY: {
    id: 'read_only',
    name: 'Read Only',
    description: 'Can read files, search conversations, and tune own behavior',
    icon: '👁️',
    allowed_tools: [
      'get_time',
      'echo',
      'read_file',
      'read_dir',
      'search_conversations',
      'git_status',
      'git_diff',
      'http_fetch',
      'update_agent_config'
    ]
  },

  // Level 2: Read + restricted write
  READ_WRITE: {
    id: 'read_write',
    name: 'Read-Write',
    description: 'Can read/write files in sandbox, use git, but no shell access',
    icon: '✏️',
    allowed_tools: [
      'get_time',
      'echo',
      'read_file',
      'read_dir',
      'write_file',
      'write_repo_file',
      'search_conversations',
      'git_status',
      'git_diff',
      'git_add',
      'git_commit',
      'http_fetch',
      'update_agent_config'
    ]
  },

  // Level 3: Full git workflow
  GIT_WORKFLOW: {
    id: 'git_workflow',
    name: 'Git Workflow',
    description: 'Full git operations including push/pull',
    icon: '🔀',
    allowed_tools: [
      'get_time',
      'echo',
      'read_file',
      'read_dir',
      'write_file',
      'write_repo_file',
      'search_conversations',
      'git_status',
      'git_diff',
      'git_add',
      'git_commit',
      'git_push',
      'git_pull',
      'http_fetch',
      'update_agent_config',
      'restart_frontend'
    ]
  },

  // Level 4: Advanced - includes shell and tool creation
  ADVANCED: {
    id: 'advanced',
    name: 'Advanced',
    description: 'Shell access and tool creation (use with caution)',
    icon: '⚡',
    allowed_tools: [
      'get_time',
      'echo',
      'read_file',
      'read_dir',
      'write_file',
      'write_repo_file',
      'search_conversations',
      'git_status',
      'git_diff',
      'git_add',
      'git_commit',
      'git_push',
      'git_pull',
      'http_fetch',
      'run_bash',
      'run_powershell',
      'update_agent_config',
      'create_tool',
      'refresh_tools',
      'restart_frontend'
    ]
  },

  // Level 5: Full access (all tools)
  FULL: {
    id: 'full',
    name: 'Full Access',
    description: 'Unrestricted access to all tools',
    icon: '🔓',
    allowed_tools: ['*']  // Special case: all tools
  }
};

/**
 * Get permission level by ID
 */
export function getPermissionLevel(levelId) {
  return Object.values(PERMISSION_LEVELS).find(level => level.id === levelId) || PERMISSION_LEVELS.READ_ONLY;
}

/**
 * Get allowed tools for a permission level
 */
export function getAllowedTools(levelId, allAvailableTools = []) {
  const level = getPermissionLevel(levelId);

  // Special case: full access
  if (level.allowed_tools.includes('*')) {
    return allAvailableTools;
  }

  return level.allowed_tools;
}

/**
 * Check if a tool is allowed for a given permission level
 */
export function isToolAllowed(toolName, levelId, allAvailableTools = []) {
  const allowedTools = getAllowedTools(levelId, allAvailableTools);
  return allowedTools.includes(toolName);
}

/**
 * Filter tools by permission level
 */
export function filterToolsByPermission(tools, levelId) {
  const level = getPermissionLevel(levelId);

  // Special case: full access
  if (level.allowed_tools.includes('*')) {
    return tools;
  }

  // Filter to allowed tools only
  return tools.filter(tool => {
    const toolName = tool.function?.name || tool.name;
    return level.allowed_tools.includes(toolName);
  });
}

/**
 * Get default permission level for new agents
 */
export function getDefaultPermissionLevel() {
  return PERMISSION_LEVELS.READ_ONLY.id;
}

/**
 * Get permission level summary for display
 */
export function getPermissionSummary(levelId, allAvailableTools = []) {
  const level = getPermissionLevel(levelId);
  const allowedTools = getAllowedTools(levelId, allAvailableTools);

  return {
    level: level.name,
    icon: level.icon,
    description: level.description,
    tool_count: allowedTools.length,
    tools: allowedTools
  };
}

export default {
  PERMISSION_LEVELS,
  getPermissionLevel,
  getAllowedTools,
  isToolAllowed,
  filterToolsByPermission,
  getDefaultPermissionLevel,
  getPermissionSummary
};
