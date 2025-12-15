// Dynamic tool loader and registry with fallback to static aggregator
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'node:crypto';
import {
  checkToolAllowed,
  validateToolArguments,
  createToolLogEvent,
  emitToolLog,
  TOOL_TIMEOUT_MS,
  TOOL_MAX_RETRIES,
  TOOL_MAX_OUTPUT_BYTES
} from '../../config/tools.config.mjs';
import { appendEvent, createToolExecutionEvent } from '../telemetry/contextlog.mjs';
import { redactForLogging } from './guardrails.mjs';
// T405: MCP Integration
import {
  getAllMCPTools,
  isMCPTool,
  executeMCPTool
} from '../../mcp/tool-adapter.mjs';

const execFileAsync = promisify(execFile);

let REGISTRY = new Map();
let TOOL_DEFS_CACHE = [];
let LAST_LOADED_AT = 0;

// Tool error tracking and rollback (codex.plan Phase 1, T205)
// Maps toolName -> { count, lastError, firstSeen, reverted }
const toolErrors = new Map();
const ERROR_THRESHOLD = parseInt(process.env.TOOL_ERROR_THRESHOLD || '3', 10);
const ERROR_WINDOW_MS = parseInt(process.env.TOOL_ERROR_WINDOW_MS || '300000', 10); // 5 minutes

// Regression detection (codex.plan Phase 2, T211)
// Maps toolName -> { baseline, recent, violations }
const toolMetrics = new Map();
const REGRESSION_CHECK_ENABLED = process.env.REGRESSION_CHECK_ENABLED === '1';
const REGRESSION_LATENCY_THRESHOLD_MS = parseInt(process.env.REGRESSION_LATENCY_MS || '50', 10); // +50ms
const REGRESSION_ERROR_RATE_THRESHOLD = parseFloat(process.env.REGRESSION_ERROR_RATE || '0.05'); // +5%
const REGRESSION_WINDOW_SIZE = parseInt(process.env.REGRESSION_WINDOW_SIZE || '10', 10); // Last N executions
const REGRESSION_BASELINE_SIZE = parseInt(process.env.REGRESSION_BASELINE_SIZE || '20', 10); // First N for baseline

// Resource quotas (codex.plan Phase 2, T212)
// T304: Disabled by default for maximum local capability
// Maps toolName -> { requests: [{timestamp}], bytes_written: number }
const toolResourceUsage = new Map();
// T304: Resource quotas disabled by default (RESOURCE_QUOTAS_ENABLED undefined → false)
const RESOURCE_QUOTAS_ENABLED = process.env.RESOURCE_QUOTAS_ENABLED === '1';
const TOOL_RATE_LIMIT_PER_MIN = parseInt(process.env.TOOL_RATE_LIMIT_PER_MIN || '30', 10); // Requests per minute per tool (when enabled)
const TOOL_DISK_QUOTA_BYTES = parseInt(process.env.TOOL_DISK_QUOTA_BYTES || String(10 * 1024 * 1024), 10); // 10 MB per tool (when enabled)
const TOOL_MEMORY_LIMIT_MB = parseInt(process.env.TOOL_MEMORY_LIMIT_MB || '512', 10); // 512 MB per tool (when enabled)
const TOOL_CPU_TIMEOUT_MS = parseInt(process.env.TOOL_CPU_TIMEOUT_MS || '30000', 10); // 30 seconds (when enabled)

// Tool signature validation (codex.plan Phase 2, T210)
const SIGNATURE_CHECK_ENABLED = process.env.TOOL_SIGNATURE_CHECK === '1';
const SIGNATURE_SECRET = process.env.TOOL_SIGNATURE_SECRET || 'forgekeeper-default-secret-change-in-production';
const SIGNATURE_FILE = path.join(process.env.REPO_ROOT || process.cwd(), '.forgekeeper/tool_signatures.json');
let toolSignatures = new Map(); // toolName -> signature
// When static fallback is used, we delegate to the aggregated index module
let STATIC_AGG = null;
const TOOLS_DIR = path.resolve(process.cwd(), 'tools');
const SELF_UPDATE_ENABLED = process.env.FRONTEND_ENABLE_SELF_UPDATE === '1';
const WRITE_MAX = Number(process.env.TOOLS_SELF_MAX_BYTES || 64 * 1024);

