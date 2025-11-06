import React, { useEffect, useMemo, useState } from 'react';
import { Chat } from './components/Chat';
import AutonomousPanel from './components/AutonomousPanel';
import { PreferencesPanel } from './components/PreferencesPanel';
import { checkHealth } from './lib/health';

type ToolMetadata = { name: string; description?: string };

function normalizeToolMetadata(defs: unknown): ToolMetadata[] {
  if (!Array.isArray(defs)) return [];
  return defs
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const fn = (raw as { function?: { name?: unknown; description?: unknown } }).function;
      const name = typeof fn?.name === 'string' ? fn.name : undefined;
      if (!name) return null;
      const description = typeof fn?.description === 'string' ? fn.description : undefined;
      // Coerce to the wider ToolMetadata type so the filter predicate can narrow correctly
      return { name, description } as ToolMetadata;
    })
    .filter((item): item is ToolMetadata => !!item);
}

export default function App() {
  const [apiBase, setApiBase] = useState<string>(import.meta.env.VITE_VLLM_API_BASE || '/v1');
  const [model, setModel] = useState<string>(import.meta.env.VITE_VLLM_MODEL || 'core');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showAutonomousPanel, setShowAutonomousPanel] = useState(false);
  const [toolsAvailable, setToolsAvailable] = useState<boolean>(false);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [toolMetadata, setToolMetadata] = useState<ToolMetadata[]>([]);
  const [toolStorage, setToolStorage] = useState<{ path: string; bindMounted: boolean } | null>(null);
  const [toolCaps, setToolCaps] = useState<{ selfUpdateEnabled?: boolean; repoWrite?: { enabled: boolean; root: string; allowed: string[]; maxBytes: number } } | null>(null);

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
            const names = Array.isArray(cfg.tools.names) ? cfg.tools.names : [];
            setToolNames(names);
          const meta = normalizeToolMetadata(cfg.tools.defs);
          if (meta.length) setToolMetadata(meta);
          if (cfg.tools.storage && typeof cfg.tools.storage.path === 'string') {
            setToolStorage({ path: cfg.tools.storage.path, bindMounted: !!cfg.tools.storage.bindMounted });
          }
          setToolCaps({ selfUpdateEnabled: !!cfg.tools.selfUpdateEnabled, repoWrite: cfg.tools.repoWrite });
          }
          if (cfg?.model && typeof cfg.model === 'string') setModel(cfg.model);
        }
      } catch (err) {
        console.warn('Failed to load /config.json runtime overrides.', err);
      }
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
          const names = Array.isArray(t.names) ? t.names : [];
          setToolNames(names);
          const meta = normalizeToolMetadata(t.defs);
          setToolMetadata(meta.length ? meta : names.map((name: string) => ({ name })));
        }
      } catch (err) {
        console.warn('Failed to fetch /api/tools metadata.', err);
      }
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
          <button onClick={()=>setShowAutonomousPanel(s=>!s)} title="Toggle Autonomous Panel">🤖 Autonomous</button>
          <button onClick={()=>setShowPreferences(true)} title="User Preferences">⚙️ Preferences</button>
          <button onClick={()=>setShowSettings(s=>!s)}>{showSettings? 'Close' : 'Settings'}</button>
        </div>
      </header>

      {/* Autonomous Panel [codex] - Collapsible */}
      {showAutonomousPanel && (
        <section id="autonomous-panel" style={{ marginBottom: 12 }}>
          <AutonomousPanel model={model} />
        </section>
      )}

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
        <Chat
          apiBase={apiBase}
          model={model}
          fill
          toolsAvailable={toolsAvailable}
          toolNames={toolNames}
          toolMetadata={toolMetadata}
          toolStorage={toolStorage || undefined}
          repoWrite={toolCaps?.repoWrite}
        />
      </div>

      {/* Preferences Panel Modal */}
      {showPreferences && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowPreferences(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1200px, 95vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 12,
              position: 'relative',
            }}
          >
            <button
              onClick={() => setShowPreferences(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                zIndex: 1,
                color: '#6b7280',
              }}
              title="Close"
            >
              ✕
            </button>
            <PreferencesPanel />
          </div>
        </div>
      )}
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

