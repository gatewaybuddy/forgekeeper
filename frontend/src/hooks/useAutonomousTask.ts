/** [codex] useAutonomousTask hook - wraps start/stop/status for autonomous sessions */
import { useCallback, useMemo, useState } from 'react';
import { startAutonomousSession, stopAutonomousSession } from '../lib/autonomousClient';
import useAutonomousStatus, { type AutoStatusState } from './useAutonomousStatus';

export interface UseAutoTaskOptions {
  intervalMs?: number;
}

export function useAutonomousTask(model: string, opts: UseAutoTaskOptions = {}) {
  const [task, setTask] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const { data, running, error, refresh } = useAutonomousStatus(sessionId, { intervalMs: opts.intervalMs ?? 800 });

  const start = useCallback(async (t: string, maxIterations = 15) => {
    setLastError(null);
    const taskText = t.trim();
    if (!taskText) throw new Error('Task is required');
    const res = await startAutonomousSession({ task: taskText, model, max_iterations: maxIterations, async: true });
    setTask(taskText);
    setSessionId(res.session_id);
    return res.session_id;
  }, [model]);

  const stop = useCallback(async () => {
    if (!sessionId) return;
    try { await stopAutonomousSession(sessionId); await refresh(); }
    catch (e: any) { setLastError(e?.message || String(e)); }
  }, [sessionId, refresh]);

  const clear = useCallback(() => {
    setSessionId(null);
    setTask('');
    setLastError(null);
  }, []);

  // [codex] allow adopting an externally-started session (e.g., from Chat header)
  const adopt = useCallback((sid: string, t?: string) => {
    if (t) setTask(t);
    setSessionId(sid);
  }, []);

  const state = useMemo(() => ({ task, sessionId, running, data, error: error || lastError }) as {
    task: string; sessionId: string | null; running: boolean; data: AutoStatusState | null; error: string | null;
  }, [task, sessionId, running, data, error, lastError]);

  return { ...state, start, stop, clear, adopt, refresh };
}

export default useAutonomousTask;