async function tryDynamicLoad() {
  const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true }).catch(() => []);
  const mods = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('.mjs') && !['index.mjs', 'TEMPLATE.mjs'].includes(n));
  const tmpRegistry = new Map();
  const defs = [];
  for (const file of mods) {
    try {
      const full = path.join(TOOLS_DIR, file);
      const url = pathToFileURL(full).href + `?t=${Date.now()}`;
      const mod = await import(url);
      if (mod && mod.def && typeof mod.run === 'function') {
        const name = mod.def?.function?.name || path.basename(file, '.mjs');
        tmpRegistry.set(name, mod);
        defs.push(mod.def);
      }
    } catch (e) {
      // skip invalid modules
      // console.warn('tool load failed', file, e);
    }
  }
  REGISTRY = tmpRegistry;
  TOOL_DEFS_CACHE = defs;
  LAST_LOADED_AT = Date.now();
  STATIC_AGG = null;
  return { defs, count: defs.length };
}

async function tryStaticFallback() {
  // Fall back to static aggregate if dynamic fails
  const agg = await import('./tools/index.mjs');
  TOOL_DEFS_CACHE = Array.isArray(agg.TOOL_DEFS) ? agg.TOOL_DEFS : [];
  // In fallback mode we route all executions through the aggregator's runTool
  STATIC_AGG = agg;
  REGISTRY = new Map();
  LAST_LOADED_AT = Date.now();
  return { defs: TOOL_DEFS_CACHE, count: TOOL_DEFS_CACHE.length };
}

/**
 * Load tool signatures from file (codex.plan Phase 2, T210)
 */
async function loadSignatures() {
  if (!SIGNATURE_CHECK_ENABLED) return;

  try {
    const content = await fs.readFile(SIGNATURE_FILE, 'utf8');
    const data = JSON.parse(content);
    toolSignatures = new Map(Object.entries(data));
    console.log(`[Tool Signatures] Loaded ${toolSignatures.size} signatures`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[Tool Signatures] Failed to load signatures:', err.message);
    }
    // File doesn't exist or is invalid - start fresh
    toolSignatures = new Map();
  }
}

/**
 * Save tool signatures to file (codex.plan Phase 2, T210)
 */
