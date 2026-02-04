import { useCallback, useEffect, useRef, useState } from 'react';
import { getAutonomousStatus } from '../lib/autonomousClient';

export interface UseAutoStatusOptions {
  intervalMs?: number;
}

export interface AutoStatusState {
  session_id: string;
  running: boolean;
  state?: {
    iteration: number;
    max_iterations: number;
    progress_percent: number;
    artifacts_created: number;
    errors: number;
    stuck_count: number;
    action_history?: Array<{
      iteration: number;
      action: string;
      result: string;
    }>;
    artifacts?: Array<{
      type: string;
      path: string;
    }>;
    recentFailures?: Array<{
      iteration: number;
      error: string;
    }>;
  };
  result?: {
    completed: boolean;
    reason: string;
    iterations: number;
    confidence: number;
    summary?: string;
  };
  error?: string;
}

export function useAutonomousStatus(sessionId?: string | null, opts: UseAutoStatusOptions = {}) {
  const interval = Math.max(200, opts.intervalMs ?? 800);
  const [data, setData] = useState<AutoStatusState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const sidRef = useRef<string | null>(sessionId ?? null);

  useEffect(() => {
    sidRef.current = sessionId ?? null;
  }, [sessionId]);

  const tick = useCallback(async () => {
    const sid = sidRef.current;
    if (!sid) return;
    try {
      const st = await getAutonomousStatus(sid);
      setData(st);
      setRunning(!!st.running);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    if (sessionId) {
      // Poll immediately, then on interval
      tick();
      id = setInterval(tick, interval);
    }
    return () => { if (id) clearInterval(id); };
  }, [sessionId, interval, tick]);

  return { data, running, error, refresh: tick };
}

export default useAutonomousStatus;

