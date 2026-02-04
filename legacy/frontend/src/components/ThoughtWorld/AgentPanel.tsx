import React from 'react';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface AgentPanelProps {
  name: 'forge' | 'scout' | 'loom' | 'anvil';
  icon: string;
  title: string;
  role: string;
  status: 'idle' | 'thinking' | 'done' | 'error';
  content: string;
  elapsed?: number;
}

/**
 * AgentPanel - Individual agent display in thought-world sidebar
 *
 * Shows:
 * - Agent name and role
 * - Current status (idle/thinking/done/error)
 * - Streaming content
 * - Elapsed time when done
 */
export function AgentPanel({ name, icon, title, role, status, content, elapsed }: AgentPanelProps) {
  const statusLabels = {
    idle: 'Waiting',
    thinking: 'Thinking',
    done: elapsed ? `Done (${(elapsed / 1000).toFixed(1)}s)` : 'Done',
    error: 'Error',
  };

  return (
    <div className={`agent-panel ${name}`}>
      {/* Agent header */}
      <div className="agent-header">
        <div className="agent-icon">{icon}</div>
        <div className="agent-info">
          <div className="agent-name">{title}</div>
          <div className="agent-role">{role}</div>
        </div>
        <div className={`agent-status ${status}`}>
          {statusLabels[status]}
        </div>
      </div>

      {/* Agent content */}
      <div className="agent-content">
        {content || (status === 'idle' ? '' : 'Waiting...')}
      </div>
    </div>
  );
}
