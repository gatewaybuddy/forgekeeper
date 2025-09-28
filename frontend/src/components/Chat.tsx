import React, { useCallback, useMemo, useRef, useState } from 'react';
import { chatOnce, streamChat } from '../lib/chatClient';

type Role = 'system' | 'user' | 'assistant';
interface Message {
  role: Role;
  content: string;
  reasoning?: string | null;
}

export function Chat({ apiBase, model }: { apiBase: string; model: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !streaming, [input, streaming]);

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

  return (
    <div>
      <section style={{border:'1px solid #eee', borderRadius:8, padding:12, marginBottom:12, minHeight: 280}}>
        {messages.map((m, i) => (
          <div key={i} style={{marginBottom:10}}>
            <div style={{fontWeight:600, fontSize:12, color:'#666', marginBottom:4}}>{m.role.toUpperCase()}</div>
            <div style={{whiteSpace:'pre-wrap'}}>{m.content || <span style={{color:'#aaa'}}>(no content)</span>}</div>
            {m.role === 'assistant' && showReasoning && (
              <div style={{marginTop:6, padding:8, background:'#f8f9fa', border:'1px dashed #ddd', borderRadius:6}}>
                <div style={{fontSize:12, color:'#666', marginBottom:4}}>[reasoning]</div>
                <div style={{whiteSpace:'pre-wrap', color:'#555'}}>{m.reasoning || <span style={{color:'#bbb'}}>(none)</span>}</div>
              </div>
            )}
          </div>
        ))}
      </section>

      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
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
      </div>
      <small style={{color:'#666'}}>Using model "{model}" at base "{apiBase}"</small>
    </div>
  );
}

