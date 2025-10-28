/**
 * Forgekeeper Event Type Definitions
 * Based on Codex event protocol architecture
 */

export type EventType =
  // Lifecycle events
  | 'task_started'
  | 'task_complete'
  | 'item_started'
  | 'item_completed'

  // Tool execution events
  | 'tool_call_begin'
  | 'tool_call_output_delta'
  | 'tool_call_end'
  | 'tool_call_error'

  // Reasoning events
  | 'reasoning_delta'
  | 'reasoning_section_break'
  | 'reasoning_summary'

  // Approval events
  | 'approval_request'
  | 'approval_granted'
  | 'approval_denied'

  // Turn tracking
  | 'turn_diff'

  // Token tracking
  | 'token_count'

  // Validation and review
  | 'validation_error'
  | 'validation_warning'
  | 'review_started'
  | 'review_completed'

  // History management
  | 'history_compaction'

  // Autonomous agent events
  | 'autonomous_session_start'
  | 'autonomous_iteration'
  | 'autonomous_checkpoint'
  | 'autonomous_session_complete'

  // Generic
  | 'error'
  | 'metric';

export type Actor = 'user' | 'assistant' | 'tool' | 'system';

export type ItemType = 'tool_call' | 'message' | 'approval' | 'review';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export type ApprovalType = 'initial' | 'escalation';

export type SandboxLevel = 'strict' | 'workspace' | 'none';

/**
 * Base event structure
 */
export interface BaseEvent {
  /** Unique event ID (ULID) */
  id: string;

  /** Event type */
  type: EventType;

  /** ISO-8601 timestamp */
  ts: string;

  /** Conversation ID */
  conv_id: string;

  /** Turn ID (optional) */
  turn_id?: number;

  /** Actor that triggered event */
  actor?: Actor;
}

/**
 * Task Started Event
 * Emitted when a conversation turn begins
 */
export interface TaskStartedEvent extends BaseEvent {
  type: 'task_started';
  actor: 'system';

  /** Model being used */
  model: string;

  /** Approval policy */
  approval_policy: string;

  /** Sandbox policy */
  sandbox_policy: string;

  /** Reasoning effort (if applicable) */
  reasoning_effort?: string;
}

/**
 * Task Complete Event
 * Emitted when a conversation turn completes
 */
export interface TaskCompleteEvent extends BaseEvent {
  type: 'task_complete';
  actor: 'system';

  /** Duration in milliseconds */
  duration_ms: number;

  /** Number of tool calls made */
  tool_calls_count: number;

  /** Final token usage */
  tokens: TokenUsage;
}

/**
 * Item Started Event
 * Generic event for any item beginning (tool, message, etc.)
 */
export interface ItemStartedEvent extends BaseEvent {
  type: 'item_started';

  /** Type of item */
  item_type: ItemType;

  /** Parent item ID (for nesting) */
  parent_id?: string;

  /** Item name */
  name?: string;
}

/**
 * Item Completed Event
 * Generic event for any item completing
 */
export interface ItemCompletedEvent extends BaseEvent {
  type: 'item_completed';

  /** Type of item */
  item_type: ItemType;

  /** Duration in milliseconds */
  elapsed_ms: number;

  /** Success status */
  status: 'ok' | 'error';
}

/**
 * Tool Call Begin Event
 * Emitted when tool execution starts
 */
export interface ToolCallBeginEvent extends BaseEvent {
  type: 'tool_call_begin';
  actor: 'tool';

  /** Tool name */
  name: string;

  /** Arguments preview (redacted, truncated) */
  args_preview: string;

  /** Sandbox level used */
  sandbox_level: SandboxLevel;

  /** Tool call ID */
  call_id: string;
}

/**
 * Tool Call Output Delta Event
 * Emitted during streaming tool output
 */
export interface ToolCallOutputDeltaEvent extends BaseEvent {
  type: 'tool_call_output_delta';
  actor: 'tool';

  /** Tool name */
  name: string;

  /** Tool call ID */
  call_id: string;

  /** Output delta */
  delta: string;
}

/**
 * Tool Call End Event
 * Emitted when tool execution completes
 */
export interface ToolCallEndEvent extends BaseEvent {
  type: 'tool_call_end';
  actor: 'tool';

  /** Tool name */
  name: string;

  /** Tool call ID */
  call_id: string;

  /** Result preview (redacted, truncated) */
  result_preview: string;

  /** Full result byte size */
  result_bytes: number;

  /** Whether output was truncated */
  truncated: boolean;

  /** Duration in milliseconds */
  elapsed_ms: number;

  /** Exit code (for shell tools) */
  exit_code?: number;

  /** Timeout status */
  timed_out?: boolean;
}

/**
 * Tool Call Error Event
 * Emitted when tool execution fails
 */
export interface ToolCallErrorEvent extends BaseEvent {
  type: 'tool_call_error';
  actor: 'tool';

  /** Tool name */
  name: string;

  /** Tool call ID */
  call_id: string;

  /** Error message */
  error_message: string;

  /** Error code */
  error_code?: string;

  /** Duration before error */
  elapsed_ms: number;
}

