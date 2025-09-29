import React, { useEffect, useMemo, useState } from 'react';
import { Chat } from './components/Chat';
import { checkHealth } from './lib/health';

export default function App() {
  const [apiBase, setApiBase] = useState<string>(import.meta.env.VITE_VLLM_API_BASE || '/v1');
  const [model, setModel] = useState<string>(import.meta.env.VITE_VLLM_MODEL || 'core');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toolsAvailable, setToolsAvailable] = useState<boolean>(false);
  const [toolNames, setToolNames] = useState<string[]>([]);

  const healthUrls = useMemo(() => ({
    healthz: apiBase.replace(/\/v1\/?$/, '') + '/healthz',
    health: apiBase.replace(/\/v1\/?$/, '') + '/health'
  }), [apiBase]);

  useEffect(() => {
    // Try to load runtime config when hosted in the Node container
    (async () => {
      try {
        const resp = await fetch('/config.json');
        if (resp.ok) {
          const cfg = await resp.json();
          if (cfg?.apiBase && typeof cfg.apiBase === 'string') setApiBase(cfg.apiBase);
          if (cfg?.model && typeof cfg.model === 'string') setModel(cfg.model);
          if (cfg?.tools) {
            setToolsAvailable(!!cfg.tools.enabled);
            setToolNames(Array.isArray(cfg.tools.names) ? cfg.tools.names : []);
          }
          if (cfg?.model && typeof cfg.model === 'string') setModel(cfg.model);
        }
      } catch {}
    })();
    let mounted = true;
    setChecking(true);
    (async () => {
      const ok = await checkHealth(healthUrls.healthz, healthUrls.health, 800, 8);
      if (!mounted) return;
      setHealthy(ok);
      setChecking(false);
    })();
    (async () => {
      try {
        const r = await fetch('/api/tools');
        if (r.ok) {
          const t = await r.json();
          setToolsAvailable(!!t.enabled);
          setToolNames(Array.isArray(t.names) ? t.names : []);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [healthUrls]);

  return (
    <div style={{
      fontFamily:'system-ui,Segoe UI,Roboto,Helvetica,Arial',
      maxWidth: 960,
      margin: '0 auto',
      padding: 16,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <header style={{display:'flex', alignItems:'center', gap:12, marginBottom: 12, flex: '0 0 auto'}}>
        <h1 style={{margin: 0, fontSize: 20}}>Forgekeeper Chat</h1>
        <StatusDot healthy={healthy} checking={checking} />
        <div style={{marginLeft:'auto', display:'flex', gap:8}}>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{fontSize:12, color:'#555'}}>Model</span>
            <input value={model} onChange={e=>setModel(e.target.value)} style={{padding:'4px 6px'}} />
          </label>
          <button onClick={()=>setShowSettings(s=>!s)}>{showSettings? 'Close' : 'Settings'}</button>
        </div>
      </header>

      {showSettings && (
        <section style={{
          border:'1px solid #ddd',
          borderRadius:8,
          padding:12,
          marginBottom:12,
          flex: '0 0 auto',
          maxHeight: '25vh',
          overflowY: 'auto'
        }}>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <label style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12, color:'#555'}}>API Base</span>
              <input value={apiBase} onChange={e=>setApiBase(e.target.value)} style={{padding:'4px 6px', minWidth:320}} />
            </label>
            <small style={{color:'#666'}}>Defaults to proxy: /v1 (Vite dev server → vLLM)</small>
          </div>
        </section>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <Chat apiBase={apiBase} model={model} fill toolsAvailable={toolsAvailable} toolNames={toolNames} />
      </div>
    </div>
  );
}

function StatusDot({ healthy, checking }: { healthy: boolean | null, checking: boolean }) {
  const color = checking ? '#f0ad4e' : healthy ? '#28a745' : '#dc3545';
  const label = checking ? 'checking' : healthy ? 'healthy' : 'unhealthy';
  return (
    <div title={`vLLM status: ${label}`} style={{display:'inline-flex', alignItems:'center', gap:6}}>
      <span style={{width:10, height:10, borderRadius:10, background: color, display:'inline-block'}} />
      <span style={{fontSize:12, color:'#555'}}>{label}</span>
    </div>
  );
}

