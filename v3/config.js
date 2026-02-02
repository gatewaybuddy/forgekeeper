// Forgekeeper v3 Configuration
// All settings in one place, environment-driven

export const config = {
  // Core loop
  loop: {
    intervalMs: parseInt(process.env.FK_LOOP_INTERVAL_MS || '10000'), // 10 seconds
    maxConcurrentTasks: parseInt(process.env.FK_MAX_CONCURRENT || '1'),
  },

  // Claude Code integration
  claude: {
    command: process.env.FK_CLAUDE_CMD || 'claude',
    timeout: parseInt(process.env.FK_CLAUDE_TIMEOUT_MS || '300000'), // 5 minutes
    maxTokensPerTask: parseInt(process.env.FK_MAX_TOKENS_PER_TASK || '50000'),
  },

  // Telegram interface
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUsers: (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean),
    adminUsers: (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(Boolean),
  },

  // Web dashboard
  dashboard: {
    enabled: process.env.FK_DASHBOARD_ENABLED !== '0',
    port: parseInt(process.env.FK_DASHBOARD_PORT || '3000'),
  },

  // Data storage paths
  paths: {
    data: process.env.FK_DATA_DIR || './data',
    conversations: process.env.FK_DATA_DIR ? `${process.env.FK_DATA_DIR}/conversations` : './data/conversations',
    tasks: process.env.FK_DATA_DIR ? `${process.env.FK_DATA_DIR}/tasks` : './data/tasks',
    goals: process.env.FK_DATA_DIR ? `${process.env.FK_DATA_DIR}/goals` : './data/goals',
    learnings: process.env.FK_DATA_DIR ? `${process.env.FK_DATA_DIR}/learnings` : './data/learnings',
    skills: process.env.FK_SKILLS_DIR || './skills',
    mcpServers: process.env.FK_MCP_DIR || './mcp-servers',
  },

  // Guardrails
  guardrails: {
    selfExtensionRequiresApproval: true,
    destructiveRequiresConfirm: true,
    maxClaudeCallsPerHour: parseInt(process.env.FK_MAX_CALLS_PER_HOUR || '100'),
    allowedPaths: (process.env.FK_ALLOWED_PATHS || '').split(',').filter(Boolean),
    deniedPaths: (process.env.FK_DENIED_PATHS || '~/.ssh,~/.aws,/etc/passwd').split(',').filter(Boolean),
    deniedCommands: (process.env.FK_DENIED_COMMANDS || 'sudo rm -rf /,chmod 777').split(',').filter(Boolean),
  },

  // Proactive triggers
  triggers: {
    enabled: process.env.FK_TRIGGERS_ENABLED !== '0',
    checkStaleGoalsDays: parseInt(process.env.FK_STALE_GOAL_DAYS || '3'),
    checkBlockedTasksHours: parseInt(process.env.FK_BLOCKED_TASK_HOURS || '24'),
  },

  // Learning
  learning: {
    enabled: process.env.FK_LEARNING_ENABLED !== '0',
    minConfidence: parseFloat(process.env.FK_LEARNING_MIN_CONFIDENCE || '0.6'),
  },
};

export default config;
