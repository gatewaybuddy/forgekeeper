import React, { useState } from 'react';
import { ConversationFeed } from './ConversationFeed';
import { SessionConfig } from './types';
import './ThoughtWorldChat.css';

export function ThoughtWorldChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [task, setTask] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const [agentConfigs, setAgentConfigs] = useState({
    forge: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
    scout: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
    loom: { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    anvil: { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' }
  });

  const [maxIterations, setMaxIterations] = useState(10);
  const [autonomyLevel, setAutonomyLevel] = useState(5);

  const handleStartSession = async () => {
    if (!task.trim()) {
      alert('Please enter a task');
      return;
    }

    setIsStarting(true);

    try {
      const response = await fetch('/api/thought-world/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          config: {
            forge: agentConfigs.forge,
            scout: agentConfigs.scout,
            loom: agentConfigs.loom,
            anvil: agentConfigs.anvil
          },
          maxIterations,
          autonomyLevel
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }

      const data = await response.json();
      const newSessionId = data.sessionId;

      setSessionId(newSessionId);
      setSessionConfig({
        sessionId: newSessionId,
        task,
        maxIterations,
        autonomyLevel,
        agentConfig: agentConfigs
      });
    } catch (error) {
      console.error('[ThoughtWorldChat] Error starting session:', error);
      alert('Failed to start session. Check console for details.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSessionComplete = (outcome: string) => {
    console.log('[ThoughtWorldChat] Session complete:', outcome);
    // Could show a notification or modal here
  };

  const handleNewSession = () => {
    setSessionId(null);
    setSessionConfig(null);
    setTask('');
  };

  if (sessionId && sessionConfig) {
    return (
      <div className="thought-world-chat">
        <ConversationFeed
          sessionId={sessionId}
          sessionConfig={sessionConfig}
          onSessionComplete={handleSessionComplete}
        />
        <div className="session-controls">
          <button onClick={handleNewSession} className="new-session-btn">
            🔄 New Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thought-world-chat setup">
      <div className="setup-container">
        <h1>Thought World Interactive Chat</h1>
        <p className="subtitle">Collaborate with AI agents in real-time</p>

        <div className="setup-form">
          <div className="form-group">
            <label htmlFor="task">Task Description</label>
            <textarea
              id="task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Enter your task... (e.g., Clone github.com/user/repo and analyze the code structure)"
              rows={4}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="maxIterations">Max Iterations</label>
              <input
                type="number"
                id="maxIterations"
                value={maxIterations}
                onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                min={1}
                max={20}
              />
            </div>

            <div className="form-group">
              <label htmlFor="autonomyLevel">
                Autonomy Level
                <span className="help-text">
                  {autonomyLevel <= 3 && '(High supervision)'}
                  {autonomyLevel >= 4 && autonomyLevel <= 6 && '(Balanced)'}
                  {autonomyLevel >= 7 && '(High autonomy)'}
                </span>
              </label>
              <input
                type="range"
                id="autonomyLevel"
                value={autonomyLevel}
                onChange={(e) => setAutonomyLevel(parseInt(e.target.value))}
                min={1}
                max={10}
              />
              <div className="range-labels">
                <span>1</span>
                <span>{autonomyLevel}</span>
                <span>10</span>
              </div>
            </div>
          </div>

          <details className="agent-config-details">
            <summary>Agent Configuration (Advanced)</summary>
            <div className="agent-configs">
              {Object.entries(agentConfigs).map(([agent, config]) => (
                <div key={agent} className="agent-config-row">
                  <span className="agent-label">{agent}</span>
                  <select
                    value={config.model}
                    onChange={(e) =>
                      setAgentConfigs({
                        ...agentConfigs,
                        [agent]: { ...config, model: e.target.value }
                      })
                    }
                  >
                    <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </select>
                </div>
              ))}
            </div>
          </details>

          <button
            onClick={handleStartSession}
            disabled={isStarting || !task.trim()}
            className="start-btn"
          >
            {isStarting ? '⏳ Starting...' : '🚀 Start Conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}
