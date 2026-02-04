import React, { useRef, useEffect } from 'react';
import { MessageBubble, Message } from './MessageBubble';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface MessageListProps {
  messages: Message[];
  showReasoning?: boolean;
  autoScroll?: boolean;
}

/**
 * MessageList - Scrollable message display area
 *
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Proper scroll containment (only this scrolls)
 * - Loading indicator
 */
export function MessageList({
  messages,
  showReasoning = true,
  autoScroll = true,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, autoScroll]);

  return (
    <div className="messages-container">
      <div className="messages-scroll" ref={scrollRef}>
        <div className="message-list">
          {messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              showReasoning={showReasoning}
            />
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
