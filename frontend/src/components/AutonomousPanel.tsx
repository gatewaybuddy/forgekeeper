import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useAutonomousTask from '../hooks/useAutonomousTask';
import {
  listCheckpoints,
  resumeFromCheckpoint,
  provideClarification,
  getLearningStats,
  type CheckpointInfo,
  type LearningStats,
} from '../lib/autonomousClient';

type HistoryItem = { session_id: string; task: string; completed: boolean; reason?: string; ts: string };

export default function AutonomousPanel({ model }: { model: string }) {
  const [task, setTask] = useState('Analyze the repository and summarize key components');
  const { task: currentTask, sessionId, running, data, error, start, stop, clear, adopt, refresh } = useAutonomousTask(model, { intervalMs: 800 });
  const busy = !!running;

  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [clarificationNeeded, setClarificationNeeded] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationResponse, setClarificationResponse] = useState('');
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'checkpoints' | 'stats' | 'history' | 'fullHistory' | 'episodes' | 'recoveryStats' | null>(null);
  const [expandedHistoryItem, setExpandedHistoryItem] = useState<string | null>(null);
  const [fullHistory] = useState<any[]>([]);
  const [loadingFullHistory, setLoadingFullHistory] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [episodeStats, setEpisodeStats] = useState<any>(null);
  const [recoveryStats, setRecoveryStats] = useState<any>(null);
  const [loadingRecoveryStats, setLoadingRecoveryStats] = useState(false);

  const progressPct = Math.max(0, Math.min(100, data?.state?.progress_percent ?? 0));
  const iter = data?.state?.iteration ?? 0;
  const iterMax = data?.state?.max_iterations ?? 0;
  const reason = (data?.result as unknown)?.reason ?? '';
  const completed = !!(data?.result && (data.result as unknown)?.completed === true);

  // Extract action history from state
  const actionHistory = data?.state?.action_history || [];

  const canStart = useMemo(() => !busy && (task.trim().length > 0), [busy, task]);

  const [toast, setToast] = useState<{ msg: string; level: 'info' | 'error' } | null>(null);
  useEffect(() => {
    if (error) setToast({ msg: `Error: ${error}`, level: 'error' });
  }, [error]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    try {
      const sid = localStorage.getItem('fk_auto_adopt_session');
      if (sid && !sessionId) {
        const t = localStorage.getItem('fk_auto_adopt_task') || '';
        adopt(sid, t);
        localStorage.removeItem('fk_auto_adopt_session');
        localStorage.removeItem('fk_auto_adopt_task');
      }
    } catch {
      // Ignore errors when loading session from localStorage
    }
  }, [sessionId, adopt]);

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { const raw = localStorage.getItem('fk_auto_history'); if (raw) return JSON.parse(raw); } catch {
      // Ignore parse errors
    }
    return [];
  });
  useEffect(() => { try { localStorage.setItem('fk_auto_history', JSON.stringify(history.slice(-10))); } catch {
    // Ignore storage errors
  } }, [history]);
  useEffect(() => {
    if (sessionId && !running && data?.result) {
      const item: HistoryItem = { session_id: sessionId, task: currentTask || task, completed: !!data.result.completed, reason: (data.result as unknown)?.reason, ts: new Date().toISOString() };
      setHistory(prev => {
        const exists = prev.some(h => h.session_id === item.session_id);
        return exists ? prev : [...prev.slice(-9), item];
      });
    }
  }, [sessionId, running, data?.result, currentTask, task]);

  const onStart = useCallback(async () => {
    try { await start(task.trim(), 50); } // Increased from 15 to match agent default
    catch (e: unknown) { setToast({ msg: `Failed to start: ${e?.message || e}`, level: 'error' }); }
  }, [task, start]);

  const onStop = useCallback(async () => {
    try { await stop(); }
    catch (e: unknown) { setToast({ msg: `Stop failed: ${e?.message || e}`, level: 'error' }); }
  }, [stop]);

  const onReset = useCallback(() => { clear(); }, [clear]);

  const onLoadCheckpoints = useCallback(async () => {
    setLoadingCheckpoints(true);
    try {
      const resp = await listCheckpoints();
      setCheckpoints(resp.checkpoints || []);
      setExpandedSection(expandedSection === 'checkpoints' ? null : 'checkpoints');
    } catch (e: unknown) {
      setToast({ msg: `Failed to load checkpoints: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingCheckpoints(false);
    }
  }, [expandedSection]);

  const onResumeCheckpoint = useCallback(async (checkpointId: string) => {
    try {
      setExpandedSection(null);
      const resp = await resumeFromCheckpoint(checkpointId);
      if (resp.session_id) {
        const checkpoint = checkpoints.find(c => c.checkpoint_id === checkpointId);
        adopt(resp.session_id, checkpoint?.task || 'Resumed session');
        setToast({ msg: `Resumed from checkpoint`, level: 'info' });
      }
    } catch (e: unknown) {
      setToast({ msg: `Failed to resume: ${e?.message || e}`, level: 'error' });
    }
  }, [checkpoints, adopt]);

  const onLoadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const resp = await getLearningStats();
      setLearningStats(resp.stats);
      setExpandedSection(expandedSection === 'stats' ? null : 'stats');
    } catch (e: unknown) {
      setToast({ msg: `Failed to load stats: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingStats(false);
    }
  }, [expandedSection]);

  const onLoadRecoveryStats = useCallback(async () => {
    setLoadingRecoveryStats(true);
    try {
      const resp = await fetch('/api/chat/autonomous/recovery-stats');
      const data = await resp.json();
      if (data.ok) {
        setRecoveryStats(data.stats);
        setExpandedSection(expandedSection === 'recoveryStats' ? null : 'recoveryStats');
      } else {
        throw new Error(data.message || 'Failed to load recovery stats');
      }
    } catch (e: unknown) {
      setToast({ msg: `Failed to load recovery stats: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingRecoveryStats(false);
    }
  }, [expandedSection]);

  const onLoadFullHistory = useCallback(async () => {
    setLoadingFullHistory(true);
    try {
      // TODO: Re-implement getFullHistory in autonomousClient
      setToast({ msg: 'Full history feature not yet implemented', level: 'info' });
      setExpandedSection(expandedSection === 'fullHistory' ? null : 'fullHistory');
    } catch (e: unknown) {
      setToast({ msg: `Failed to load full history: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingFullHistory(false);
    }
  }, [expandedSection]);

  const onLoadEpisodes = useCallback(async () => {
    setLoadingEpisodes(true);
    try {
      const [episodesResp, statsResp] = await Promise.all([
        fetch('/api/episodes?limit=10').then(r => r.json()),
        fetch('/api/episodes/stats').then(r => r.json()),
      ]);

      if (episodesResp.ok) {
        setEpisodes(episodesResp.episodes || []);
      }

      if (statsResp.ok) {
        setEpisodeStats(statsResp.stats);
      }

      setExpandedSection(expandedSection === 'episodes' ? null : 'episodes');
    } catch (e: unknown) {
      setToast({ msg: `Failed to load episodes: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingEpisodes(false);
    }
  }, [expandedSection]);

  const onSearchEpisodes = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setLoadingEpisodes(true);
    try {
      const resp = await fetch('/api/episodes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5, minScore: 0.3, successOnly: true }),
      });

      const data = await resp.json();
      if (data.ok) {
        setEpisodes(data.results || []);
        setToast({ msg: `Found ${data.results.length} similar episodes`, level: 'info' });
      }
    } catch (e: unknown) {
      setToast({ msg: `Failed to search episodes: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingEpisodes(false);
    }
  }, []);

  const onProvideClarification = useCallback(async () => {
    if (!sessionId || !clarificationResponse.trim()) return;
    try {
      await provideClarification(sessionId, clarificationResponse.trim());
      setClarificationNeeded(false);
      setClarificationQuestions([]);
      setClarificationResponse('');
      setToast({ msg: `Clarification provided, agent resuming...`, level: 'info' });
      setTimeout(() => refresh(), 1000);
    } catch (e: unknown) {
      setToast({ msg: `Failed to provide clarification: ${e?.message || e}`, level: 'error' });
    }
  }, [sessionId, clarificationResponse, refresh]);

  useEffect(() => {
    if (data && (data as unknown).needsClarification) {
      setClarificationNeeded(true);
      setClarificationQuestions((data as unknown).questions || []);
    }
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast Notifications */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 24,
          background: toast.level === 'error' ? '#fee2e2' : '#dbeafe',
          color: toast.level === 'error' ? '#991b1b' : '#1e40af',
          border: `1px solid ${toast.level === 'error' ? '#fca5a5' : '#93c5fd'}`,
          borderRadius: 8,
          padding: '12px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 14,
          fontWeight: 500,
          zIndex: 1000,
          maxWidth: 400
        }}>
          {toast.msg}
        </div>
      )}

      {/* Task Input Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
            {sessionId ? '🤖 Active Session' : '🚀 Start Autonomous Task'}
          </h2>
          {sessionId && (
            <span style={{
              fontSize: 12,
              color: '#64748b',
              background: '#f1f5f9',
              padding: '4px 12px',
              borderRadius: 6,
              fontFamily: 'monospace'
            }}>
              {sessionId.slice(0, 12)}...
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Enter task description (e.g., 'Create a function to calculate Fibonacci')"
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              transition: 'border-color 0.2s',
              outline: 'none'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          {!sessionId && (
            <button
              onClick={onStart}
              disabled={!canStart}
              style={{
                background: canStart ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                cursor: canStart ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: canStart ? '0 2px 8px rgba(102,126,234,0.3)' : 'none'
              }}
            >
              ▶ Start
            </button>
          )}
          {sessionId && running && (
            <button
              onClick={onStop}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
              }}
            >
              ⏹ Stop
            </button>
          )}
          {sessionId && !running && (
            <button
              onClick={onReset}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              🗑 Clear
            </button>
          )}
        </div>
      </div>

      {/* Progress Section */}
      {sessionId && (
        <div style={{
          background: '#f8f9fa',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Progress</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
              <span>Iteration: {iter}/{iterMax}</span>
              <span>•</span>
              <span>{progressPct}%</span>
            </div>
          </div>

          <div style={{
            height: 12,
            background: '#e5e7eb',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 16
          }}>
            <div style={{
              width: `${progressPct}%`,
              height: '100%',
              background: completed ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #667eea, #764ba2)',
              borderRadius: 999,
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12
          }}>
            <Stat label="Artifacts" value={data?.state?.artifacts_created ?? 0} />
            <Stat label="Errors" value={data?.state?.errors ?? 0} color="#ef4444" />
            <Stat label="Stuck Count" value={data?.state?.stuck_count ?? 0} color="#f59e0b" />
            {reason && !running && <Stat label="Status" value={reason} color="#3b82f6" />}
          </div>

          {/* Recent Activity Display */}
          {actionHistory.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📋 Recent Activity</span>
                  {running && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 400 }}>● Active</span>}
                </div>
                {sessionId && (
                  <a
                    href={`/api/ctx/tail.json?n=1000&session_id=${sessionId}`}
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
                )}
              </div>

              {/* Show most recent action prominently */}
              {(() => {
                const mostRecent = actionHistory[actionHistory.length - 1];
                if (!mostRecent) return null;

                return (
                  <div style={{
                    background: mostRecent.error ? '#fef2f2' : '#f0f9ff',
                    border: `1px solid ${mostRecent.error ? '#fecaca' : '#bae6fd'}`,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        {mostRecent.error ? '❌' : running ? '⏳' : '✅'} Iteration {mostRecent.iteration}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                        {mostRecent.progress !== undefined ? `${mostRecent.progress}% complete` : ''}
                      </span>
                      {mostRecent.confidence !== undefined && (
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                          | {(mostRecent.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: '#1f2937', marginBottom: 6, fontWeight: 500 }}>
                      {mostRecent.action || 'Working...'}
                    </div>

                    {mostRecent.result && (
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {mostRecent.result.length > 150 ? mostRecent.result.slice(0, 150) + '...' : mostRecent.result}
                      </div>
                    )}

                    {mostRecent.tools_used && mostRecent.tools_used.length > 0 && (
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {mostRecent.tools_used.map((tool: string, i: number) => (
                          <span key={i} style={{
                            background: '#f1f5f9',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontFamily: 'monospace'
                          }}>
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Show expandable activity log for older items */}
              {actionHistory.length > 1 && (
                <details style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  <summary style={{ fontWeight: 600, marginBottom: 8, userSelect: 'none' }}>
                    Show previous {actionHistory.length - 1} iterations
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {actionHistory.slice(0, -1).reverse().map((item: unknown, idx: number) => (
                      <div key={idx} style={{
                        background: item.error ? '#fef2f2' : '#f9fafb',
                        border: `1px solid ${item.error ? '#fecaca' : '#e5e7eb'}`,
                        borderRadius: 6,
                        padding: 10
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                            {item.error ? '❌' : '✅'} Iteration {item.iteration}
                          </span>
                          {item.progress !== undefined && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>
                              {item.progress}%
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#1f2937', marginBottom: 4 }}>
                          {item.action || 'N/A'}
                        </div>
                        {item.result && (
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            {item.result.length > 100 ? item.result.slice(0, 100) + '...' : item.result}
                          </div>
                        )}
                        {item.tools_used && item.tools_used.length > 0 && (
                          <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                            Tools: {item.tools_used.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Diagnostic & Recovery Section - Collapsible */}
          {data?.state?.recentFailures && data.state.recentFailures.length > 0 && (
            <details style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              <summary style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}>
                <span>▸ 🔍 Diagnostic & Recovery</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                  ({data.state.recentFailures.filter((f: unknown) => f.recoverySucceeded).length}/{data.state.recentFailures.length} recovered)
                </span>
              </summary>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.state.recentFailures.slice(-3).reverse().map((failure: unknown, idx: number) => (
                  <div key={idx} style={{
                    background: failure.recoverySucceeded ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${failure.recoverySucceeded ? '#bbf7d0' : '#fecaca'}`,
                    borderRadius: 8,
                    padding: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        {failure.recoverySucceeded ? '✅' : '❌'} {failure.tool}
                      </span>
                      {failure.diagnosis?.rootCause?.category && (
                        <span style={{
                          fontSize: 10,
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontFamily: 'monospace'
                        }}>
                          {failure.diagnosis.rootCause.category}
                        </span>
                      )}
                    </div>

                    {failure.diagnosis?.rootCause?.description && (
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                        <strong>Root Cause:</strong> {failure.diagnosis.rootCause.description}
                      </div>
                    )}

                    {failure.diagnosis?.whyChain?.why1 && (
                      <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                        &quot;{failure.diagnosis.whyChain.why1}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {data?.result?.summary && !running && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Summary</div>
              <pre style={{
                whiteSpace: 'pre-wrap',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                maxHeight: 200,
                overflow: 'auto',
                fontSize: 12,
                margin: 0,
                color: '#1f2937'
              }}>
                {data.result.summary}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Real-time Action Log - Collapsible */}
      {sessionId && actionHistory.length > 0 && (
        <details style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: 12,
          overflow: 'hidden'
        }}>
          <summary style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            listStyle: 'none'
          }}>
            <span>▸</span>
            <span>📋</span>
            <span>Recent Activities</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.9 }}>
              {actionHistory.length} iteration{actionHistory.length !== 1 ? 's' : ''}
            </span>
          </summary>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actionHistory.map((item: unknown, idx: number) => (
              <div key={idx} style={{
                background: item.error ? '#fee2e2' : '#f8f9fa',
                border: `1px solid ${item.error ? '#fca5a5' : '#e5e7eb'}`,
                borderRadius: 8,
                padding: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    background: item.error ? '#dc2626' : item.special ? '#f59e0b' : '#667eea',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4
                  }}>
                    {item.error ? '❌ ERROR' : item.special ? '💬 USER' : `#${item.iteration}`}
                  </span>
                  {item.tools_used && item.tools_used.length > 0 && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      🔧 {item.tools_used.join(', ')}
                    </span>
                  )}
                  {item.progress !== undefined && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>
                      {item.progress}% confident
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#1f2937', marginBottom: 4, fontWeight: 500 }}>
                  {item.action}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                  {item.result?.length > 200 ? item.result.slice(0, 200) + '...' : item.result}
                </div>
                {item.artifacts && item.artifacts.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#10b981' }}>
                    ✓ Created: {item.artifacts.map((a: unknown) => a.path).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Clarification Dialog */}
      {clarificationNeeded && sessionId && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2px solid #fbbf24',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#92400e', marginBottom: 12 }}>
            🤔 Agent Needs Your Help
          </div>
          <div style={{ fontSize: 14, color: '#78350f', marginBottom: 12 }}>
            The agent is stuck and has some questions:
          </div>
          {clarificationQuestions.map((q, idx) => (
            <div key={idx} style={{
              fontSize: 13,
              color: '#78350f',
              marginBottom: 6,
              paddingLeft: 16,
              position: 'relative'
            }}>
              <span style={{ position: 'absolute', left: 0 }}>•</span>
              {q}
            </div>
          ))}
          <textarea
            value={clarificationResponse}
            onChange={(e) => setClarificationResponse(e.target.value)}
            placeholder="Type your response to help the agent continue..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: 12,
              marginTop: 12,
              borderRadius: 8,
              border: '2px solid #fbbf24',
              fontSize: 14,
              resize: 'vertical'
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={onProvideClarification}
              disabled={!clarificationResponse.trim()}
              style={{
                background: clarificationResponse.trim() ? '#f59e0b' : '#d1d5db',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                cursor: clarificationResponse.trim() ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Send Response
            </button>
            <button
              onClick={() => {
                setClarificationNeeded(false);
                setClarificationQuestions([]);
                setClarificationResponse('');
              }}
              style={{
                background: 'white',
                color: '#78350f',
                border: '2px solid #fbbf24',
                padding: '10px 20px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!sessionId && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ActionButton
            icon="📋"
            label="Checkpoints"
            onClick={onLoadCheckpoints}
            loading={loadingCheckpoints}
            active={expandedSection === 'checkpoints'}
          />
          <ActionButton
            icon="📊"
            label="Learning Stats"
            onClick={onLoadStats}
            loading={loadingStats}
            active={expandedSection === 'stats'}
          />
          <ActionButton
            icon="🔧"
            label="Recovery Stats"
            onClick={onLoadRecoveryStats}
            loading={loadingRecoveryStats}
            active={expandedSection === 'recoveryStats'}
          />
          <ActionButton
            icon="🕒"
            label="Recent Sessions"
            onClick={() => setExpandedSection(expandedSection === 'history' ? null : 'history')}
            active={expandedSection === 'history'}
          />
          <ActionButton
            icon="📚"
            label="Full History (JSONL)"
            onClick={onLoadFullHistory}
            loading={loadingFullHistory}
            active={expandedSection === 'fullHistory'}
          />
          <ActionButton
            icon="🎬"
            label="Episodes (Semantic)"
            onClick={onLoadEpisodes}
            loading={loadingEpisodes}
            active={expandedSection === 'episodes'}
          />
        </div>
      )}

      {/* Checkpoints */}
      {expandedSection === 'checkpoints' && (
        <CollapsibleSection title="Saved Checkpoints" onClose={() => setExpandedSection(null)}>
          {checkpoints.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>
              No checkpoints available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checkpoints.map(cp => (
                <div key={cp.checkpoint_id} style={{
                  background: '#f8f9fa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#1f2937', fontWeight: 500, marginBottom: 4 }}>{cp.task}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {new Date(cp.timestamp).toLocaleString()} • Iter: {cp.iteration} • {cp.progress_percent}%
                    </div>
                  </div>
                  <button
                    onClick={() => onResumeCheckpoint(cp.checkpoint_id)}
                    style={{
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Learning Stats */}
      {expandedSection === 'stats' && learningStats && (
        <CollapsibleSection title="Learning Statistics" onClose={() => setExpandedSection(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <StatCard label="Total Sessions" value={learningStats.total_sessions} />
            <StatCard
              label="Success Rate"
              value={`${learningStats.total_sessions > 0 ? Math.round((learningStats.successful_sessions / learningStats.total_sessions) * 100) : 0}%`}
              color="#10b981"
            />
            <StatCard label="Failures" value={learningStats.failed_sessions} color="#ef4444" />
          </div>

          {Object.keys(learningStats.by_task_type).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>By Task Type</div>
              {Object.entries(learningStats.by_task_type).map(([taskType, stats]) => (
                <div key={taskType} style={{
                  fontSize: 12,
                  color: '#6b7280',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0'
                }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{taskType}</span>
                  <span>
                    {stats.total} sessions • {Math.round((stats.success / stats.total) * 100)}% success • ~{stats.avg_iterations} iter
                  </span>
                </div>
              ))}
            </div>
          )}

          {learningStats.recent_patterns.successful_tools.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>✅ Successful Tools</div>
              <div style={{ fontSize: 12, color: '#10b981' }}>
                {learningStats.recent_patterns.successful_tools.join(', ')}
              </div>
            </div>
          )}

          {learningStats.recent_patterns.failed_tools.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>⚠️ Problematic Tools</div>
              <div style={{ fontSize: 12, color: '#ef4444' }}>
                {learningStats.recent_patterns.failed_tools.join(', ')}
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Recovery Stats */}
      {expandedSection === 'recoveryStats' && recoveryStats && (
        <CollapsibleSection title="🔧 Recovery Pattern Statistics" onClose={() => setExpandedSection(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <StatCard label="Total Recovery Attempts" value={recoveryStats.total_recovery_attempts} />
            <StatCard label="Successful Recoveries" value={recoveryStats.total_recovery_successes} color="#10b981" />
            <StatCard
              label="Overall Success Rate"
              value={`${(recoveryStats.overall_recovery_rate * 100).toFixed(0)}%`}
              color={recoveryStats.overall_recovery_rate >= 0.7 ? '#10b981' : recoveryStats.overall_recovery_rate >= 0.5 ? '#f59e0b' : '#ef4444'}
            />
            <StatCard label="Error Categories Learned" value={recoveryStats.total_error_categories} color="#667eea" />
          </div>

          {/* Recovery by Category */}
          {Object.keys(recoveryStats.recovery_by_category).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Recovery Success by Error Category</div>
              {Object.entries(recoveryStats.recovery_by_category).map(([category, stats]: [string, any]) => (
                <div key={category} style={{
                  background: '#f8f9fa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', fontFamily: 'monospace' }}>
                      {category}
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: stats.success_rate >= 0.7 ? '#10b981' : stats.success_rate >= 0.5 ? '#f59e0b' : '#ef4444',
                      background: stats.success_rate >= 0.7 ? '#d1fae5' : stats.success_rate >= 0.5 ? '#fef3c7' : '#fee2e2',
                      padding: '2px 8px',
                      borderRadius: 4
                    }}>
                      {(stats.success_rate * 100).toFixed(0)}% success
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 16 }}>
                    <span>{stats.total_occurrences} occurrences</span>
                    <span>•</span>
                    <span>{stats.recovery_attempts} attempts</span>
                    <span>•</span>
                    <span>{stats.recovery_successes} succeeded</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top Strategies */}
          {recoveryStats.top_strategies && recoveryStats.top_strategies.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Top Recovery Strategies</div>
              {recoveryStats.top_strategies.map((strategy: unknown, idx: number) => (
                strategy.top_strategy && (
                  <div key={idx} style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>
                        {strategy.top_strategy.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#10b981', fontFamily: 'monospace' }}>
                        {strategy.error_category}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#064e3b', display: 'flex', gap: 16 }}>
                      <span>✅ {strategy.top_strategy.success_count} successes</span>
                      <span>•</span>
                      <span>~{strategy.top_strategy.avg_iterations.toFixed(1)} iterations avg</span>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Recent History */}
      {expandedSection === 'history' && history.length > 0 && (
        <CollapsibleSection title="Recent Sessions (Last 10)" onClose={() => setExpandedSection(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.slice().reverse().map(h => (
              <div key={h.session_id} style={{
                background: '#f8f9fa',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{new Date(h.ts).toLocaleString()}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: h.completed ? '#10b981' : '#ef4444',
                    background: h.completed ? '#d1fae5' : '#fee2e2',
                    padding: '2px 8px',
                    borderRadius: 4
                  }}>
                    {h.completed ? '✓ Completed' : (h.reason || 'Stopped')}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#1f2937' }}>{h.task}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontFamily: 'monospace' }}>
                  {h.session_id}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setHistory([])}
            style={{
              marginTop: 12,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600
            }}
          >
            Clear History
          </button>
        </CollapsibleSection>
      )}

      {/* Full History from JSONL */}
      {expandedSection === 'fullHistory' && (
        <CollapsibleSection title="Full Session History (from .session_memory.jsonl)" onClose={() => setExpandedSection(null)}>
          {fullHistory.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>
              No sessions recorded yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fullHistory.map((session, idx) => (
                <div key={idx} style={{
                  background: '#f8f9fa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  overflow: 'hidden'
                }}>
                  <div
                    style={{
                      padding: 12,
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => setExpandedHistoryItem(expandedHistoryItem === `${idx}` ? null : `${idx}`)}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: session.success ? '#10b981' : '#ef4444',
                        background: session.success ? '#d1fae5' : '#fee2e2',
                        padding: '2px 8px',
                        borderRadius: 4
                      }}>
                        {session.success ? '✓ SUCCESS' : '✗ FAILED'}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>
                        {new Date(session.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 16, marginBottom: 4 }}>
                      <span>Task Type: <strong style={{ color: '#1f2937', textTransform: 'capitalize' }}>{session.task_type}</strong></span>
                      <span>Iterations: <strong style={{ color: '#1f2937' }}>{session.iterations}</strong></span>
                      {session.error_count > 0 && <span style={{ color: '#ef4444' }}>Errors: {session.error_count}</span>}
                    </div>
                    {expandedHistoryItem !== `${idx}` && (
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        Click to expand details ▼
                      </div>
                    )}
                  </div>

                  {expandedHistoryItem === `${idx}` && (
                    <div style={{ padding: 12, background: 'white', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                        Click to collapse ▲
                      </div>

                      {session.tools_used && session.tools_used.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Tools Used</div>
                          <div style={{ fontSize: 12, color: '#10b981' }}>
                            {session.tools_used.join(', ')}
                          </div>
                        </div>
                      )}

                      {!session.success && session.failure_reason && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Failure Reason</div>
                          <div style={{ fontSize: 12, color: '#ef4444' }}>
                            {session.failure_reason}
                          </div>
                        </div>
                      )}

                      {!session.success && session.failed_tools && session.failed_tools.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Failed Tools</div>
                          <div style={{ fontSize: 12, color: '#ef4444' }}>
                            {session.failed_tools.join(', ')}
                          </div>
                        </div>
                      )}

                      {session.repetitive_actions && (
                        <div style={{
                          fontSize: 12,
                          color: '#f59e0b',
                          background: '#fef3c7',
                          padding: '6px 8px',
                          borderRadius: 4,
                          marginBottom: 8
                        }}>
                          ⚠️ Repetitive actions detected
                        </div>
                      )}

                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                        Line {session.line_number} in .session_memory.jsonl
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Episodes (Semantic Search) */}
      {expandedSection === 'episodes' && (
        <CollapsibleSection title="Episodic Memory (Semantic Search)" onClose={() => setExpandedSection(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search for similar episodes (e.g., 'implement Python function')"
                value={episodeSearchQuery}
                onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSearchEpisodes(episodeSearchQuery);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </div>
            <button
              onClick={() => onSearchEpisodes(episodeSearchQuery)}
              disabled={loadingEpisodes || !episodeSearchQuery.trim()}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: loadingEpisodes || !episodeSearchQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: loadingEpisodes || !episodeSearchQuery.trim() ? 0.5 : 1
              }}
            >
              {loadingEpisodes ? 'Searching...' : 'Search Similar Episodes'}
            </button>
          </div>

          {episodeStats && (
            <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Memory Statistics</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 11 }}>
                <div>
                  <div style={{ color: '#9ca3af' }}>Total Episodes</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{episodeStats.total_episodes}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af' }}>Successful</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#10b981' }}>{episodeStats.successful}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af' }}>Failed</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#ef4444' }}>{episodeStats.failed}</div>
                </div>
              </div>
            </div>
          )}

          {episodes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>
              {loadingEpisodes ? 'Loading episodes...' : 'No episodes found. Try searching for something!'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {episodes.map((item: unknown, idx: number) => {
                const episode = item.episode || item;
                const score = item.score !== undefined ? item.score : null;

                return (
                  <div key={episode.episode_id || idx} style={{
                    background: 'white',
                    border: `2px solid ${episode.success ? '#d1fae5' : '#fee2e2'}`,
                    borderRadius: 8,
                    padding: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: episode.success ? '#10b981' : '#ef4444',
                        background: episode.success ? '#d1fae5' : '#fee2e2',
                        padding: '2px 8px',
                        borderRadius: 4
                      }}>
                        {episode.success ? '✓ SUCCESS' : '✗ FAILED'}
                      </span>
                      {score !== null && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#667eea',
                          background: '#e0e7ff',
                          padding: '2px 8px',
                          borderRadius: 4
                        }}>
                          {(score * 100).toFixed(0)}% similar
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>
                      {episode.task}
                    </div>

                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      <strong>Task Type:</strong> {episode.task_type} | <strong>Iterations:</strong> {episode.iterations} | <strong>Confidence:</strong> {(episode.confidence * 100).toFixed(0)}%
                    </div>

                    {episode.strategy && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                        <strong>Strategy:</strong> {episode.strategy}
                      </div>
                    )}

                    {episode.tools_used && episode.tools_used.length > 0 && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                        <strong>Tools:</strong> {episode.tools_used.join(', ')}
                      </div>
                    )}

                    {episode.summary && (
                      <div style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb', padding: 8, borderRadius: 4, marginTop: 8 }}>
                        {episode.summary}
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
                      {new Date(episode.timestamp).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

function Stat({ label, value, color = '#1f2937' }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color = '#1f2937' }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      background: '#f8f9fa',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 16,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, loading = false, active = false }: { icon: string; label: string; onClick: () => void; loading?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        background: active ? '#667eea' : 'white',
        color: active ? 'white' : '#374151',
        border: `2px solid ${active ? '#667eea' : '#e5e7eb'}`,
        padding: '10px 20px',
        borderRadius: 8,
        cursor: loading ? 'wait' : 'pointer',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.2s'
      }}
    >
      <span>{icon}</span>
      <span>{loading ? 'Loading...' : label}</span>
    </button>
  );
}

function CollapsibleSection({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: 12,
      overflow: 'hidden'
    }}>
      <div style={{
        background: '#f8f9fa',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{title}</div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 18,
            padding: 0,
            lineHeight: 1
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}
