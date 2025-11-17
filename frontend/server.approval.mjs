/**
 * Approval Request System (Phase 8.1: T301)
 *
 * Human-in-the-loop approval workflow for critical autonomous operations.
 *
 * Features:
 * - Request/response queue management
 * - Risk-based approval requirements
 * - Timeout handling
 * - ContextLog integration
 * - Decision tracking
 *
 * @module server.approval
 */

import { ulid } from 'ulid';
import { appendEvent } from './server.contextlog.mjs';

/**
 * @typedef {'low' | 'medium' | 'high' | 'critical'} RiskLevel
 */

/**
 * @typedef {'pending' | 'approved' | 'rejected' | 'modified' | 'timeout'} ApprovalStatus
 */

/**
 * @typedef {Object} ApprovalRequestContext
 * @property {string} task - Task description
 * @property {string} reasoning - Agent's reasoning for this operation
 * @property {RiskLevel} impact - Risk/impact level
 * @property {string[]} [alternatives] - Alternative approaches available
 */

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} id - Unique request ID (ULID)
 * @property {string} timestamp - ISO timestamp of request creation
 * @property {string} operation - Operation being requested (e.g., 'git_commit', 'file_delete')
 * @property {ApprovalRequestContext} context - Context and reasoning
 * @property {ApprovalStatus} status - Current status
 * @property {number} timeoutMs - Timeout in milliseconds
 * @property {string} [convId] - Conversation ID for ContextLog correlation
 * @property {string} [traceId] - Trace ID for ContextLog correlation
 */

/**
 * @typedef {'approve' | 'reject' | 'modify'} ApprovalDecision
 */

/**
 * @typedef {Object} ApprovalResponse
 * @property {string} requestId - ID of the request being responded to
 * @property {ApprovalDecision} decision - User's decision
 * @property {string} [feedback] - Optional user feedback/reasoning
 * @property {Record<string, unknown>} [modifications] - Modifications to apply (if decision = 'modify')
 * @property {string} timestamp - ISO timestamp of response
 */

/**
 * In-memory approval request queue
 * @type {Map<string, ApprovalRequest>}
 */
const approvalQueue = new Map();

/**
 * Pending promises waiting for approval responses
 * @type {Map<string, {resolve: Function, reject: Function, timeoutHandle: NodeJS.Timeout}>}
 */
const pendingResponses = new Map();

/**
 * Get configuration from environment (dynamic to support testing)
 */
function getConfig() {
  return {
    enabled: process.env.AUTONOMOUS_ENABLE_COLLABORATION === '1',
    defaultTimeout: parseInt(process.env.AUTONOMOUS_APPROVAL_TIMEOUT_MS || '300000', 10), // 5 minutes
  };
}

/**
 * Create a new approval request
 *
 * @param {string} operation - Operation name (e.g., 'git_commit', 'file_delete')
 * @param {ApprovalRequestContext} context - Request context and reasoning
 * @param {Object} [options] - Optional parameters
 * @param {number} [options.timeoutMs] - Custom timeout in milliseconds
 * @param {string} [options.convId] - Conversation ID
 * @param {string} [options.traceId] - Trace ID
 * @returns {Promise<ApprovalResponse>} Promise that resolves with user's response
 */
