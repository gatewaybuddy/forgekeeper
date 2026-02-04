/**
 * MessageBubble - Individual message display
 *
 * Renders a single message with:
 * - Author avatar and name
 * - Message content
 * - Timestamp
 * - Agent-specific styling
 * - Metadata (collapsible)
 * - Status indicators (thinking, streaming, complete)
 */

import React, { useState } from 'react';
import type { Message, AgentId } from './types';
import { AGENT_CONFIGS } from './types';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [showMetadata, setShowMetadata] = useState(false);

  const isAgent = message.author_type === 'agent';
  const agentConfig = isAgent && message.author_id in AGENT_CONFIGS
    ? AGENT_CONFIGS[message.author_id as AgentId]
    : null;

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = () => {
    if (!message.agent_state) return null;

    const badges = {
      thinking: { icon: '💭', text: 'Thinking...', color: '#6b7280' },
      contributing: { icon: '✍️', text: 'Typing...', color: '#3b82f6' },
      complete: null // No badge when complete
    };

    const badge = badges[message.agent_state];
    if (!badge) return null;

    return (
      <span className="status-badge" style={{ color: badge.color }}>
        {badge.icon} {badge.text}
      </span>
    );
  };

  return (
    <div className={`message-bubble message-${message.author_type}`}>
      <div className="message-header">
        <span className="author-avatar">{message.author_avatar}</span>
        <div className="author-info">
          <span
            className="author-name"
            style={{ color: agentConfig?.color || '#000' }}
          >
            {message.author_name}
          </span>
          {agentConfig && (
            <span className="author-role">{agentConfig.role}</span>
          )}
        </div>
        <div className="message-meta">
          <span className="timestamp">{formatTimestamp(message.created_at)}</span>
          {message.elapsed_ms && (
            <span className="elapsed">({(message.elapsed_ms / 1000).toFixed(1)}s)</span>
          )}
          {getStatusBadge()}
        </div>
      </div>

      <div className="message-content">
        {message.content ? (
          <div className="content-text">
            {message.content.split('\n').map((line, idx) => (
              <React.Fragment key={idx}>
                {line}
                {idx < message.content.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="content-placeholder">
            <span className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        )}
      </div>

      {message.metadata && (
        <div className="message-metadata">
          <button
            className="metadata-toggle"
            onClick={() => setShowMetadata(!showMetadata)}
          >
            {showMetadata ? '▼' : '▶'} Reasoning Transparency
          </button>

          {showMetadata && (
            <div className="metadata-content">
              {message.metadata.primary_optimization && (
                <div className="metadata-item">
                  <strong>Primary Optimization:</strong> {message.metadata.primary_optimization}
                </div>
              )}
              {message.metadata.assumed_constraints && message.metadata.assumed_constraints.length > 0 && (
                <div className="metadata-item">
                  <strong>Assumed Constraints:</strong>
                  <ul>
                    {message.metadata.assumed_constraints.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.metadata.tradeoffs_accepted && message.metadata.tradeoffs_accepted.length > 0 && (
                <div className="metadata-item">
                  <strong>Tradeoffs Accepted:</strong>
                  <ul>
                    {message.metadata.tradeoffs_accepted.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.metadata.confidence && (
                <div className="metadata-item">
                  <strong>Confidence:</strong> {message.metadata.confidence}
                </div>
              )}
              {message.metadata.would_reconsider_if && message.metadata.would_reconsider_if.length > 0 && (
                <div className="metadata-item">
                  <strong>Would Reconsider If:</strong>
                  <ul>
                    {message.metadata.would_reconsider_if.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
