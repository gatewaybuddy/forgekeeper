import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamViaServer, chatViaServer, type ChatMessageReq } from '../lib/chatClient';

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

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

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
  return [
    DEFAULT_SYSTEM_PROMPT,
    'You may call JSON function tools when they will help solve the task.',
    'Available tools:',
    formatted,
    'Call a tool only when necessary and otherwise respond normally.'
  ].join('\n');
}

export function Chat({ apiBase, model, fill, toolsAvailable, toolNames, toolMetadata }: {
  apiBase: string;
  model: string;
  fill?: boolean;
  toolsAvailable?: boolean;
  toolNames?: string[];
  toolMetadata?: ToolInstruction[];
}) {
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'system', content: buildSystemPrompt(toolNames, toolsAvailable, toolMetadata) }
  ]);
  const systemPrompt = useMemo(
    () => buildSystemPrompt(toolNames, toolsAvailable, toolMetadata),
    [toolMetadata, toolNames, toolsAvailable]
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [toolDebug, setToolDebug] = useState<any>(null);
  const [showToolDiag, setShowToolDiag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [contNotice, setContNotice] = useState(false);

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

  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 0) {
        return [{ role: 'system', content: systemPrompt }];
      }
      const [first, ...rest] = prev;
      if (first.role !== 'system') {
        return [{ role: 'system', content: systemPrompt }, ...prev];
      }
      if (first.content === systemPrompt) return prev;
      return [{ ...first, content: systemPrompt }, ...rest];
    });
  }, [systemPrompt]);

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
        onOrchestration: (payload) => {
          if (payload?.messages) {
            const conv = normalizeTranscript(payload.messages);
            setMessages(() => [...conv, { role: 'assistant', content: '', reasoning: '' }]);
          }
          if (payload?.debug) {
            setToolDebug(payload.debug);
            if (payload.debug?.continuedTotal > 0) setContNotice(true);
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
            if (final.debug?.continuedTotal > 0) setContNotice(true);
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
  }, [input, messages, model, refreshMetrics]);

  const onStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
      const res = await chatViaServer({ model, messages: requestHistory });
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
  }, [input, messages, model, refreshMetrics]);

  // tools orchestration is built into both send modes now

  // Auto-scroll to bottom as messages update, but only when user is near bottom
  useEffect(() => {
    const sc = scrollRef.current;
    const end = endRef.current;
    if (!sc || !end) return;
    // If user has scrolled far up, don't force-scroll unless streaming
    const nb = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    setNearBottom(nb);
    if (nb) {
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

  return (
    <div style={{display:'flex', flexDirection:'column', flex: fill ? '1 1 auto' as const : undefined, minHeight: 0}}>
      <div
        ref={scrollRef}
        style={{
          border:'1px solid #eee',
          borderRadius:8,
          padding:12,
          marginBottom:12,
          // Use flex sizing so this box takes the remaining space without forcing the page to scroll
          height: fill ? undefined : '55vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: '#fff',
          scrollBehavior: 'smooth',
          minHeight: 0,
          flex: fill ? '1 1 auto' : undefined
        }}
        onScroll={onScroll}
      >
        {messages.map((m, i) => {
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
              {m.role === 'assistant' && showReasoning && (
                <div style={{marginTop:6, padding:8, background:'#f8f9fa', border:'1px dashed #ddd', borderRadius:6}}>
                  <div style={{fontSize:12, color:'#666', marginBottom:4}}>[reasoning]</div>
                  <div style={{whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#555'}}>
                    {m.reasoning ? m.reasoning : <span style={{color:'#bbb'}}>(none)</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {!nearBottom && (
        <div style={{display:'flex', justifyContent:'center', marginTop: -8, marginBottom: 8}}>
          <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Scroll to latest
          </button>
        </div>
      )}

      <div style={{flex: '0 0 auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
          <input
            placeholder="Ask something..."
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if (e.key === 'Enter' && !e.shiftKey && canSend) onSend(); }}
            style={{flex:1, padding:'10px 12px'}}
          />
          <button disabled={!canSend} onClick={onSend}>Send (stream)</button>
          <button disabled={!canSend} onClick={onSendOnce}>Send (block)</button>
          
          <button disabled={!streaming} onClick={onStop}>Stop</button>
          <label style={{display:'flex', alignItems:'center', gap:6, marginLeft: 8}}>
            <input type="checkbox" checked={showReasoning} onChange={e=>setShowReasoning(e.target.checked)} />
            <span style={{fontSize:12}}>Show reasoning</span>
          </label>
          <label style={{display:'flex', alignItems:'center', gap:6, marginLeft: 8}}>
            <input type="checkbox" checked={showToolDiag} onChange={e=>setShowToolDiag(e.target.checked)} />
            <span style={{fontSize:12}}>Tools diagnostics</span>
          </label>
        </div>
        <small style={{color:'#666'}}>Using model "{model}" at base "{apiBase}" {toolsLabel ? `— Tools: ${toolsLabel}` : ''}</small>
        {contNotice && (
          <div style={{marginTop:8, padding:8, background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:8, color:'#8c6d1f', fontSize:12}}>
            Auto-continued to complete the response.
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
      </div>
    </div>
  );
}

