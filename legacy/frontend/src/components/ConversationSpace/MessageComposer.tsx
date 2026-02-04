/**
 * MessageComposer - User input component
 *
 * Features:
 * - Text input with auto-resize
 * - @mention autocomplete for agents
 * - Submit on Enter (Shift+Enter for newline)
 * - Character counter
 * - Optional metadata for Assumption Transparency Protocol
 */

import React, { useState, useRef, useEffect } from 'react';
import type { PostMessageRequest, MessageMetadata } from './types';
import './MessageComposer.css';

interface Agent {
  id: string;
  name: string;
  icon: string;
  role: string;
  enabled: boolean;
}

interface MessageComposerProps {
  channelId: string;
  conversationId?: string;
  onMessageSent?: (messageId: string) => void;
}

export function MessageComposer({ channelId, conversationId, onMessageSent }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [showMetadata, setShowMetadata] = useState(false);
  const [metadata, setMetadata] = useState<MessageMetadata>({});
  const [responseStyle, setResponseStyle] = useState<'minimal' | 'conversational' | 'detailed'>('conversational');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Load agents list
  useEffect(() => {
    async function loadAgents() {
      try {
        const response = await fetch('/api/conversation-space/agents');
        const data = await response.json();
        if (data.success) {
          // Only include enabled agents for mentions
          setAgents(data.agents.filter((a: Agent) => a.enabled));
        }
      } catch (err) {
        console.error('[MessageComposer] Failed to load agents:', err);
      }
    }

    loadAgents();

    // Reload agents when window regains focus (e.g., after managing agents)
    const handleFocus = () => {
      loadAgents();
    };
    window.addEventListener('focus', handleFocus);

    // Also listen for custom reload event
    const handleReload = () => {
      loadAgents();
    };
    window.addEventListener('agents-reloaded', handleReload);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('agents-reloaded', handleReload);
    };
  }, []);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const request: PostMessageRequest = {
        content: content.trim()
      };

      // Always include response_style if not conversational (default)
      const requestMetadata: MessageMetadata = { ...metadata };
      if (responseStyle !== 'conversational') {
        requestMetadata.response_style = responseStyle;
      }

      // Include metadata if any fields are set
      if (showMetadata && (
        metadata.primary_optimization ||
        metadata.assumed_constraints?.length ||
        metadata.tradeoffs_accepted?.length ||
        metadata.confidence ||
        metadata.would_reconsider_if?.length
      )) {
        request.metadata = { ...requestMetadata, ...metadata };
      } else if (responseStyle !== 'conversational') {
        // Just include response_style
        request.metadata = requestMetadata;
      }

      // Use conversation-scoped endpoint if conversationId is available
      const endpoint = conversationId
        ? `/api/conversation-space/conversations/${conversationId}/messages`
        : `/api/conversation-space/channels/${channelId}/messages`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Clear form
        setContent('');
        setMetadata({});
        setShowMetadata(false);
        setError(null);

        // Callback
        if (onMessageSent && data.message?.id) {
          onMessageSent(data.message.id);
        }
      } else {
        setError(data.error || 'Failed to send message');
      }
    } catch (err) {
      console.error('[MessageComposer] Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
      return;
    }

    // Check for @ mention
    if (e.key === '@') {
      setShowMentions(true);
      setMentionFilter('');
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    // Check if typing after @
    const cursorPos = e.target.selectionStart;
    const beforeCursor = newContent.substring(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionFilter(mentionMatch[1]);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (agentId: string) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const beforeCursor = content.substring(0, cursorPos);
    const afterCursor = content.substring(cursorPos);

    // Replace the partial mention with full mention
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const beforeMention = beforeCursor.substring(0, mentionMatch.index);
      const newContent = `${beforeMention}@${agentId} ${afterCursor}`;
      setContent(newContent);

      // Set cursor position after mention
      setTimeout(() => {
        const newPos = beforeMention.length + agentId.length + 2;
        textareaRef.current?.setSelectionRange(newPos, newPos);
        textareaRef.current?.focus();
      }, 0);
    }

    setShowMentions(false);
  };

  const filteredAgents = agents.filter(agent =>
    agent.id.toLowerCase().startsWith(mentionFilter.toLowerCase())
  );

  // Generate dynamic placeholder text
  const agentMentions = agents.length > 0
    ? `use ${agents.map(a => `@${a.id}`).join(', ')} to mention agents`
    : 'no agents currently available';
  const placeholderText = `Type your message... (${agentMentions})`;

  return (
    <div className="message-composer">
      {error && (
        <div className="composer-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="composer-main">
          <textarea
            ref={textareaRef}
            className="composer-input"
            placeholder={placeholderText}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
          />

          {showMentions && filteredAgents.length > 0 && (
            <div className="mention-autocomplete">
              {filteredAgents.map(agent => (
                <button
                  key={agent.id}
                  type="button"
                  className="mention-option"
                  onClick={() => insertMention(agent.id)}
                >
                  <span className="mention-icon">{agent.icon}</span>
                  <span className="mention-name">{agent.name}</span>
                  <span className="mention-role">({agent.role})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="composer-footer">
          <div className="composer-actions">
            <div className="response-style-buttons">
              <button
                type="button"
                className={`style-button ${responseStyle === 'minimal' ? 'active' : ''}`}
                onClick={() => setResponseStyle('minimal')}
                title="Minimal response (1-2 sentences)"
              >
                🎯 Minimal
              </button>
              <button
                type="button"
                className={`style-button ${responseStyle === 'conversational' ? 'active' : ''}`}
                onClick={() => setResponseStyle('conversational')}
                title="Normal conversational response"
              >
                💬 Normal
              </button>
              <button
                type="button"
                className={`style-button ${responseStyle === 'detailed' ? 'active' : ''}`}
                onClick={() => setResponseStyle('detailed')}
                title="Detailed, comprehensive response"
              >
                📚 Detailed
              </button>
            </div>

            <button
              type="button"
              className={`metadata-toggle ${showMetadata ? 'active' : ''}`}
              onClick={() => setShowMetadata(!showMetadata)}
              title="Add reasoning transparency metadata"
            >
              {showMetadata ? '📋 Hide Metadata' : '📋 Add Metadata'}
            </button>

            <span className="character-count">
              {content.length} chars
            </span>
          </div>

          <button
            type="submit"
            className="send-button"
            disabled={!content.trim() || sending}
          >
            {sending ? '⏳ Sending...' : '📤 Send'}
          </button>
        </div>

        {showMetadata && (
          <div className="metadata-form">
            <h4>Assumption Transparency</h4>

            <div className="metadata-field">
              <label>Primary Optimization</label>
              <input
                type="text"
                placeholder="e.g., Code clarity, Performance, Maintainability"
                value={metadata.primary_optimization || ''}
                onChange={e => setMetadata({ ...metadata, primary_optimization: e.target.value })}
              />
            </div>

            <div className="metadata-field">
              <label>Assumed Constraints</label>
              <textarea
                placeholder="One per line, e.g., 'No breaking changes'"
                value={metadata.assumed_constraints?.join('\n') || ''}
                onChange={e => setMetadata({
                  ...metadata,
                  assumed_constraints: e.target.value.split('\n').filter(s => s.trim())
                })}
                rows={2}
              />
            </div>

            <div className="metadata-field">
              <label>Tradeoffs Accepted</label>
              <textarea
                placeholder="One per line, e.g., 'Slightly more verbose'"
                value={metadata.tradeoffs_accepted?.join('\n') || ''}
                onChange={e => setMetadata({
                  ...metadata,
                  tradeoffs_accepted: e.target.value.split('\n').filter(s => s.trim())
                })}
                rows={2}
              />
            </div>

            <div className="metadata-field">
              <label>Confidence Level</label>
              <select
                value={metadata.confidence || ''}
                onChange={e => setMetadata({
                  ...metadata,
                  confidence: e.target.value as 'low' | 'medium' | 'high' | undefined
                })}
              >
                <option value="">Not specified</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="metadata-field">
              <label>Would Reconsider If</label>
              <textarea
                placeholder="One per line, e.g., 'Performance requirements change'"
                value={metadata.would_reconsider_if?.join('\n') || ''}
                onChange={e => setMetadata({
                  ...metadata,
                  would_reconsider_if: e.target.value.split('\n').filter(s => s.trim())
                })}
                rows={2}
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
