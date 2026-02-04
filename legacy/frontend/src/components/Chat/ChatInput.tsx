import React, { useRef, useEffect } from 'react';
import { StreamingStatusBar } from '../StreamingStatusBar';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  showStatus?: boolean;
}

/**
 * ChatInput - Message input area with send button and status bar
 *
 * Features:
 * - Auto-expanding textarea
 * - Keyboard shortcuts (Cmd/Ctrl+Enter to send)
 * - Streaming status bar
 * - Fixed at bottom of chat container
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type your message...',
  showStatus = true,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="input-container">
      {/* Streaming status bar */}
      {showStatus && <StreamingStatusBar />}

      {/* Input wrapper */}
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          className="input-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
        />
        <button
          className="send-button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          {disabled ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Keyboard hint */}
      <div
        style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          textAlign: 'right',
        }}
      >
        {!disabled && 'Press Cmd/Ctrl + Enter to send'}
      </div>
    </div>
  );
}
