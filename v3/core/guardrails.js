// Security guardrails for Forgekeeper v3
import { config } from '../config.js';

// Patterns that indicate destructive operations
const DESTRUCTIVE_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+[\/~]/i,
  /rm\s+-rf?\s+\*/i,
  /DROP\s+(TABLE|DATABASE)/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i,  // DELETE without WHERE
  /TRUNCATE\s+TABLE/i,
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,
  /chmod\s+777/i,
  />\s*\/dev\/sd[a-z]/i,
  /mkfs\./i,
  /:(){ :|:& };:/,  // Fork bomb
];

// Patterns that indicate access to sensitive paths
const SENSITIVE_PATH_PATTERNS = [
  /['"](~\/)?\.ssh\//i,
  /['"](~\/)?\.aws\//i,
  /['"](~\/)?\.gnupg\//i,
  /['"]\/etc\/passwd/i,
  /['"]\/etc\/shadow/i,
  /['"]\/etc\/sudoers/i,
  /\.env(?:\.local|\.prod)?['"]/i,
  /credentials?\.json/i,
  /private[_-]?key/i,
];

// Check if content violates guardrails
export function checkGuardrails(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);

  // Check destructive patterns
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        reason: `Destructive pattern detected: ${pattern.toString()}`,
        type: 'destructive',
        requiresApproval: config.guardrails.destructiveRequiresConfirm,
      };
    }
  }

  // Check sensitive paths
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        reason: `Sensitive path access: ${pattern.toString()}`,
        type: 'sensitive_path',
        requiresApproval: true,
      };
    }
  }

  // Check denied paths from config
  for (const deniedPath of config.guardrails.deniedPaths) {
    if (text.includes(deniedPath)) {
      return {
        allowed: false,
        reason: `Denied path: ${deniedPath}`,
        type: 'denied_path',
        requiresApproval: true,
      };
    }
  }

  // Check denied commands from config
  for (const deniedCmd of config.guardrails.deniedCommands) {
    if (text.includes(deniedCmd)) {
      return {
        allowed: false,
        reason: `Denied command: ${deniedCmd}`,
        type: 'denied_command',
        requiresApproval: true,
      };
    }
  }

  return { allowed: true };
}

// Check if an action requires approval
export function requiresApproval(action) {
  // Self-extension always requires approval
  if (action.type === 'self_extension') {
    return {
      required: true,
      reason: 'Self-extension requires user approval',
      level: 'review', // review = show code, confirm = yes/no, notify = FYI
    };
  }

  // Check content for risky patterns
  const guardrailCheck = checkGuardrails(action.content || action.description || '');
  if (!guardrailCheck.allowed && guardrailCheck.requiresApproval) {
    return {
      required: true,
      reason: guardrailCheck.reason,
      level: 'confirm',
    };
  }

  // High complexity tasks
  if (action.estimated_complexity === 'high') {
    return {
      required: false, // Not required but recommended
      recommended: true,
      reason: 'High complexity task - consider reviewing',
      level: 'notify',
    };
  }

  return { required: false };
}

// Format guardrails as prompt instructions
export function formatGuardrailsForPrompt() {
  const rules = [];

  rules.push('Do NOT perform destructive operations (rm -rf, DROP TABLE, force push) without explicit approval.');

  if (config.guardrails.deniedPaths.length > 0) {
    rules.push(`Do NOT access these paths: ${config.guardrails.deniedPaths.join(', ')}`);
  }

  if (config.guardrails.deniedCommands.length > 0) {
    rules.push(`Do NOT run these commands: ${config.guardrails.deniedCommands.join(', ')}`);
  }

  if (config.guardrails.allowedPaths.length > 0) {
    rules.push(`Only operate within: ${config.guardrails.allowedPaths.join(', ')}`);
  }

  rules.push('If you need to do something risky, stop and ask for approval first.');

  return rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
}

// Validate that generated code/MCP server is safe
export function validateGeneratedCode(code) {
  const issues = [];

  // Check for network operations to suspicious destinations
  if (/fetch\s*\(\s*['"]http:\/\/(?!localhost|127\.0\.0\.1)/i.test(code)) {
    issues.push('Non-HTTPS external network request detected');
  }

  // Check for eval or similar
  if (/\beval\s*\(/.test(code)) {
    issues.push('eval() usage detected - potential code injection risk');
  }

  // Check for child_process without validation
  if (/child_process|exec\(|spawn\(/.test(code) && !/sanitize|validate|escape/.test(code)) {
    issues.push('Shell execution without apparent input validation');
  }

  // Check for file operations outside expected paths
  if (/writeFile|appendFile|unlink|rmdir/.test(code)) {
    issues.push('File write/delete operations - review paths carefully');
  }

  return {
    safe: issues.length === 0,
    issues,
    requiresReview: issues.length > 0,
  };
}

// Rate limiting state
const rateLimitState = new Map();

export function checkRateLimit(userId, action) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxActions = 10;

  const history = rateLimitState.get(key) || [];
  const recent = history.filter(t => now - t < windowMs);

  if (recent.length >= maxActions) {
    return {
      allowed: false,
      reason: `Rate limit: max ${maxActions} ${action} actions per minute`,
      retryAfter: windowMs - (now - recent[0]),
    };
  }

  recent.push(now);
  rateLimitState.set(key, recent);
  return { allowed: true };
}

export default {
  checkGuardrails,
  requiresApproval,
  formatGuardrailsForPrompt,
  validateGeneratedCode,
  checkRateLimit,
};
