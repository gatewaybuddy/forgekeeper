import React from 'react';
import '../../styles/design-system.css';
import '../../styles/layout.css';

export interface ConsensusPanelProps {
  decision: 'approved' | 'approved_with_modifications' | 'rejected' | 'escalated';
  content: string;
  episodeId?: string;
}

/**
 * ConsensusPanel - Displays final consensus decision
 *
 * Shows the outcome of the 4-agent consensus process.
 */
export function ConsensusPanel({ decision, content, episodeId }: ConsensusPanelProps) {
  const decisionLabels = {
    approved: 'APPROVED',
    approved_with_modifications: 'APPROVED WITH MODIFICATIONS',
    rejected: 'REJECTED',
    escalated: 'ESCALATED',
  };

  return (
    <div className="consensus-panel">
      <div className="consensus-header">Consensus Decision</div>

      {/* Decision badge */}
      <div className={`decision-badge ${decision}`}>
        {decisionLabels[decision]}
      </div>

      {/* Decision content */}
      <div className="consensus-content">{content}</div>

      {/* Episode ID */}
      {episodeId && (
        <div className="episode-id">
          Episode ID: {episodeId}
        </div>
      )}
    </div>
  );
}
