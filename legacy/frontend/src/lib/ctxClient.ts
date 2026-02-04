export type CtxEvent = {
  id?: string;
  ts: string;
  actor: 'user' | 'assistant' | 'tool' | 'system';
  act: 'message' | 'tool_call' | 'tool_result' | 'error' | 'metric' | 'auto_continue' | 'review_cycle' | 'review_summary' | 'chunk_outline' | 'chunk_write' | 'chunk_assembly' | 'tool_execution_start' | 'tool_execution_finish' | 'tool_execution_error';
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
  [k: string]: unknown;
};

// Review event types
export interface ReviewCycleEvent extends CtxEvent {
  act: 'review_cycle';
  review_pass: number;
  max_passes?: number;
  quality_score: number;
  threshold: number;
  accepted: boolean;
  critique: string;
}

export interface ReviewSummaryEvent extends CtxEvent {
  act: 'review_summary';
  total_passes: number;
  final_score: number;
  regeneration_count: number;
  accepted: boolean;
  total_elapsed_ms: number;
}

// Chunk event types
export interface ChunkOutlineEvent extends CtxEvent {
  act: 'chunk_outline';
  chunk_count: number;
  outline: string[];
  raw_outline?: string;
}

export interface ChunkWriteEvent extends CtxEvent {
  act: 'chunk_write';
  chunk_index: number;
  chunk_label: string;
  reasoning_tokens?: number;
  content_tokens?: number;
}

export interface ChunkAssemblyEvent extends CtxEvent {
  act: 'chunk_assembly';
  chunk_count: number;
  total_reasoning_tokens: number;
  total_content_tokens: number;
  total_tokens: number;
}

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

export async function fetchContextEvents(options?: {
  n?: number;
  convId?: string | null;
  eventTypes?: string[];
}): Promise<CtxEvent[]> {
  const { n = 100, convId, eventTypes } = options || {};
  const events = await tailContextLog(n, convId);

  if (eventTypes && eventTypes.length > 0) {
    return events.filter(e => eventTypes.includes(e.act));
  }

  return events;
}
