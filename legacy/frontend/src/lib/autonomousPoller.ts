import { getAutonomousStatus, type AutonomousResult } from './autonomousClient';

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface PollOutcome {
  session_id: string;
  running: boolean;
  state?: {
    iteration: number;
    max_iterations: number;
    progress_percent: number;
    artifacts_created: number;
    errors: number;
    stuck_count: number;
  };
  result?: AutonomousResult;
}

export async function pollAutonomousUntilDone(sessionId: string, opts: PollOptions = {}): Promise<PollOutcome> {
  const interval = Math.max(100, opts.intervalMs ?? 500);
  const timeout = Math.max(interval, opts.timeoutMs ?? 60_000);
  const t0 = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - t0 > timeout) {
      throw new Error('poll timeout');
    }
    const st = await getAutonomousStatus(sessionId);
    if (!st.running) return st;
    await new Promise((r) => setTimeout(r, interval));
  }
}

