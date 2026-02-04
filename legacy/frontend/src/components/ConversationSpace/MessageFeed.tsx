/**
 * MessageFeed - Real-time message display
 *
 * Displays messages with:
 * - SSE streaming for real-time updates
 * - Auto-scroll to latest messages
 * - Agent thinking indicators
 * - Streaming content updates
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message, SSEEvent } from './types';
import './MessageFeed.css';

interface MessageFeedProps {
  channelId: string;
  conversationId?: string;
}

export function MessageFeed({ channelId, conversationId }: MessageFeedProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial messages
  useEffect(() => {
    async function fetchMessages() {
      try {
        setLoading(true);

        // Use conversation-scoped endpoint if conversationId is available
        const endpoint = conversationId
          ? `/api/conversation-space/conversations/${conversationId}/messages`
          : `/api/conversation-space/channels/${channelId}/messages?limit=50`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          setMessages(data.messages);
          setError(null);
        } else {
          setError(data.error || 'Failed to load messages');
        }
      } catch (err) {
        console.error('[MessageFeed] Error fetching messages:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [channelId, conversationId]);

  // Establish SSE connection
  useEffect(() => {
    const eventSource = new EventSource(`/api/conversation-space/stream/${channelId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[MessageFeed] SSE connected');
      setConnected(true);
    };

    eventSource.onerror = (err) => {
      console.error('[MessageFeed] SSE error:', err);
      setConnected(false);

      // Auto-reconnect is handled by EventSource
      // Just update UI state
    };

    // Handle message_created events
    eventSource.addEventListener('message_created', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const newMessage = data.message as Message;

        console.log('[MessageFeed] New message:', newMessage.id);

        setMessages(prev => {
          // Check if message already exists (prevent duplicates)
          if (prev.some(m => m.id === newMessage.id)) {
            return prev;
          }
          return [...prev, newMessage];
        });
      } catch (err) {
        console.error('[MessageFeed] Error parsing message_created:', err);
      }
    });

    // Handle agent_thinking events
    eventSource.addEventListener('agent_thinking', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`[MessageFeed] ${data.agent_id} thinking (score: ${data.relevance_score})`);

        // Update agent state to show thinking indicator
        setMessages(prev => prev.map(m =>
          m.id === data.message_id
            ? { ...m, agent_state: 'thinking' }
            : m
        ));
      } catch (err) {
        console.error('[MessageFeed] Error parsing agent_thinking:', err);
      }
    });

    // Handle agent_contributing events
    eventSource.addEventListener('agent_contributing', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`[MessageFeed] ${data.agent_id} contributing`);

        // Create placeholder message for streaming
        const placeholderMessage: Message = {
          id: data.message_id,
          channel_id: channelId,
          author_type: 'agent',
          author_id: data.agent_id,
          author_name: data.agent_id.charAt(0).toUpperCase() + data.agent_id.slice(1),
          author_avatar: getAgentAvatar(data.agent_id),
          content: '',
          created_at: new Date().toISOString(),
          agent_state: 'contributing'
        };

        setMessages(prev => {
          // Check if message already exists
          if (prev.some(m => m.id === data.message_id)) {
            return prev.map(m =>
              m.id === data.message_id
                ? { ...m, agent_state: 'contributing' }
                : m
            );
          }
          return [...prev, placeholderMessage];
        });
      } catch (err) {
        console.error('[MessageFeed] Error parsing agent_contributing:', err);
      }
    });

    // Handle agent_chunk events (streaming content)
    eventSource.addEventListener('agent_chunk', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        setMessages(prev => prev.map(m =>
          m.id === data.message_id
            ? { ...m, content: m.content + data.chunk }
            : m
        ));
      } catch (err) {
        console.error('[MessageFeed] Error parsing agent_chunk:', err);
      }
    });

    // Handle agent_complete events
    eventSource.addEventListener('agent_complete', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`[MessageFeed] ${data.agent_id} complete (${data.elapsed_ms}ms)`);

        setMessages(prev => prev.map(m =>
          m.id === data.message_id
            ? {
                ...m,
                agent_state: 'complete',
                elapsed_ms: data.elapsed_ms
              }
            : m
        ));
      } catch (err) {
        console.error('[MessageFeed] Error parsing agent_complete:', err);
      }
    });

    // Handle reaction_added events
    eventSource.addEventListener('reaction_added', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`[MessageFeed] Reaction added: ${data.reaction_type} by ${data.author_id}`);

        // Future: Update message with reaction
        // For now, just log it
      } catch (err) {
        console.error('[MessageFeed] Error parsing reaction_added:', err);
      }
    });

    return () => {
      console.log('[MessageFeed] Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [channelId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Helper function to get agent avatar
  function getAgentAvatar(agentId: string): string {
    const avatars: Record<string, string> = {
      forge: '🔨',
      scout: '🔭',
      loom: '🧵',
      anvil: '⚒️'
    };
    return avatars[agentId] || '🤖';
  }

  if (loading) {
    return (
      <div className="message-feed loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="message-feed error">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-feed">
      <div className="connection-status">
        <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢' : '🔴'}
        </span>
        <span className="status-text">
          {connected ? 'Live' : 'Reconnecting...'}
        </span>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p className="empty-icon">💬</p>
            <p className="empty-text">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
