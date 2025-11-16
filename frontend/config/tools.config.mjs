// Centralized ToolShell configuration for T11: Harden execution sandbox and gating
// Defines allowlist, argument schemas, runtime limits, and feature flags

/**
 * Tool execution feature flag
 * When false, all tool execution is disabled with a gated error
 */
export const TOOLS_EXECUTION_ENABLED = process.env.TOOLS_EXECUTION_ENABLED !== '0';

/**
 * Tool runtime limits
 */
export const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS || '30000', 10); // 30 seconds default
export const TOOL_MAX_RETRIES = parseInt(process.env.TOOL_MAX_RETRIES || '0', 10); // No retries by default
export const TOOL_MAX_OUTPUT_BYTES = parseInt(process.env.TOOL_MAX_OUTPUT_BYTES || String(1024 * 1024), 10); // 1MB default

/**
 * Tool allowlist - centralized list of permitted tools
 * Can be overridden via TOOL_ALLOW env var (comma-separated)
 */
export const DEFAULT_ALLOWED_TOOLS = [
  'echo',
  'get_time',
  'read_dir',
  'read_file',
  'write_file',
  'write_repo_file',
  'http_fetch',
  'git_status',
  'git_diff',
  'git_add',
  'git_commit',
  'git_push',
  'git_pull',
  'run_bash',
  'run_powershell',
  'refresh_tools',
  'restart_frontend',
  'create_task_card',
  'check_pr_status'
];

/**
 * Get the effective tool allowlist
 * Respects TOOL_ALLOW env var if set
 */
