import React from 'react';
import { AgentMessage as AgentMessageType } from './types';
import { ToolFormatter } from './ToolFormatter';
import { JsonFormatter } from './JsonFormatter';
import './AgentMessage.css';

interface AgentMessageProps {
  message: AgentMessageType;
  onQuickAction?: (inputId: string, action: string, customResponse?: string) => void;
}

const agentConfig = {
  forge: { icon: '🔨', color: '#f97316', name: 'Forge', role: 'Executor' },
  scout: { icon: '🔭', color: '#a855f7', name: 'Scout', role: 'Challenger' },
  loom: { icon: '🧵', color: '#3b82f6', name: 'Loom', role: 'Verifier' },
  anvil: { icon: '⚒️', color: '#10b981', name: 'Anvil', role: 'Integrator' },
  system: { icon: '🔧', color: '#6b7280', name: 'System', role: 'Tool' },
  human: { icon: '👤', color: '#8b5cf6', name: 'You', role: 'User' }
};

export function AgentMessage({ message, onQuickAction }: AgentMessageProps) {
  const agent = agentConfig[message.agent];
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [customResponse, setCustomResponse] = React.useState('');

  const handleQuickAction = (action: string) => {
    if (onQuickAction && message.humanInputRequest) {
      onQuickAction(message.humanInputRequest.inputId, action);
      setShowCustomInput(false);
    }
  };

  const handleCustomResponse = () => {
    if (onQuickAction && message.humanInputRequest && customResponse.trim()) {
      onQuickAction(message.humanInputRequest.inputId, 'custom', customResponse);
      setCustomResponse('');
      setShowCustomInput(false);
    }
  };

  return (
    <div className={`agent-message agent-${message.agent} status-${message.status}`}>
      <div className="message-header">
        <span className="agent-icon">{agent.icon}</span>
        <div className="agent-info">
          <span className="agent-name" style={{ color: agent.color }}>
            {agent.name}
          </span>
          <span className="agent-role">{agent.role}</span>
        </div>
        <div className="message-meta">
          <span className="timestamp">
            {message.timestamp.toLocaleTimeString()}
          </span>
          {message.elapsed && (
            <span className="elapsed">({(message.elapsed / 1000).toFixed(1)}s)</span>
          )}
          {message.status === 'waiting_human' && (
            <span className="waiting-badge">⏸️ WAITING FOR YOU</span>
          )}
          {message.status === 'streaming' && (
            <span className="streaming-badge">✍️ Typing...</span>
          )}
        </div>
      </div>

      <div className="message-content">
        <JsonFormatter content={message.content} />
      </div>

      {message.toolExecution && (
        <ToolFormatter toolExecution={message.toolExecution} />
      )}

      {message.humanInputRequest && message.status === 'waiting_human' && (
        <div className="human-input-prompt">
          <div className="question">{message.humanInputRequest.question}</div>

          <div className="quick-actions">
            {message.humanInputRequest.suggestedActions.map((action) => (
              <button
                key={action.action}
                onClick={() => handleQuickAction(action.action)}
                className="quick-action-btn"
              >
                <span className="action-icon">{action.icon}</span>
                {action.label}
              </button>
            ))}

            <button
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="quick-action-btn custom"
            >
              💬 Custom Response
            </button>
          </div>

          {showCustomInput && (
            <div className="custom-input">
              <textarea
                value={customResponse}
                onChange={(e) => setCustomResponse(e.target.value)}
                placeholder="Type your custom response..."
                rows={3}
              />
              <button onClick={handleCustomResponse} className="send-btn">
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
