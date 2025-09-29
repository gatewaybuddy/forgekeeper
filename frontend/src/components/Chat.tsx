import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatOnce, streamChat, chatViaServer } from '../lib/chatClient';

type Role = 'system' | 'user' | 'assistant';
interface Message {
  role: Role;
  content: string;
  reasoning?: string | null;
}

export function Chat({ apiBase, model, fill, toolsAvailable, toolNames }: { apiBase: string; model: string; fill?: boolean; toolsAvailable?: boolean; toolNames?: string[] }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [toolDebug, setToolDebug] = useState<any>(null);
  const [showToolDiag, setShowToolDiag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [nearBottom, setNearBottom] = useState(true);

  const canSend = useMemo(() => input.trim().length > 0 && !streaming, [input, streaming]);
  const toolsLabel = useMemo(() => {
    if (!toolsAvailable) return 'unavailable';
    const names = Array.isArray(toolNames) ? toolNames : [];
    return 'available' + (names.length ? ' (' + names.join(', ') + ')' : '');
  }, [toolsAvailable, toolNames]);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const msgs = [...messages, { role: 'user' as const, content: text }];
    setMessages(msgs);

    // Seed an assistant placeholder for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '', reasoning: '' }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({
        apiBase,
        model,
        messages: msgs.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
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
        onDone: (final) => {
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
        },
        onError: (err) => {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err?.message || err}` }]);
        }
      });
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || e}` }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [apiBase, input, messages, model]);

  const onStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onSendOnce = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const msgs = [...messages, { role: 'user' as const, content: text }];
    setMessages(msgs);
    setStreaming(true);
    try {
      const res = await chatOnce({ apiBase, model, messages: msgs.map(({ role, content }) => ({ role, content })) });
      setMessages(prev => [...prev, { role: 'assistant', content: res.content || '', reasoning: res.reasoning || '' }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || e}` }]);
    } finally {
      setStreaming(false);
    }
  }, [apiBase, input, messages, model]);

  // Non-streaming send via server-side tool orchestrator (/api/chat)
  const onSendTools = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const msgs = [...messages, { role: 'user' as const, content: text }];
    setMessages(msgs);
    setStreaming(true);
    try {
      const res = await chatViaServer({ model, messages: msgs.map(({ role, content }) => ({ role, content })) });
      setMessages(prev => [...prev, { role: 'assistant', content: res.content || '', reasoning: res.reasoning || '' }]);
      setToolDebug(res.raw?.debug || null);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || e}` }]);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, model]);

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
        {messages.map((m, i) => (
          <div key={i} style={{marginBottom:12}}>
            <div style={{fontWeight:600, fontSize:12, color:'#666', marginBottom:4}}>{m.role.toUpperCase()}</div>
            <div style={{whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
              {m.content || <span style={{color:'#aaa'}}>(no content)</span>}
            </div>
            {m.role === 'assistant' && showReasoning && (
              <div style={{marginTop:6, padding:8, background:'#f8f9fa', border:'1px dashed #ddd', borderRadius:6}}>
                <div style={{fontSize:12, color:'#666', marginBottom:4}}>[reasoning]</div>
                <div style={{whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#555'}}>
                  {m.reasoning || <span style={{color:'#bbb'}}>(none)</span>}
                </div>
              </div>
            )}
          </div>
        ))}
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
          <button disabled={!canSend || !toolsAvailable} title={!toolsAvailable ? 'Tools unavailable' : ''} onClick={onSendTools}>Send (tools)</button>
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
        <small style={{color:'#666'}}>Using model "{model}" at base "{apiBase}" · Tools: {toolsLabel}</small>
        {showToolDiag && toolDebug && (
          <div style={{marginTop:8, padding:10, background:'#f6f8fa', border:'1px solid #e5e7eb', borderRadius:8}}>
            <div style={{fontWeight:600, color:'#555', marginBottom:6}}>Tools Diagnostics</div>
            <div style={{fontSize:12, color:'#555'}}>
              {(toolDebug.diagnostics || []).map((step:any, idx:number) => (
                <div key={idx} style={{marginBottom:6}}>
                  <div>iter {step.iter}, finish_reason: {String(step.finish_reason ?? '')}, tool_calls: {step.tool_calls_count ?? (step.tools?.length ?? 0)}</div>
                  {Array.isArray(step.tools) && step.tools.length > 0 && (
                    <ul style={{margin:'4px 0 0 16px', padding:0}}>
                      {step.tools.map((t:any,i:number)=> (
                        <li key={i} style={{listStyle:'disc'}}>
                          <code>{t.name}</code> args: <code>{typeof t.args === 'string' ? t.args : JSON.stringify(t.args)}</code>
                        </li>
                      ))}
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
