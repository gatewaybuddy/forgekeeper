// Forgekeeper v3 Configuration
// All settings in one place, environment-driven
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ quiet: true });

export const config = {
  // Core loop
  loop: {
    intervalMs: parseInt(process.env.FK_LOOP_INTERVAL_MS || '10000'), // 10 seconds
    maxConcurrentTasks: parseInt(process.env.FK_MAX_CONCURRENT || '1'),
  },

  // Claude Code integration
  claude: {
    command: process.env.FK_CLAUDE_CMD || 'claude',
    model: process.env.FK_CLAUDE_MODEL || 'opus', // opus, sonnet, haiku
    timeout: parseInt(process.env.FK_CLAUDE_TIMEOUT_MS || '300000'), // 5 minutes
    maxTokensPerTask: parseInt(process.env.FK_MAX_TOKENS_PER_TASK || '50000'),
    skipPermissions: process.env.FK_CLAUDE_SKIP_PERMISSIONS === '1',
  },

  // Telegram interface
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUsers: (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean),
    adminUsers: (process.env.TELEGRAM_ADMIN_USERS || '').split(',').filter(Boolean),
    // Resilience settings
    launchTimeoutMs: parseInt(process.env.FK_TELEGRAM_LAUNCH_TIMEOUT_MS || '120000'), // 2 minutes
    maxRetries: parseInt(process.env.FK_TELEGRAM_MAX_RETRIES || '5'),
    retryDelayMs: parseInt(process.env.FK_TELEGRAM_RETRY_DELAY_MS || '5000'), // 5 seconds base delay
    maxRetryDelayMs: parseInt(process.env.FK_TELEGRAM_MAX_RETRY_DELAY_MS || '60000'), // 1 minute max
    healthCheckIntervalMs: parseInt(process.env.FK_TELEGRAM_HEALTH_CHECK_MS || '30000'), // 30 seconds
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

  // Agent Pool (parallel task execution)
  agentPool: {
    enabled: process.env.FK_AGENT_POOL_ENABLED === '1',
    size: parseInt(process.env.FK_AGENT_POOL_SIZE || '3'),
  },

  // Topic Router (multi-topic message handling)
  topicRouter: {
    enabled: process.env.FK_TOPIC_ROUTER_ENABLED === '1',
  },

  // Autonomous behavior (self-directed actions when idle)
  autonomous: {
    enabled: process.env.FK_AUTONOMOUS_ENABLED === '1',
    maxActionsPerHour: parseInt(process.env.FK_AUTONOMOUS_MAX_PER_HOUR || '10'),
    personalityPath: process.env.FK_PERSONALITY_PATH || 'D:/Projects/forgekeeper_personality',
  },

  // Session Manager (rotation, topic routing, stuck detection)
  sessionManager: {
    maxMessagesPerSession: parseInt(process.env.FK_SESSION_MAX_MESSAGES || '50'),
    maxSessionAgeHours: parseInt(process.env.FK_SESSION_MAX_AGE_HOURS || '24'),
    enableTopicRouting: process.env.FK_TOPIC_ROUTING_ENABLED === '1',
    resumeTimeoutMs: parseInt(process.env.FK_RESUME_TIMEOUT_MS || '60000'), // 60s - fail fast on slow resume
    smartRoutingMinutes: parseInt(process.env.FK_SMART_ROUTING_MINUTES || '60'), // Reconnect to sessions active in last hour
  },

  // PM2 Integration
  pm2: {
    enabled: process.env.PM2_HOME || process.env.pm_id ? true : false,
    appName: process.env.FK_PM2_APP_NAME || 'forgekeeper',
  },

  // Convenience: data directory at top level
  dataDir: process.env.FK_DATA_DIR || './data',
};

export default config;
