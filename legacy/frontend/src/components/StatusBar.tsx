import React, { useEffect, useState } from 'react';
import '../styles/design-system.css';

type Status = 'up' | 'down' | 'na';

function Dot({ status, label }: { status: Status; label: string }) {
  const color = status === 'up'
    ? 'var(--accent-green)'
    : status === 'down'
    ? 'var(--accent-red)'
    : 'var(--text-dim)';

  return (
    <span
      title={`${label}: ${status}`}
      className="status-indicator"
    >
      <span
        className="status-dot"
        style={{ background: color }}
      />
      <span className="text-sm text-secondary">{label}</span>
    </span>
  );
}

export default function StatusBar() {
  const [inf, setInf] = useState<Status>('na');
  const [agent, setAgent] = useState<Status>('na');
  const [gql, setGql] = useState<Status>('na');
  const [queue, setQueue] = useState<Status>('na');

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        // Inference health
        const r1 = await fetch('/healthz').catch(() => null) || await fetch('/health').catch(() => null);
        if (alive) setInf(r1 && (r1.ok || (r1.status >= 200 && r1.status < 500)) ? 'up' : 'down');
      } catch { if (alive) setInf('down'); }
      try {
        const r2 = await fetch('/metrics');
        if (alive) setAgent(r2 && (r2.ok || (r2.status >= 200 && r2.status < 500)) ? 'up' : 'down');
      } catch { if (alive) setAgent('down'); }
      try {
        const gqlUrl = (window as unknown).FRONTEND_GRAPHQL_URL || '/graphql';
        const r3 = await fetch(gqlUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{__typename}' }) });
        if (alive) setGql(r3 && (r3.status === 200 || r3.status === 400) ? 'up' : 'down');
      } catch { if (alive) setGql('down'); }
      // Queue: not implemented in this track
      if (alive) setQueue('na');
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="panel" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--gap-md)',
      padding: 'var(--padding-sm) var(--padding-md)'
    }}>
      <Dot status={inf} label="Inference" />
      <Dot status={agent} label="Agent" />
      <Dot status={gql} label="GraphQL" />
      <Dot status={queue} label="Queue" />
    </div>
  );
}

