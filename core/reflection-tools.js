/**
 * Reflection Tools for Forgekeeper
 *
 * Provides safe, read-only tools for situational awareness during reflection.
 * These tools allow the reflection system to check actual state rather than speculating.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { config } from '../config.js';
import { tasks } from './memory.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const TOOL_USAGE_PATH = join(JOURNAL_DIR, 'reflection_tool_usage.jsonl');

// Settings
const ENABLED = config.reflectionTools?.enabled ?? false;

// Tool definitions - all read-only
const REFLECTION_TOOLS = {
  gitStatus: {
    name: 'gitStatus',
    description: 'Check git repository status (modified, staged, untracked files)',
    safe: true,
  },
  listPendingTasks: {
    name: 'listPendingTasks',
    description: 'List all pending tasks in the queue',
    safe: true,
  },
  checkFileExists: {
    name: 'checkFileExists',
    description: 'Check if a file exists at the given path',
    safe: true,
  },
  readFileSnippet: {
    name: 'readFileSnippet',
    description: 'Read the first 50 lines of a file',
    safe: true,
  },
  getSystemTime: {
    name: 'getSystemTime',
    description: 'Get current date and time',
    safe: true,
  },
};

/**
 * Ensure journal directory exists
 */
function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/**
 * Log tool usage
 */
function logToolUsage(toolName, args, result) {
  ensureJournalDir();

  const entry = {
    ts: new Date().toISOString(),
    tool: toolName,
    args,
    resultSummary: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200),
    success: result !== null,
  };

  try {
    appendFileSync(TOOL_USAGE_PATH, JSON.stringify(entry) + '\n');
    rotateIfNeeded(TOOL_USAGE_PATH);
  } catch (err) {
    console.error('[ReflectionTools] Failed to log usage:', err.message);
  }
}

/**
 * Check if reflection tools are enabled
 */
export function isEnabled() {
  return ENABLED;
}

/**
 * Get git repository status
 */
export function gitStatus() {
  if (!ENABLED) return null;

  try {
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const lines = status.split('\n').filter(Boolean);

    const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
    const staged = lines.filter(l => l.startsWith('A ') || l.startsWith('M ')).length;
    const untracked = lines.filter(l => l.startsWith('??')).length;
    const deleted = lines.filter(l => l.startsWith(' D') || l.startsWith('D ')).length;

    const result = {
      modified,
      staged,
      untracked,
      deleted,
      total: lines.length,
      files: lines.slice(0, 10), // First 10 files
      summary: lines.length === 0
        ? 'Working directory clean'
        : `${modified} modified, ${staged} staged, ${untracked} untracked`,
    };

    logToolUsage('gitStatus', {}, result.summary);
    return result;
  } catch (err) {
    const result = { error: err.message, summary: 'Git status check failed' };
    logToolUsage('gitStatus', {}, result.summary);
    return result;
  }
}

/**
 * List pending tasks
 */
export function listPendingTasks() {
  if (!ENABLED) return null;

  try {
    const pending = tasks.pending();

    const result = {
      count: pending.length,
      tasks: pending.slice(0, 5).map(t => ({
        id: t.id,
        description: t.description?.slice(0, 100),
        priority: t.priority,
        origin: t.origin,
        age: Math.round((Date.now() - new Date(t.created).getTime()) / 60000) + 'm',
      })),
      summary: pending.length === 0
        ? 'No pending tasks'
        : `${pending.length} pending task(s)`,
    };

    logToolUsage('listPendingTasks', {}, result.summary);
    return result;
  } catch (err) {
    const result = { error: err.message, summary: 'Task list check failed' };
    logToolUsage('listPendingTasks', {}, result.summary);
    return result;
  }
}

/**
 * Check if a file exists
 */
export function checkFileExists(filePath) {
  if (!ENABLED) return null;

  // Security: prevent path traversal
  if (filePath.includes('..')) {
    const result = { exists: false, error: 'Path traversal not allowed' };
    logToolUsage('checkFileExists', { filePath }, result.error);
    return result;
  }

  try {
    const exists = existsSync(filePath);
    const result = {
      path: filePath,
      exists,
      summary: exists ? `File exists: ${filePath}` : `File not found: ${filePath}`,
    };

    logToolUsage('checkFileExists', { filePath }, result.summary);
    return result;
  } catch (err) {
    const result = { exists: false, error: err.message };
    logToolUsage('checkFileExists', { filePath }, err.message);
    return result;
  }
}

