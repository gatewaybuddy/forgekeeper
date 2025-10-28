/**
 * Autonomous Mode Client
 *
 * API client for autonomous agent sessions
 */

export interface AutonomousTask {
  task: string;
  model?: string;
  max_iterations?: number;
  conv_id?: string;
  async?: boolean; // when true, start in background and return session_id immediately
}

export interface AutonomousResult {
  completed: boolean;
  reason: string;
  iterations: number;
  confidence: number;
  history: Array<{
    iteration: number;
    action: string;
    result: string;
    progress: number;
    confidence: number;
    tools_used?: string[];
    artifacts?: Array<{ type: string; path: string }>;
  }>;
  artifacts: Array<{ type: string; path: string }>;
  summary: string;
  state: {
    progress_percent: number;
    errors: number;
    reflections: any[];
  };
}

export interface AutonomousResponse {
  ok: boolean;
  session_id: string;
  result?: AutonomousResult; // present in sync mode
  running?: boolean; // present in async mode
  needsClarification?: boolean; // [Day 10] Interactive mode - agent needs help
  questions?: string[]; // [Day 10] Clarifying questions from agent
  currentState?: { // [Day 10] Current state when asking for clarification
    iteration: number;
    progress: number;
    lastActions: string[];
  };
}

// [Day 10] Checkpoint metadata
export interface CheckpointInfo {
  checkpoint_id: string;
  session_id: string;
  task: string;
  timestamp: string;
  iteration: number;
  progress_percent: number;
  artifacts_count: number;
}

// [Day 10] Learning stats
export interface LearningStats {
  total_sessions: number;
  successful_sessions: number;
  failed_sessions: number;
  by_task_type: {
    [taskType: string]: {
      total: number;
      success: number;
      avg_iterations: number;
    };
  };
  recent_patterns: {
    successful_tools: string[];
    failed_tools: string[];
    common_failure_reasons: string[];
  };
}

/**
 * Start an autonomous agent session
 *
 * @param params Task parameters
 * @returns Promise resolving to the result
 */
export async function startAutonomousSession(params: AutonomousTask): Promise<AutonomousResponse> {
  const resp = await fetch('/api/chat/autonomous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}

/**
 * Get the status/result of an autonomous session
 */
export async function getAutonomousStatus(sessionId: string): Promise<{
  ok: boolean;
  session_id: string;
  running: boolean;
  state?: { iteration: number; max_iterations: number; progress_percent: number; artifacts_created: number; errors: number; stuck_count: number };
  result?: AutonomousResult;
  error?: string;
}> {
  const url = `/api/chat/autonomous/status?session_id=${encodeURIComponent(sessionId)}`;
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }
  return await resp.json();
}

/**
 * Stop an autonomous agent session
 *
 * @param sessionId Session ID to stop
 * @returns Promise resolving to confirmation
 */
export async function stopAutonomousSession(sessionId: string): Promise<{ ok: boolean }> {
  const resp = await fetch('/api/chat/autonomous/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}

/**
 * List available checkpoints
 * [Day 10]
 *
 * @returns Promise resolving to list of checkpoints
 */
export async function listCheckpoints(): Promise<{ ok: boolean; checkpoints: CheckpointInfo[] }> {
  const resp = await fetch('/api/chat/autonomous/checkpoints', {
    method: 'GET',
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}

/**
 * Resume autonomous session from checkpoint
 * [Day 10]
 *
 * @param checkpointId Checkpoint ID to resume from
 * @returns Promise resolving to the resumed session
 */
export async function resumeFromCheckpoint(checkpointId: string): Promise<AutonomousResponse> {
  const resp = await fetch('/api/chat/autonomous/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkpoint_id: checkpointId }),
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}

/**
 * Provide clarification to waiting agent (interactive mode)
 * [Day 10]
 *
 * @param sessionId Session ID waiting for clarification
 * @param response User's clarifying response
 * @returns Promise resolving to resumed session
 */
export async function provideClarification(
  sessionId: string,
  response: string
): Promise<AutonomousResponse> {
  const resp = await fetch('/api/chat/autonomous/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, response }),
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}

/**
 * Get learning statistics
 * [Day 10]
 *
 * @returns Promise resolving to learning stats
 */
export async function getLearningStats(): Promise<{ ok: boolean; stats: LearningStats }> {
  const resp = await fetch('/api/chat/autonomous/stats', {
    method: 'GET',
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${resp.status}`);
  }

  return await resp.json();
}
