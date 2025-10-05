export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessageReq {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  // Optional: preserve assistant tool_calls to keep tool<->result pairing on round-trips
  tool_calls?: any[];
}

export interface ChatOnceResult {
  content: string | null;
  reasoning: string | null;
  raw: any;
  messages?: any[] | null;
  diagnostics?: any;
  debug?: any;
}

export async function chatOnce({ apiBase, model, messages }: { apiBase: string; model: string; messages: ChatMessageReq[]; }): Promise<ChatOnceResult> {
  const url = apiBase.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.0, stream: false, max_tokens: 512 })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  const json = await resp.json();
  const choice = json?.choices?.[0];
  const msg = choice?.message || choice; // some servers put fields at choice level
  const content = extractContent(msg?.content ?? choice?.content ?? null);
  const reasoning: string | null = (typeof msg?.reasoning_content === 'string' && msg.reasoning_content.length > 0)
    ? msg.reasoning_content
    : null;
  return { content, reasoning, raw: json };
}

// Call server-side tool orchestrator (non-streaming). Useful when tools are required.
export async function chatViaServer({ model, messages }: { model: string; messages: ChatMessageReq[]; }): Promise<ChatOnceResult> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  const json = await resp.json();
  const content = typeof json?.assistant?.content === 'string' ? json.assistant.content : null;
  const reasoning = typeof json?.assistant?.reasoning === 'string' ? json.assistant.reasoning : null;
  const messagesOut = Array.isArray(json?.messages) ? json.messages : null;
  const diagnostics = json?.debug?.diagnostics ?? null;
  const debug = json?.debug ?? null;
  return { content, reasoning, raw: json, messages: messagesOut, diagnostics, debug };
}

function extractContent(c: any): string | null {
  if (typeof c === 'string') return c;
  if (!c) return null;
  if (Array.isArray(c)) {
    let out = '';
    for (const part of c) {
      if (!part) continue;
      if (typeof part === 'string') { out += part; continue; }
      if (typeof part.text === 'string') out += part.text;
      else if (typeof part.content === 'string') out += part.content;
      else if (typeof part.value === 'string') out += part.value;
    }
    return out || null;
  }
  return null;
}

export interface StreamDelta {
  reasoningDelta?: string;
  contentDelta?: string;
}

export interface StreamFinal {
  reasoning?: string | null;
  content?: string | null;
  continued?: boolean;
  messages?: any[] | null;
  diagnostics?: any;
  debug?: any;
}

export async function streamChat({
  apiBase,
  model,
  messages,
  signal,
  onDelta,
  onDone,
  onError
}: {
  apiBase: string;
  model: string;
  messages: ChatMessageReq[];
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
  onDone: (final: StreamFinal) => void;
  onError: (err: any) => void;
}): Promise<void> {
  const url = apiBase.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ model, messages, temperature: 0.0, stream: true, max_tokens: 512 }),
    signal
  });
  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalReasoning = '';
  let finalContent = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          onDone({ reasoning: finalReasoning || null, content: finalContent || null });
          return;
        }
        try {
          const chunk = JSON.parse(data);
          const choice = chunk?.choices?.[0];
          const delta = choice?.delta || {};
          const r = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
          const c = typeof delta.content === 'string' ? delta.content : '';
          if (r) finalReasoning += r;
          if (c) finalContent += c;
          if (r || c) onDelta({ reasoningDelta: r || undefined, contentDelta: c || undefined });
        } catch (e) {
          // ignore malformed lines
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}


// Stream via server-side tool orchestrator endpoint (/api/chat/stream)
export async function streamViaServer({
  model,
  messages,
  signal,
  onDelta,
  onDone,
  onError,
  onOrchestration
}: {
  model: string;
  messages: ChatMessageReq[];
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
  onDone: (final: StreamFinal) => void;
  onError: (err: any) => void;
  onOrchestration?: (payload: { messages?: any[] | null; debug?: any; diagnostics?: any }) => void;
}): Promise<void> {
  const url = '/api/chat/stream';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ model, messages }),
    signal
  });
  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalReasoning = '';
  let finalContent = '';
  let continued = false;
  let currentEvent = '';
  let orchestrationMessages: any[] | null | undefined;
  let orchestrationDebug: any;
  let orchestrationDiagnostics: any;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) { currentEvent = ''; continue; }
        if (line.startsWith('event:')) { currentEvent = line.slice(6).trim(); continue; }
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          onDone({
            reasoning: finalReasoning || null,
            content: finalContent || null,
            continued,
            messages: orchestrationMessages ?? null,
            diagnostics: orchestrationDiagnostics,
            debug: orchestrationDebug,
          });
          return;
        }
        try {
          if (currentEvent === 'fk-debug') {
            const dbg = JSON.parse(data);
            if (dbg && dbg.continued) continued = true;
          } else if (currentEvent === 'fk-orchestration') {
            const payload = JSON.parse(data);
            orchestrationMessages = Array.isArray(payload?.messages) ? payload.messages : null;
            orchestrationDebug = payload?.debug ?? null;
            orchestrationDiagnostics = payload?.debug?.diagnostics ?? payload?.diagnostics ?? null;
            onOrchestration?.({
              messages: orchestrationMessages,
              debug: orchestrationDebug,
              diagnostics: orchestrationDiagnostics,
            });
          } else {
            const chunk = JSON.parse(data);
            const choice = (chunk as any)?.choices?.[0];
            const delta = (choice as any)?.delta || {};
            const r = typeof (delta as any).reasoning_content === 'string' ? (delta as any).reasoning_content : '';
            const c = typeof (delta as any).content === 'string' ? (delta as any).content : '';
            if (r) finalReasoning += r;
            if (c) finalContent += c;
            if (r || c) onDelta({ reasoningDelta: r || undefined, contentDelta: c || undefined });
          }
        } catch (e) {
          // ignore malformed lines
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}
