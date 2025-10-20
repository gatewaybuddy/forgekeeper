import React, { useEffect, useState } from 'react';

type Status = 'up' | 'down' | 'na';

function Dot({ status, label }: { status: Status; label: string }) {
  const color = status === 'up' ? '#16a34a' : status === 'down' ? '#dc2626' : '#94a3b8';
  return (
    <span title={`${label}: ${status}`} style={{display:'inline-flex', alignItems:'center', gap:6, marginRight:12}}>
      <span style={{width:8, height:8, borderRadius:99, background: color, display:'inline-block'}} />
      <span style={{fontSize:12, color:'#334155'}}>{label}</span>
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
        const gqlUrl = (window as any).FRONTEND_GRAPHQL_URL || '/graphql';
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
    <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:8, background:'#f8fafc'}}>
      <Dot status={inf} label="Inference" />
      <Dot status={agent} label="Agent" />
      <Dot status={gql} label="GraphQL" />
      <Dot status={queue} label="Queue" />
    </div>
  );
}

