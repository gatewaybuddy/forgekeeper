import React, { useState, useMemo } from 'react';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import type { Message } from './MessageBubble';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface ChatContainerProps {
  apiBase: string;
  model: string;
  messages: Message[];
  input: string;
  streaming: boolean;
  showReasoning?: boolean;

  // Callbacks
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onModelChange: (model: string) => void;
  onApiBaseChange: (base: string) => void;

  // Settings
  maxTokens?: number;
  onMaxTokensChange?: (tokens: number) => void;
  temperature?: number;
  onTemperatureChange?: (temp: number) => void;
  topP?: number;
  onTopPChange?: (topP: number) => void;
  reviewEnabled?: boolean;
  onReviewEnabledChange?: (enabled: boolean) => void;
  chunkedEnabled?: boolean;
  onChunkedEnabledChange?: (enabled: boolean) => void;
}

/**
 * ChatContainer - Simplified chat component using new design system
 *
 * This is a clean wrapper that delegates to:
 * - ChatSettingsPanel (collapsible configuration)
 * - MessageList (scrollable messages)
 * - ChatInput (input + status bar)
 *
 * Replaces the old 1,459-line Chat.tsx with a modular structure.
 */
export function ChatContainer({
  apiBase,
  model,
  messages,
  input,
  streaming,
  showReasoning = true,
  onInputChange,
  onSubmit,
  onModelChange,
  onApiBaseChange,
  maxTokens = 2048,
  onMaxTokensChange = () => {},
  temperature = 0.0,
  onTemperatureChange = () => {},
  topP = 0.4,
  onTopPChange = () => {},
  reviewEnabled = false,
  onReviewEnabledChange = () => {},
  chunkedEnabled = false,
  onChunkedEnabledChange = () => {},
}: ChatContainerProps) {
  return (
    <div className="chat-container">
      {/* Collapsible settings panel */}
      <ChatSettingsPanel
        model={model}
        onModelChange={onModelChange}
        maxTokens={maxTokens}
        onMaxTokensChange={onMaxTokensChange}
        temperature={temperature}
        onTemperatureChange={onTemperatureChange}
        topP={topP}
        onTopPChange={onTopPChange}
        reviewEnabled={reviewEnabled}
        onReviewEnabledChange={onReviewEnabledChange}
        chunkedEnabled={chunkedEnabled}
        onChunkedEnabledChange={onChunkedEnabledChange}
        apiBase={apiBase}
        onApiBaseChange={onApiBaseChange}
        showAdvanced={true}
      />

      {/* Messages display area */}
      <MessageList
        messages={messages}
        showReasoning={showReasoning}
        autoScroll={true}
      />

      {/* Input area with status bar */}
      <ChatInput
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        disabled={streaming}
        placeholder="Type your message... (Cmd/Ctrl+Enter to send)"
        showStatus={true}
      />
    </div>
  );
}
