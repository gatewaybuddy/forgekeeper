import React, { useEffect, useState } from 'react';
import type {
  CtxEvent,
  ReviewCycleEvent,
  ChunkOutlineEvent,
  ChunkWriteEvent,
} from '../lib/ctxClient';
import './Drawer.css';

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
    <div className="collapsible-section">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="collapsible-header"
      >
        <span>
          {isOpen ? '▼' : '▶'} {title}
          {count !== undefined && ` (${count})`}
        </span>
      </button>
      {isOpen && <div className="collapsible-content">{children}</div>}
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
      className={`copy-button ${copied ? 'copied' : ''}`}
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
  const badgeClass = accepted
    ? 'accepted'
    : scoreDiff > -0.2
      ? 'marginal'
      : 'rejected';

  return (
    <div className="review-pass-card">
      <div className="review-pass-header">
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Pass {review_pass}</span>
          <span className={`review-pass-badge ${badgeClass}`}>
            {accepted ? 'Accepted' : 'Rejected'}
          </span>
        </div>
        <div className="review-metrics">
          <span>{typeof elapsed_ms === 'number' ? `${elapsed_ms}ms` : '-'}</span>
          <CopyButton data={event} />
        </div>
      </div>

      <div className="review-score-bar">
        <div
          className={`review-score-fill ${badgeClass}`}
          style={{ width: `${Math.min(100, (quality_score / threshold) * 100)}%` }}
        />
      </div>

      <div className="review-metrics">
        <span>Score: {quality_score.toFixed(3)} / {threshold.toFixed(2)}</span>
      </div>

      {critique && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="toggle-button"
          >
            {expanded ? '▼ Hide Critique' : '▶ Show Critique'}
          </button>
          {expanded && (
            <div className="review-critique">
              {critique}
            </div>
          )}
          {!expanded && critique.length > 200 && (
            <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
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
    <div className="chunk-card">
      <div className="chunk-header">
        <div>
          <span>Chunk {chunk_index + 1}/{totalChunks}</span>
          {chunk_label && (
            <span className="chunk-description">{chunk_label}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-sm)' }}>
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
            {typeof elapsed_ms === 'number' ? `${(elapsed_ms / 1000).toFixed(1)}s` : '-'}
          </span>
          <CopyButton data={event} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--gap-lg)', fontSize: 'var(--font-sm)' }}>
        {typeof reasoning_tokens === 'number' && (
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Reasoning: </span>
            <span style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>{reasoning_tokens}</span>
            <span style={{ color: 'var(--text-tertiary)' }}> tokens</span>
          </div>
        )}
        {typeof content_tokens === 'number' && (
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Content: </span>
            <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{content_tokens}</span>
            <span style={{ color: 'var(--text-tertiary)' }}> tokens</span>
          </div>
        )}
        {typeof reasoning_tokens === 'number' && typeof content_tokens === 'number' && (
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Total: </span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {reasoning_tokens + content_tokens}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}> tokens</span>
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
      className="drawer-overlay"
      onClick={onClose}
    >
      <div
        className="drawer-container"
        style={{ width: 'min(900px, 94vw)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <h2 className="drawer-title">Diagnostics — Recent Events</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="drawer-close-button"
          >
            ✕
          </button>
        </div>
        <div className="drawer-body">

        {/* Tool Executions Section */}
        {hasToolExecutions && (
          <CollapsibleSection title="Tool Executions" count={toolEvents.length} defaultOpen={true}>
            {loadingTools && <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Loading...</div>}
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                    <th style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>Tool</th>
                    <th style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>Time</th>
                    <th style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {toolEvents.slice(0, 20).map((e, i) => {
                    const isError = e.act === 'tool_execution_error';
                    const isFinish = e.act === 'tool_execution_finish';
                    const statusColor = isError ? 'var(--accent-red)' : isFinish ? 'var(--accent-green)' : 'var(--accent-yellow)';
                    const statusBg = isError ? 'var(--accent-red-dark)' : isFinish ? 'var(--accent-green-dark)' : 'var(--accent-yellow-dark)';
                    const statusText = isError ? 'error' : isFinish ? 'done' : 'start';
                    const preview = e.result_preview || e.args_preview || (e as { error?: string }).error || '';
                    return (
                      <tr key={`tool-${i}`} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--font-xs)',
                              fontWeight: 600,
                              background: statusBg,
                              color: statusColor,
                            }}
                          >
                            {statusText}
                          </span>
                        </td>
                        <td style={{ padding: '4px 6px', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
                          {typeof e.elapsed_ms === 'number' ? `${e.elapsed_ms}ms` : '-'}
                        </td>
                        <td
                          style={{
                            padding: '4px 6px',
                            fontSize: 'var(--font-xs)',
                            maxWidth: 300,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: 'var(--text-secondary)',
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
            {loadingReview && <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Loading...</div>}
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
            {loadingChunks && <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Loading...</div>}
            {chunkOutline && (
              <div
                style={{
                  padding: 'var(--padding-md)',
                  background: 'var(--accent-blue-dark)',
                  border: '1px solid var(--accent-blue)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--gap-md)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--font-sm)', color: 'var(--accent-blue)', marginBottom: 'var(--gap-xs)' }}>
                  Outline ({chunkOutline.chunk_count} chunks)
                </div>
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
                  {chunkOutline.outline.join(' → ')}
                </div>
                {typeof chunkOutline.elapsed_ms === 'number' && (
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--gap-xs)' }}>
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
                padding: 'var(--padding-md)',
                background: 'var(--accent-yellow-dark)',
                border: '1px solid var(--accent-yellow)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
              }}
            >
              <ul style={{ margin: 'var(--gap-xs) 0 0 16px', padding: 0, fontSize: 'var(--font-sm)' }}>
                {events
                  .filter((e) => e.act === 'auto_continue')
                  .map((e, i) => (
                    <li key={`cont-${i}`} style={{ color: 'var(--text-secondary)' }}>
                      attempt {String(e.attempt || '?')}: {String(e.reason || 'incomplete')}{' '}
                      {typeof e.elapsed_ms === 'number' ? `(${e.elapsed_ms} ms)` : ''}
                    </li>
                  ))}
              </ul>
              <div style={{ marginTop: 'var(--gap-xs)', fontSize: 'var(--font-sm)' }}>
                Counts — total: <b>{contCounts.total}</b> short: <b>{contCounts.short}</b> punct:{' '}
                <b>{contCounts.punct}</b> fence: <b>{contCounts.fence}</b>
              </div>
              <div style={{ marginTop: 'var(--gap-xs)' }}>
                <button
                  onClick={copyLast}
                  style={{
                    padding: '4px 8px',
                    fontSize: 'var(--font-xs)',
                    background: 'var(--accent-yellow)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
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
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>ts</th>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>actor</th>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>act</th>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>name</th>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>preview</th>
                  <th style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>ms</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                    <td style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
                      {e.ts?.replace('T', ' ').replace('Z', 'Z')}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>{e.actor}</td>
                    <td style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>{e.act}</td>
                    <td style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>{e.name || ''}</td>
                    <td
                      style={{
                        padding: '6px 8px',
                        fontSize: 'var(--font-sm)',
                        color: 'var(--text-secondary)',
                        maxWidth: 480,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {e.content_preview || e.result_preview || e.args_preview || ''}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
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
    </div>
  );
}