export async function requestApproval(operation, context, options = {}) {
  const config = getConfig();

  if (!config.enabled) {
    // Auto-approve if collaboration disabled
    return {
      requestId: 'auto-approved',
      decision: 'approve',
      feedback: 'Collaboration disabled, auto-approved',
      timestamp: new Date().toISOString(),
    };
  }

  const requestId = ulid();
  const timestamp = new Date().toISOString();
  const timeoutMs = options.timeoutMs || config.defaultTimeout;

  /** @type {ApprovalRequest} */
  const request = {
    id: requestId,
    timestamp,
    operation,
    context,
    status: 'pending',
    timeoutMs,
    convId: options.convId,
    traceId: options.traceId,
  };

  // Add to queue
  approvalQueue.set(requestId, request);

  // Log request event
  appendEvent({
    actor: 'autonomous',
    act: 'approval_request',
    conv_id: options.convId,
    trace_id: options.traceId,
    request_id: requestId,
    operation,
    risk_level: context.impact,
    reasoning: context.reasoning,
    task: context.task,
    alternatives_count: context.alternatives?.length || 0,
  });

  // Create promise that will be resolved when user responds
  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutHandle = setTimeout(() => {
      request.status = 'timeout';
      pendingResponses.delete(requestId);

      // Log timeout event
      appendEvent({
        actor: 'system',
        act: 'approval_timeout',
        conv_id: options.convId,
        trace_id: options.traceId,
        request_id: requestId,
        elapsed_ms: timeoutMs,
      });

      reject(new Error(`Approval request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Store promise handlers
    pendingResponses.set(requestId, { resolve, reject, timeoutHandle });
  });
}

/**
 * Submit a response to an approval request
 *
 * @param {string} requestId - ID of the request
 * @param {ApprovalDecision} decision - User's decision
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.feedback] - User feedback
 * @param {Record<string, unknown>} [options.modifications] - Modifications to apply
 * @returns {boolean} True if response was accepted, false if request not found
 */
export function respondToApproval(requestId, decision, options = {}) {
  const request = approvalQueue.get(requestId);
  if (!request) {
    console.error(`[Approval] Request ${requestId} not found`);
    return false;
  }

  if (request.status !== 'pending') {
    console.error(`[Approval] Request ${requestId} already resolved with status: ${request.status}`);
    return false;
  }

  const pending = pendingResponses.get(requestId);
  if (!pending) {
    console.error(`[Approval] No pending promise for request ${requestId}`);
    return false;
  }

  // Update request status
  request.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'modified';

  // Clear timeout
  clearTimeout(pending.timeoutHandle);

  // Create response
  /** @type {ApprovalResponse} */
  const response = {
    requestId,
    decision,
    feedback: options.feedback,
    modifications: options.modifications,
    timestamp: new Date().toISOString(),
  };

  // Log response event
  const elapsedMs = Date.now() - new Date(request.timestamp).getTime();
  appendEvent({
    actor: 'user',
    act: 'approval_response',
    conv_id: request.convId,
    trace_id: request.traceId,
    request_id: requestId,
    decision,
    feedback: options.feedback,
    elapsed_ms: elapsedMs,
  });

  // Resolve the promise
  pending.resolve(response);
  pendingResponses.delete(requestId);

  return true;
}

/**
 * Get all pending approval requests
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.convId] - Filter by conversation ID
 * @returns {ApprovalRequest[]} Array of pending requests
 */
export function getPendingApprovals(options = {}) {
  const requests = Array.from(approvalQueue.values())
    .filter(req => req.status === 'pending');

  if (options.convId) {
    return requests.filter(req => req.convId === options.convId);
  }

  return requests;
}

/**
 * Get approval request by ID
 *
 * @param {string} requestId - Request ID
 * @returns {ApprovalRequest | undefined} The request, or undefined if not found
 */
export function getApprovalRequest(requestId) {
  return approvalQueue.get(requestId);
}

/**
 * Cancel a pending approval request
 *
 * @param {string} requestId - Request ID
 * @returns {boolean} True if cancelled, false if not found or not pending
 */
export function cancelApprovalRequest(requestId) {
  const request = approvalQueue.get(requestId);
  if (!request || request.status !== 'pending') {
    return false;
  }

  const pending = pendingResponses.get(requestId);
  if (pending) {
    clearTimeout(pending.timeoutHandle);
    pending.reject(new Error('Approval request cancelled'));
    pendingResponses.delete(requestId);
  }

  request.status = 'rejected';

  // Log cancellation
  appendEvent({
    actor: 'system',
    act: 'approval_cancelled',
    conv_id: request.convId,
    trace_id: request.traceId,
    request_id: requestId,
  });

  return true;
}

/**
 * Clear old completed/expired requests from queue
 *
 * @param {number} [maxAgeMs=3600000] - Max age in milliseconds (default 1 hour)
 * @returns {number} Number of requests cleared
 */
export function cleanupOldRequests(maxAgeMs = 3600000) {
  const now = Date.now();
  let cleared = 0;

  for (const [id, request] of approvalQueue.entries()) {
    const age = now - new Date(request.timestamp).getTime();
    if (request.status !== 'pending' && age > maxAgeMs) {
      approvalQueue.delete(id);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Get approval system statistics
 *
 * @returns {Object} Statistics about approval requests
 */
export function getApprovalStats() {
  const config = getConfig();
  const requests = Array.from(approvalQueue.values());

  return {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    modified: requests.filter(r => r.status === 'modified').length,
    timeout: requests.filter(r => r.status === 'timeout').length,
    enabled: config.enabled,
  };
}

// Periodic cleanup (run every 10 minutes)
setInterval(() => {
  const cleared = cleanupOldRequests();
  if (cleared > 0) {
    console.log(`[Approval] Cleaned up ${cleared} old requests`);
  }
}, 600000);
