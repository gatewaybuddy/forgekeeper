import React, { useEffect, useRef, useState } from 'react';
import { AgentMessage as AgentMessageType, SessionConfig } from './types';
import { AgentMessage } from './AgentMessage';
import './ConversationFeed.css';

interface ConversationFeedProps {
  sessionId: string;
  sessionConfig: SessionConfig;
  onSessionComplete?: (outcome: string) => void;
}

export function ConversationFeed({
  sessionId,
  sessionConfig,
  onSessionComplete
}: ConversationFeedProps) {
  const [messages, setMessages] = useState<AgentMessageType[]>([]);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [sessionStatus, setSessionStatus] = useState<'running' | 'paused' | 'complete'>('running');
  const [showScrollTop, setShowScrollTop] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageMapRef = useRef<Map<string, AgentMessageType>>(new Map());
  const currentIterationRef = useRef(currentIteration);
  const onSessionCompleteRef = useRef(onSessionComplete);

  // Keep refs up to date
  useEffect(() => {
    currentIterationRef.current = currentIteration;
  }, [currentIteration]);

  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete;
  }, [onSessionComplete]);

  // DEBUG: Track messages array changes
  useEffect(() => {
    console.log('[ConversationFeed] 🔄 Messages state changed. Count:', messages.length, 'Messages:', messages.map(m => m.id));
  }, [messages]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAutoScroll]);

  // Track scroll position to show/hide scroll-to-top button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Show button if scrolled down more than 300px
      setShowScrollTop(container.scrollTop > 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // SSE connection
  useEffect(() => {
    console.log('[ConversationFeed] 🔌 Setting up SSE connection for session:', sessionId);
    const eventSource = new EventSource(`/api/thought-world/stream/${sessionId}`);
    eventSourceRef.current = eventSource;

    // DEBUG: Log ALL incoming events
    eventSource.onmessage = (e) => {
      console.log('[ConversationFeed] 📨 RAW EVENT:', { type: e.type, data: e.data.substring(0, 100) });
    };

    // Session start
    eventSource.addEventListener('session_start', (e) => {
      const data = JSON.parse(e.data);
      console.log('[ConversationFeed] ✅ Session started:', data);
      setCurrentIteration(0);
      setSessionStatus('running');
    });

    // Iteration events
    eventSource.addEventListener('iteration_start', (e) => {
      const data = JSON.parse(e.data);
      setCurrentIteration(data.iteration);
    });

    // Forge events
    eventSource.addEventListener('forge_start', (e) => {
      const data = JSON.parse(e.data);
      console.log('[ConversationFeed] 🔨 FORGE_START received:', data);
      addOrUpdateMessage({
        id: `forge-${data.iteration}`,
        timestamp: new Date(),
        iteration: data.iteration,
        agent: 'forge',
        role: 'executor',
        content: '',
        status: 'thinking'
      });
      console.log('[ConversationFeed] 🔨 FORGE_START message added');
    });

    eventSource.addEventListener('forge_chunk', (e) => {
      const data = JSON.parse(e.data);
      updateMessageContent(`forge-${data.iteration}`, data.content, 'streaming');
    });

    eventSource.addEventListener('forge_done', (e) => {
      const data = JSON.parse(e.data);
      updateMessageStatus(`forge-${data.iteration}`, 'complete', data.elapsed);
    });

    // Scout events
    eventSource.addEventListener('scout_start', (e) => {
      const data = JSON.parse(e.data);
      addOrUpdateMessage({
        id: `scout-${data.iteration}`,
        timestamp: new Date(),
        iteration: data.iteration,
        agent: 'scout',
        role: 'challenger',
        content: '',
        status: 'thinking'
      });
    });

    eventSource.addEventListener('scout_chunk', (e) => {
      const data = JSON.parse(e.data);
      updateMessageContent(`scout-${data.iteration}`, data.content, 'streaming');
    });

    eventSource.addEventListener('scout_done', (e) => {
      const data = JSON.parse(e.data);
      updateMessageStatus(`scout-${data.iteration}`, 'complete', data.elapsed);
    });

    // Loom events
    eventSource.addEventListener('loom_start', (e) => {
      const data = JSON.parse(e.data);
      addOrUpdateMessage({
        id: `loom-${data.iteration}`,
        timestamp: new Date(),
        iteration: data.iteration,
        agent: 'loom',
        role: 'verifier',
        content: '',
        status: 'thinking'
      });
    });

    eventSource.addEventListener('loom_chunk', (e) => {
      const data = JSON.parse(e.data);
      updateMessageContent(`loom-${data.iteration}`, data.content, 'streaming');
    });

    eventSource.addEventListener('loom_done', (e) => {
      const data = JSON.parse(e.data);
      updateMessageStatus(`loom-${data.iteration}`, 'complete', data.elapsed);
    });

    // Anvil events
    eventSource.addEventListener('anvil_start', (e) => {
      const data = JSON.parse(e.data);
      addOrUpdateMessage({
        id: `anvil-${data.iteration}`,
        timestamp: new Date(),
        iteration: data.iteration,
        agent: 'anvil',
        role: 'integrator',
        content: '',
        status: 'thinking'
      });
    });

    eventSource.addEventListener('anvil_chunk', (e) => {
      const data = JSON.parse(e.data);
      updateMessageContent(`anvil-${data.iteration}`, data.content, 'streaming');
    });

    eventSource.addEventListener('anvil_done', (e) => {
      const data = JSON.parse(e.data);
      updateMessageStatus(`anvil-${data.iteration}`, 'complete', data.elapsed);
    });

    // Tool execution events
    eventSource.addEventListener('tool_executing', (e) => {
      const data = JSON.parse(e.data);
      addOrUpdateMessage({
        id: `tool-${data.iteration}-${data.tool}`,
        timestamp: new Date(),
        iteration: data.iteration,
        agent: 'system',
        role: 'tool',
        content: '', // Content will be rendered by ToolFormatter
        status: 'streaming',
        toolExecution: {
          tool: data.tool,
          arguments: data.arguments,
          success: undefined,
          elapsed: undefined
        }
      });
    });

    eventSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);

      // Update the message with complete tool execution data
      setMessages(prev => prev.map(m => {
        if (m.id === `tool-${data.iteration}-${data.tool}`) {
          return {
            ...m,
            status: 'complete' as const,
            toolExecution: {
              tool: data.tool,
              arguments: m.toolExecution?.arguments || {},
              result: data.result,
              success: data.success,
              error: data.error,
              elapsed: data.elapsed
            }
          };
        }
        return m;
      }));
    });

    // Human input request
    eventSource.addEventListener('human_input_requested', (e) => {
      const data = JSON.parse(e.data);
      console.log('[ConversationFeed] Human input requested:', data);

      addOrUpdateMessage({
        id: `human-request-${data.inputId}`,
        timestamp: new Date(),
        iteration: currentIterationRef.current,
        agent: 'scout',
        role: 'challenger',
        content: '',
        status: 'waiting_human',
        humanInputRequest: {
          inputId: data.inputId,
          question: data.question,
          context: data.context,
          suggestedActions: data.suggestedActions,
          urgency: data.urgency || 'medium'
        }
      });

      setSessionStatus('paused');
    });

    // Session complete
    eventSource.addEventListener('session_complete', (e) => {
      const data = JSON.parse(e.data);
      console.log('[ConversationFeed] Session complete:', data);
      setSessionStatus('complete');
      if (onSessionCompleteRef.current) {
        onSessionCompleteRef.current(data.outcome);
      }
    });

    // Session error
    eventSource.addEventListener('session_error', (e) => {
      const data = JSON.parse(e.data);
      console.error('[ConversationFeed] Session error:', data);
      setSessionStatus('complete');

      // Display error as a system message
      addOrUpdateMessage({
        id: `error-${data.sessionId}`,
        timestamp: new Date(),
        iteration: currentIterationRef.current,
        agent: 'system',
        role: 'tool',
        content: `❌ Session failed: ${data.error}`,
        status: 'complete'
      });
    });

    // Error handling
    eventSource.onerror = (error) => {
      console.error('[ConversationFeed] SSE error:', error);
      // Don't close on error - will reconnect automatically
    };

    return () => {
      console.log('[ConversationFeed] Closing SSE connection');
      eventSource.close();
    };
  }, [sessionId]); // Only re-connect when sessionId changes, not on every iteration!

  const addOrUpdateMessage = (message: AgentMessageType) => {
    console.log('[ConversationFeed] 📝 addOrUpdateMessage called:', { id: message.id, agent: message.agent, content: message.content.substring(0, 50) });
    setMessages(prev => {
      console.log('[ConversationFeed] 📝 Current messages count:', prev.length);
      const existing = prev.find(m => m.id === message.id);
      if (existing) {
        console.log('[ConversationFeed] 📝 Updating existing message:', message.id);
        return prev.map(m => m.id === message.id ? message : m);
      }
      console.log('[ConversationFeed] 📝 Adding NEW message:', message.id);
      const newMessages = [...prev, message];
      console.log('[ConversationFeed] 📝 New messages count:', newMessages.length);
      return newMessages;
    });
    messageMapRef.current.set(message.id, message);
  };

  const updateMessageContent = (
    id: string,
    content: string,
    status: AgentMessageType['status']
  ) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, content: m.content + content, status };
      }
      return m;
    }));
  };

  const updateMessageStatus = (
    id: string,
    status: AgentMessageType['status'],
    elapsed?: number
  ) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, status, elapsed };
      }
      return m;
    }));
  };

  const handleQuickAction = async (
    inputId: string,
    action: string,
    customResponse?: string
  ) => {
    console.log('[ConversationFeed] Quick action:', { inputId, action, customResponse });

    // Add human response message
    addOrUpdateMessage({
      id: `human-response-${inputId}`,
      timestamp: new Date(),
      iteration: currentIteration,
      agent: 'human',
      role: 'user',
      content: customResponse || `Selected: ${action}`,
      status: 'complete'
    });

    // Send response to backend
    try {
      const response = await fetch(`/api/thought-world/human-input/${sessionId}/${inputId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, response: customResponse })
      });

      if (response.ok) {
        console.log('[ConversationFeed] Human input sent successfully');
        setSessionStatus('running');
      } else {
        console.error('[ConversationFeed] Failed to send human input');
      }
    } catch (error) {
      console.error('[ConversationFeed] Error sending human input:', error);
    }
  };

  const handleScrollToggle = () => {
    setIsAutoScroll(!isAutoScroll);
  };

  const scrollToTop = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="conversation-feed">
      <div className="conversation-header">
        <div className="session-info">
          <h3>Thought World Conversation</h3>
          <div className="session-meta">
            <span className="session-id">Session: {sessionId.slice(0, 8)}</span>
            <span className="iteration">Iteration: {currentIteration} / {sessionConfig.maxIterations}</span>
            <span className={`status status-${sessionStatus}`}>
              {sessionStatus === 'running' && '▶️ Running'}
              {sessionStatus === 'paused' && '⏸️ Paused'}
              {sessionStatus === 'complete' && '✅ Complete'}
            </span>
          </div>
        </div>
        <button
          onClick={handleScrollToggle}
          className={`auto-scroll-btn ${isAutoScroll ? 'active' : ''}`}
          title={isAutoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
        >
          {isAutoScroll ? '📌 Auto-scroll ON' : '📍 Auto-scroll OFF'}
        </button>
      </div>

      <div className="messages-container" ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Waiting for agents to start...</p>
          </div>
        )}

        {messages.map((message, index) => {
          // Show iteration divider
          const showDivider = index > 0 && messages[index - 1].iteration !== message.iteration;

          return (
            <React.Fragment key={message.id}>
              {showDivider && (
                <div className="iteration-divider">
                  <span>Iteration {message.iteration}</span>
                </div>
              )}
              <AgentMessage
                message={message}
                onQuickAction={handleQuickAction}
              />
            </React.Fragment>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to top button */}
      <button
        onClick={scrollToTop}
        className={`scroll-to-top ${!showScrollTop ? 'hidden' : ''}`}
        title="Scroll to top"
        aria-label="Scroll to top"
      >
        ↑
      </button>
    </div>
  );
}
