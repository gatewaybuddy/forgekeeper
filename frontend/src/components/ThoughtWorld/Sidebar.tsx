import React, { useEffect, useState } from 'react';
import { AgentPanel } from './AgentPanel';
import { ConsensusPanel } from './ConsensusPanel';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface AgentState {
  status: 'idle' | 'thinking' | 'done' | 'error';
  content: string;
  elapsed?: number;
}

export interface ThoughtWorldState {
  forge: AgentState;
  scout: AgentState;
  loom: AgentState;
  anvil: AgentState;
  decision?: {
    type: 'approved' | 'approved_with_modifications' | 'rejected' | 'escalated';
    content: string;
  };
  episodeId?: string;
}

export interface ThoughtWorldSidebarProps {
  sessionId: string | null;
}

/**
 * ThoughtWorldSidebar - Real-time agent activity monitor
 *
 * Displays the 4-agent consensus flow:
 * - Forge (Executor)
 * - Scout (Challenger)
 * - Loom (Verifier)
 * - Anvil (Integrator)
 *
 * Polls for updates every 2 seconds to show real-time progress.
 */
export function ThoughtWorldSidebar({ sessionId }: ThoughtWorldSidebarProps) {
  const [state, setState] = useState<ThoughtWorldState>({
    forge: { status: 'idle', content: '' },
    scout: { status: 'idle', content: '' },
    loom: { status: 'idle', content: '' },
    anvil: { status: 'idle', content: '' },
  });

  useEffect(() => {
    if (!sessionId) {
      // No active session - reset to idle
      setState({
        forge: { status: 'idle', content: '' },
        scout: { status: 'idle', content: '' },
        loom: { status: 'idle', content: '' },
        anvil: { status: 'idle', content: '' },
      });
      return;
    }

    // Poll for updates every 2 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/thought-world/status/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setState({
            forge: data.agents?.forge || { status: 'idle', content: '' },
            scout: data.agents?.scout || { status: 'idle', content: '' },
            loom: data.agents?.loom || { status: 'idle', content: '' },
            anvil: data.agents?.anvil || { status: 'idle', content: '' },
            decision: data.decision,
            episodeId: data.episodeId,
          });
        }
      } catch (error) {
        console.error('[ThoughtWorldSidebar] Failed to fetch status:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="thought-world-sidebar">
        <div className="sidebar-header">
          <h3>🌍 Thought World</h3>
          <span className="session-id">No active session</span>
        </div>
        <div
          style={{
            padding: 'var(--padding-xl)',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--font-sm)',
          }}
        >
          <p>Start a conversation in the thought-world interface to see agent activity here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="thought-world-sidebar">
      {/* Sidebar header */}
      <div className="sidebar-header">
        <h3>🌍 Thought World</h3>
        <span className="session-id">{sessionId.slice(0, 8)}</span>
      </div>

      {/* Agent panels */}
      <div className="agents-grid">
        <AgentPanel
          name="forge"
          icon="🔨"
          title="Forge"
          role="Executor • Proposes solution"
          status={state.forge.status}
          content={state.forge.content}
          elapsed={state.forge.elapsed}
        />

        <AgentPanel
          name="scout"
          icon="🔭"
          title="Scout"
          role="Challenger • Demands proof"
          status={state.scout.status}
          content={state.scout.content}
          elapsed={state.scout.elapsed}
        />

        <AgentPanel
          name="loom"
          icon="🔍"
          title="Loom"
          role="Verifier • Reviews for errors"
          status={state.loom.status}
          content={state.loom.content}
          elapsed={state.loom.elapsed}
        />

        <AgentPanel
          name="anvil"
          icon="⚖️"
          title="Anvil"
          role="Integrator • Final decision"
          status={state.anvil.status}
          content={state.anvil.content}
          elapsed={state.anvil.elapsed}
        />
      </div>

      {/* Consensus panel */}
      {state.decision && (
        <ConsensusPanel
          decision={state.decision.type}
          content={state.decision.content}
          episodeId={state.episodeId}
        />
      )}
    </div>
  );
}