/**
 * Reasoning Delta Event
 * Emitted during reasoning streaming
 */
export interface ReasoningDeltaEvent extends BaseEvent {
  type: 'reasoning_delta';
  actor: 'assistant';

  /** Reasoning content delta */
  delta: string;
}

/**
 * Reasoning Section Break Event
 * Emitted between reasoning and final content
 */
export interface ReasoningSectionBreakEvent extends BaseEvent {
  type: 'reasoning_section_break';
  actor: 'assistant';
}

/**
 * Approval Request Event
 * Emitted when user approval is needed
 */
export interface ApprovalRequestEvent extends BaseEvent {
  type: 'approval_request';
  actor: 'system';

  /** Type of approval */
  approval_type: ApprovalType;

  /** Tool name requiring approval */
  tool_name: string;

  /** Arguments preview */
  args_preview: string;

  /** Reason for request */
  reason?: string;

  /** Impact description */
  impact?: string;
}

/**
 * Approval Granted Event
 * Emitted when user approves
 */
export interface ApprovalGrantedEvent extends BaseEvent {
  type: 'approval_granted';
  actor: 'user';

  /** Request event ID */
  request_id: string;

  /** Remember for session */
  remember_for_session: boolean;
}

/**
 * Approval Denied Event
 * Emitted when user denies
 */
export interface ApprovalDeniedEvent extends BaseEvent {
  type: 'approval_denied';
  actor: 'user';

  /** Request event ID */
  request_id: string;

  /** Denial reason */
  reason?: string;
}

/**
 * Turn Diff Event
 * Emitted at end of turn with changes summary
 */
export interface TurnDiffEvent extends BaseEvent {
  type: 'turn_diff';
  actor: 'system';

  /** Files modified this turn */
  files_modified: string[];

  /** Number of tool calls */
  tool_calls_count: number;

  /** Turn duration */
  duration_ms: number;

  /** Token usage */
  tokens: TokenUsage;
}

/**
 * Token Count Event
 * Emitted when token usage updates
 */
export interface TokenCountEvent extends BaseEvent {
  type: 'token_count';
  actor: 'system';

  /** Token usage breakdown */
  tokens: TokenUsage;

  /** Cumulative tokens this conversation */
  cumulative: TokenUsage;
}

/**
 * Validation Error Event
 * Emitted when response validation fails
 */
export interface ValidationErrorEvent extends BaseEvent {
  type: 'validation_error';
  actor: 'system';

  /** Validation errors */
  errors: ValidationError[];
}

/**
 * Review Completed Event
 * Emitted when code review finishes
 */
export interface ReviewCompletedEvent extends BaseEvent {
  type: 'review_completed';
  actor: 'system';

  /** Overall assessment */
  overall_assessment: 'approved' | 'approved_with_notes' | 'changes_requested' | 'rejected';

  /** Number of findings */
  findings_count: number;

  /** Findings by severity */
  findings_by_severity: Record<Severity, number>;
}

/**
 * History Compaction Event
 * Emitted when history is compacted
 */
export interface HistoryCompactionEvent extends BaseEvent {
  type: 'history_compaction';
  actor: 'system';

  /** Original message count */
  original_messages: number;

  /** Original token count */
  original_tokens: number;

  /** Compacted message count */
  compacted_messages: number;

  /** Compacted token count */
  compacted_tokens: number;

  /** Summary length */
  summary_length: number;
}

/**
 * Error Event
 * Generic error event
 */
export interface ErrorEvent extends BaseEvent {
  type: 'error';
  actor: 'system';

  /** Error message */
  error_message: string;

  /** Error stack trace */
  stack_trace?: string;

  /** Error code */
  error_code?: string;
}

/**
 * Token Usage Structure
 */
export interface TokenUsage {
  /** Input tokens */
  input_tokens: number;

  /** Output tokens */
  output_tokens: number;

  /** Reasoning output tokens (tracked separately) */
  reasoning_output_tokens: number;

  /** Cache read tokens (Anthropic) */
  cache_read_tokens?: number;

  /** Cache write tokens (Anthropic) */
  cache_write_tokens?: number;
}

/**
 * Validation Error Structure
 */
export interface ValidationError {
  /** Error type */
  type: 'unknown_tool' | 'invalid_json' | 'missing_required_arg' | 'type_mismatch';

  /** Tool name (if applicable) */
  tool?: string;

  /** Parameter name (if applicable) */
  param?: string;

  /** Error message */
  message: string;

  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Union type of all events
 */
export type Event =
  | TaskStartedEvent
  | TaskCompleteEvent
  | ItemStartedEvent
  | ItemCompletedEvent
  | ToolCallBeginEvent
  | ToolCallOutputDeltaEvent
  | ToolCallEndEvent
  | ToolCallErrorEvent
  | ReasoningDeltaEvent
  | ReasoningSectionBreakEvent
  | ApprovalRequestEvent
  | ApprovalGrantedEvent
  | ApprovalDeniedEvent
  | TurnDiffEvent
  | TokenCountEvent
  | ValidationErrorEvent
  | ReviewCompletedEvent
  | HistoryCompactionEvent
  | ErrorEvent;