/**
 * Read the first N lines of a file
 */
export function readFileSnippet(filePath, maxLines = 50) {
  if (!ENABLED) return null;

  // Security: prevent path traversal and sensitive files
  if (filePath.includes('..')) {
    return { error: 'Path traversal not allowed' };
  }

  const sensitivePatterns = ['.env', 'credentials', 'secret', 'password', '.ssh', '.aws'];
  if (sensitivePatterns.some(p => filePath.toLowerCase().includes(p))) {
    const result = { error: 'Cannot read sensitive files' };
    logToolUsage('readFileSnippet', { filePath }, result.error);
    return result;
  }

  try {
    if (!existsSync(filePath)) {
      const result = { error: 'File not found' };
      logToolUsage('readFileSnippet', { filePath }, result.error);
      return result;
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, maxLines);

    const result = {
      path: filePath,
      lineCount: lines.length,
      totalLines: content.split('\n').length,
      content: lines.join('\n'),
      summary: `Read ${lines.length} lines from ${filePath}`,
    };

    logToolUsage('readFileSnippet', { filePath, maxLines }, result.summary);
    return result;
  } catch (err) {
    const result = { error: err.message };
    logToolUsage('readFileSnippet', { filePath }, err.message);
    return result;
  }
}

/**
 * Get current system time
 */
export function getSystemTime() {
  if (!ENABLED) return null;

  const now = new Date();
  const result = {
    iso: now.toISOString(),
    local: now.toLocaleString(),
    hour: now.getHours(),
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
    summary: `Current time: ${now.toLocaleString()}`,
  };

  logToolUsage('getSystemTime', {}, result.summary);
  return result;
}

/**
 * Execute a tool by name
 */
export function executeTool(toolName, args = {}) {
  if (!ENABLED) {
    return { error: 'Reflection tools not enabled' };
  }

  const tool = REFLECTION_TOOLS[toolName];
  if (!tool) {
    return { error: `Unknown tool: ${toolName}` };
  }

  switch (toolName) {
    case 'gitStatus':
      return gitStatus();
    case 'listPendingTasks':
      return listPendingTasks();
    case 'checkFileExists':
      return checkFileExists(args.filePath);
    case 'readFileSnippet':
      return readFileSnippet(args.filePath, args.maxLines);
    case 'getSystemTime':
      return getSystemTime();
    default:
      return { error: `Tool not implemented: ${toolName}` };
  }
}

/**
 * Get available tools for prompt
 */
export function getAvailableTools() {
  if (!ENABLED) return [];

  return Object.values(REFLECTION_TOOLS).map(t => ({
    name: t.name,
    description: t.description,
  }));
}

/**
 * Build tool prompt addition for reflection
 */
export function buildToolPrompt() {
  if (!ENABLED) return null;

  const tools = getAvailableTools();
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

  return `You have access to these situational awareness tools to check actual state before forming thoughts:
${toolList}

You can check the current state of things rather than speculating. Use these to ground your reflections in reality.`;
}

/**
 * Get recent tool usage
 */
export function getRecentUsage(limit = 10) {
  if (!existsSync(TOOL_USAGE_PATH)) return [];

  try {
    const lines = readFileSync(TOOL_USAGE_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get module statistics
 */
export function getStats() {
  const usage = getRecentUsage(100);

  const toolCounts = {};
  for (const entry of usage) {
    toolCounts[entry.tool] = (toolCounts[entry.tool] || 0) + 1;
  }

  return {
    enabled: ENABLED,
    availableTools: Object.keys(REFLECTION_TOOLS),
    recentUsageCount: usage.length,
    toolCounts,
  };
}

export default {
  isEnabled,
  gitStatus,
  listPendingTasks,
  checkFileExists,
  readFileSnippet,
  getSystemTime,
  executeTool,
  getAvailableTools,
  buildToolPrompt,
  getRecentUsage,
  getStats,
};