async function saveSignatures() {
  if (!SIGNATURE_CHECK_ENABLED) return;

  try {
    const dir = path.dirname(SIGNATURE_FILE);
    await fs.mkdir(dir, { recursive: true });

    const data = Object.fromEntries(toolSignatures);
    await fs.writeFile(SIGNATURE_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Tool Signatures] Saved ${toolSignatures.size} signatures`);
  } catch (err) {
    console.error('[Tool Signatures] Failed to save signatures:', err.message);
  }
}

/**
 * Compute HMAC-SHA256 signature for tool code (codex.plan Phase 2, T210)
 */
function computeSignature(code) {
  const hmac = crypto.createHmac('sha256', SIGNATURE_SECRET);
  hmac.update(code);
  return hmac.digest('hex');
}

/**
 * Sign a tool and store its signature (codex.plan Phase 2, T210)
 */
export async function signTool(toolName, code) {
  if (!SIGNATURE_CHECK_ENABLED) return null;

  const signature = computeSignature(code);
  toolSignatures.set(toolName, signature);
  await saveSignatures();

  console.log(`[Tool Signatures] Signed tool: ${toolName}`);
  return signature;
}

/**
 * Verify tool signature (codex.plan Phase 2, T210)
 */
export async function verifyTool(toolName, code) {
  if (!SIGNATURE_CHECK_ENABLED) return { valid: true, reason: 'signature_check_disabled' };

  const storedSignature = toolSignatures.get(toolName);

  if (!storedSignature) {
    return { valid: false, reason: 'no_signature', message: `Tool ${toolName} has no stored signature` };
  }

  const computedSignature = computeSignature(code);

  if (storedSignature !== computedSignature) {
    return {
      valid: false,
      reason: 'signature_mismatch',
      message: `Tool ${toolName} signature mismatch - tool may have been modified`
    };
  }

  return { valid: true, reason: 'verified' };
}

/**
 * Get all tool signatures
 */
export function getAllSignatures() {
  return Array.from(toolSignatures.entries()).map(([tool, signature]) => ({
    tool,
    signature,
    algorithm: 'HMAC-SHA256'
  }));
}

/**
 * Track tool metrics for regression detection (codex.plan Phase 2, T211)
 */
function trackToolMetrics(toolName, latencyMs, success) {
  if (!REGRESSION_CHECK_ENABLED) return null;

  if (!toolMetrics.has(toolName)) {
    toolMetrics.set(toolName, {
      baseline: { latencies: [], errors: 0, total: 0 },
      recent: { latencies: [], errors: 0, total: 0 },
      violations: []
    });
  }

  const metrics = toolMetrics.get(toolName);
  const execution = { latencyMs, success, timestamp: Date.now() };

  // Build baseline from first N executions
  if (metrics.baseline.total < REGRESSION_BASELINE_SIZE) {
    metrics.baseline.latencies.push(latencyMs);
    metrics.baseline.total++;
    if (!success) metrics.baseline.errors++;
    return null; // Still building baseline
  }

  // Track recent executions (sliding window)
  metrics.recent.latencies.push(latencyMs);
  metrics.recent.total++;
  if (!success) metrics.recent.errors++;

  // Keep only last N executions
  if (metrics.recent.latencies.length > REGRESSION_WINDOW_SIZE) {
    const removed = metrics.recent.latencies.shift();
    metrics.recent.total--;
  }

  return metrics;
}

/**
 * Check for regressions and determine if revert is needed (codex.plan Phase 2, T211)
 */
function checkRegression(toolName) {
  if (!REGRESSION_CHECK_ENABLED) return { regressed: false };

  const metrics = toolMetrics.get(toolName);
  if (!metrics || metrics.baseline.total < REGRESSION_BASELINE_SIZE) {
    return { regressed: false, reason: 'insufficient_baseline' };
  }

  if (metrics.recent.total < 5) {
    return { regressed: false, reason: 'insufficient_recent_data' };
  }

  // Calculate baseline metrics
  const baselineAvgLatency = metrics.baseline.latencies.reduce((a, b) => a + b, 0) / metrics.baseline.total;
  const baselineErrorRate = metrics.baseline.errors / metrics.baseline.total;

  // Calculate recent metrics
  const recentAvgLatency = metrics.recent.latencies.reduce((a, b) => a + b, 0) / metrics.recent.total;
  const recentErrorRate = metrics.recent.errors / metrics.recent.total;

  // Check thresholds
  const latencyIncrease = recentAvgLatency - baselineAvgLatency;
  const errorRateIncrease = recentErrorRate - baselineErrorRate;

  const latencyRegressed = latencyIncrease > REGRESSION_LATENCY_THRESHOLD_MS;
  const errorRateRegressed = errorRateIncrease > REGRESSION_ERROR_RATE_THRESHOLD;

  if (latencyRegressed || errorRateRegressed) {
    const violation = {
      timestamp: Date.now(),
      baseline: { avgLatency: baselineAvgLatency, errorRate: baselineErrorRate },
      recent: { avgLatency: recentAvgLatency, errorRate: recentErrorRate },
      increases: { latency: latencyIncrease, errorRate: errorRateIncrease }
    };

    metrics.violations.push(violation);

    return {
      regressed: true,
      latencyRegressed,
      errorRateRegressed,
      violation
    };
  }

  return { regressed: false };
}

/**
 * Get regression statistics for a tool
 */
export function getToolRegressionStats(toolName) {
  return toolMetrics.get(toolName) || null;
}

/**
 * Get all tool regression statistics
 */
export function getAllToolRegressionStats() {
  return Array.from(toolMetrics.entries()).map(([name, metrics]) => ({
    tool: name,
    baseline: metrics.baseline,
    recent: metrics.recent,
    violations: metrics.violations,
    violation_count: metrics.violations.length
  }));
}

/**
 * Clear regression stats for a tool
 */
export function clearToolRegressionStats(toolName) {
  toolMetrics.delete(toolName);
}

/**
 * Check rate limit for a tool (codex.plan Phase 2, T212)
 */
function checkRateLimit(toolName) {
  if (!RESOURCE_QUOTAS_ENABLED) return { allowed: true };

  if (!toolResourceUsage.has(toolName)) {
    toolResourceUsage.set(toolName, {
      requests: [],
      bytes_written: 0,
      last_reset: Date.now()
    });
  }

  const usage = toolResourceUsage.get(toolName);
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Remove requests older than 1 minute
  usage.requests = usage.requests.filter(req => req.timestamp > oneMinuteAgo);

  // Check if limit exceeded
  if (usage.requests.length >= TOOL_RATE_LIMIT_PER_MIN) {
    return {
      allowed: false,
      reason: 'rate_limit_exceeded',
      limit: TOOL_RATE_LIMIT_PER_MIN,
      current: usage.requests.length,
      reset_in_ms: usage.requests[0].timestamp + 60000 - now
    };
  }

  // Record this request
  usage.requests.push({ timestamp: now });

  return { allowed: true };
}

/**
 * Track disk usage for a tool (codex.plan Phase 2, T212)
 */
function trackDiskUsage(toolName, bytes) {
  if (!RESOURCE_QUOTAS_ENABLED) return null;

  if (!toolResourceUsage.has(toolName)) {
    toolResourceUsage.set(toolName, {
      requests: [],
      bytes_written: 0,
      last_reset: Date.now()
    });
  }

  const usage = toolResourceUsage.get(toolName);
  usage.bytes_written += bytes;

  return usage;
}

/**
 * Check disk quota for a tool (codex.plan Phase 2, T212)
 */
function checkDiskQuota(toolName, additionalBytes = 0) {
  if (!RESOURCE_QUOTAS_ENABLED) return { allowed: true };

  const usage = toolResourceUsage.get(toolName);
  if (!usage) return { allowed: true };

  const totalBytes = usage.bytes_written + additionalBytes;

  if (totalBytes > TOOL_DISK_QUOTA_BYTES) {
    return {
      allowed: false,
      reason: 'disk_quota_exceeded',
      limit: TOOL_DISK_QUOTA_BYTES,
      current: usage.bytes_written,
      requested: additionalBytes,
      total: totalBytes
    };
  }

  return { allowed: true };
}

/**
 * Get resource usage for a tool
 */
export function getToolResourceUsage(toolName) {
  const usage = toolResourceUsage.get(toolName);
  if (!usage) return null;

  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const recentRequests = usage.requests.filter(req => req.timestamp > oneMinuteAgo);

  return {
    requests_last_minute: recentRequests.length,
    bytes_written: usage.bytes_written,
    last_reset: usage.last_reset,
    limits: {
      rate_limit_per_min: TOOL_RATE_LIMIT_PER_MIN,
      disk_quota_bytes: TOOL_DISK_QUOTA_BYTES,
      memory_limit_mb: TOOL_MEMORY_LIMIT_MB,
      cpu_timeout_ms: TOOL_CPU_TIMEOUT_MS
    }
  };
}

/**
 * Get all tool resource usage
 */
export function getAllToolResourceUsage() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  return Array.from(toolResourceUsage.entries()).map(([name, usage]) => {
    const recentRequests = usage.requests.filter(req => req.timestamp > oneMinuteAgo);
    return {
      tool: name,
      requests_last_minute: recentRequests.length,
      bytes_written: usage.bytes_written,
      last_reset: usage.last_reset
    };
  });
}

/**
 * Clear resource usage for a tool
 */
export function clearToolResourceUsage(toolName) {
  toolResourceUsage.delete(toolName);
}

export async function reloadTools() {
  if (!SELF_UPDATE_ENABLED) {
    return tryStaticFallback();
  }
  try {
    return await tryDynamicLoad();
  } catch {
    return tryStaticFallback();
  }
}

export async function getToolDefs() {
  if (TOOL_DEFS_CACHE.length === 0 || (SELF_UPDATE_ENABLED && (Date.now() - LAST_LOADED_AT) > 5000)) {
    await reloadTools();
  }

  // T405: Merge MCP tools with native tools
  const nativeTools = TOOL_DEFS_CACHE;
  const mcpTools = getAllMCPTools();

  // Return combined tool list (MCP tools after native tools)
  return [...nativeTools, ...mcpTools];
}

/**
 * Track tool errors and determine if rollback is needed
 * (codex.plan Phase 1, T205)
 */
function trackToolError(toolName, error) {
  if (!toolErrors.has(toolName)) {
    toolErrors.set(toolName, {
      count: 0,
      lastError: null,
      firstSeen: Date.now(),
      reverted: false
    });
  }

  const stats = toolErrors.get(toolName);
  const now = Date.now();

  // Reset if outside error window
  if (now - stats.firstSeen > ERROR_WINDOW_MS) {
    stats.count = 1;
    stats.firstSeen = now;
  } else {
    stats.count++;
  }

  stats.lastError = error;

  // Check if threshold exceeded
  const shouldRevert = stats.count >= ERROR_THRESHOLD && !stats.reverted;

  return { should_revert: shouldRevert, stats };
}

/**
 * Revert a tool to its HEAD version using git
 * (codex.plan Phase 1, T205)
 */
async function revertTool(toolName) {
  const toolPath = `tools/${toolName}`;
  const cwd = process.env.REPO_ROOT || process.cwd();

  try {
    // Git checkout HEAD version
    await execFileAsync('git', ['checkout', 'HEAD', '--', toolPath], {
      cwd,
      timeout: 5000
    });

    // Mark as reverted
    const stats = toolErrors.get(toolName);
    if (stats) {
      stats.reverted = true;
    }

    // Reload tools to pick up the reverted version
    await reloadTools();

    console.log(`[Tool Rollback] Reverted ${toolName} to HEAD version after ${stats?.count || 0} errors`);

    return {
      reverted: true,
      tool: toolName,
      error_count: stats?.count || 0,
      message: `Tool ${toolName} reverted to HEAD version after exceeding error threshold`
    };
  } catch (err) {
    console.error(`[Tool Rollback] Failed to revert ${toolName}:`, err.message);
    return {
      reverted: false,
      tool: toolName,
      error: err.message
    };
  }
}

/**
 * Get error statistics for a tool
 */
export function getToolErrorStats(toolName) {
  return toolErrors.get(toolName) || null;
}

/**
 * Get all tool error statistics
 */
export function getAllToolErrorStats() {
  return Array.from(toolErrors.entries()).map(([name, stats]) => ({
    tool: name,
    ...stats
  }));
}

/**
 * Clear error stats for a tool (e.g., after manual fix)
 */
export function clearToolErrors(toolName) {
  toolErrors.delete(toolName);
}

export async function runTool(name, args, metadata = {}) {
  const startTime = Date.now();
  const trace_id = metadata.trace_id || null;
  const conv_id = metadata.conv_id || null;

  // T21: Redact sensitive data from arguments before logging
  const redactedArgs = redactForLogging(args, { maxBytes: 200 });

  // T11: Emit structured start log
  const startLog = createToolLogEvent('start', name, { args: redactedArgs, trace_id, conv_id });
  emitToolLog(startLog);

  // T12: Persist to ContextLog with redacted preview
  const ctxStartEvent = createToolExecutionEvent({
    phase: 'start',
    tool: name,
    conv_id,
    trace_id,
    args_preview: redactedArgs,
  });
  appendEvent(ctxStartEvent);

  try {
    // T11: Check if tool execution is globally enabled and tool is in allowlist
    const allowCheck = checkToolAllowed(name);
    if (!allowCheck.allowed) {
      const error = new Error(allowCheck.message);
      error.gated = true;
      error.reason = allowCheck.reason;
      throw error;
    }

    // T11: Validate arguments against schema
    const validation = validateToolArguments(name, args);
    if (!validation.valid) {
      const error = new Error(`Tool argument validation failed: ${validation.errors.join(', ')}`);
      error.validation_errors = validation.errors;
      throw error;
    }

    if (!STATIC_AGG && REGISTRY.size === 0) await reloadTools();

    // Check rate limit (codex.plan Phase 2, T212)
    const rateLimitCheck = checkRateLimit(name);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded for tool ${name}: ${rateLimitCheck.current}/${rateLimitCheck.limit} requests in last minute. Reset in ${Math.ceil(rateLimitCheck.reset_in_ms / 1000)}s`);
    }

    let success = false;
    let result;

    // T405: Check if this is an MCP tool and route accordingly
    const allTools = await getToolDefs();
    const toolDef = allTools.find(t => t?.function?.name === name);

    // T11: Execute with timeout
    const executeWithTimeout = async () => {
      // T405: Route to MCP adapter if this is an MCP tool
      if (toolDef && isMCPTool(toolDef)) {
        console.log(`[MCP] Routing tool call to MCP server: ${name}`);
        return await executeMCPTool(toolDef, args || {});
      }

      // Native tool execution
      if (STATIC_AGG && typeof STATIC_AGG.runTool === 'function') {
        return await STATIC_AGG.runTool(name, args || {});
      } else {
        const mod = REGISTRY.get(name);
        if (!mod || typeof mod.run !== 'function') throw new Error(`Unknown tool: ${name}`);
        return await mod.run(args || {});
      }
    };

    // T11: Apply timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool execution timeout after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS);
    });

    result = await Promise.race([executeWithTimeout(), timeoutPromise]);
    success = true;

    // T11: Check output size limit
    const resultSize = Buffer.byteLength(
      typeof result === 'string' ? result : JSON.stringify(result),
      'utf8'
    );
    if (resultSize > TOOL_MAX_OUTPUT_BYTES) {
      console.warn(`[Tool Output] Tool ${name} exceeded output size limit: ${resultSize} > ${TOOL_MAX_OUTPUT_BYTES}`);
      // Truncate result
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      result = resultStr.slice(0, TOOL_MAX_OUTPUT_BYTES) + '\n[... output truncated due to size limit]';
    }

    const latencyMs = Date.now() - startTime;

    // T21: Redact sensitive data from result before logging
    const redactedResult = redactForLogging(result, { maxBytes: 200 });

    // T11: Emit structured finish log with redacted result
    const finishLog = createToolLogEvent('finish', name, {
      elapsed_ms: latencyMs,
      result_preview: redactedResult,
      result_size_bytes: resultSize,
      trace_id,
      conv_id
    });
    emitToolLog(finishLog);

    // T12: Persist to ContextLog with redacted preview
    const ctxFinishEvent = createToolExecutionEvent({
      phase: 'finish',
      tool: name,
      conv_id,
      trace_id,
      result_preview: redactedResult,
      elapsed_ms: latencyMs,
      result_size_bytes: resultSize,
    });
    appendEvent(ctxFinishEvent);

    // Track metrics and check for regression (codex.plan T211)
    trackToolMetrics(name, latencyMs, true);
    const regression = checkRegression(name);

    if (regression.regressed) {
      const toolFile = `${name}.mjs`;
      console.warn(`[Regression Detection] Tool ${name} performance degraded:`, regression.violation);

      // Trigger rollback due to regression
      revertTool(toolFile).then((revertResult) => {
        if (revertResult.reverted) {
          console.log(`[Regression Detection] Successfully reverted ${toolFile} due to performance degradation`);
        } else {
          console.error(`[Regression Detection] Failed to revert ${toolFile}:`, revertResult.error);
        }
      }).catch((err) => {
        console.error(`[Regression Detection] Revert error for ${toolFile}:`, err);
      });
    }

    // Clear error count on successful execution (codex.plan T205)
    if (toolErrors.has(name)) {
      toolErrors.delete(name);
    }

    return result;
  } catch (e) {
    const errorMsg = e?.message || String(e);
    const latencyMs = Date.now() - startTime;

    // T11: Emit structured error log
    const errorLog = createToolLogEvent('error', name, {
      error: errorMsg,
      error_type: e.gated ? 'gated' : (e.validation_errors ? 'validation' : 'execution'),
      elapsed_ms: latencyMs,
      stack: e.stack || null,
      trace_id,
      conv_id
    });
    emitToolLog(errorLog);

    // T12: Persist to ContextLog
    const ctxErrorEvent = createToolExecutionEvent({
      phase: 'error',
      tool: name,
      conv_id,
      trace_id,
      error: errorMsg,
      error_type: e.gated ? 'gated' : (e.validation_errors ? 'validation' : 'execution'),
      elapsed_ms: latencyMs,
    });
    appendEvent(ctxErrorEvent);

    // Track failed execution metrics (codex.plan T211)
    trackToolMetrics(name, latencyMs, false);

    // T11: If this is a gated error, return structured error immediately
    if (e.gated) {
      return {
        error: errorMsg,
        gated: true,
        reason: e.reason,
        timestamp: new Date().toISOString(),
        trace_id,
        conv_id
      };
    }

    // Track error and check if rollback is needed (codex.plan T205)
    const toolFile = `${name}.mjs`;
    const { should_revert, stats } = trackToolError(toolFile, errorMsg);

    if (should_revert) {
      console.error(`[Tool Rollback] Tool ${toolFile} exceeded error threshold (${stats.count} errors within ${ERROR_WINDOW_MS}ms). Attempting revert...`);

      // Attempt rollback in background (don't block the error response)
      revertTool(toolFile).then((result) => {
        if (result.reverted) {
          console.log(`[Tool Rollback] Successfully reverted ${toolFile}`);
        } else {
          console.error(`[Tool Rollback] Failed to revert ${toolFile}:`, result.error);
        }
      }).catch((err) => {
        console.error(`[Tool Rollback] Revert error for ${toolFile}:`, err);
      });

      return {
        error: `Tool error (${name}): ${errorMsg}`,
        rollback_triggered: true,
        error_count: stats.count,
        message: `Tool ${name} has been automatically reverted due to repeated failures`
      };
    }

    return `Tool error (${name}): ${errorMsg}`;
  }
}

// Export a snapshot for compatibility (may be empty until first load)
export const TOOL_DEFS = TOOL_DEFS_CACHE;

// Optional write helper (used by server) – validates size
export async function writeToolFile(name, code) {
  if (!SELF_UPDATE_ENABLED) throw new Error('Self-update is disabled');
  if (typeof name !== 'string' || !name.match(/^[a-z0-9_\-]+\.mjs$/i)) {
    throw new Error('Invalid tool filename; must be [a-z0-9_-]+.mjs');
  }
  if (typeof code !== 'string' || code.length < 1) throw new Error('Code is required');
  if (Buffer.byteLength(code, 'utf8') > WRITE_MAX) throw new Error(`Code exceeds limit (${WRITE_MAX} bytes)`);
  const full = path.join(TOOLS_DIR, name);
  await fs.writeFile(full, code, 'utf8');
  return { path: full };
}

/*
Modular tools live under ./tools/*.mjs
- Add a new tool by copying ./tools/TEMPLATE.mjs or writing via /api/tools/write.
- Env and sandbox helpers are in ./tools/fs_common.mjs.
- Enable self-update routes with FRONTEND_ENABLE_SELF_UPDATE=1
*/

