import React, { useEffect, useState } from 'react';

type TaskItem = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | string;
  evidence?: any;
  suggested?: string[];
  acceptance?: string[];
};

export default function TasksDrawer({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<number>(60);

  const load = async (windowMin: number) => {
    try {
      setLoading(true);
      const r = await fetch(`/api/tasks/suggest?window_min=${windowMin}`);
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setItems(Array.isArray(j?.items) ? j.items : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(win); }, []);

  const copy = async () => {
    try {
      const md = items.map(it => [
        `- [${it.severity?.toUpperCase?.() || 'MED'}] ${it.title} (${it.id})`,
        it.suggested?.length ? `  - Suggested: ${it.suggested.join('; ')}` : '',
      ].filter(Boolean).join('\n')).join('\n');
      await navigator.clipboard.writeText(md);
      alert('Copied tasks to clipboard.');
    } catch {}
  };

  return (
    <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100}} onClick={onClose}>
      <div style={{width:'min(900px, 94vw)', background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 12px 32px rgba(0,0,0,0.18)', padding:16, maxHeight:'80vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div style={{fontWeight:700, color:'#334155'}}>Suggested Tasks (last {win}m)</div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <input type="number" min={5} max={480} value={win} onChange={e=> setWin(Math.max(5, Math.min(480, Number(e.target.value)||60)))} style={{width:80}} />
            <button onClick={()=>load(win)} disabled={loading}>Refresh</button>
            <button onClick={copy} disabled={!items.length}>Copy</button>
            <button onClick={onClose} aria-label="Close" title="Close">✕</button>
          </div>
        </div>
        {loading && <div>Loading…</div>}
        {error && <div style={{color:'#b91c1c'}}>Error: {error}</div>}
        {!loading && !error && (
          <ul style={{listStyle:'none', padding:0, margin:0}}>
            {items.map((it, idx) => (
              <li key={idx} style={{border:'1px solid #e5e7eb', borderRadius:8, padding:10, marginBottom:8}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <div style={{fontWeight:600}}>{it.title}</div>
                  <div style={{fontSize:12, color:'#64748b'}}>{it.id} • {String(it.severity).toUpperCase()}</div>
                </div>
                {Array.isArray(it.suggested) && it.suggested.length > 0 && (
                  <div style={{marginTop:6, fontSize:12}}>Suggested: {it.suggested.join('; ')}</div>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li style={{color:'#64748b'}}>No suggestions for the selected window.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

