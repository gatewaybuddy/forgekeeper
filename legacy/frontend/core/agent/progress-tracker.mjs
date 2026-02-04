/**
 * Progress Tracker - Detect stuck vs. slow based on state changes
 *
 * Usage:
 *   const tracker = new ProgressTracker('session-123');
 *   tracker.heartbeat({ iteration: 1, phase: 'reflection' });
 *   tracker.stateChange({ type: 'tool_call', data: { tool: 'write_file' } });
 *   const stuck = tracker.isStuck(); // false = making progress
 */

export class ProgressTracker {
  constructor(sessionId, config = {}) {
    this.sessionId = sessionId;
    this.heartbeats = [];
    this.stateChanges = [];
    this.startTime = Date.now();

    // Configuration
    this.config = {
      heartbeatInterval: config.heartbeatInterval || 10000, // 10s
      stuckThreshold: config.stuckThreshold || 5, // 5 heartbeats with no change
      maxHeartbeatsInMemory: config.maxHeartbeatsInMemory || 100,
      maxStateChangesInMemory: config.maxStateChangesInMemory || 50,
    };
  }

  /**
   * Record heartbeat - agent is alive
   */
  heartbeat(metadata = {}) {
    this.heartbeats.push({
      ts: Date.now(),
      iteration: metadata.iteration,
      phase: metadata.phase,
    });

    // Cleanup old heartbeats to prevent memory leak
    if (this.heartbeats.length > this.config.maxHeartbeatsInMemory) {
      this.heartbeats.shift();
    }
  }

  /**
   * Record state change - agent is making progress
   */
  stateChange(change) {
    this.stateChanges.push({
      ts: Date.now(),
      type: change.type, // 'tool_call', 'reflection_complete', 'plan_generated'
      data: change.data,
    });

    // Cleanup old state changes
    if (this.stateChanges.length > this.config.maxStateChangesInMemory) {
      this.stateChanges.shift();
    }
  }

  /**
   * Check if agent is stuck (alive but no progress)
   *
   * Returns true if:
   * - At least N heartbeats recorded
   * - No state changes during the last N heartbeats
   */
  isStuck() {
    if (this.heartbeats.length < this.config.stuckThreshold) {
      return false; // Not enough data yet
    }

    const recentHeartbeats = this.heartbeats.slice(-this.config.stuckThreshold);
    const firstTs = recentHeartbeats[0].ts;
    const lastTs = recentHeartbeats[recentHeartbeats.length - 1].ts;

    // Count state changes during this period
    const stateChangesInPeriod = this.stateChanges.filter(
      sc => sc.ts >= firstTs && sc.ts <= lastTs
    );

    // Stuck = heartbeats but no state changes
    return stateChangesInPeriod.length === 0;
  }

  /**
   * Get current status
   */
  getStatus() {
    const now = Date.now();
    const lastHeartbeat = this.heartbeats[this.heartbeats.length - 1];
    const lastStateChange = this.stateChanges[this.stateChanges.length - 1];

    const alive = lastHeartbeat && (now - lastHeartbeat.ts) < (this.config.heartbeatInterval * 2);

    return {
      sessionId: this.sessionId,
      alive,
      stuck: this.isStuck(),
      uptime: now - this.startTime,
      progress: {
        heartbeats: this.heartbeats.length,
        stateChanges: this.stateChanges.length,
        lastChange: lastStateChange?.type,
        lastChangeAgo: lastStateChange ? now - lastStateChange.ts : null,
      },
      currentPhase: lastHeartbeat?.phase,
      currentIteration: lastHeartbeat?.iteration,
    };
  }

  /**
   * Reset tracker (for recovery)
   */
  reset() {
    this.heartbeats = [];
    this.stateChanges = [];
  }

  /**
   * Get recent history for debugging
   */
  getHistory(count = 10) {
    return {
      heartbeats: this.heartbeats.slice(-count),
      stateChanges: this.stateChanges.slice(-count),
    };
  }
}
