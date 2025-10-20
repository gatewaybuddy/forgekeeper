export type CtxEvent = {
  id?: string;
  ts: string;
  actor: 'user' | 'assistant' | 'tool' | 'system';
  act: 'message' | 'tool_call' | 'tool_result' | 'error' | 'metric' | 'auto_continue';
  conv_id?: string;
  trace_id?: string;
  iter?: number;
  name?: string;
  status?: string;
  elapsed_ms?: number;
  args_preview?: string;
  result_preview?: string;
  content_preview?: string;
  attempt?: number;
  reason?: string;
  [k: string]: any;
};

export async function tailContextLog(n: number, convId?: string | null): Promise<CtxEvent[]> {
  const params = new URLSearchParams();
  params.set('n', String(Math.max(1, Math.min(500, n || 50))));
  if (convId) params.set('conv_id', convId);
  const r = await fetch(`/api/ctx/tail?${params.toString()}`);
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const rows = Array.isArray(j?.rows) ? j.rows as CtxEvent[] : [];
  return rows;
}
