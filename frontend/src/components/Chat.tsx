import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamViaServer, chatViaServer, type ChatMessageReq } from '../lib/chatClient';
import { tailContextLog, type CtxEvent } from '../lib/ctxClient';
import StatusBar from './StatusBar';
import DiagnosticsDrawer from './DiagnosticsDrawer';
import TasksDrawer from './TasksDrawer';
import { injectDeveloperNoteBeforeLastUser } from '../lib/convoUtils';

type Role = 'system' | 'user' | 'assistant' | 'tool';
interface Message {
  role: Role;
  content: string;
  reasoning?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

function extractContentFragment(content: any): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  if (Array.isArray(content)) {
    let out = '';
    for (const part of content) {
      if (!part) continue;
      if (typeof part === 'string') { out += part; continue; }
      if (typeof part.text === 'string') out += part.text;
      else if (typeof part.content === 'string') out += part.content;
      else if (typeof part.value === 'string') out += part.value;
    }
    return out;
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
    if (typeof content.value === 'string') return content.value;
  }
  return '';
}

function formatToolContent(raw: any): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  if (raw == null) return '';
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

function mapServerMessageToUi(msg: any): Message | null {
  if (!msg || typeof msg !== 'object') return null;
  const role = msg.role;
  if (role === 'tool') {
    const content = formatToolContent(msg.content);
    return {
      role: 'tool',
      content: content || '',
      name: typeof msg.name === 'string' ? msg.name : undefined,
      tool_call_id: typeof msg.tool_call_id === 'string' ? msg.tool_call_id : undefined,
    };
  }
  if (role === 'assistant') {
    const content = extractContentFragment(msg.content ?? null);
    const reasoning = typeof msg.reasoning === 'string'
      ? msg.reasoning
      : (typeof msg.reasoning_content === 'string' ? msg.reasoning_content : null);
    const tool_calls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : undefined;
    return { role: 'assistant', content: content || '', reasoning: reasoning ?? null, tool_calls };
  }
  if (role === 'system' || role === 'user') {
    const content = extractContentFragment(msg.content ?? null);
    return { role, content: content || '' };
  }
  return null;
}

function normalizeTranscript(serverMessages: any[] | null | undefined, final?: { content?: string | null; reasoning?: string | null }): Message[] {
  const normalized: Message[] = [];
  if (Array.isArray(serverMessages)) {
    for (const entry of serverMessages) {
      const mapped = mapServerMessageToUi(entry);
      if (mapped) normalized.push(mapped);
    }
  }
  if (final) {
    const hasPayload = Object.prototype.hasOwnProperty.call(final, 'content') || Object.prototype.hasOwnProperty.call(final, 'reasoning');
    if (hasPayload) {
      const existing = normalized.length > 0 ? normalized[normalized.length - 1] : null;
      const content = typeof final.content === 'string' ? final.content : (final.content ?? '');
      const reasoning = typeof final.reasoning === 'string' ? final.reasoning : (final.reasoning ?? null);
      if (existing && existing.role === 'assistant') {
        normalized[normalized.length - 1] = { ...existing, content: content ?? '', reasoning: reasoning ?? existing.reasoning ?? null };
      } else {
        normalized.push({ role: 'assistant', content: content ?? '', reasoning: reasoning ?? null });
      }
    }
  }
  return normalized;
}

function toChatRequestMessages(msgs: Message[]): ChatMessageReq[] {
  return msgs.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: msg.content ?? '',
        name: msg.name,
        tool_call_id: msg.tool_call_id,
      };
    }
    return {
      role: msg.role,
      content: msg.content ?? '',
      ...(msg.role === 'assistant' && Array.isArray((msg as any).tool_calls) ? { tool_calls: (msg as any).tool_calls } : {}),
    };
  });
}

function toolPreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '(no output)';
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
}

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful, action-oriented assistant. When users ask for information you don\'t have, use available tools to gather it. When users ask you to perform actions, use tools to execute them step-by-step.';

type ToolInstruction = { name: string; description?: string };

/**
 * Keep the system prompt in sync with the tool allowlist. Adjust this helper if the
 * tool instructions need to change – it is the single source of truth for the prompt.
 *
 * The tool metadata comes from `/api/tools` (and falls back to the allowlisted name list)
 * so that updating the server allowlist automatically updates the system message.
 */
function buildSystemPrompt(
  toolNames?: string[],
  toolsAvailable?: boolean,
  toolMetadata?: ToolInstruction[]
): string {
  const entries: ToolInstruction[] = Array.isArray(toolMetadata) && toolMetadata.length > 0
    ? toolMetadata.filter((tool) => typeof tool?.name === 'string')
    : (Array.isArray(toolNames) ? toolNames.filter(Boolean).map((name) => ({ name })) : []);
  if (!toolsAvailable || entries.length === 0) {
    return DEFAULT_SYSTEM_PROMPT;
  }
  const formatted = entries
    .map(({ name, description }) => {
      const trimmed = typeof description === 'string' ? description.trim() : '';
      return trimmed ? `- ${name}: ${trimmed}` : `- ${name}`;
    })
    .join('\n');
  const hasBash = entries.some(e => e.name === 'run_bash');
  const hasFileOps = entries.some(e => e.name === 'read_file' || e.name === 'read_dir');
  const extras: string[] = [];
  extras.push('\nIMPORTANT: You have access to tools. Use them proactively:');
  extras.push('- Before answering questions about files/directories, check current state with tools');
  extras.push('- When asked to perform actions, execute them step-by-step using tools');
  extras.push('- Call tools with proper JSON function syntax');
  if (hasBash) {
    extras.push('\nFor shell commands:');
    extras.push('- Call run_bash with a single script string, chaining commands with &&');
    extras.push('- After execution, summarize stdout/stderr and verify results');
  }
  if (hasFileOps) {
    extras.push('\nFor file operations:');
    extras.push('- Check before modifying: (1) read_dir to see structure, (2) read_file to review content');
    extras.push('- After changes, verify with tools rather than assuming success');
  }
  return [
    DEFAULT_SYSTEM_PROMPT,
    ...extras,
    '\nAvailable tools:',
    formatted,
    '\nThink step-by-step and use tools when they help accomplish the task.'
  ].join('\n');
}

