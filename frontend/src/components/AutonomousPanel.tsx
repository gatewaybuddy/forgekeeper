import React, { useCallback, useEffect, useMemo, useState } from 'react';
// [codex] switch to useAutonomousTask wrapper
import useAutonomousTask from '../hooks/useAutonomousTask';
// [Day 10] New API methods
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

  // [Day 10] Checkpoint management
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);

  // [Day 10] Interactive mode
  const [clarificationNeeded, setClarificationNeeded] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationResponse, setClarificationResponse] = useState('');

  // [Day 10] Learning stats
  const [showStats, setShowStats] = useState(false);
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const progressPct = Math.max(0, Math.min(100, data?.state?.progress_percent ?? 0));
  const iter = data?.state?.iteration ?? 0;
  const iterMax = data?.state?.max_iterations ?? 0;
  const reason = (data?.result as any)?.reason ?? '';
  const completed = !!(data?.result && (data.result as any)?.completed === true);

  const canStart = useMemo(() => !busy && (task.trim().length > 0), [busy, task]);

  // [codex] toast notifications
  const [toast, setToast] = useState<{ msg: string; level: 'info' | 'error' } | null>(null);
  useEffect(() => {
    if (error) setToast({ msg: `Autonomous error: ${error}`, level: 'error' });
  }, [error]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // [codex] adopt externally-started session via localStorage handoff
  useEffect(() => {
    try {
      const sid = localStorage.getItem('fk_auto_adopt_session');
      if (sid && !sessionId) {
        const t = localStorage.getItem('fk_auto_adopt_task') || '';
        adopt(sid, t);
        localStorage.removeItem('fk_auto_adopt_session');
        localStorage.removeItem('fk_auto_adopt_task');
      }
    } catch {}
  }, [sessionId, adopt]);

  // [codex] session history in localStorage
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { const raw = localStorage.getItem('fk_auto_history'); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });
  useEffect(() => { try { localStorage.setItem('fk_auto_history', JSON.stringify(history.slice(-10))); } catch {} }, [history]);
  useEffect(() => {
    if (sessionId && !running && data?.result) {
      const item: HistoryItem = { session_id: sessionId, task: currentTask || task, completed: !!data.result.completed, reason: (data.result as any)?.reason, ts: new Date().toISOString() };
      setHistory(prev => {
        const exists = prev.some(h => h.session_id === item.session_id);
        return exists ? prev : [...prev.slice(-9), item];
      });
    }
  }, [sessionId, running, data?.result, currentTask, task]);

  const onStart = useCallback(async () => {
    try { await start(task.trim(), 15); }
    catch (e: any) { setToast({ msg: `Failed to start: ${e?.message || e}`, level: 'error' }); }
  }, [task, start]);

  const onStop = useCallback(async () => {
    try { await stop(); }
    catch (e: any) { setToast({ msg: `Stop failed: ${e?.message || e}`, level: 'error' }); }
  }, [stop]);

  const onReset = useCallback(() => { clear(); }, [clear]);

  // [Day 10] Load checkpoints
  const onLoadCheckpoints = useCallback(async () => {
    setLoadingCheckpoints(true);
    try {
      const resp = await listCheckpoints();
      setCheckpoints(resp.checkpoints || []);
      setShowCheckpoints(true);
    } catch (e: any) {
      setToast({ msg: `Failed to load checkpoints: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingCheckpoints(false);
    }
  }, []);

  // [Day 10] Resume from checkpoint
  const onResumeCheckpoint = useCallback(async (checkpointId: string) => {
    try {
      setShowCheckpoints(false);
      const resp = await resumeFromCheckpoint(checkpointId);
      // Adopt the resumed session
      if (resp.session_id) {
        const checkpoint = checkpoints.find(c => c.checkpoint_id === checkpointId);
        adopt(resp.session_id, checkpoint?.task || 'Resumed session');
        setToast({ msg: `Resumed from checkpoint`, level: 'info' });
      }
    } catch (e: any) {
      setToast({ msg: `Failed to resume: ${e?.message || e}`, level: 'error' });
    }
  }, [checkpoints, adopt]);

  // [Day 10] Load learning stats
  const onLoadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const resp = await getLearningStats();
      setLearningStats(resp.stats);
      setShowStats(true);
    } catch (e: any) {
      setToast({ msg: `Failed to load stats: ${e?.message || e}`, level: 'error' });
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // [Day 10] Provide clarification
  const onProvideClarification = useCallback(async () => {
    if (!sessionId || !clarificationResponse.trim()) return;
    try {
      await provideClarification(sessionId, clarificationResponse.trim());
      setClarificationNeeded(false);
      setClarificationQuestions([]);
      setClarificationResponse('');
      setToast({ msg: `Clarification provided, agent resuming...`, level: 'info' });
      // Refresh to get updated status
      setTimeout(() => refresh(), 1000);
    } catch (e: any) {
      setToast({ msg: `Failed to provide clarification: ${e?.message || e}`, level: 'error' });
    }
  }, [sessionId, clarificationResponse, refresh]);

  // [Day 10] Check for clarification requests
  useEffect(() => {
    if (data && (data as any).needsClarification) {
      setClarificationNeeded(true);
      setClarificationQuestions((data as any).questions || []);
    }
  }, [data]);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#334155' }}>Autonomous Panel</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{sessionId ? `Session: ${sessionId}` : 'No active session'}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter a task for the autonomous agent"
          style={{ flex: 1, padding: '6px 8px' }}
          disabled={busy}
        />
        {!sessionId && (
          <button onClick={onStart} disabled={!canStart} title="Start autonomous session">
            Start
          </button>
        )}
        {sessionId && running && (
          <button onClick={onStop} title="Stop autonomous session">Stop</button>
        )}
        {sessionId && !running && (
          <button onClick={onReset} title="Clear session">Clear</button>
        )}
      </div>

      {sessionId && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Progress</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{iter}/{iterMax}</div>
            <div style={{ fontSize: 12, marginLeft: 'auto', color: '#64748b' }}>{progressPct}%</div>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999 }}>
            <div style={{ width: `${progressPct}%`, height: 8, background: completed ? '#22c55e' : '#3b82f6', borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, color: '#475569', fontSize: 12 }}>
            <div>Artifacts: {data?.state?.artifacts_created ?? 0}</div>
            <div>Errors: {data?.state?.errors ?? 0}</div>
            <div>Stuck: {data?.state?.stuck_count ?? 0}</div>
            {reason && !running && (<div>Reason: {reason}</div>)}
          </div>

          {toast && (
            <div style={{ position: 'fixed', top: 12, right: 12, background: toast.level === 'error' ? '#fee2e2' : '#e0f2fe', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', boxShadow: '0 6px 16px rgba(0,0,0,0.15)' }}>
              {toast.msg}
            </div>
          )}

          {data?.result?.summary && !running && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, color: '#334155', marginBottom: 6 }}>Summary</div>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, maxHeight: 220, overflow: 'auto' }}>
                {data.result.summary}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* [Day 10] Action buttons */}
      {!sessionId && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button
            onClick={onLoadCheckpoints}
            disabled={loadingCheckpoints}
            title="Load saved checkpoints"
          >
            {loadingCheckpoints ? 'Loading...' : '📋 Checkpoints'}
          </button>
          <button
            onClick={onLoadStats}
            disabled={loadingStats}
            title="View learning statistics"
          >
            {loadingStats ? 'Loading...' : '📊 Stats'}
          </button>
        </div>
      )}

      {/* [Day 10] Interactive Mode - Clarification Request */}
      {clarificationNeeded && sessionId && (
        <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 8 }}>🤔 Agent Needs Clarification</div>
          <div style={{ fontSize: 13, color: '#78350f', marginBottom: 8 }}>
            The agent is stuck and has some questions:
          </div>
          {clarificationQuestions.map((q, idx) => (
            <div key={idx} style={{ fontSize: 13, color: '#78350f', marginBottom: 4, paddingLeft: 8 }}>
              • {q}
            </div>
          ))}
          <textarea
            value={clarificationResponse}
            onChange={(e) => setClarificationResponse(e.target.value)}
            placeholder="Your response to help the agent..."
            style={{ width: '100%', minHeight: 60, padding: 8, marginTop: 8, borderRadius: 4, border: '1px solid #fbbf24' }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              onClick={onProvideClarification}
              disabled={!clarificationResponse.trim()}
              style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4 }}
            >
              Send Response
            </button>
            <button
              onClick={() => {
                setClarificationNeeded(false);
                setClarificationQuestions([]);
                setClarificationResponse('');
              }}
              style={{ padding: '6px 12px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* [Day 10] Checkpoint Browser */}
      {showCheckpoints && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, color: '#334155' }}>Available Checkpoints</div>
            <button
              onClick={() => setShowCheckpoints(false)}
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 8px' }}
            >
              Close
            </button>
          </div>
          {checkpoints.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13, padding: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              No checkpoints available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
              {checkpoints.map(cp => (
                <div key={cp.checkpoint_id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(cp.timestamp).toLocaleString()}</div>
                    <div style={{ marginLeft: 'auto', fontSize: 12, color: '#3b82f6' }}>
                      Iter: {cp.iteration} | {cp.progress_percent}%
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#111827', marginBottom: 6 }}>{cp.task}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                    Session: {cp.session_id.slice(0, 12)}...
                  </div>
                  <button
                    onClick={() => onResumeCheckpoint(cp.checkpoint_id)}
                    style={{ fontSize: 12, padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4 }}
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* [Day 10] Learning Stats */}
      {showStats && learningStats && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, color: '#334155' }}>Learning Statistics</div>
            <button
              onClick={() => setShowStats(false)}
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 8px' }}
            >
              Close
            </button>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Total Sessions</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>{learningStats.total_sessions}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Success Rate</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#16a34a' }}>
                  {learningStats.total_sessions > 0
                    ? Math.round((learningStats.successful_sessions / learningStats.total_sessions) * 100)
                    : 0}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Failures</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#dc2626' }}>{learningStats.failed_sessions}</div>
              </div>
            </div>

            {Object.keys(learningStats.by_task_type).length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>By Task Type</div>
                {Object.entries(learningStats.by_task_type).map(([taskType, stats]) => (
                  <div key={taskType} style={{ fontSize: 12, color: '#475569', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ textTransform: 'capitalize' }}>{taskType}</span>
                    <span>
                      {stats.total} sessions | {Math.round((stats.success / stats.total) * 100)}% success | ~{stats.avg_iterations} iter
                    </span>
                  </div>
                ))}
              </div>
            )}

            {learningStats.recent_patterns.successful_tools.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Successful Tools</div>
                <div style={{ fontSize: 12, color: '#16a34a' }}>
                  {learningStats.recent_patterns.successful_tools.join(', ')}
                </div>
              </div>
            )}

            {learningStats.recent_patterns.failed_tools.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Problematic Tools</div>
                <div style={{ fontSize: 12, color: '#dc2626' }}>
                  {learningStats.recent_patterns.failed_tools.join(', ')}
                </div>
              </div>
            )}

            {learningStats.recent_patterns.common_failure_reasons.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Common Failure Reasons</div>
                {learningStats.recent_patterns.common_failure_reasons.map((reason, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: '#dc2626', marginBottom: 2 }}>
                    • {reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* [codex] Recent session history */}
      {history.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, color: '#334155', marginBottom: 6 }}>Recent Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
            {history.slice().reverse().map(h => (
              <div key={h.session_id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(h.ts).toLocaleString()}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 12, color: h.completed ? '#16a34a' : '#dc2626' }}>
                    {h.completed ? 'completed' : (h.reason || 'stopped')}
                  </div>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#111827' }}>{h.task}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>Session: {h.session_id}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setHistory([])} title="Clear session history">Clear History</button>
          </div>
        </div>
      )}
    </div>
  );
}