export function getToolAllowlist() {
  const allow = (process?.env?.TOOL_ALLOW || '').trim();
  if (allow) {
    return new Set(allow.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return new Set(DEFAULT_ALLOWED_TOOLS);
}

/**
 * Argument validation schemas for tools
 * Define expected types and constraints for tool arguments
 */
export const TOOL_ARGUMENT_SCHEMAS = {
  echo: {
    text: { type: 'string', required: true, maxLength: 10000 }
  },
  get_time: {
    timezone: { type: 'string', required: false, maxLength: 100 }
  },
  read_dir: {
    path: { type: 'string', required: false, maxLength: 4096 }
  },
  read_file: {
    path: { type: 'string', required: true, maxLength: 4096 }
  },
  write_file: {
    path: { type: 'string', required: true, maxLength: 4096 },
    content: { type: 'string', required: true, maxLength: 10485760 } // 10MB
  },
  write_repo_file: {
    path: { type: 'string', required: true, maxLength: 4096 },
    content: { type: 'string', required: true, maxLength: 10485760 } // 10MB
  },
  http_fetch: {
    url: { type: 'string', required: true, maxLength: 2048 },
    method: { type: 'string', required: false, enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    headers: { type: 'object', required: false },
    body: { type: 'string', required: false, maxLength: 1048576 } // 1MB
  },
  git_status: {},
  git_diff: {
    staged: { type: 'boolean', required: false }
  },
  git_add: {
    files: { type: 'array', required: true, maxItems: 100 }
  },
  git_commit: {
    message: { type: 'string', required: true, maxLength: 10000 }
  },
  git_push: {
    remote: { type: 'string', required: false, maxLength: 256 },
    branch: { type: 'string', required: false, maxLength: 256 }
  },
  git_pull: {
    remote: { type: 'string', required: false, maxLength: 256 },
    branch: { type: 'string', required: false, maxLength: 256 }
  },
  run_bash: {
    command: { type: 'string', required: true, maxLength: 100000 }
  },
  run_powershell: {
    command: { type: 'string', required: true, maxLength: 100000 }
  },
  refresh_tools: {},
  restart_frontend: {},
  create_task_card: {
    title: { type: 'string', required: true, maxLength: 200 },
    description: { type: 'string', required: true, maxLength: 10000 },
    priority: { type: 'string', required: false, enum: ['low', 'medium', 'high', 'critical'] }
  },
  check_pr_status: {
    pr_number: { type: 'number', required: true, min: 1 }
  }
};

/**
 * Validate tool arguments against schema
 * @param {string} toolName - Name of the tool
 * @param {object} args - Arguments to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateToolArguments(toolName, args) {
  const schema = TOOL_ARGUMENT_SCHEMAS[toolName];

  // No schema defined = allow all arguments
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const errors = [];
  const argsObj = args || {};

  // Check all schema fields
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = argsObj[fieldName];

    // Check required fields
    if (fieldSchema.required && (value === undefined || value === null)) {
      errors.push(`Missing required argument: ${fieldName}`);
      continue;
    }

    // Skip optional missing fields
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (fieldSchema.type && actualType !== fieldSchema.type) {
      errors.push(`Argument '${fieldName}' must be of type ${fieldSchema.type}, got ${actualType}`);
      continue;
    }

    // String constraints
    if (fieldSchema.type === 'string') {
      if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
        errors.push(`Argument '${fieldName}' exceeds maximum length of ${fieldSchema.maxLength} characters`);
      }
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push(`Argument '${fieldName}' must be one of: ${fieldSchema.enum.join(', ')}`);
      }
    }

    // Number constraints
    if (fieldSchema.type === 'number') {
      if (fieldSchema.min !== undefined && value < fieldSchema.min) {
        errors.push(`Argument '${fieldName}' must be >= ${fieldSchema.min}`);
      }
      if (fieldSchema.max !== undefined && value > fieldSchema.max) {
        errors.push(`Argument '${fieldName}' must be <= ${fieldSchema.max}`);
      }
    }

    // Array constraints
    if (fieldSchema.type === 'array') {
      if (fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
        errors.push(`Argument '${fieldName}' exceeds maximum of ${fieldSchema.maxItems} items`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if a tool is allowed to execute
 * @param {string} toolName - Name of the tool
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkToolAllowed(toolName) {
  // Global execution toggle
  if (!TOOLS_EXECUTION_ENABLED) {
    return {
      allowed: false,
      reason: 'tool_execution_disabled',
      message: 'Tool execution is disabled via TOOLS_EXECUTION_ENABLED=0'
    };
  }

  // Allowlist check
  const allowlist = getToolAllowlist();
  if (!allowlist.has(toolName)) {
    return {
      allowed: false,
      reason: 'tool_not_in_allowlist',
      message: `Tool '${toolName}' is not in the allowlist. Allowed tools: ${Array.from(allowlist).join(', ')}`
    };
  }

  return { allowed: true };
}

/**
 * Structured log event for tool execution
 * @param {string} phase - Execution phase: 'start', 'finish', 'error'
 * @param {string} toolName - Name of the tool
 * @param {object} metadata - Additional metadata
 * @returns {object} Structured log object
 */
export function createToolLogEvent(phase, toolName, metadata = {}) {
  const baseEvent = {
    timestamp: new Date().toISOString(),
    event: 'tool_execution',
    phase, // 'start', 'finish', 'error'
    tool: toolName,
    version: '1.0.0', // Schema version for downstream consumers
  };

  // Add phase-specific fields
  switch (phase) {
    case 'start':
      return {
        ...baseEvent,
        args_preview: metadata.args ? JSON.stringify(metadata.args).slice(0, 200) : null,
        trace_id: metadata.trace_id || null,
        conv_id: metadata.conv_id || null,
      };

    case 'finish':
      return {
        ...baseEvent,
        elapsed_ms: metadata.elapsed_ms || 0,
        result_preview: metadata.result_preview || null,
        result_size_bytes: metadata.result_size_bytes || 0,
        trace_id: metadata.trace_id || null,
        conv_id: metadata.conv_id || null,
      };

    case 'error':
      return {
        ...baseEvent,
        error: metadata.error || 'unknown error',
        error_type: metadata.error_type || 'execution_error',
        elapsed_ms: metadata.elapsed_ms || 0,
        stack: metadata.stack || null,
        trace_id: metadata.trace_id || null,
        conv_id: metadata.conv_id || null,
      };

    default:
      return baseEvent;
  }
}

/**
 * Emit structured log to console (for downstream guardrails)
 * Logs are emitted as JSON for easy parsing by monitoring tools
 * @param {object} logEvent - Structured log event
 */
export function emitToolLog(logEvent) {
  // Use console.log with special prefix for easy filtering
  console.log(`[TOOL_TELEMETRY] ${JSON.stringify(logEvent)}`);
}
