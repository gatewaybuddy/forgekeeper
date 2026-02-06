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
    // Message settings
    maxLength: parseInt(process.env.FK_TELEGRAM_MAX_LENGTH || '4096'), // Telegram's limit per message
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

  // Content Security (prompt injection protection)
  security: {
    externalContentWrapping: process.env.FK_CONTENT_SECURITY_ENABLED !== '0',
    logInjectionPatterns: process.env.FK_SECURITY_LOG_PATTERNS !== '0',
    securityLogPath: process.env.FK_SECURITY_LOG_PATH || 'forgekeeper_personality/journal/security_events.jsonl',
  },

  // Event Hooks (behavior modification system)
  hooks: {
    enabled: process.env.FK_HOOKS_ENABLED !== '0',
    hooksDir: process.env.FK_HOOKS_DIR || 'forgekeeper_personality/hooks',
    debug: process.env.FK_HOOKS_DEBUG === '1',
  },

  // Session Hydration (lazy loading)
  sessionHydration: {
    enabled: process.env.FK_SESSION_HYDRATION_ENABLED === '1',
    chunkSize: parseInt(process.env.FK_SESSION_CHUNK_SIZE || '100'),
    cacheSize: parseInt(process.env.FK_SESSION_CACHE_SIZE || '5'),
    retentionDays: parseInt(process.env.FK_SESSION_RETENTION_DAYS || '30'),
  },

  // Context Flush (auto-save context before limit)
  contextFlush: {
    enabled: process.env.FK_CONTEXT_FLUSH_ENABLED !== '0',
    threshold: parseFloat(process.env.FK_CONTEXT_FLUSH_THRESHOLD || '0.8'),
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

  // Reflection Meta-Analysis (prompt evolution)
  reflectionMeta: {
    enabled: process.env.FK_REFLECTION_META_ENABLED !== '0',
    repetitionThreshold: parseInt(process.env.FK_REFLECTION_REPETITION_THRESHOLD || '3'),
    autoApply: process.env.FK_REFLECTION_AUTO_APPLY === '1',
  },

  // Reflection Tools (read-only situational awareness)
  reflectionTools: {
    enabled: process.env.FK_REFLECTION_TOOLS_ENABLED === '1',
  },

  // Semantic Memory (vector-based recall)
  semanticMemory: {
    enabled: process.env.FK_SEMANTIC_MEMORY_ENABLED === '1',
    topK: parseInt(process.env.FK_SEMANTIC_TOP_K || '3'),
    model: process.env.FK_SEMANTIC_MODEL || 'Xenova/all-MiniLM-L6-v2',
  },

  // Agent Router (multi-agent routing)
  agentRouter: {
    enabled: process.env.FK_MULTI_AGENT_ENABLED === '1',
  },

  // Agent Pool (parallel task execution)
  agentPool: {
    enabled: process.env.FK_AGENT_POOL_ENABLED === '1',
    size: parseInt(process.env.FK_AGENT_POOL_SIZE || '3'),
  },

  // Agent Isolation (spawn isolated contexts for autonomous work)
  agentIsolation: {
    enabled: process.env.FK_AGENT_ISOLATION_ENABLED !== '0',
    maxAgents: parseInt(process.env.FK_MAX_ISOLATED_AGENTS || '2'),
    timeoutMs: parseInt(process.env.FK_AGENT_ISOLATION_TIMEOUT_MS || '300000'),
  },

  // Session-scoped Subagents (parallel work with result collection)
  subagents: {
    maxConcurrent: parseInt(process.env.FK_MAX_SUBAGENTS || '3'),
    defaultTimeoutMs: parseInt(process.env.FK_SUBAGENT_TIMEOUT_MS || '300000'),
  },

  // Elevated Mode (approval gates for dangerous operations)
  elevation: {
    enabled: process.env.FK_ELEVATION_ENABLED !== '0',
    timeoutMs: parseInt(process.env.FK_ELEVATION_TIMEOUT_MS || '300000'),
  },

  // Scheduled Task System
  scheduler: {
    enabled: process.env.FK_SCHEDULER_ENABLED !== '0',
    maxPerHour: parseInt(process.env.FK_SCHEDULER_MAX_PER_HOUR || '20'),
    rememberApproval: process.env.FK_SCHEDULER_REMEMBER_APPROVAL === '1',
    skipApproval: process.env.FK_SCHEDULER_SKIP_APPROVAL === '1',
  },

  // Hot-swappable Plugin System
  plugins: {
    enabled: process.env.FK_PLUGINS_ENABLED === '1',
    autoApproveSelf: process.env.FK_PLUGIN_AUTO_APPROVE_SELF === '1',
  },

  // ACE - Action Confidence Engine (graduated trust for autonomous actions)
  ace: {
    enabled: process.env.FK_ACE_ENABLED !== '0',
    bypassMode: process.env.FK_ACE_BYPASS_MODE || 'off', // off, log-only, disabled
    weights: {
      reversibility: parseFloat(process.env.FK_ACE_WEIGHT_REVERSIBILITY || '0.30'),
      precedent: parseFloat(process.env.FK_ACE_WEIGHT_PRECEDENT || '0.35'),
      blastRadius: parseFloat(process.env.FK_ACE_WEIGHT_BLAST_RADIUS || '0.35'),
    },
    thresholds: {
      act: parseFloat(process.env.FK_ACE_THRESHOLD_ACT || '0.70'),
      escalate: parseFloat(process.env.FK_ACE_THRESHOLD_ESCALATE || '0.40'),
    },
    rubberStampThreshold: parseInt(process.env.FK_ACE_RUBBER_STAMP_THRESHOLD || '10'),
    auditIntervalDays: parseInt(process.env.FK_ACE_AUDIT_INTERVAL_DAYS || '7'),
    decay: {
      lambda: parseFloat(process.env.FK_ACE_DECAY_LAMBDA || '0.01'),
      baseline: parseFloat(process.env.FK_ACE_DECAY_BASELINE || '0.20'),
    },
  },

  // Self-Improvement Pipeline (autonomous self-modification with validation)
  selfImprovement: {
    enabled: process.env.FK_SELF_IMPROVEMENT_ENABLED === '1',
    maxPerHour: parseInt(process.env.FK_SI_MAX_PER_HOUR || '3'),
    maxPerDay: parseInt(process.env.FK_SI_MAX_PER_DAY || '10'),
    pauseOnConsecutiveFailures: parseInt(process.env.FK_SI_PAUSE_ON_FAILURES || '3'),
    testCommand: process.env.FK_SI_TEST_COMMAND || 'node tests/run-all.js',
    testTimeoutMs: parseInt(process.env.FK_SI_TEST_TIMEOUT_MS || '60000'),
    digestIntervalDays: parseInt(process.env.FK_SI_DIGEST_INTERVAL_DAYS || '7'),
  },

  // Topic Router (multi-topic message handling)
  topicRouter: {
    enabled: process.env.FK_TOPIC_ROUTER_ENABLED === '1',
  },

  // Autonomous behavior (self-directed actions when idle)
  autonomous: {
    enabled: process.env.FK_AUTONOMOUS_ENABLED === '1',
    maxActionsPerHour: parseInt(process.env.FK_AUTONOMOUS_MAX_PER_HOUR || '10'),
    personalityPath: process.env.FK_PERSONALITY_PATH || 'forgekeeper_personality',
  },

  // Autonomous Feedback (task outcome tracking)
  autonomousFeedback: {
    enabled: process.env.FK_AUTONOMOUS_FEEDBACK_ENABLED !== '0',
    stuckThresholdMs: parseInt(process.env.FK_AUTONOMOUS_STUCK_THRESHOLD_MS || String(30 * 60 * 1000)),
  },

  // Session Manager (rotation, topic routing, stuck detection)
  sessionManager: {
    maxMessagesPerSession: parseInt(process.env.FK_SESSION_MAX_MESSAGES || '50'),
    maxSessionAgeHours: parseInt(process.env.FK_SESSION_MAX_AGE_HOURS || '24'),
    enableTopicRouting: process.env.FK_TOPIC_ROUTING_ENABLED === '1',
    resumeTimeoutMs: parseInt(process.env.FK_RESUME_TIMEOUT_MS || '60000'), // 60s - fail fast on slow resume
    smartRoutingMinutes: parseInt(process.env.FK_SMART_ROUTING_MINUTES || '60'), // Reconnect to sessions active in last hour
  },

  // Timeout configuration (all in milliseconds)
  // Idle timeout = no output for this long triggers timeout
  // Max timeout = absolute maximum regardless of activity
  timeouts: {
    // Quick queries (one-shot, no session)
    queryIdleMs: parseInt(process.env.FK_TIMEOUT_QUERY_IDLE_MS || '60000'),      // 60s
    queryMaxMs: parseInt(process.env.FK_TIMEOUT_QUERY_MAX_MS || '120000'),       // 2 min

    // Chat messages (conversational, session-based)
    chatIdleMs: parseInt(process.env.FK_TIMEOUT_CHAT_IDLE_MS || '90000'),        // 90s
    chatMaxMs: parseInt(process.env.FK_TIMEOUT_CHAT_MAX_MS || '180000'),         // 3 min

    // Complex tasks (exploration, multi-step work)
    taskIdleMs: parseInt(process.env.FK_TIMEOUT_TASK_IDLE_MS || '120000'),       // 2 min
    taskMaxMs: parseInt(process.env.FK_TIMEOUT_TASK_MAX_MS || '300000'),         // 5 min

    // Background/autonomous tasks (can run longer)
    backgroundIdleMs: parseInt(process.env.FK_TIMEOUT_BG_IDLE_MS || '180000'),   // 3 min
    backgroundMaxMs: parseInt(process.env.FK_TIMEOUT_BG_MAX_MS || '600000'),     // 10 min
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
