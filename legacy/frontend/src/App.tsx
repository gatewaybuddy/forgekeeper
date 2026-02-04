import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { CleanChatWrapper } from './components/CleanChatWrapper';
import { PreferencesPanel } from './components/PreferencesPanel';
import { ThoughtWorldChat } from './components/ThoughtWorldChat';
import { ConversationSpace } from './components/ConversationSpace/ConversationSpace';
import { MainLayout } from './components/Layout';
import { ThoughtWorldSidebar } from './components/ThoughtWorld';
import { checkHealth } from './lib/health';
import './styles/design-system.css';
import './styles/layout.css';

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
  // Always use relative URLs for browser requests - Docker hostnames don't work from browser
  // The /config.json endpoint will provide the correct server-side config
  const [apiBase, setApiBase] = useState<string>('/v1');
  const [model, setModel] = useState<string>('core');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
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
    <BrowserRouter>
      <AppContent
        apiBase={apiBase}
        setApiBase={setApiBase}
        model={model}
        setModel={setModel}
        healthy={healthy}
        checking={checking}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showPreferences={showPreferences}
        setShowPreferences={setShowPreferences}
        toolsAvailable={toolsAvailable}
        toolNames={toolNames}
        toolMetadata={toolMetadata}
        toolStorage={toolStorage}
        toolCaps={toolCaps}
      />
    </BrowserRouter>
  );
}

function AppContent({
  apiBase,
  setApiBase,
  model,
  setModel,
  healthy,
  checking,
  showSettings,
  setShowSettings,
  showPreferences,
  setShowPreferences,
  toolsAvailable,
  toolNames,
  toolMetadata,
  toolStorage,
  toolCaps
}: {
  apiBase: string;
  setApiBase: (base: string) => void;
  model: string;
  setModel: (model: string) => void;
  healthy: boolean | null;
  checking: boolean;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showPreferences: boolean;
  setShowPreferences: (show: boolean) => void;
  toolsAvailable: boolean;
  toolNames: string[];
  toolMetadata: ToolMetadata[];
  toolStorage: unknown;
  toolCaps: unknown;
}) {
  const location = useLocation();
  const [showThoughtWorldSidebar, setShowThoughtWorldSidebar] = useState(false);
  const [thoughtWorldSessionId, setThoughtWorldSessionId] = useState<string | null>(null);

  const isThoughtWorld = location.pathname === '/thought-world';
  const isMainChat = location.pathname === '/';
  const isConversationSpace = location.pathname === '/conversation';

  // For thought-world page, always show sidebar with full layout
  // For main chat, sidebar is optional and toggleable
  const shouldShowSidebar = isThoughtWorld || showThoughtWorldSidebar;

  // Clean chat has its own layout, so don't wrap it in MainLayout
  if (isMainChat) {
    return (
      <>
        <Routes>
          <Route path="/" element={
            <CleanChatWrapper
              apiBase={apiBase}
              model={model}
            />
          } />
        </Routes>

        {/* Preferences Panel Modal */}
        {showPreferences && (
          <div className="modal-backdrop" onClick={() => setShowPreferences(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowPreferences(false)}
                className="modal-close"
                title="Close"
              >
                ✕
              </button>
              <PreferencesPanel />
            </div>
          </div>
        )}
      </>
    );
  }

  // Conversation Space has its own layout
  if (isConversationSpace) {
    return (
      <Routes>
        <Route path="/conversation" element={<ConversationSpace />} />
      </Routes>
    );
  }

  return (
    <MainLayout
      showThoughtWorldSidebar={shouldShowSidebar}
      onToggleSidebar={isThoughtWorld ? undefined : () => setShowThoughtWorldSidebar(!showThoughtWorldSidebar)}
      thoughtWorldSidebar={
        <ThoughtWorldSidebar sessionId={thoughtWorldSessionId} />
      }
    >
      <Routes>
        <Route path="/thought-world" element={<ThoughtWorldChat />} />
      </Routes>

      {/* Preferences Panel Modal */}
      {showPreferences && (
        <div className="modal-backdrop" onClick={() => setShowPreferences(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPreferences(false)}
              className="modal-close"
              title="Close"
            >
              ✕
            </button>
            <PreferencesPanel />
          </div>
        </div>
      )}
    </MainLayout>
  );
}