export function Chat({ apiBase, model, fill, toolsAvailable, toolNames, toolMetadata, toolStorage, repoWrite }: {
  apiBase: string;
  model: string;
  fill?: boolean;
  toolsAvailable?: boolean;
  toolNames?: string[];
  toolMetadata?: ToolInstruction[];
  toolStorage?: { path: string; bindMounted: boolean };
  repoWrite?: { enabled: boolean; root: string; allowed: string[]; maxBytes: number } | undefined;
}) {
  // Conversation identity
  const [convId, setConvId] = useState<string>(() => {
    try { const saved = localStorage.getItem('fk_conv_id'); if (saved) return saved; } catch {}
    const gen = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
    return `c_${gen}`;
  });
  useEffect(() => { try { localStorage.setItem('fk_conv_id', convId); } catch {} }, [convId]);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'system', content: buildSystemPrompt(toolNames, toolsAvailable, toolMetadata) }
  ]);
  const systemPrompt = useMemo(
    () => buildSystemPrompt(toolNames, toolsAvailable, toolMetadata),
    [toolMetadata, toolNames, toolsAvailable]
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [fkFinal, setFkFinal] = useState('');
  const [showReasoning, setShowReasoning] = useState(true);
  const [pinReasoning, setPinReasoning] = useState<boolean>(() => { try { return localStorage.getItem('fk_pin_reasoning') === '1'; } catch { return false; } });
  const [toolDebug, setToolDebug] = useState<any>(null);
  const [showToolDiag, setShowToolDiag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  // Stop & Revise
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ctxEvents, setCtxEvents] = useState<CtxEvent[]>([]);
  const [pollingOn, setPollingOn] = useState(true);
  const lastEventTsRef = useRef<string>('');
  const [compaction, setCompaction] = useState<any>(null);
  const [contNotice, setContNotice] = useState(false);
  const [contDetails, setContDetails] = useState<Array<{attempt?: number; reason?: string}>>([]);
  const [hideInlineWhenPinned, setHideInlineWhenPinned] = useState<boolean>(() => { try { return localStorage.getItem('fk_hide_inline_reasoning_when_pinned') === '1'; } catch { return false; } });
  // System prompt (auto from tools vs user override)
  const [sysMode, setSysMode] = useState<'auto' | 'custom'>('auto');
  const [sysCustom, setSysCustom] = useState<string>('');
  // Runtime tool config (local dev only)
  const [psEnabled, setPsEnabled] = useState<boolean | null>(null);
  const [psCwd, setPsCwd] = useState<string>('');
  const [toolAllow, setToolAllow] = useState<string>('');
  const [bashEnabled, setBashEnabled] = useState<boolean | null>(null);
  const [bashCwd, setBashCwd] = useState<string>('');
  const [httpEnabled, setHttpEnabled] = useState<boolean | null>(null);
  const [httpInfo, setHttpInfo] = useState<{ maxBytes: number; timeoutMs: number } | null>(null);
  // Repo editor state
  const [repoPath, setRepoPath] = useState<string>('');
  const [repoContent, setRepoContent] = useState<string>('');
  const [repoStatus, setRepoStatus] = useState<string>('');
  // Hamburger + modals
  const [showMenu, setShowMenu] = useState(false);
  const [showSysModal, setShowSysModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  // Generation controls
  const [genMaxTokens, setGenMaxTokens] = useState<number>(512);
  const [genContTokens, setGenContTokens] = useState<number>(512);
  const [genContAttempts, setGenContAttempts] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('fk_gen_cont_attempts');
      if (raw == null) return 2;
      const n = Number(raw);
      return Math.max(0, Math.min(6, Number.isNaN(n) ? 2 : n));
    } catch { return 2; }
  });
  const [genTemp, setGenTemp] = useState<number>(0.0);
  const [genTopP, setGenTopP] = useState<number>(0.4);
  const [genAuto, setGenAuto] = useState<boolean>(false);
  // Send strategy: auto chooses stream vs block based on prompt
  type SendStrategy = 'auto' | 'stream' | 'block';
  const [sendStrategy, setSendStrategy] = useState<SendStrategy>('auto');

  const canSend = useMemo(() => input.trim().length > 0 && !streaming, [input, streaming]);
  const toolsLabel = useMemo(() => {
    if (!toolsAvailable) return '';
    const names = Array.isArray(toolMetadata) && toolMetadata.length
      ? toolMetadata.map((tool) => tool.name).filter(Boolean)
      : (Array.isArray(toolNames) ? toolNames : []);
    return names.length ? names.join(', ') : '';
  }, [toolsAvailable, toolMetadata, toolNames]);

  const refreshMetrics = useCallback(async () => {
    try {
      const r = await fetch('/metrics');
      if (r.ok) setMetrics(await r.json());
    } catch {}
  }, []);

  const runDiagnostics = useCallback(async () => {
    try {
      setDiagLoading(true);
      const r = await fetch('/api/diagnose');
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setDiag(j);
    } catch (e:any) {
      setDiag({ ok: false, errors: [e?.message || String(e)] });
    } finally {
      setDiagLoading(false);
    }
  }, []);

  // Load generation controls + system override from storage
  useEffect(() => {
    try {
      const mt = Number(localStorage.getItem('fk_gen_max_tokens') || '0');
      const ct = Number(localStorage.getItem('fk_gen_cont_tokens') || '0');
      const caRaw = localStorage.getItem('fk_gen_cont_attempts');
      const au = localStorage.getItem('fk_gen_auto') === '1';
      if (mt > 0) setGenMaxTokens(mt);
      if (ct > 0) setGenContTokens(ct);
      if (caRaw != null) {
        const ca = Number(caRaw);
        if (!Number.isNaN(ca) && ca >= 0) setGenContAttempts(Math.max(0, Math.min(6, ca)));
      }
      setGenAuto(au);
      const tp = Number(localStorage.getItem('fk_gen_temp') || 'NaN');
      const pp = Number(localStorage.getItem('fk_gen_top_p') || 'NaN');
      if (!Number.isNaN(tp)) setGenTemp(Math.max(0, Math.min(2, tp)));
      if (!Number.isNaN(pp)) setGenTopP(Math.max(0, Math.min(1, pp)));
      const mode = localStorage.getItem('fk_sys_prompt_mode') || 'auto';
      setSysMode(mode === 'custom' ? 'custom' : 'auto');
      const txt = localStorage.getItem('fk_sys_prompt_text') || '';
      if (txt) setSysCustom(txt);
    } catch {}
  }, []);

  // Fetch runtime tool config (dev-only; no auth)
  // Load saved system prompt override
  useEffect(() => {
    try {
      const mode = localStorage.getItem('fk_sys_prompt_mode') || 'auto';
      setSysMode(mode === 'custom' ? 'custom' : 'auto');
      const txt = localStorage.getItem('fk_sys_prompt_text') || '';
      if (txt) setSysCustom(txt);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/tools/config');
        if (r.ok) {
          const j = await r.json();
          setPsEnabled(!!j?.powershellEnabled);
          setPsCwd(typeof j?.cwd === 'string' ? j.cwd : '');
          setToolAllow(typeof j?.allow === 'string' ? j.allow : '');
          setBashEnabled(!!j?.bashEnabled);
          setBashCwd(typeof j?.bashCwd === 'string' ? j.bashCwd : '');
          if (typeof j?.httpFetchEnabled === 'boolean') setHttpEnabled(!!j.httpFetchEnabled);
          if (j?.httpFetch && typeof j.httpFetch === 'object') {
            const mb = Number((j.httpFetch as any).maxBytes || 0);
            const to = Number((j.httpFetch as any).timeoutMs || 0);
            setHttpInfo({ maxBytes: mb, timeoutMs: to });
          }
        }
      } catch {}
    })();
  }, []);

  const effectiveSystem = useMemo(() => {
    const c = sysMode === 'custom' ? (sysCustom || '') : '';
    return (sysMode === 'custom' && c.trim().length > 0) ? c : systemPrompt;
  }, [sysMode, sysCustom, systemPrompt]);

  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 0) {
        return [{ role: 'system', content: effectiveSystem }];
      }
      const [first, ...rest] = prev;
      if (first.role !== 'system') {
        return [{ role: 'system', content: effectiveSystem }, ...prev];
      }
      if (first.content === effectiveSystem) return prev;
      return [{ ...first, content: effectiveSystem }, ...rest];
    });
  }, [effectiveSystem]);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setContNotice(false);
    const userMessage: Message = { role: 'user', content: text };
    const baseHistory = [...messages, userMessage];
    const requestHistory = toChatRequestMessages(baseHistory);
    setToolDebug(null);
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '', reasoning: '' }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamViaServer({
        model,
        messages: requestHistory,
        signal: controller.signal,
        maxTokens: genMaxTokens,
        contTokens: genContTokens,
        contAttempts: genContAttempts,
        autoTokens: !!genAuto,
        temperature: genTemp,
        topP: genTopP,
        convId,
        onOrchestration: (payload) => {
          if (payload?.messages) {
            const conv = normalizeTranscript(payload.messages);
            setMessages(() => [...conv, { role: 'assistant', content: '', reasoning: '' }]);
          }
          if (payload?.debug) {
            setToolDebug(payload.debug);
            try { setCompaction(payload.debug?.compaction ?? null); } catch {}
            if (payload.debug?.continuedTotal > 0) {
              setContNotice(true);
              if (Array.isArray(payload.debug?.continuations)) setContDetails(payload.debug.continuations);
            }
            if (payload.debug?.continued && payload.debug?.reason) {
              setContNotice(true);
              setContDetails((prev) => [...prev, { attempt: payload.debug.attempt, reason: payload.debug.reason }]);
            }
            try {
              if ((payload as any)?.debug?.fkFinal && typeof (payload as any)?.debug?.content === 'string') {
                setFkFinal((payload as any).debug.content);
              }
            } catch {}
          } else if (payload?.diagnostics) {
            setToolDebug({ diagnostics: payload.diagnostics });
          }
        },
        onDelta: (delta) => {
          setMessages(prev => {
            const out = [...prev];
            const idx = out.length - 1;
            const curr = out[idx];
            if (!curr || curr.role !== 'assistant') return out;
            out[idx] = {
              ...curr,
              reasoning: (curr.reasoning || '') + (delta.reasoningDelta || ''),
              content: curr.content + (delta.contentDelta || '')
            };
            return out;
          });
        },
        onDone: async (final) => {
          setMessages(prev => {
            const out = [...prev];
            const idx = out.length - 1;
            const curr = out[idx];
            if (!curr || curr.role !== 'assistant') return out;
            out[idx] = {
              ...curr,
              reasoning: final.reasoning ?? curr.reasoning ?? '',
              content: final.content ?? curr.content
            };
            return out;
          });
          if (final.debug) {
            setToolDebug(final.debug);
            if (final.debug?.continuedTotal > 0) {
              setContNotice(true);
              if (Array.isArray(final.debug?.continuations)) setContDetails(final.debug.continuations);
            }
          } else if (final.diagnostics) {
            setToolDebug({ diagnostics: final.diagnostics });
          }
          if (final.continued) setContNotice(true);
          await refreshMetrics();
        },
        onError: (err) => {
          setMessages(prev => {
            const out = [...prev];
            const idx = out.length - 1;
            if (idx >= 0 && out[idx].role === 'assistant') {
              out[idx] = { role: 'assistant', content: `Error: ${err?.message || err}` };
              return out;
            }
            return [...out, { role: 'assistant', content: `Error: ${err?.message || err}` }];
          });
        }
      });
    } catch (e: any) {
      setMessages(prev => {
        const out = [...prev];
        const idx = out.length - 1;
        if (idx >= 0 && out[idx].role === 'assistant') {
          out[idx] = { role: 'assistant', content: `Error: ${e?.message || e}` };
          return out;
        }
        return [...out, { role: 'assistant', content: `Error: ${e?.message || e}` }];
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, model, refreshMetrics, genMaxTokens, genContTokens, genContAttempts, genAuto, genTemp, genTopP, convId]);

  const onStop = useCallback(() => {
    abortRef.current?.abort();
    try { setReviseOpen(true); } catch {}
  }, []);

  const chooseSendMode = useCallback((text: string, history: Message[]): SendStrategy => {
    try {
      const t = text.toLowerCase();
      const words = t.split(/\s+/).filter(Boolean).length;
      const longHints = /(novella|chapter|chapters|book|long\s+story|epic|act\s+\d|scene\s+\d|step[- ]by[- ]step|explain in detail|write code|implement|function|class|regex|script|docker|compose|diff|patch|unit test|typescript|react|sql)/i.test(t);
      const shortHints = /(summary|tl;dr|brief|concise|one sentence|quick answer|short answer|tiny)/i.test(t);
      if (longHints) return 'stream';
      if (shortHints && words < 60) return 'block';
      if (words < 35 && /\?$/.test(t)) return 'block';
      return 'stream';
    } catch { return 'stream'; }
  }, []);

  const onSendSmart = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    const mode = sendStrategy === 'auto' ? chooseSendMode(text, messages) : sendStrategy;
    if (mode === 'block') {
      // Run non-stream via server orchestrator
      setInput('');
      setContNotice(false);
      const userMessage: Message = { role: 'user', content: text };
      const baseHistory = [...messages, userMessage];
      const requestHistory = toChatRequestMessages(baseHistory);
      setToolDebug(null);
      setMessages(prev => [...prev, userMessage]);
      try {
        const res = await chatViaServer({ model, messages: requestHistory, maxTokens: genMaxTokens, autoTokens: !!genAuto, temperature: genTemp, topP: genTopP, convId });
        const conv = normalizeTranscript(res.messages ?? requestHistory, { content: res.content ?? '', reasoning: res.reasoning ?? null });
        setMessages(conv);
        if (res.debug) setToolDebug(res.debug);
        if (res.diagnostics) setToolDebug({ diagnostics: res.diagnostics });
        await refreshMetrics();
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || e}` }]);
      }
      return;
    }
    // Default to streaming
    await onSend();
  }, [input, messages, model, onSend, sendStrategy, chooseSendMode, genMaxTokens, genAuto, refreshMetrics, genTemp, genTopP, convId]);

  const onSendOnce = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setContNotice(false);
    const userMessage: Message = { role: 'user', content: text };
    const baseHistory = [...messages, userMessage];
    const requestHistory = toChatRequestMessages(baseHistory);
    setMessages(baseHistory);
    setToolDebug(null);
    setStreaming(true);
    try {
      const res = await chatViaServer({ model, messages: requestHistory, maxTokens: genMaxTokens, autoTokens: !!genAuto, temperature: genTemp, topP: genTopP, convId });
      try { setCompaction((res as any)?.debug?.compaction ?? null); } catch {}
      const conv = normalizeTranscript(res.messages ?? requestHistory, { content: res.content ?? '', reasoning: res.reasoning ?? null });
      setMessages(conv);
      const debug = res.debug ?? res.raw?.debug ?? null;
      setToolDebug(debug);
      if (debug?.continuedTotal > 0) setContNotice(true);
      await refreshMetrics();
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || e}` }]);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, model, refreshMetrics, genMaxTokens, genAuto, genTemp, genTopP, convId]);

  // Auto-scroll to bottom as messages update
  useEffect(() => {
    const sc = scrollRef.current;
    const end = endRef.current;
    if (!sc || !end) return;
    const nb = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    setNearBottom(nb);
    // Always autoscroll during streaming, or when user is near bottom
    if (streaming || nb) {
      end.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
    }
  }, [messages, streaming]);

  const onScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const nb = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    setNearBottom(nb);
  }, []);

  useEffect(() => {
    refreshMetrics();
  }, [refreshMetrics]);

  // Stop & Revise: inject developer note and relaunch
  const onReviseSubmit = useCallback(async () => {
    const note = (reviseText || '').trim();
    setReviseOpen(false);
    if (!note) return;
    const base = injectDeveloperNoteBeforeLastUser(messages as any, note) as any;
    const req = toChatRequestMessages(base);
    setToolDebug(null);
    setMessages(prev => [...prev, { role: 'assistant', content: '', reasoning: '' }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamViaServer({
        model,
        messages: req,
        signal: controller.signal,
        maxTokens: genMaxTokens,
        contTokens: genContTokens,
        contAttempts: genContAttempts,
        autoTokens: !!genAuto,
        temperature: genTemp,
        topP: genTopP,
        convId,
        onOrchestration: (payload) => {
          if (payload?.messages) {
            const conv = normalizeTranscript(payload.messages);
            setMessages(() => [...conv, { role: 'assistant', content: '', reasoning: '' }]);
          }
          if (payload?.debug) setToolDebug(payload.debug);
        },
        onDelta: (delta) => {
          setMessages(prev => {
            const out = [...prev];
            const idx = out.length - 1;
            const curr = out[idx];
            if (!curr || curr.role !== 'assistant') return out;
            out[idx] = { ...curr, reasoning: (curr.reasoning || '') + (delta.reasoningDelta || ''), content: curr.content + (delta.contentDelta || '') };
            return out;
          });
        },
        onDone: async (final) => {
          setMessages(prev => {
            const out = [...prev];
            const idx = out.length - 1;
            const curr = out[idx];
            if (!curr || curr.role !== 'assistant') return out;
            out[idx] = { ...curr, reasoning: final.reasoning ?? curr.reasoning ?? '', content: final.content ?? curr.content };
            return out;
          });
          if (final.debug) setToolDebug(final.debug);
          await refreshMetrics();
        },
        onError: (err) => {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err?.message || err}` }]);
        }
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setReviseText('');
    }
  }, [reviseText, messages, model, genMaxTokens, genContTokens, genContAttempts, genAuto, genTemp, genTopP, convId, refreshMetrics]);

  // Diagnostics drawer helpers
  const refreshCtx = useCallback(async () => {
    try {
      const rows = await tailContextLog(100, convId);
      setCtxEvents(rows);
      if (rows && rows[0]?.ts) lastEventTsRef.current = rows[0].ts;
    } catch {}
  }, [convId]);

  // Lightweight polling of ContextLog
  useEffect(() => {
    let alive = true;
    const active = () => pollingOn && !streaming && document.visibilityState === 'visible';
    const tick = async () => {
      if (!active()) return;
      const rows = await tailContextLog(20, convId);
      if (!alive || !rows.length) return;
      const latest = rows.find(r => r.act === 'message' && r.actor === 'assistant');
      if (latest && latest.ts && latest.ts !== lastEventTsRef.current) {
        lastEventTsRef.current = latest.ts;
        setCtxEvents(rows);
      }
    };
    const id = setInterval(tick, 5000);
    const vis = () => {};
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [convId, pollingOn, streaming]);

  return (
    <div style={{display:'flex', flexDirection:'column', flex: fill ? '1 1 auto' as const : undefined, minHeight: 0}}>
      <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:10}}>
        <StatusBar />
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:8}}>
          <button onClick={() => {
            setMessages([{ role: 'system', content: systemPrompt }]);
            const gen = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,10));
            setConvId(`c_${gen}`);
            setCtxEvents([]);
            lastEventTsRef.current = '';
          }}>New Conversation</button>
          <span style={{fontSize:12, color:'#64748b'}}>ID: <code>{convId.slice(0,12)}…</code></span>
          <a
            href={`/api/ctx/tail.json?n=1000&conv_id=${convId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: '#3b82f6',
              textDecoration: 'none',
              padding: '4px 8px',
              borderRadius: 4,
              background: '#eff6ff',
              border: '1px solid #bae6fd',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
          >
            📄 View Full Logs
          </a>
        </div>
      </div>

      <div style={{display:'flex', gap:12, alignItems:'stretch', minHeight:0, flex: '1 1 0', overflow: 'hidden'}}>
        <div
          ref={scrollRef}
          style={{
            border:'1px solid #eee',
            borderRadius:8,
            padding:12,
            marginBottom:12,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: '#fff',
            scrollBehavior: 'smooth',
            minHeight: 0,
            flex: '1 1 0'
          }}
          onScroll={onScroll}
        >
        {messages.map((m, i) => {
          // Filter out intermediate assistant messages with tool calls
          // Only show final assistant response (no tool_calls)
          if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            return null; // Skip intermediate assistant messages with tool calls
          }

          if (m.role === 'tool') {
            const preview = toolPreview(m.content || '');
            const prev = i > 0 ? messages[i-1] : null;
            const prevCalls = Array.isArray((prev as any)?.tool_calls) ? (prev as any).tool_calls : [];
            const paired = !!(m.tool_call_id && prevCalls.some((c:any)=> c?.id === m.tool_call_id));
            return (
              <div key={i} style={{ marginBottom: 12, border: paired ? '1px solid #d1fae5' : '1px solid #fee2e2', borderRadius: 8, padding: 6, background: paired ? '#f0fdf4' : '#fff7f7' }}>
                <details style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, padding: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
                    <span>TOOL • {m.name || '(unnamed)'}</span>
                    <span style={{ fontWeight: 400, color: '#4b5563' }}>{preview}</span>
                    <span style={{ fontWeight: 600, color: paired ? '#065f46' : '#b91c1c' }}>{paired ? 'paired' : 'orphan'}</span>
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', maxHeight: 260, overflowY: 'auto' }}>
                      {m.content || '(no output)'}
                    </pre>
                    {m.tool_call_id && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                        call id: <code>{m.tool_call_id}</code>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          }
          return (
            <div key={i} style={{marginBottom:12}}>
              <div style={{fontWeight:600, fontSize:12, color:'#666', marginBottom:4}}>{m.role.toUpperCase()}</div>
              <div style={{whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
                {m.content ? m.content : <span style={{color:'#aaa'}}>(no content)</span>}
              </div>
              {i === messages.length - 1 && m.role === 'assistant' && toolDebug?.toolsUsed && Array.isArray(toolDebug.toolsUsed) && toolDebug.toolsUsed.length > 0 && (
                <div style={{marginTop:6, display:'flex', gap:6, flexWrap:'wrap'}}>
                  <span style={{fontSize:11, color:'#0f766e', background:'#ccfbf1', border:'1px solid #99f6e4', padding:'2px 6px', borderRadius:999}}>Used tools: {toolDebug.toolsUsed.join(', ')}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
        </div>
        {showReasoning && (
          <div style={{flex:'0 0 35%', border:'1px solid #e2e8f0', borderRadius:8, padding:10, background:'#fafafa', display:'flex', flexDirection:'column', maxHeight: fill ? undefined : '55vh'}}>
            <div style={{fontWeight:600, fontSize:12, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>Reasoning</span>
              <span style={{display:'inline-block', width:8, height:8, borderRadius:9999, background: streaming ? '#16a34a' : '#94a3b8'}} title={streaming ? 'Streaming' : 'Idle'} />
            </div>
            <div style={{flex:'1 1 auto', overflowY:'auto', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:8}}>
              <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, fontSize:12, color:'#374151'}}>
                {(() => {
                  const last = messages.length ? messages[messages.length - 1] : null;
                  const r = last && last.role === 'assistant' ? (last.reasoning || '') : '';
                  if (r) return r;
                  if (streaming) return '(waiting for reasoning...)';
                  return '(No reasoning output from this model.\n\nReasoning requires:\n• A model with native reasoning support (e.g., o1-mini)\n• Or FRONTEND_USE_HARMONY=1 with a Harmony-compatible model\n\nTo disable this panel, uncheck "Show reasoning" above.)';
                })()}
              </pre>
            </div>
          </div>
        )}
      </div>
      {!nearBottom && (
        <div style={{display:'flex', justifyContent:'center', marginTop: -8, marginBottom: 8}}>
          <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Scroll to latest
          </button>
        </div>
      )}

      <div style={{flex: '0 0 auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, position:'relative'}}>
          <input
            placeholder="Ask something..."
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if (e.key === 'Enter' && !e.shiftKey && canSend) onSendSmart(); }}
            style={{flex:1, padding:'10px 12px'}}
          />
          <button disabled={!canSend} onClick={onSendSmart}>Send</button>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <label style={{fontSize:12, color:'#555'}}>Mode</label>
            <select value={sendStrategy} onChange={e=>setSendStrategy(e.target.value as SendStrategy)} style={{padding:'6px 8px', fontSize:12}}>
              <option value="auto">auto</option>
              <option value="stream">stream</option>
              <option value="block">block</option>
            </select>
          </div>

          <button disabled={!streaming} onClick={onStop}>Stop</button>
          <label style={{display:'flex', alignItems:'center', gap:6, marginLeft: 8}}>
            <input type="checkbox" checked={showReasoning} onChange={e=>setShowReasoning(e.target.checked)} />
            <span style={{fontSize:12}}>Show reasoning</span>
          </label>

          {/* Hamburger menu (top-right of controls row) */}
          <div style={{marginLeft:'auto'}}>
            <button aria-label="Menu" title="Menu" onClick={()=>setShowMenu(v=>!v)} style={{padding:'8px 10px'}}>☰</button>
            {showMenu && (
              <div style={{position:'absolute', right:8, top:'100%', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, boxShadow:'0 8px 20px rgba(0,0,0,0.08)', zIndex:50, minWidth:200}} onMouseLeave={()=>setShowMenu(false)}>
                <button onClick={()=>{ setShowSysModal(true); setShowMenu(false); }} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>Settings…</button>
                <button onClick={()=>{ setShowToolsModal(true); setShowMenu(false); }} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>Tools…</button>
                <button onClick={()=>{ setShowTasks(true); setShowMenu(false); }} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>Tasks…</button>
                <hr style={{margin:'4px 0', border:'none', borderTop:'1px solid #e5e7eb'}} />
                <button onClick={()=>{ setDrawerOpen(v=>!v); if (!drawerOpen) refreshCtx(); setShowMenu(false); }} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>
                  {drawerOpen ? '✓ ' : ''}Diagnostics Drawer
                </button>
                <button onClick={()=>{ setShowToolDiag(v=>!v); setShowMenu(false); }} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>
                  {showToolDiag ? '✓ ' : ''}Tool Diagnostics
                </button>
                <hr style={{margin:'4px 0', border:'none', borderTop:'1px solid #e5e7eb'}} />
                <button onClick={()=>{ if (streaming) onStop(); setReviseOpen(true); setShowMenu(false); }} disabled={reviseOpen} style={{display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer'}}>Stop & Revise…</button>
              </div>
            )}
          </div>
        </div>
        <small style={{color:'#666'}}>
          Using model "{model}" at base "{apiBase}" {toolsLabel ? `• Tools: ${toolsLabel}` : ''}
        </small>
        {contNotice && (
          <div style={{marginTop:8, padding:8, background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:8, color:'#8c6d1f', fontSize:12}}>
            <div style={{fontWeight:600}}>Auto-continued to complete the response.</div>
            {Array.isArray(contDetails) && contDetails.length > 0 && (
              <div style={{marginTop:4}}>
                Attempts: {contDetails.map(d => `${d.attempt ?? ''}${d.reason ? `:${d.reason}` : ''}`).join(', ')}
              </div>
            )}
          </div>
        )}
        {diag && (
          <div style={{marginTop:8, padding:10, background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:8}}>
            <div style={{fontWeight:600, color:'#3730a3', marginBottom:6}}>Diagnostics</div>
            <div style={{fontSize:12, color: diag.ok ? '#166534' : '#991b1b'}}>
              Status: {diag.ok ? 'OK' : 'Issues detected'}
              {Array.isArray(diag.errors) && diag.errors.length > 0 && (
                <div style={{marginTop:4}}>Errors: {diag.errors.join('; ')}</div>
              )}
            </div>
            <details style={{marginTop:8}} open>
              <summary style={{cursor:'pointer', fontSize:12, color:'#3730a3'}}>Environment</summary>
              <pre style={{whiteSpace:'pre-wrap', fontSize:12}}>{JSON.stringify(diag.env, null, 2)}</pre>
            </details>
            <details style={{marginTop:8}} open>
              <summary style={{cursor:'pointer', fontSize:12, color:'#3730a3'}}>Mounts</summary>
              <pre style={{whiteSpace:'pre-wrap', fontSize:12}}>{JSON.stringify(diag.mounts, null, 2)}</pre>
            </details>
            <details style={{marginTop:8}}>
              <summary style={{cursor:'pointer', fontSize:12, color:'#3730a3'}}>Upstream</summary>
              <pre style={{whiteSpace:'pre-wrap', fontSize:12}}>{JSON.stringify(diag.upstream, null, 2)}</pre>
            </details>
          </div>
        )}
        {compaction && (
          <div style={{marginTop:8, padding:8, background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:8, color:'#3730a3', fontSize:12}}>
            Context summarized ({String(compaction?.method || 'auto')}). Budget ~{String(compaction?.budget || '')} tokens.
          </div>
        )}
        {metrics && (
          <div style={{marginTop:8, padding:10, background:'#f6f8fa', border:'1px solid #e5e7eb', borderRadius:8}}>
            <div style={{fontWeight:600, color:'#555', marginBottom:6}}>Metrics</div>
            <div style={{fontSize:12, color:'#555'}}>
              totalRequests: <code>{String(metrics.totalRequests ?? 0)}</code>
              {' '}streamRequests: <code>{String(metrics.streamRequests ?? 0)}</code>
              {' '}totalToolCalls: <code>{String(metrics.totalToolCalls ?? 0)}</code>
              {' '}rateLimited: <code>{String(metrics.rateLimited ?? 0)}</code>
              {metrics.continuations && (
                <>
                  <br />continuations.total: <code>{String(metrics.continuations?.total ?? 0)}</code>
                  {' '}short: <code>{String(metrics.continuations?.short ?? 0)}</code>
                  {' '}punct: <code>{String(metrics.continuations?.punct ?? 0)}</code>
                  {' '}fence: <code>{String(metrics.continuations?.fence ?? 0)}</code>
                </>
              )}
              {Array.isArray(metrics.contHistory) && metrics.contHistory.length > 0 && (
                <div style={{marginTop:6}}>
                  <span style={{fontSize:12, color:'#555'}}>continuations (last 10m): </span>
                  {(() => {
                    const now = Date.now();
                    const bins = new Array(10).fill(0);
                    for (const e of metrics.contHistory) {
                      const dt = now - Number(e.t || 0);
                      const min = Math.floor(dt / 60000);
                      if (min >= 0 && min < 10) bins[9 - min] += 1; // rightmost is recent
                    }
                    const max = Math.max(1, ...bins);
                    return (
                      <span style={{display:'inline-flex', gap:2, marginLeft:6, verticalAlign:'middle'}}>
                        {bins.map((v,i)=> (
                          <span key={i} style={{display:'inline-block', width:6, height:Math.max(2, Math.round((v/max)*12)), background:'#64748b'}} title={`${v} at t-${9-i}m`} />
                        ))}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Overlays (modals) for settings */}
        {showSysModal && (
          <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100}} onClick={()=>setShowSysModal(false)}>
            <div style={{width:'min(800px, 92vw)', background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 12px 32px rgba(0,0,0,0.18)', padding:16}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <div style={{fontWeight:700, color:'#155e75'}}>Settings</div>
              <button onClick={()=>setShowSysModal(false)} aria-label="Close" title="Close">✕</button>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
              <label style={{display:'flex', alignItems:'center', gap:6}}>
                <input type="checkbox" checked={sysMode === 'custom'} onChange={e=>{
                  const on = e.target.checked;
                  setSysMode(on ? 'custom' : 'auto');
                  try { localStorage.setItem('fk_sys_prompt_mode', on ? 'custom' : 'auto'); } catch {}
                }} />
                <span style={{fontSize:12}}>Use custom prompt (overrides tool‑generated)</span>
              </label>
              <span style={{fontSize:12, color:'#475569'}}>
                {sysMode === 'custom' ? 'Using custom' : 'Using auto'}
              </span>
            </div>
            <textarea
              value={sysCustom}
              onChange={e=>setSysCustom(e.target.value)}
              placeholder={systemPrompt}
              rows={8}
              style={{width:'100%', fontFamily:'monospace', fontSize:12, padding:8, border:'1px solid #94a3b8', borderRadius:6}}
              disabled={sysMode !== 'custom'}
            />
            <div style={{marginTop:10, padding:10, background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8}}>
              <div style={{fontWeight:600, color:'#075985', marginBottom:6}}>UI Preferences</div>
              <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={pollingOn} onChange={e=>setPollingOn(e.target.checked)} />
                  <span style={{fontSize:12}}>Enable ContextLog polling</span>
                </label>
              </div>
            </div>
            <div style={{marginTop:10, padding:10, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8}}>
              <div style={{fontWeight:600, color:'#334155', marginBottom:6}}>Generation</div>
              <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={genAuto} onChange={e=>{ setGenAuto(e.target.checked); try { localStorage.setItem('fk_gen_auto', e.target.checked ? '1' : '0'); } catch {} }} />
                  <span style={{fontSize:12}}>Auto tokens (server chooses)</span>
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Max output tokens:</span>
                  <input type="number" min={64} max={8192} value={genMaxTokens}
                         onChange={e=>setGenMaxTokens(Math.max(64, Math.min(8192, Number(e.target.value)||0)))}
                         style={{width:100, padding:'4px 6px', fontSize:12}} disabled={genAuto} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Continue tokens:</span>
                  <input type="number" min={64} max={4096} value={genContTokens}
                         onChange={e=>setGenContTokens(Math.max(64, Math.min(4096, Number(e.target.value)||0)))}
                         style={{width:100, padding:'4px 6px', fontSize:12}} disabled={genAuto} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Continue attempts:</span>
                  <input type="number" min={0} max={6} value={genContAttempts}
                         onChange={e=>setGenContAttempts(Math.max(0, Math.min(6, Number(e.target.value)||0)))}
                         style={{width:100, padding:'4px 6px', fontSize:12}} disabled={genAuto} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Temperature:</span>
                  <input type="number" min={0} max={2} step={0.05} value={genTemp}
                         onChange={e=>setGenTemp(Math.max(0, Math.min(2, Number(e.target.value)||0)))}
                         style={{width:90, padding:'4px 6px', fontSize:12}} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Top‑p:</span>
                  <input type="number" min={0} max={1} step={0.05} value={genTopP}
                         onChange={e=>setGenTopP(Math.max(0, Math.min(1, Number(e.target.value)||0)))}
                         style={{width:90, padding:'4px 6px', fontSize:12}} />
                </label>
              </div>
            </div>
            <div style={{display:'flex', gap:8, marginTop:10, justifyContent:'flex-end'}}>
              <button onClick={()=>setShowSysModal(false)}>Close</button>
              <button onClick={() => {
                try { localStorage.setItem('fk_sys_prompt_text', sysCustom || ''); localStorage.setItem('fk_sys_prompt_mode', 'custom'); } catch {}
                setSysMode('custom');
                setMessages(prev => {
                  const [first, ...rest] = prev.length ? prev : [{ role:'system', content:'' } as any];
                  return [{ role:'system', content: (sysCustom || '').trim() || systemPrompt }, ...(prev.length ? rest : [])];
                });
                try {
                  localStorage.setItem('fk_gen_max_tokens', String(genMaxTokens));
                  localStorage.setItem('fk_gen_cont_tokens', String(genContTokens));
                  localStorage.setItem('fk_gen_cont_attempts', String(genContAttempts));
                  localStorage.setItem('fk_gen_auto', genAuto ? '1' : '0');
                  localStorage.setItem('fk_gen_temp', String(genTemp));
                  localStorage.setItem('fk_gen_top_p', String(genTopP));
                } catch {}
                setShowSysModal(false);
              }} disabled={sysMode !== 'custom'}>Apply</button>
              <button onClick={() => {
                setSysMode('auto'); setSysCustom('');
                try { localStorage.removeItem('fk_sys_prompt_text'); localStorage.setItem('fk_sys_prompt_mode','auto'); } catch {}
                try { localStorage.removeItem('fk_gen_max_tokens'); localStorage.removeItem('fk_gen_cont_tokens'); localStorage.removeItem('fk_gen_cont_attempts'); localStorage.removeItem('fk_gen_auto'); } catch {}
                setShowSysModal(false);
              }}>Reset to auto</button>
            </div>
          </div>
        </div>
        )}
        {showToolDiag && toolDebug && (
          <div style={{marginTop:8, padding:10, background:'#f6f8fa', border:'1px solid #e5e7eb', borderRadius:8}}>
            <div style={{fontWeight:600, color:'#555', marginBottom:6}}>Tools Diagnostics</div>
            <div style={{fontSize:12, color:'#555'}}>
              {(toolDebug.diagnostics || []).map((step:any, idx:number) => (
                <div key={idx} style={{marginBottom:6}}>
                  <div>iter {step.iter}, finish_reason: {String(step.finish_reason ?? '')}, tool_calls: {step.tool_calls_count ?? (step.tools?.length ?? 0)}</div>
                  {Array.isArray(step.tools) && step.tools.length > 0 && (
                    <ul style={{margin:'4px 0 0 16px', padding:0}}>
                      {step.tools.map((t:any,i:number)=> {
                        const argsStr = typeof t.args === 'string' ? t.args : JSON.stringify(t.args);
                        const preview = typeof t.preview === 'string' ? t.preview : '';
                        const timing = typeof t.ms === 'number' ? `${t.ms} ms` : '';
                        return (
                          <li key={i} style={{listStyle:'disc', marginBottom: 4}}>
                            <div><code>{t.name}</code> args: <code>{argsStr}</code>{timing ? ` — ${timing}` : ''}</div>
                            {preview && (
                              <div style={{ marginTop: 2, color:'#6b7280' }}>out: <code>{preview}</code></div>
                            )}
                            {t.error && (
                              <div style={{ marginTop: 2, color:'#b91c1c' }}>error: <code>{t.error}</code></div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {showToolsModal && (
          <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100}} onClick={()=>setShowToolsModal(false)}>
            <div style={{width:'min(800px, 92vw)', background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 12px 32px rgba(0,0,0,0.18)', padding:16}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                <div style={{fontWeight:700, color:'#3730a3'}}>Tools Settings (local dev)</div>
                <button onClick={()=>setShowToolsModal(false)} aria-label="Close" title="Close">✕</button>
              </div>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:8}}>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={!!psEnabled} onChange={e=>setPsEnabled(e.target.checked)} />
                  <span style={{fontSize:12}}>Enable PowerShell tool</span>
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={!!bashEnabled} onChange={e=>setBashEnabled(e.target.checked)} />
                  <span style={{fontSize:12}}>Enable Bash tool</span>
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={!!httpEnabled} onChange={e=>setHttpEnabled(e.target.checked)} />
                  <span style={{fontSize:12}}>Enable HTTP fetch tool</span>
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Working dir (cwd):</span>
                  <input value={psCwd} onChange={e=>setPsCwd(e.target.value)} placeholder="/work" style={{padding:'4px 6px', fontSize:12}} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Bash cwd:</span>
                  <input value={bashCwd} onChange={e=>setBashCwd(e.target.value)} placeholder="/work" style={{padding:'4px 6px', fontSize:12}} />
                </label>
                <label style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:12}}>Allowlist (empty = all):</span>
                  <input value={toolAllow} onChange={e=>setToolAllow(e.target.value)} placeholder="get_time,echo,read_dir" style={{padding:'4px 6px', fontSize:12, minWidth:260}} />
                </label>
              </div>
              {/* Capabilities summary */}
              <div style={{marginBottom:8, padding:10, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8}}>
                <div style={{fontWeight:600, color:'#334155', marginBottom:6}}>Capabilities</div>
                <div style={{fontSize:12, color:'#334155'}}>
                  <div>Tools dir: <code>{toolStorage?.path || '/app/tools'}</code> {toolStorage?.bindMounted ? '(mounted)' : '(internal)'}</div>
                  <div>Repo mount: <code>/workspace</code> (mounted)</div>
                  <div>Self-update routes: <code>POST /api/tools/write</code>, <code>/api/tools/reload</code> (dev)</div>
                  <div>Repo write tool: <code>write_repo_file</code> (enable with FRONTEND_ENABLE_REPO_WRITE=1)</div>
                  <div>HTTP fetch: {httpEnabled ? 'enabled' : 'disabled'}{httpInfo ? ` (max ${httpInfo.maxBytes} bytes, timeout ${httpInfo.timeoutMs} ms)` : ''}</div>
                </div>
              </div>
              {/* Inference settings */}
              <div style={{marginTop:8, marginBottom:8, padding:10, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8}}>
                <div style={{fontWeight:600, color:'#14532d', marginBottom:6}}>Inference</div>
                <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
                  <label style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:12}}>Temperature:</span>
                    <input type="number" min={0} max={2} step={0.05} value={genTemp}
                           onChange={e=>setGenTemp(Math.max(0, Math.min(2, Number(e.target.value)||0)))}
                           style={{width:90, padding:'4px 6px', fontSize:12}} />
                  </label>
                  <label style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:12}}>Top‑p:</span>
                    <input type="number" min={0} max={1} step={0.05} value={genTopP}
                           onChange={e=>setGenTopP(Math.max(0, Math.min(1, Number(e.target.value)||0)))}
                           style={{width:90, padding:'4px 6px', fontSize:12}} />
                  </label>
                  <div style={{fontSize:11, color:'#166534'}}>Lower = more deterministic and concise.</div>
                </div>
              </div>

              <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button onClick={()=>setShowToolsModal(false)}>Close</button>
                <button onClick={async ()=>{
                  try {
                    const r = await fetch('/api/tools/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ powershellEnabled: !!psEnabled, bashEnabled: !!bashEnabled, httpFetchEnabled: !!httpEnabled, cwd: psCwd || null, bashCwd: bashCwd || null, allow: toolAllow }) });
                    if (!r.ok) throw new Error(await r.text());
                    try { localStorage.setItem('fk_gen_temp', String(genTemp)); localStorage.setItem('fk_gen_top_p', String(genTopP)); } catch {}
                    await refreshMetrics();
                    setShowToolsModal(false);
                  } catch (e:any) {
                    alert(`Failed to update tool config: ${e?.message || e}`);
                  }
                }}>Save</button>
              </div>

              {/* Repo file editor (dev) */}
              <div style={{marginTop:12, padding:10, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8}}>
                <div style={{fontWeight:600, color:'#9a3412', marginBottom:6}}>Repo File Editor (dev)</div>
                {!repoWrite?.enabled && (
                  <div style={{fontSize:12, color:'#9a3412', marginBottom:8}}>FRONTEND_ENABLE_REPO_WRITE is disabled.</div>
                )}
                {repoWrite?.enabled && (
                  <>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                      <span style={{fontSize:12}}>Path:</span>
                      <select value={repoPath} onChange={e=>setRepoPath(e.target.value)} style={{padding:'4px 6px', fontSize:12}}>
                        <option value="">(select)</option>
                        {(repoWrite?.allowed || []).map((p) => (<option key={p} value={p}>{p}</option>))}
                      </select>
                      <button onClick={async()=>{
                        try {
                          if (!repoPath) return;
                          const r = await fetch(`/api/repo/read?path=${encodeURIComponent(repoPath)}`);
                          if (!r.ok) throw new Error(await r.text());
                          const j = await r.json();
                          setRepoContent(String(j?.content || ''));
                          setRepoStatus('Loaded.');
                        } catch (e:any) { setRepoStatus(`Load failed: ${e?.message || e}`); }
                      }}>Load</button>
                      <button onClick={async()=>{
                        try {
                          if (!repoPath) return;
                          const r = await fetch('/api/repo/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repoPath, content: repoContent }) });
                          if (!r.ok) throw new Error(await r.text());
                          setRepoStatus('Saved. Rebuild the frontend to apply runtime changes.');
                        } catch (e:any) { setRepoStatus(`Save failed: ${e?.message || e}`); }
                      }}>Save</button>
                      {repoStatus && <span style={{fontSize:12, color:'#9a3412'}}>{repoStatus}</span>}
                    </div>
                    <textarea value={repoContent} onChange={e=>setRepoContent(e.target.value)} rows={10} style={{width:'100%', fontFamily:'monospace', fontSize:12, padding:8, border:'1px solid #fed7aa', borderRadius:6}} placeholder="Select a file and click Load" />
                    <div style={{fontSize:11, color:'#9a3412', marginTop:6}}>Writes to repo root {repoWrite?.root || '/workspace'}; allowed: {(repoWrite?.allowed || []).join(', ')}; max bytes: {String(repoWrite?.maxBytes || 0)}</div>
                  </>
                )}
              </div>

              {/* Rebuild helper */}
              <div style={{marginTop:12, padding:10, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8}}>
                <div style={{fontWeight:600, color:'#334155', marginBottom:6}}>Rebuild Frontend (apply Dockerfile changes)</div>
                <div style={{fontSize:12, color:'#334155', marginBottom:6}}>Run this on your host:</div>
                <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'monospace', fontSize:12, background:'#fff', padding:8, border:'1px solid #e2e8f0', borderRadius:6}}>
docker compose -f forgekeeper/docker-compose.yml up -d --build frontend
                </pre>
                <button onClick={()=>{
                  const cmd = 'docker compose -f forgekeeper/docker-compose.yml up -d --build frontend';
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(cmd).catch(()=>{});
                  }
                }}>Copy command</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {drawerOpen && <DiagnosticsDrawer events={ctxEvents} onClose={()=>setDrawerOpen(false)} />}
      {showTasks && <TasksDrawer onClose={()=>setShowTasks(false)} />}
      {reviseOpen && (
        <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:110}} onClick={()=>setReviseOpen(false)}>
          <div style={{width:'min(720px, 92vw)', background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', boxShadow:'0 12px 32px rgba(0,0,0,0.18)', padding:16}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <div style={{fontWeight:700, color:'#334155'}}>Stop & Revise</div>
              <button onClick={()=>setReviseOpen(false)} aria-label="Close" title="Close">✕</button>
            </div>
            <div style={{fontSize:12, color:'#475569', marginBottom:8}}>Add a short developer note. It will be injected before the last user message to steer the next attempt.</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
              {[
                'Use run_bash to verify repo state; summarize outputs briefly.',
                'Prefer concise, actionable steps; avoid long prose.',
                'If a shell step fails, show the exact command and stderr.',
                'Verify file changes with read_dir/read_file before claiming success.'
              ].map((t,i)=> (
                <button key={i} onClick={()=>setReviseText(t)} style={{fontSize:12, padding:'4px 6px', border:'1px solid #cbd5e1', borderRadius:6, background:'#f8fafc', cursor:'pointer'}}>{t}</button>
              ))}
            </div>
            <textarea rows={6} value={reviseText} onChange={e=>setReviseText(e.target.value)} style={{width:'100%', fontFamily:'monospace', fontSize:12, padding:8, border:'1px solid #94a3b8', borderRadius:6}} placeholder="Example: Use run_bash to verify repo state; prefer concise CLI." />
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:10}}>
              <button onClick={()=>setReviseOpen(false)}>Cancel</button>
              <button onClick={onReviseSubmit} disabled={!reviseText.trim()}>Relaunch with note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
