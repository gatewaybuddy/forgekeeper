/**
 * AgentPresenceBar - Shows active agents and their states
 *
 * Displays:
 * - Agent icons and names
 * - Running/offline status
 * - Current state (idle, thinking, contributing)
 * - Relevance scores (when thinking)
 * - Threshold levels
 */

import React, { useState, useEffect } from 'react';
import type { AgentStatus } from './types';
import { AGENT_CONFIGS } from './types';
import './AgentPresenceBar.css';

interface AgentPresenceBarProps {
  channelId: string;
}

export function AgentPresenceBar({ channelId }: AgentPresenceBarProps) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch agent status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/conversation-space/status');

        if (!response.ok) {
          throw new Error(`Failed to fetch status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          setAgents(data.agents);
          setError(null);
        } else {
          setError(data.error || 'Failed to load agent status');
        }
      } catch (err) {
        console.error('[AgentPresenceBar] Error fetching status:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();

    // Refresh status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to SSE for real-time state updates
  useEffect(() => {
    const eventSource = new EventSource(`/api/conversation-space/stream/${channelId}`);

    // Update agent state when thinking
    eventSource.addEventListener('agent_thinking', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        setAgents(prev => prev.map(agent =>
          agent.id === data.agent_id
            ? {
                ...agent,
                state: 'thinking',
                relevance_score: data.relevance_score
              }
            : agent
        ));
      } catch (err) {
        console.error('[AgentPresenceBar] Error parsing agent_thinking:', err);
      }
    });

    // Update agent state when contributing
    eventSource.addEventListener('agent_contributing', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        setAgents(prev => prev.map(agent =>
          agent.id === data.agent_id
            ? { ...agent, state: 'contributing' }
            : agent
        ));
      } catch (err) {
        console.error('[AgentPresenceBar] Error parsing agent_contributing:', err);
      }
    });

    // Update agent state when complete
    eventSource.addEventListener('agent_complete', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        setAgents(prev => prev.map(agent =>
          agent.id === data.agent_id
            ? { ...agent, state: 'idle' }
            : agent
        ));
      } catch (err) {
        console.error('[AgentPresenceBar] Error parsing agent_complete:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [channelId]);

  const getStateBadge = (agent: AgentStatus) => {
    if (!agent.running) {
      return <span className="state-badge offline">Offline</span>;
    }

    switch (agent.state) {
      case 'thinking':
        return (
          <span className="state-badge thinking">
            💭 Thinking {agent.relevance_score !== undefined && `(${(agent.relevance_score * 100).toFixed(0)}%)`}
          </span>
        );
      case 'contributing':
        return <span className="state-badge contributing">✍️ Contributing</span>;
      case 'idle':
      default:
        return <span className="state-badge idle">Listening</span>;
    }
  };

  const getAgentConfig = (agentId: string) => {
    const config = Object.values(AGENT_CONFIGS).find(c => c.id === agentId);
    return config || {
      id: agentId,
      name: agentId.charAt(0).toUpperCase() + agentId.slice(1),
      icon: '🤖',
      color: '#6b7280',
      role: 'Unknown',
      threshold: 0.5
    };
  };

  if (loading) {
    return (
      <div className="agent-presence-bar loading">
        <div className="spinner"></div>
        <span>Loading agents...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-presence-bar error">
        <span className="error-icon">⚠️</span>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="agent-presence-bar">
      <div className="presence-header">
        <span className="presence-title">Active Agents</span>
        <span className="presence-count">
          {agents.filter(a => a.running).length} / {agents.length} online
        </span>
      </div>

      <div className="agents-list">
        {agents.map(agent => {
          const config = getAgentConfig(agent.id);

          return (
            <div
              key={agent.id}
              className={`agent-card ${agent.running ? 'online' : 'offline'} ${agent.state || 'idle'}`}
              style={{
                borderLeftColor: agent.running ? config.color : '#6b7280'
              }}
            >
              <div className="agent-header">
                <span className="agent-icon" style={{ filter: agent.running ? 'none' : 'grayscale(100%)' }}>
                  {config.icon}
                </span>
                <div className="agent-info">
                  <span className="agent-name" style={{ color: agent.running ? config.color : '#6b7280' }}>
                    {config.name}
                  </span>
                  <span className="agent-role">{config.role}</span>
                </div>
              </div>

              <div className="agent-status">
                {getStateBadge(agent)}
              </div>

              <div className="agent-threshold">
                <span className="threshold-label">Threshold:</span>
                <span className="threshold-value">{(config.threshold * 100).toFixed(0)}%</span>
                <div className="threshold-bar">
                  <div
                    className="threshold-fill"
                    style={{
                      width: `${config.threshold * 100}%`,
                      backgroundColor: config.color
                    }}
                  />
                  {agent.relevance_score !== undefined && agent.state === 'thinking' && (
                    <div
                      className="relevance-indicator"
                      style={{
                        left: `${agent.relevance_score * 100}%`
                      }}
                      title={`Current relevance: ${(agent.relevance_score * 100).toFixed(0)}%`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
