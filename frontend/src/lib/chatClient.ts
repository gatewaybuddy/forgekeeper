export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatMessageReq {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  // Optional: preserve assistant tool_calls to keep tool<->result pairing on round-trips
  tool_calls?: ToolCall[];
}

export interface ChatOnceResult {
  content: string | null;
  reasoning: string | null;
  raw: unknown;
  messages?: ChatMessageReq[] | null;
  diagnostics?: unknown;
  debug?: unknown;
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
export async function chatViaServer({ model, messages, maxTokens, autoTokens, temperature, topP, convId, reviewEnabled, chunkedEnabled }: { model: string; messages: ChatMessageReq[]; maxTokens?: number; autoTokens?: boolean; temperature?: number; topP?: number; convId?: string; reviewEnabled?: boolean; chunkedEnabled?: boolean; }): Promise<ChatOnceResult> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      conv_id: convId,
      max_tokens: typeof maxTokens === 'number' ? maxTokens : undefined,
      auto_tokens: !!autoTokens,
      temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
      top_p: (typeof topP === 'number' && !Number.isNaN(topP)) ? topP : undefined,
      review_enabled: typeof reviewEnabled === 'boolean' ? reviewEnabled : undefined,
      chunked_enabled: typeof chunkedEnabled === 'boolean' ? chunkedEnabled : undefined,
    }),
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

// Call thought-world multi-agent consensus mode
export async function chatViaThoughtWorld({ model, messages, convId }: { model: string; messages: ChatMessageReq[]; convId?: string; }): Promise<ChatOnceResult> {
  const resp = await fetch('/api/chat/thought-world', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      conv_id: convId,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  const json = await resp.json();
  const content = typeof json?.assistant?.content === 'string' ? json.assistant.content : null;
  const reasoning = null; // Thought world uses consensus instead of reasoning
  const messagesOut = Array.isArray(json?.messages) ? json.messages : null;
  const thoughtWorld = json?.assistant?.thoughtWorld ?? null;
  return { content, reasoning, raw: json, messages: messagesOut, diagnostics: { thoughtWorld } };
}

function extractContent(c: unknown): string | null {
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
  messages?: ChatMessageReq[] | null;
  diagnostics?: unknown;
  debug?: unknown;
}

export interface ProgressInfo {
  mode: 'review' | 'chunked';
  current: number;
  total: number;
  label?: string;
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
  onError: (err: Error | unknown) => void;
}): Promise<void> {
  const url = apiBase.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ model, messages, temperature: 0.0, stream: true, max_tokens: 1024 }),
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
    // eslint-disable-next-line no-constant-condition
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
  onOrchestration,
  onProgress,
  maxTokens,
  contTokens,
  contAttempts,
  autoTokens,
  temperature,
  topP,
  convId,
  reviewEnabled,
  chunkedEnabled,
}: {
  model: string;
  messages: ChatMessageReq[];
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
  onDone: (final: StreamFinal) => void;
  onError: (err: Error | unknown) => void;
  onOrchestration?: (payload: { messages?: ChatMessageReq[] | null; debug?: unknown; diagnostics?: unknown }) => void;
  onProgress?: (progress: ProgressInfo) => void;
  maxTokens?: number;
  contTokens?: number;
  contAttempts?: number;
  autoTokens?: boolean;
  temperature?: number;
  topP?: number;
  convId?: string;
  reviewEnabled?: boolean;
  chunkedEnabled?: boolean;
}): Promise<void> {
  const url = '/api/chat/stream';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({
      model,
      messages,
      conv_id: convId,
      max_tokens: maxTokens,
      cont_tokens: contTokens,
      cont_attempts: contAttempts,
      auto_tokens: !!autoTokens,
      temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : undefined,
      top_p: (typeof topP === 'number' && !Number.isNaN(topP)) ? topP : undefined,
      review_enabled: typeof reviewEnabled === 'boolean' ? reviewEnabled : undefined,
      chunked_enabled: typeof chunkedEnabled === 'boolean' ? chunkedEnabled : undefined,
    }),
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
  const contEvents: Array<{ attempt?: number; reason?: string }> = [];
  let currentEvent = '';
  let orchestrationMessages: ChatMessageReq[] | null | undefined;
  let orchestrationDebug: unknown;
  let orchestrationDiagnostics: unknown;
  try {
    // eslint-disable-next-line no-constant-condition
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
            if (dbg && dbg.continued) {
              continued = true;
              contEvents.push({ attempt: dbg.attempt, reason: dbg.reason });
              onOrchestration?.({ debug: { continued: true, attempt: dbg.attempt, reason: dbg.reason } });
            }
          } else if (currentEvent === 'fk-orchestration') {
            const payload = JSON.parse(data);
            orchestrationMessages = Array.isArray(payload?.messages) ? payload.messages : null;
            orchestrationDebug = payload?.debug ?? null;
            orchestrationDiagnostics = payload?.debug?.diagnostics ?? payload?.diagnostics ?? null;

            // Parse progress information from debug data
            if (onProgress && orchestrationDebug) {
              const dbg = orchestrationDebug as Record<string, unknown>;
              // Review mode progress: review_pass indicates current pass
              if (typeof dbg?.review_pass === 'number') {
                const reviewPass = dbg.review_pass as number;
                const maxPasses = typeof dbg?.max_review_passes === 'number'
                  ? dbg.max_review_passes as number
                  : 3;
                onProgress({
                  mode: 'review',
                  current: reviewPass,
                  total: maxPasses,
                });
              }
              // Chunked mode progress: chunk_index indicates current chunk
              if (typeof dbg?.chunk_index === 'number') {
                const chunkIndex = dbg.chunk_index as number;
                const totalChunks = typeof dbg?.total_chunks === 'number'
                  ? dbg.total_chunks as number
                  : dbg.chunk_index as number;
                const chunkLabel = typeof dbg?.chunk_label === 'string'
                  ? dbg.chunk_label as string
                  : undefined;
                onProgress({
                  mode: 'chunked',
                  current: chunkIndex,
                  total: totalChunks,
                  label: chunkLabel,
                });
              }
            }

            onOrchestration?.({
              messages: orchestrationMessages,
              debug: orchestrationDebug,
              diagnostics: orchestrationDiagnostics,
            });
          } else if (currentEvent === 'fk-final') {
            const fin = JSON.parse(data);
            const c = typeof fin?.content === 'string' ? fin.content : '';
            const r = typeof fin?.reasoning === 'string' ? fin.reasoning : '';
            if (r && !finalReasoning) {
              finalReasoning = r;
              onDelta({ reasoningDelta: r });
            }
            if (c && !finalContent) {
              finalContent = c;
              onDelta({ contentDelta: c });
            }
            const dbg: Record<string, unknown> = { fkFinal: true, content: c };
            if (contEvents.length > 0) { dbg.continuedTotal = contEvents.length; dbg.continuations = contEvents; }
            onOrchestration?.({ debug: dbg });
          } else {
            const chunk = JSON.parse(data) as Record<string, unknown>;
            const choice = (chunk?.choices as unknown[])?.[0] as Record<string, unknown> | undefined;
            const delta = (choice?.delta as Record<string, unknown>) || {};
            const r = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
            const c = typeof delta.content === 'string' ? delta.content : '';
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
