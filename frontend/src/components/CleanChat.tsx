import React, { useState, useRef, useEffect } from 'react';
import '../styles/clean-chat.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface CleanChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isStreaming?: boolean;
  onOpenSettings?: () => void;
  showThoughtWorld?: boolean;
  onToggleThoughtWorld?: () => void;
  thoughtWorldSidebar?: React.ReactNode;
}

export function CleanChat({
  messages,
  onSendMessage,
  isStreaming = false,
  onOpenSettings,
  showThoughtWorld = false,
  onToggleThoughtWorld,
  thoughtWorldSidebar
}: CleanChatProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getAvatarIcon = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return '👤';
      case 'assistant':
        return '🤖';
      case 'system':
        return 'ℹ️';
    }
  };

  const getRoleName = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'Forgekeeper';
      case 'system':
        return 'System';
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="clean-chat-container">
      {/* Header */}
      <header className="clean-chat-header">
        <div className="clean-chat-header-left">
          <div className="clean-chat-logo">Forgekeeper</div>
        </div>
        <div className="clean-chat-header-right">
          {onToggleThoughtWorld && (
            <button
              className="clean-icon-button"
              onClick={onToggleThoughtWorld}
              title={showThoughtWorld ? 'Hide Thought World' : 'Show Thought World'}
            >
              {showThoughtWorld ? '👁️' : '🌍'}
            </button>
          )}
          <button
            className="clean-icon-button"
            onClick={onOpenSettings}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Main content area with optional sidebar */}
      <div className="clean-content-wrapper" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Messages */}
        <div className="clean-messages-container" style={{ flex: showThoughtWorld ? '1' : '1', minWidth: 0 }}>
          <div className="clean-messages-wrapper">
          {messages.filter(m => m.role !== 'system' || m.content).map((message, index) => (
            <div key={index} className={`clean-message ${message.role}`}>
              <div className="clean-message-avatar">
                {getAvatarIcon(message.role)}
              </div>
              <div className="clean-message-content">
                <div className="clean-message-header">
                  <span className="clean-message-role">{getRoleName(message.role)}</span>
                  {message.timestamp && (
                    <span className="clean-message-time">{formatTime(message.timestamp)}</span>
                  )}
                </div>
                <div className="clean-message-text">{message.content}</div>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="clean-message assistant">
              <div className="clean-message-avatar">🤖</div>
              <div className="clean-message-content">
                <div className="clean-message-header">
                  <span className="clean-message-role">Forgekeeper</span>
                </div>
                <div className="clean-streaming-indicator">
                  <div className="clean-streaming-dot"></div>
                  <div className="clean-streaming-dot"></div>
                  <div className="clean-streaming-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ThoughtWorld Sidebar */}
        {showThoughtWorld && thoughtWorldSidebar && (
          <div className="clean-thought-world-sidebar">
            {thoughtWorldSidebar}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="clean-input-container">
        <div className="clean-input-wrapper">
          <div className="clean-textarea-wrapper">
            <textarea
              ref={textareaRef}
              className="clean-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Forgekeeper..."
              rows={1}
              disabled={isStreaming}
            />
          </div>
          <button
            className="clean-send-button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            title="Send message"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

interface CleanSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    reviewMode?: boolean;
    chunkedMode?: boolean;
  };
  onUpdateSettings: (settings: any) => void;
}

export function CleanSettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}: CleanSettingsModalProps) {
  const [availableModels, setAvailableModels] = useState<Array<{id: string, name: string, maxTokens: number | null, root: string | null}>>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Fetch available models when modal opens
  useEffect(() => {
    if (isOpen && availableModels.length === 0) {
      setLoadingModels(true);
      fetch('/api/models')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.models) {
            setAvailableModels(data.models);
          } else {
            // Fallback to current model if fetch fails
            setAvailableModels([{ id: settings.model || 'core', name: settings.model || 'core', maxTokens: null, root: null }]);
          }
        })
        .catch(err => {
          console.error('Failed to fetch models:', err);
          setAvailableModels([{ id: settings.model || 'core', name: settings.model || 'core', maxTokens: null, root: null }]);
        })
        .finally(() => setLoadingModels(false));
    }
  }, [isOpen, availableModels.length, settings.model]);

  if (!isOpen) return null;

  const selectedModel = availableModels.find(m => m.id === settings.model);

  return (
    <div className="clean-settings-overlay" onClick={onClose}>
      <div className="clean-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clean-settings-header">
          <h2 className="clean-settings-title">Settings</h2>
          <button className="clean-icon-button" onClick={onClose}>✕</button>
        </div>
        <div className="clean-settings-body">
          <div className="clean-setting-group">
            <label className="clean-setting-label">Model</label>
            <p className="clean-setting-description">Select the AI model to use</p>
            {loadingModels ? (
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Loading models...</div>
            ) : (
              <>
                <select
                  className="clean-setting-input"
                  value={settings.model || 'core'}
                  onChange={(e) => onUpdateSettings({ ...settings, model: e.target.value })}
                >
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                      {model.maxTokens ? ` (max: ${model.maxTokens} tokens)` : ''}
                    </option>
                  ))}
                </select>
                {selectedModel?.root && (
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    Path: {selectedModel.root}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="clean-setting-group">
            <label className="clean-setting-label">Temperature</label>
            <p className="clean-setting-description">Controls randomness (0 = focused, 1 = creative)</p>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              className="clean-setting-input"
              value={settings.temperature || 0}
              onChange={(e) => onUpdateSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {settings.temperature?.toFixed(1) || '0.0'}
            </div>
          </div>

          <div className="clean-setting-group">
            <label className="clean-setting-label">Max Tokens</label>
            <p className="clean-setting-description">Maximum length of response</p>
            <input
              type="number"
              className="clean-setting-input"
              value={settings.maxTokens || 512}
              onChange={(e) => onUpdateSettings({ ...settings, maxTokens: parseInt(e.target.value) })}
            />
          </div>

          <div className="clean-setting-group">
            <label className="clean-setting-label">Advanced Features</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                className="clean-toggle"
                onClick={() => onUpdateSettings({ ...settings, reviewMode: !settings.reviewMode })}
              >
                <div className={`clean-toggle-switch ${settings.reviewMode ? 'active' : ''}`}>
                  <div className="clean-toggle-knob"></div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Review Mode</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Self-review responses for quality
                  </div>
                </div>
              </div>

              <div
                className="clean-toggle"
                onClick={() => onUpdateSettings({ ...settings, chunkedMode: !settings.chunkedMode })}
              >
                <div className={`clean-toggle-switch ${settings.chunkedMode ? 'active' : ''}`}>
                  <div className="clean-toggle-knob"></div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Chunked Mode</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Break complex responses into chunks
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
