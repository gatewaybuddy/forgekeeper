import React, { useEffect, useState } from 'react';
import BatchActionBar from './BatchActionBar';
import AnalyticsDashboard from './AnalyticsDashboard';
import TemplateSelector from './TemplateSelector';
import PriorityBadge from './PriorityBadge';
import PRPreviewModal from './PRPreviewModal';
import './Drawer.css';

type TaskItem = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | string;
  evidence?: unknown;
  suggested?: string[];
  acceptance?: string[];
  priority?: number;
  status?: 'pending' | 'approved' | 'dismissed' | 'completed';
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

  // New state for enhanced features
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [prModalData, setPRModalData] = useState<any>(null);

  const load = async (windowMin: number) => {
    try {
      setLoading(true);
      const r = await fetch(`/api/tasks/suggest?window_min=${windowMin}`);
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setItems(Array.isArray(j?.items) ? j.items : []);
      setError(null);
    } catch (e: unknown) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(win); }, [win, load]);

  const toggleSelect = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTasks.length === items.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(items.map(it => it.id));
    }
  };

  const copy = async () => {
    try {
      const md = items.map(it => [
        `- [${it.severity?.toUpperCase?.() || 'MED'}] ${it.title} (${it.id})`,
        it.suggested?.length ? `  - Suggested: ${it.suggested.join('; ')}` : '',
      ].filter(Boolean).join('\n')).join('\n');
      await navigator.clipboard.writeText(md);
      alert('Copied tasks to clipboard.');
    } catch {
      // TODO: Add error handling
    }
  };

  const previewPR = async () => {
    try {
      setPrLoading(true);
      setPrError(null);
      setPrPreview(null);
      setPRModalData(null);
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
        setPRModalData(j);
        setShowPRModal(true); // Open enhanced modal
      }
    } catch (e:any) {
      setPrError(e?.message || String(e));
    } finally {
      setPrLoading(false);
    }
  };

  const createPR = async () => {
    try {
      setPrLoading(true);
      setPrError(null);
      const files = prFiles.split(',').map(s=>s.trim()).filter(Boolean);
      const edits = (prAppendText && files.length > 0) ? [{ path: files[0], appendText: prAppendText }] : [];
      const labels = ['docs', 'auto-pr'];
      const m = prTitle.match(/\b(T\d{2,6})\b/i);
      if (m) labels.push(`task:${m[1].toUpperCase()}`);
      const r = await fetch('/api/auto_pr/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: prTitle, body: prBody, files, edits, labels }) });
      const j = await r.json().catch(()=>({ok:false,error:'bad_json'}));
      if (!r.ok || j.ok === false) {
        setPrError(j?.error || `HTTP ${r.status}`);
        alert(`Error creating PR: ${j?.error || 'Unknown error'}`);
      } else {
        alert(`PR created successfully!\n\n${j.prUrl || 'No URL returned'}`);
        setShowPRModal(false);
        setPRModalData(null);
      }
    } catch (e:any) {
      setPrError(e?.message || String(e));
      alert(`Error: ${e?.message || String(e)}`);
    } finally {
      setPrLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="drawer-overlay" onClick={onClose}>
      <div className="drawer-container" style={{width:'min(900px, 94vw)', maxHeight:'80vh'}} onClick={e=>e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="drawer-title">Suggested Tasks (last {win}m)</h2>
          <div style={{display:'flex', alignItems:'center', gap:'var(--gap-sm)'}}>
            <button onClick={() => setShowAnalytics(true)} title="View Analytics" className="button secondary">
              📊 Analytics
            </button>
            <button onClick={() => setShowTemplates(true)} title="New from Template" className="button secondary">
              📋 Templates
            </button>
            <input type="number" min={5} max={480} value={win} onChange={e=> setWin(Math.max(5, Math.min(480, Number(e.target.value)||60)))} style={{width:80}} />
            <button onClick={()=>load(win)} disabled={loading} className="button secondary">Refresh</button>
            <button onClick={copy} disabled={!items.length} className="button secondary">Copy</button>
            <button onClick={onClose} aria-label="Close" title="Close" className="drawer-close-button">✕</button>
          </div>
        </div>
        <div className="drawer-body">
        {loading && <div style={{color:'var(--text-secondary)'}}>Loading…</div>}
        {error && <div style={{color:'var(--accent-red)'}}>Error: {error}</div>}
        {!loading && !error && (
          <>
            {items.length > 0 && (
              <div style={{marginBottom:'var(--gap-md)', padding:'var(--padding-md)', background:'var(--bg-tertiary)', borderRadius:'var(--radius-md)'}}>
                <label style={{display:'flex', alignItems:'center', gap:'var(--gap-sm)', cursor:'pointer'}}>
                  <input
                    type="checkbox"
                    checked={selectedTasks.length === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span style={{fontSize:'var(--font-md)', fontWeight:600, color:'var(--text-primary)'}}>
                    Select All ({selectedTasks.length}/{items.length})
                  </span>
                </label>
              </div>
            )}
            <ul style={{listStyle:'none', padding:0, margin:0}}>
              {items.map((it, idx) => (
                <li key={idx} className="task-card">
                  <div style={{display:'flex', alignItems:'center', gap:'var(--gap-md)'}}>
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(it.id)}
                      onChange={() => toggleSelect(it.id)}
                      style={{cursor:'pointer'}}
                    />
                    <div style={{flex:1}}>
                      <div className="task-header">
                        <div className="task-description">{it.title}</div>
                        <div style={{display:'flex', alignItems:'center', gap:'var(--gap-sm)'}}>
                          {it.priority !== undefined && <PriorityBadge score={it.priority} size="small" />}
                          <div className="task-id">{it.id}</div>
                        </div>
                      </div>
                      {Array.isArray(it.suggested) && it.suggested.length > 0 && (
                        <div className="task-metadata">
                          <span>Suggested: {it.suggested.join('; ')}</span>
                        </div>
                      )}
                      <div style={{marginTop:'var(--gap-sm)', display:'flex', gap:'var(--gap-sm)'}}>
                        <button onClick={()=>{
                          const body = `Task: ${it.id} — ${it.title}\n\nSeverity: ${it.severity}\n\nSuggested: ${Array.isArray(it.suggested)? it.suggested.join('; ') : ''}`;
                          setPrTitle(`docs: ${it.title} (${it.id})`);
                          setPrBody(body);
                          setPrFiles('README.md');
                          if ((it as unknown).append?.text) setPrAppendText((it as unknown).append.text);
                          setShowPr(true);
                        }} className="button primary">📝 Propose PR</button>
                        { (it as unknown).append?.text && (
                          <button onClick={()=> setPrAppendText((it as unknown).append.text) } className="button secondary">Use README snippet</button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {items.length === 0 && (
                <li className="drawer-empty-message">No suggestions for the selected window.</li>
              )}
            </ul>
          </>
        )}
        <div style={{marginTop:'var(--gap-md)', padding:'var(--padding-md)', background:'var(--bg-tertiary)', border:'1px solid var(--border-primary)', borderRadius:'var(--radius-md)'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:700, color:'var(--text-bright)'}}>Propose PR (allowlist & dry‑run)</div>
            <button onClick={()=>setShowPr(v=>!v)} className="button secondary">{showPr ? 'Hide' : 'Show'}</button>
          </div>
          {showPr && (
            <div style={{marginTop:'var(--gap-md)'}}>
              <div style={{display:'flex', flexDirection:'column', gap:'var(--gap-sm)'}}>
                <div style={{display:'flex', gap:'var(--gap-sm)', alignItems:'center'}}>
                  <input placeholder="PR title" value={prTitle} onChange={e=>setPrTitle(e.target.value)} style={{flex:'1 1 auto'}} />
                  <button onClick={()=>{ if (!prTitle.startsWith('[docs]')) setPrTitle(`[docs] ${prTitle}`); }} className="button secondary">Mark as [docs]</button>
                </div>
                <textarea placeholder="PR body" rows={4} value={prBody} onChange={e=>setPrBody(e.target.value)} />
                <input placeholder="Files (comma‑separated)" value={prFiles} onChange={e=>setPrFiles(e.target.value)} />
                <textarea placeholder="Append text (optional; appended to first allowed file)" rows={3} value={prAppendText} onChange={e=>setPrAppendText(e.target.value)} />
                <div style={{display:'flex', gap:'var(--gap-sm)'}}>
                  <button onClick={previewPR} disabled={prLoading} className="button primary">Preview</button>
                </div>
                {prError && <div style={{color:'var(--accent-red)'}}>Error: {prError}</div>}
                {prPreview && (
                  <div style={{fontSize:'var(--font-sm)', background:'var(--bg-primary)', border:'1px solid var(--border-primary)', borderRadius:'var(--radius-md)', padding:'var(--padding-md)'}}>
                    <div style={{color:'var(--text-primary)'}}><b>Allowed files:</b> {(prPreview.preview?.files || []).join(', ') || '(none)'}</div>
                    <div style={{marginTop:'var(--gap-xs)', color:'var(--text-primary)'}}><b>Labels:</b> {(prPreview.preview?.labels || ['docs']).join(', ')}</div>
                    {Array.isArray(prPreview.preview?.appendPreviews) && prPreview.preview.appendPreviews.length > 0 && (
                      <div style={{marginTop:'var(--gap-sm)'}}>
                        <div style={{color:'var(--text-primary)'}}><b>Append previews:</b></div>
                        <ul style={{marginTop:'var(--gap-xs)'}}>
                          {prPreview.preview.appendPreviews.map((a:any,i:number)=> (
                            <li key={i} style={{color:'var(--text-secondary)'}}><code>{a.path}</code> — {a.bytes} bytes<br/>
                              <details>
                                <summary>Unified diff</summary>
                                <pre style={{whiteSpace:'pre-wrap', background:'var(--bg-tertiary)', padding:'var(--padding-sm)', borderRadius:'var(--radius-sm)'}}>{a.diff || a.preview}</pre>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(prPreview.blocked) && prPreview.blocked.length > 0 && (
                      <div style={{marginTop:'var(--gap-xs)', color:'var(--accent-yellow)'}}>Blocked: {prPreview.blocked.join(', ')}</div>
                    )}
                    <div style={{marginTop:'var(--gap-xs)'}}>
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
                      }} disabled={prLoading || !prPreview?.enabled || prPreview?.dryrun} title={!prPreview?.enabled ? 'AUTO_PR_ENABLED=1 required' : (prPreview?.dryrun ? 'AUTO_PR_DRYRUN=0 required' : '')} className="button primary">Create PR</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedTasks.length}
        onApproveSelected={async () => {
          try {
            const response = await fetch('/api/tasks/batch/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskIds: selectedTasks })
            });
            if (!response.ok) throw new Error('Batch approval failed');
            setSelectedTasks([]);
            load(win);
          } catch (e: unknown) {
            alert(`Error: ${e.message}`);
          }
        }}
        onDismissSelected={async () => {
          try {
            const response = await fetch('/api/tasks/batch/dismiss', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskIds: selectedTasks,
                reason: 'Batch dismissed'
              })
            });
            if (!response.ok) throw new Error('Batch dismissal failed');
            setSelectedTasks([]);
            load(win);
          } catch (e: unknown) {
            alert(`Error: ${e.message}`);
          }
        }}
        onClearSelection={() => setSelectedTasks([])}
      />

      {/* Analytics Dashboard Modal */}
      {showAnalytics && (
        <AnalyticsDashboard
          isOpen={showAnalytics}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {/* Template Selector Modal */}
      {showTemplates && (
        <TemplateSelector
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          onTaskCreated={() => {
            setShowTemplates(false);
            load(win);
          }}
        />
      )}

      {/* PR Preview Modal (Enhanced) */}
      <PRPreviewModal
        isOpen={showPRModal}
        onClose={() => {
          setShowPRModal(false);
          setPRModalData(null);
        }}
        preview={prModalData}
        onCreatePR={createPR}
        loading={prLoading}
        error={prError}
        canCreate={prModalData?.preview?.files?.allowed > 0}
        disabledReason={
          !prModalData?.preview?.enabled
            ? 'SAPL is disabled (set AUTO_PR_ENABLED=1)'
            : prModalData?.preview?.dryRun
            ? 'Dry-run mode (set AUTO_PR_DRYRUN=0 to create PRs)'
            : prModalData?.preview?.files?.allowed === 0
            ? 'No allowed files to commit'
            : ''
        }
      />
    </div>
  );
}
