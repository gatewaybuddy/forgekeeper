import React, { useState, useCallback, useEffect } from 'react';
import { CleanChat, CleanSettingsModal } from './CleanChat';
import { chatViaServer, streamViaServer, type ChatMessageReq } from '../lib/chatClient';
import { ThoughtWorldSidebar } from './ThoughtWorld';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface CleanChatWrapperProps {
  apiBase: string;
  model: string;
}

export function CleanChatWrapper({ apiBase, model: initialModel }: CleanChatWrapperProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: '',
      timestamp: Date.now()
    }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showThoughtWorld, setShowThoughtWorld] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    model: initialModel,
    temperature: 0.0,
    maxTokens: 512,
    reviewMode: false,
    chunkedMode: false
  });

  // Generate session ID when first message is sent
  useEffect(() => {
    if (messages.length > 1 && !sessionId) {
      setSessionId(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [messages, sessionId]);

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    try {
      // Build request
      const req: ChatMessageReq = {
        messages: [...messages.filter(m => m.role !== 'system' || m.content), userMessage].map(m => ({
          role: m.role,
          content: m.content
        })),
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: false
      };

      // Call API
      const response = await chatViaServer(req, apiBase);

      // Add assistant response
      if (response && response.choices && response.choices[0]) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.choices[0].message?.content || 'No response',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages, apiBase, settings]);

  return (
    <>
      <CleanChat
        messages={messages}
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        onOpenSettings={() => setShowSettings(true)}
        showThoughtWorld={showThoughtWorld}
        onToggleThoughtWorld={() => setShowThoughtWorld(!showThoughtWorld)}
        thoughtWorldSidebar={<ThoughtWorldSidebar sessionId={sessionId} />}
      />
      <CleanSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />
    </>
  );
}
