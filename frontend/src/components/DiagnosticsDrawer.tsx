import React, { useEffect, useState } from 'react';
import type {
  CtxEvent,
  ReviewCycleEvent,
  ChunkOutlineEvent,
  ChunkWriteEvent,
} from '../lib/ctxClient';

interface DiagnosticsDrawerProps {
  events: CtxEvent[];
  onClose: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 10,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          fontWeight: 700,
          color: '#334155',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        <span>
          {isOpen ? '▼' : '▶'} {title}
          {count !== undefined && ` (${count})`}
        </span>
      </button>
      {isOpen && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

function CopyButton({ data, label = 'Copy JSON' }: { data: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const json = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '4px 8px',
        fontSize: 11,
        background: copied ? '#52c41a' : '#e2e8f0',
        color: copied ? '#fff' : '#475569',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontWeight: 600,
      }}
      title={label}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function ReviewPassCard({ event }: { event: ReviewCycleEvent }) {
  const [expanded, setExpanded] = useState(false);
  const { review_pass, quality_score, threshold, accepted, critique, elapsed_ms } = event;

  const scoreDiff = quality_score - threshold;
  const scoreColor = accepted
    ? '#52c41a' // green - accepted
    : scoreDiff > -0.2
      ? '#faad14' // yellow - close
      : '#ff4d4f'; // red - far from threshold

  return (
    <div
      style={{
        padding: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>
            Pass {review_pass}
          </span>
          <span
            style={{
              display: 'inline-block',
              width: 20,
              height: 20,
              lineHeight: '20px',
              textAlign: 'center',
              borderRadius: '50%',
              background: accepted ? '#52c41a' : '#ff4d4f',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
            }}
            title={accepted ? 'Accepted' : 'Rejected'}
          >
            {accepted ? '✓' : '✗'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {typeof elapsed_ms === 'number' ? `${elapsed_ms}ms` : '-'}
          </span>
          <CopyButton data={event} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Score: </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>
            {quality_score.toFixed(3)}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}> / {threshold.toFixed(2)}</span>
        </div>
        <div
          style={{
            flex: 1,
            height: 6,
            background: '#e2e8f0',
            borderRadius: 3,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${Math.min(100, (quality_score / threshold) * 100)}%`,
              background: scoreColor,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {critique && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0369a1',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 4,
            }}
          >
            {expanded ? '▼ Hide Critique' : '▶ Show Critique'}
          </button>
          {expanded && (
            <div
              style={{
                fontSize: 12,
                color: '#475569',
                background: '#f8fafc',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #e2e8f0',
                whiteSpace: 'pre-wrap',
              }}
            >
              {critique}
            </div>
          )}
          {!expanded && critique.length > 200 && (
            <div
              style={{
                fontSize: 12,
                color: '#64748b',
                fontStyle: 'italic',
              }}
            >
              {critique.substring(0, 200)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChunkCard({ event, totalChunks }: { event: ChunkWriteEvent; totalChunks: number }) {
  const { chunk_index, chunk_label, reasoning_tokens, content_tokens, elapsed_ms } = event;

  return (
    <div
      style={{
        padding: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>
            Chunk {chunk_index + 1}/{totalChunks}
          </span>
          {chunk_label && (
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
              {chunk_label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {typeof elapsed_ms === 'number' ? `${(elapsed_ms / 1000).toFixed(1)}s` : '-'}
          </span>
          <CopyButton data={event} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        {typeof reasoning_tokens === 'number' && (
          <div>
            <span style={{ color: '#64748b' }}>Reasoning: </span>
            <span style={{ fontWeight: 600, color: '#7c3aed' }}>{reasoning_tokens}</span>
            <span style={{ color: '#64748b' }}> tokens</span>
          </div>
        )}
        {typeof content_tokens === 'number' && (
          <div>
            <span style={{ color: '#64748b' }}>Content: </span>
            <span style={{ fontWeight: 600, color: '#0369a1' }}>{content_tokens}</span>
            <span style={{ color: '#64748b' }}> tokens</span>
          </div>
        )}
        {typeof reasoning_tokens === 'number' && typeof content_tokens === 'number' && (
          <div>
            <span style={{ color: '#64748b' }}>Total: </span>
            <span style={{ fontWeight: 600, color: '#334155' }}>
              {reasoning_tokens + content_tokens}
            </span>
            <span style={{ color: '#64748b' }}> tokens</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiagnosticsDrawer({ events, onClose }: DiagnosticsDrawerProps) {
  const [toolEvents, setToolEvents] = useState<CtxEvent[]>([]);
  const [reviewEvents, setReviewEvents] = useState<ReviewCycleEvent[]>([]);
  const [chunkOutline, setChunkOutline] = useState<ChunkOutlineEvent | null>(null);
  const [chunkEvents, setChunkEvents] = useState<ChunkWriteEvent[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Load tool execution events on mount
  useEffect(() => {
    const fetchToolEvents = async () => {
      setLoadingTools(true);
      try {
        const response = await fetch('/api/tools/executions?n=50');
        if (response.ok) {
          const data = await response.json();
          if (data.ok && Array.isArray(data.events)) {
            setToolEvents(data.events);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch tool execution events:', err);
      } finally {
        setLoadingTools(false);
      }
    };
    fetchToolEvents();
  }, []);

  // Load review events
  useEffect(() => {
    const loadReviewEvents = async () => {
      setLoadingReview(true);
      try {
        // Import the function dynamically
        const { fetchContextEvents } = await import('../lib/ctxClient');
        const allEvents = await fetchContextEvents({
          n: 200,
          eventTypes: ['review_cycle'],
        });
        setReviewEvents(allEvents as ReviewCycleEvent[]);
      } catch (err) {
        console.warn('Failed to fetch review events:', err);
      } finally {
        setLoadingReview(false);
      }
    };
    loadReviewEvents();
  }, []);

  // Load chunk events
  useEffect(() => {
    const loadChunkEvents = async () => {
      setLoadingChunks(true);
      try {
        const { fetchContextEvents } = await import('../lib/ctxClient');
        const allEvents = await fetchContextEvents({
          n: 200,
          eventTypes: ['chunk_outline', 'chunk_write'],
        });

        const outlineEvent = allEvents.find((e) => e.act === 'chunk_outline') as ChunkOutlineEvent | undefined;
        const writeEvents = allEvents.filter((e) => e.act === 'chunk_write') as ChunkWriteEvent[];

        if (outlineEvent) setChunkOutline(outlineEvent);
        setChunkEvents(writeEvents);
      } catch (err) {
        console.warn('Failed to fetch chunk events:', err);
      } finally {
        setLoadingChunks(false);
      }
    };
    loadChunkEvents();
  }, []);

  const hasContinuations = Array.isArray(events) && events.some((e) => e.act === 'auto_continue');
  const hasToolExecutions = toolEvents.length > 0;
  const hasReviewEvents = reviewEvents.length > 0;
  const hasChunkEvents = chunkEvents.length > 0 || chunkOutline !== null;

  const contCounts = (() => {
    const c = { total: 0, short: 0, punct: 0, fence: 0 } as Record<string, number>;
    for (const e of events || []) {
      if (e.act === 'auto_continue') {
        c.total += 1;
        if (typeof e.reason === 'string' && c[e.reason] != null) c[e.reason] += 1;
      }
    }
    return c;
  })();

  const copyLast = async () => {
    try {
      const payload = JSON.stringify(events.slice(0, 50), null, 2);
      await navigator.clipboard.writeText(payload);
      alert('Copied last 50 events to clipboard.');
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(900px, 94vw)',
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          padding: 16,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#334155', fontSize: 16 }}>Diagnostics — Recent Events</div>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tool Executions Section */}
        {hasToolExecutions && (
          <CollapsibleSection title="Tool Executions" count={toolEvents.length} defaultOpen={true}>
            {loadingTools && <div style={{ fontSize: 12, color: '#64748b' }}>Loading...</div>}
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #d9d9d9' }}>
                    <th style={{ padding: '4px 6px' }}>Tool</th>
                    <th style={{ padding: '4px 6px' }}>Status</th>
                    <th style={{ padding: '4px 6px' }}>Time</th>
                    <th style={{ padding: '4px 6px' }}>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {toolEvents.slice(0, 20).map((e, i) => {
                    const isError = e.act === 'tool_execution_error';
                    const isFinish = e.act === 'tool_execution_finish';
                    const statusColor = isError ? '#ff4d4f' : isFinish ? '#52c41a' : '#faad14';
                    const statusText = isError ? 'error' : isFinish ? 'done' : 'start';
                    const preview = e.result_preview || e.args_preview || (e as { error?: string }).error || '';
                    return (
                      <tr key={`tool-${i}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: statusColor,
                              color: '#fff',
                            }}
                          >
                            {statusText}
                          </span>
                        </td>
                        <td style={{ padding: '4px 6px', fontSize: 11, color: '#8c8c8c' }}>
                          {typeof e.elapsed_ms === 'number' ? `${e.elapsed_ms}ms` : '-'}
                        </td>
                        <td
                          style={{
                            padding: '4px 6px',
                            fontSize: 11,
                            maxWidth: 300,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {preview}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Review History Section */}
        {hasReviewEvents && (
          <CollapsibleSection title="Review History" count={reviewEvents.length} defaultOpen={true}>
            {loadingReview && <div style={{ fontSize: 12, color: '#64748b' }}>Loading...</div>}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {reviewEvents.map((event, idx) => (
                <ReviewPassCard key={event.id || idx} event={event} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Chunk Breakdown Section */}
        {hasChunkEvents && (
          <CollapsibleSection title="Chunk Breakdown" count={chunkEvents.length} defaultOpen={true}>
            {loadingChunks && <div style={{ fontSize: 12, color: '#64748b' }}>Loading...</div>}
            {chunkOutline && (
              <div
                style={{
                  padding: 12,
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0369a1', marginBottom: 6 }}>
                  Outline ({chunkOutline.chunk_count} chunks)
                </div>
                <div style={{ fontSize: 12, color: '#0c4a6e' }}>
                  {chunkOutline.outline.join(' → ')}
                </div>
                {typeof chunkOutline.elapsed_ms === 'number' && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Generated in {chunkOutline.elapsed_ms}ms
                  </div>
                )}
              </div>
            )}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {chunkEvents.map((event, idx) => (
                <ChunkCard
                  key={event.id || idx}
                  event={event}
                  totalChunks={chunkOutline?.chunk_count || chunkEvents.length}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Continuations Section */}
        {hasContinuations && (
          <CollapsibleSection title="Continuations" count={contCounts.total} defaultOpen={false}>
            <div
              style={{
                padding: 10,
                background: '#fffbe6',
                border: '1px solid #ffe58f',
                borderRadius: 8,
                color: '#8c6d1f',
              }}
            >
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 12 }}>
                {events
                  .filter((e) => e.act === 'auto_continue')
                  .map((e, i) => (
                    <li key={`cont-${i}`}>
                      attempt {String(e.attempt || '?')}: {String(e.reason || 'incomplete')}{' '}
                      {typeof e.elapsed_ms === 'number' ? `(${e.elapsed_ms} ms)` : ''}
                    </li>
                  ))}
              </ul>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Counts — total: <b>{contCounts.total}</b> short: <b>{contCounts.short}</b> punct:{' '}
                <b>{contCounts.punct}</b> fence: <b>{contCounts.fence}</b>
              </div>
              <div style={{ marginTop: 6 }}>
                <button
                  onClick={copyLast}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#faad14',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Copy last 50 events
                </button>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* All Events Table */}
        <CollapsibleSection title="All Events" count={events.length} defaultOpen={false}>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>ts</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>actor</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>act</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>name</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>preview</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#64748b' }}>ms</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: '#334155' }}>
                      {e.ts?.replace('T', ' ').replace('Z', 'Z')}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: '#334155' }}>{e.actor}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: '#334155' }}>{e.act}</td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: '#334155' }}>{e.name || ''}</td>
                    <td
                      style={{
                        padding: '6px 8px',
                        fontSize: 12,
                        color: '#334155',
                        maxWidth: 480,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {e.content_preview || e.result_preview || e.args_preview || ''}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: '#334155' }}>
                      {typeof e.elapsed_ms === 'number' ? e.elapsed_ms : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
