import React from 'react';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface MessageBubbleProps {
  message: Message;
  showReasoning?: boolean;
}

/**
 * MessageBubble - Individual chat message display
 *
 * Styles messages based on role:
 * - user: Blue background, right-aligned
 * - assistant: Gray background, left-aligned
 * - system: Centered, dimmed
 * - tool: Left-aligned with yellow accent
 */
export function MessageBubble({ message, showReasoning = true }: MessageBubbleProps) {
  const { role, content, reasoning, name, tool_call_id } = message;

  // Don't render empty messages
  if (!content && !reasoning) {
    return null;
  }

  return (
    <div className={`message-bubble ${role}`}>
      {/* Message header (role + metadata) */}
      <div className="message-header">
        <span className="message-role">{role}</span>
        {name && <span className="text-tertiary">({name})</span>}
        {tool_call_id && (
          <span className="text-xs text-dim" title={tool_call_id}>
            ID: {tool_call_id.slice(0, 8)}...
          </span>
        )}
      </div>

      {/* Main message content */}
      {content && (
        <div className="message-content">
          {content}
        </div>
      )}

      {/* Reasoning (for assistant messages) */}
      {showReasoning && reasoning && (
        <div className="message-reasoning">
          <strong>Reasoning:</strong> {reasoning}
        </div>
      )}

      {/* Tool calls indicator */}
      {message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && (
        <div className="message-tools">
          <span className="badge info">
            {message.tool_calls.length} tool call{message.tool_calls.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
