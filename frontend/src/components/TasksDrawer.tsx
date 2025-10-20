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
  const [showPr, setShowPr] = useState(false);
  const [prTitle, setPrTitle] = useState('Update docs from Task Generator');
  const [prBody, setPrBody] = useState('');
  const [prFiles, setPrFiles] = useState('README.md');
  const [prAppendText, setPrAppendText] = useState('');
  const [prPreview, setPrPreview] = useState<any>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [prLoading, setPrLoading] = useState(false);

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

  const previewPR = async () => {
    try {
      setPrLoading(true);
      setPrError(null);
      setPrPreview(null);
      const files = prFiles.split(',').map(s=>s.trim()).filter(Boolean);
      const edits = (prAppendText && files.length > 0) ? [{ path: files[0], appendText: prAppendText }] : [];
      const labels = ['docs'];
      const m = prTitle.match(/\b(T\d{2,6})\b/i);
      if (m) labels.push(`task:${m[1].toUpperCase()}`);
      const r = await fetch('/api/auto_pr/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: prTitle, body: prBody, files, edits, labels }) });
      const j = await r.json().catch(()=>({ok:false,error:'bad_json'}));
      if (!r.ok || j.ok === false) {
        setPrError(j?.error || `HTTP ${r.status}`);
      } else {
        setPrPreview(j);
      }
    } catch (e:any) {
      setPrError(e?.message || String(e));
    } finally {
      setPrLoading(false);
    }
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
                <div style={{marginTop:6, display:'flex', gap:8}}>
                  <button onClick={()=>{
                    const body = `Task: ${it.id} — ${it.title}\n\nSeverity: ${it.severity}\n\nSuggested: ${Array.isArray(it.suggested)? it.suggested.join('; ') : ''}`;
                    setPrTitle(`[docs] ${it.title} (${it.id})`);
                    setPrBody(body);
                    setPrFiles('README.md');
                    if ((it as any).append?.text) setPrAppendText((it as any).append.text);
                    setShowPr(true);
                  }}>Open PR preview from this task</button>
                  { (it as any).append?.text && (
                    <button onClick={()=> setPrAppendText((it as any).append.text) }>Use README snippet</button>
                  )}
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li style={{color:'#64748b'}}>No suggestions for the selected window.</li>
            )}
          </ul>
        )}
        <div style={{marginTop:12, padding:10, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:700, color:'#334155'}}>Propose PR (allowlist & dry‑run)</div>
            <button onClick={()=>setShowPr(v=>!v)}>{showPr ? 'Hide' : 'Show'}</button>
          </div>
          {showPr && (
            <div style={{marginTop:8}}>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <input placeholder="PR title" value={prTitle} onChange={e=>setPrTitle(e.target.value)} style={{flex:'1 1 auto'}} />
                  <button onClick={()=>{ if (!prTitle.startsWith('[docs]')) setPrTitle(`[docs] ${prTitle}`); }}>Mark as [docs]</button>
                </div>
                <textarea placeholder="PR body" rows={4} value={prBody} onChange={e=>setPrBody(e.target.value)} />
                <input placeholder="Files (comma‑separated)" value={prFiles} onChange={e=>setPrFiles(e.target.value)} />
                <textarea placeholder="Append text (optional; appended to first allowed file)" rows={3} value={prAppendText} onChange={e=>setPrAppendText(e.target.value)} />
                <div style={{display:'flex', gap:8}}>
                  <button onClick={previewPR} disabled={prLoading}>Preview</button>
                </div>
                {prError && <div style={{color:'#b91c1c'}}>Error: {prError}</div>}
                {prPreview && (
                  <div style={{fontSize:12, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, padding:8}}>
                    <div><b>Allowed files:</b> {(prPreview.preview?.files || []).join(', ') || '(none)'}</div>
                    <div style={{marginTop:4}}><b>Labels:</b> {(prPreview.preview?.labels || ['docs']).join(', ')}</div>
                    {Array.isArray(prPreview.preview?.appendPreviews) && prPreview.preview.appendPreviews.length > 0 && (
                      <div style={{marginTop:6}}>
                        <div><b>Append previews:</b></div>
                        <ul style={{marginTop:4}}>
                          {prPreview.preview.appendPreviews.map((a:any,i:number)=> (
                            <li key={i}><code>{a.path}</code> — {a.bytes} bytes<br/>
                              <details>
                                <summary>Unified diff</summary>
                                <pre style={{whiteSpace:'pre-wrap'}}>{a.diff || a.preview}</pre>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(prPreview.blocked) && prPreview.blocked.length > 0 && (
                      <div style={{marginTop:4, color:'#b45309'}}>Blocked: {prPreview.blocked.join(', ')}</div>
                    )}
                    <div style={{marginTop:4}}>
                      <button onClick={async()=>{
                        try {
                          setPrLoading(true); setPrError(null);
                          const files = (prPreview.preview?.files || []) as string[];
                          const edits = (prAppendText && files.length > 0) ? [{ path: files[0], appendText: prAppendText }] : [];
                          const labels = (prPreview.preview?.labels || ['docs']);
                          const r = await fetch('/api/auto_pr/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: prTitle, body: prBody, files, edits, labels }) });
                          const j = await r.json().catch(()=>({ok:false,error:'bad_json'}));
                          if (!r.ok || j.ok === false) setPrError(j?.error || `HTTP ${r.status}`);
                          else {
                            alert(`PR created: ${j.pr_url || '(no URL)'}`);
                          }
                        } catch (e:any) { setPrError(e?.message || String(e)); }
                        finally { setPrLoading(false); }
                      }} disabled={prLoading || !prPreview?.enabled || prPreview?.dryrun} title={!prPreview?.enabled ? 'AUTO_PR_ENABLED=1 required' : (prPreview?.dryrun ? 'AUTO_PR_DRYRUN=0 required' : '')}>Create PR</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
