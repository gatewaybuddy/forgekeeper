/**
 * ContextLog Event Emitter
 *
 * Enhanced event emitter for comprehensive event tracking.
 * Implements the full event taxonomy from events.d.ts
 */

import { ulid } from 'ulid';
import { appendEvent } from '../../server.contextlog.mjs';

/**
 * Event Emitter for ContextLog
 *
 * Provides structured methods for emitting all event types.
 * All events are automatically persisted to JSONL and available for streaming.
 */
export class ContextLogEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Emit event to all listeners and persist to JSONL
   *
   * @param {import('../../types/events').Event} event
   */
  async emit(event) {
    // Add to JSONL
    await appendEvent(event);

    // Notify listeners
    const listeners = this.listeners.get(event.type) || [];
    for (const listener of listeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${event.type}:`, error);
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*') || [];
    for (const listener of wildcardListeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error('Error in wildcard event listener:', error);
      }
    }
  }

  /**
   * Register event listener
   *
   * @param {import('../../types/events').EventType | '*'} eventType
   * @param {Function} listener
   */
  on(eventType, listener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(listener);
  }

  /**
   * Remove event listener
   *
   * @param {import('../../types/events').EventType | '*'} eventType
   * @param {Function} listener
   */
  off(eventType, listener) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // ========================================
  // Lifecycle Events
  // ========================================

  /**
   * Emit task_started event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} config
   * @returns {Promise<import('../../types/events').TaskStartedEvent>}
   */
  async emitTaskStarted(convId, turnId, config) {
    const event = {
      id: ulid(),
      type: 'task_started',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      model: config.model,
      approval_policy: config.approvalPolicy || 'prompt',
      sandbox_policy: config.sandboxPolicy || 'workspace',
      reasoning_effort: config.reasoningEffort,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit task_complete event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {number} durationMs
   * @param {number} toolCallsCount
   * @param {import('../../types/events').TokenUsage} tokens
   * @returns {Promise<import('../../types/events').TaskCompleteEvent>}
   */
  async emitTaskComplete(convId, turnId, durationMs, toolCallsCount, tokens) {
    const event = {
      id: ulid(),
      type: 'task_complete',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      duration_ms: durationMs,
      tool_calls_count: toolCallsCount,
      tokens,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Tool Events
  // ========================================

  /**
   * Emit tool_call_begin event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} toolCall
   * @param {string} sandboxLevel
   * @returns {Promise<import('../../types/events').ToolCallBeginEvent>}
   */
  async emitToolCallBegin(convId, turnId, toolCall, sandboxLevel = 'workspace') {
    const args = typeof toolCall.function.arguments === 'string'
      ? toolCall.function.arguments
      : JSON.stringify(toolCall.function.arguments);

    const event = {
      id: ulid(),
      type: 'tool_call_begin',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'tool',
      name: toolCall.function.name,
      call_id: toolCall.id,
      args_preview: this.redactAndTruncate(args, 200),
      sandbox_level: sandboxLevel,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit tool_call_output_delta event (for streaming output)
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string} toolName
   * @param {string} callId
   * @param {string} delta
   * @returns {Promise<import('../../types/events').ToolCallOutputDeltaEvent>}
   */
  async emitToolCallOutputDelta(convId, turnId, toolName, callId, delta) {
    const event = {
      id: ulid(),
      type: 'tool_call_output_delta',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'tool',
      name: toolName,
      call_id: callId,
      delta,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit tool_call_end event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} toolCall
   * @param {string} result
   * @param {number} elapsedMs
   * @param {boolean} truncated
   * @param {number} resultBytes
   * @param {number} [exitCode]
   * @returns {Promise<import('../../types/events').ToolCallEndEvent>}
   */
  async emitToolCallEnd(convId, turnId, toolCall, result, elapsedMs, truncated, resultBytes, exitCode) {
    const event = {
      id: ulid(),
      type: 'tool_call_end',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'tool',
      name: toolCall.function.name,
      call_id: toolCall.id,
      result_preview: this.redactAndTruncate(result, 500),
      result_bytes: resultBytes,
      truncated,
      elapsed_ms: elapsedMs,
      exit_code: exitCode,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit tool_call_error event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} toolCall
   * @param {Error} error
   * @param {number} elapsedMs
   * @returns {Promise<import('../../types/events').ToolCallErrorEvent>}
   */
  async emitToolCallError(convId, turnId, toolCall, error, elapsedMs) {
    const event = {
      id: ulid(),
      type: 'tool_call_error',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'tool',
      name: toolCall.function.name,
      call_id: toolCall.id,
      error_message: error.message,
      error_code: error.code,
      elapsed_ms: elapsedMs,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Reasoning Events
  // ========================================

  /**
   * Emit reasoning_delta event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string} delta
   * @returns {Promise<import('../../types/events').ReasoningDeltaEvent>}
   */
  async emitReasoningDelta(convId, turnId, delta) {
    const event = {
      id: ulid(),
      type: 'reasoning_delta',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'assistant',
      delta,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit reasoning_section_break event
   *
   * @param {string} convId
   * @param {number} turnId
   * @returns {Promise<import('../../types/events').ReasoningSectionBreakEvent>}
   */
  async emitReasoningSectionBreak(convId, turnId) {
    const event = {
      id: ulid(),
      type: 'reasoning_section_break',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'assistant',
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Approval Events
  // ========================================

  /**
   * Emit approval_request event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string} approvalType
   * @param {string} toolName
   * @param {Object} args
   * @param {string} [reason]
   * @param {string} [impact]
   * @returns {Promise<import('../../types/events').ApprovalRequestEvent>}
   */
  async emitApprovalRequest(convId, turnId, approvalType, toolName, args, reason, impact) {
    const event = {
      id: ulid(),
      type: 'approval_request',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      approval_type: approvalType,
      tool_name: toolName,
      args_preview: this.redactAndTruncate(JSON.stringify(args), 200),
      reason,
      impact,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit approval_granted event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string} requestId
   * @param {boolean} rememberForSession
   * @returns {Promise<import('../../types/events').ApprovalGrantedEvent>}
   */
  async emitApprovalGranted(convId, turnId, requestId, rememberForSession) {
    const event = {
      id: ulid(),
      type: 'approval_granted',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'user',
      request_id: requestId,
      remember_for_session: rememberForSession,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit approval_denied event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string} requestId
   * @param {string} [reason]
   * @returns {Promise<import('../../types/events').ApprovalDeniedEvent>}
   */
  async emitApprovalDenied(convId, turnId, requestId, reason) {
    const event = {
      id: ulid(),
      type: 'approval_denied',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'user',
      request_id: requestId,
      reason,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Turn Tracking
  // ========================================

  /**
   * Emit turn_diff event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {string[]} filesModified
   * @param {number} toolCallsCount
   * @param {number} durationMs
   * @param {import('../../types/events').TokenUsage} tokens
   * @returns {Promise<import('../../types/events').TurnDiffEvent>}
   */
  async emitTurnDiff(convId, turnId, filesModified, toolCallsCount, durationMs, tokens) {
    const event = {
      id: ulid(),
      type: 'turn_diff',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      files_modified: filesModified,
      tool_calls_count: toolCallsCount,
      duration_ms: durationMs,
      tokens,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Token Tracking
  // ========================================

  /**
   * Emit token_count event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {import('../../types/events').TokenUsage} tokens
   * @param {import('../../types/events').TokenUsage} cumulative
   * @returns {Promise<import('../../types/events').TokenCountEvent>}
   */
  async emitTokenCount(convId, turnId, tokens, cumulative) {
    const event = {
      id: ulid(),
      type: 'token_count',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      tokens,
      cumulative,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Validation & Review
  // ========================================

  /**
   * Emit validation_error event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {import('../../types/events').ValidationError[]} errors
   * @returns {Promise<import('../../types/events').ValidationErrorEvent>}
   */
  async emitValidationError(convId, turnId, errors) {
    const event = {
      id: ulid(),
      type: 'validation_error',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      errors,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit review_completed event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} review
   * @returns {Promise<import('../../types/events').ReviewCompletedEvent>}
   */
  async emitReviewCompleted(convId, turnId, review) {
    const findingsBySeverity = review.findings.reduce((acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] || 0) + 1;
      return acc;
    }, {});

    const event = {
      id: ulid(),
      type: 'review_completed',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      overall_assessment: review.overall_assessment,
      findings_count: review.findings.length,
      findings_by_severity: findingsBySeverity,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // History Management
  // ========================================

  /**
   * Emit history_compaction event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Object} stats
   * @returns {Promise<import('../../types/events').HistoryCompactionEvent>}
   */
  async emitHistoryCompaction(convId, turnId, stats) {
    const event = {
      id: ulid(),
      type: 'history_compaction',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      original_messages: stats.original_messages,
      original_tokens: stats.original_tokens,
      compacted_messages: stats.compacted_messages,
      compacted_tokens: stats.compacted_tokens,
      summary_length: stats.summary_length,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Generic Error
  // ========================================

  /**
   * Emit error event
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {Error} error
   * @returns {Promise<import('../../types/events').ErrorEvent>}
   */
  async emitError(convId, turnId, error) {
    const event = {
      id: ulid(),
      type: 'error',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      error_message: error.message,
      stack_trace: error.stack,
      error_code: error.code,
    };

    await this.emit(event);
    return event;
  }

  /**
   * Emit diagnostic_reflection event
   * [T302] Root cause analysis for tool failures
   *
   * @param {string} convId
   * @param {number} turnId
   * @param {number} iteration
   * @param {string} failedTool
   * @param {Object} diagnosis
   * @returns {Promise<Object>}
   */
  async emitDiagnosticReflection(convId, turnId, iteration, failedTool, diagnosis) {
    const event = {
      id: ulid(),
      type: 'diagnostic_reflection',
      ts: new Date().toISOString(),
      conv_id: convId,
      turn_id: turnId,
      actor: 'system',
      iteration,
      failed_tool: failedTool,
      root_cause_category: diagnosis?.rootCause?.category || 'unknown',
      root_cause_description: this.redactAndTruncate(diagnosis?.rootCause?.description || '', 200),
      confidence: diagnosis?.rootCause?.confidence || 0,
      alternatives_count: diagnosis?.alternatives?.length || 0,
      can_recover: diagnosis?.errorClassification?.canRecover !== false,
      why_chain: {
        why1: this.redactAndTruncate(diagnosis?.whyChain?.why1 || '', 150),
        why5: this.redactAndTruncate(diagnosis?.whyChain?.why5 || '', 150),
      },
      recovery_strategy: diagnosis?.recoveryPlan?.strategy || null,
    };

    await this.emit(event);
    return event;
  }

  // ========================================
  // Utilities
  // ========================================

  /**
   * Redact sensitive information and truncate
   *
   * @param {string} content
   * @param {number} maxLength
   * @returns {string}
   */
  redactAndTruncate(content, maxLength = 200) {
    if (!content) return '';

    // Simple redaction patterns
    let redacted = content
      .replace(/password["\s:]+[^"\s,}]+/gi, 'password: [REDACTED]')
      .replace(/token["\s:]+[^"\s,}]+/gi, 'token: [REDACTED]')
      .replace(/api[_-]?key["\s:]+[^"\s,}]+/gi, 'api_key: [REDACTED]')
      .replace(/secret["\s:]+[^"\s,}]+/gi, 'secret: [REDACTED]');

    // Truncate
    if (redacted.length > maxLength) {
      redacted = redacted.slice(0, maxLength) + '...';
    }

    return redacted;
  }
}

/**
 * Global instance
 */
export const contextLogEvents = new ContextLogEventEmitter();
