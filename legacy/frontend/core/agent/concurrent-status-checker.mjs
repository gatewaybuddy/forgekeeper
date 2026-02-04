/**
 * Concurrent Status Checker
 *
 * Runs parallel LLM inference calls to check if agent is stuck/slow/blocked
 * without blocking the main autonomous loop.
 *
 * Usage:
 *   const checker = new ConcurrentStatusChecker(llmClient, 'core');
 *   checker.startCheck('check-001', { iteration: 5, recentActions: [...] });
 *   const result = await checker.getLatestResult('check-001', 5000);
 */

export class ConcurrentStatusChecker {
  constructor(llmClient, model, config = {}) {
    this.llmClient = llmClient;
    this.model = model;
    this.runningChecks = new Map();
    this.completedChecks = new Map();

    this.config = {
      maxConcurrentChecks: config.maxConcurrentChecks || 3,
      resultRetentionTime: config.resultRetentionTime || 60000, // 1 minute
    };
  }

  /**
   * Start a background status check (non-blocking)
   *
   * @param {string} checkId - Unique identifier for this check
   * @param {object} context - Agent context to analyze
   * @returns {boolean} - True if check started, false if max concurrent reached
   */
  startCheck(checkId, context) {
    // Limit concurrent checks
    if (this.runningChecks.size >= this.config.maxConcurrentChecks) {
      console.warn(`[ConcurrentStatusChecker] Max concurrent checks (${this.config.maxConcurrentChecks}) reached, skipping check ${checkId}`);
      return false;
    }

    const checkPromise = this._runStatusCheck(context);
    this.runningChecks.set(checkId, checkPromise);

    // Handle completion in background
    checkPromise
      .then(result => {
        console.log(`[StatusCheck:${checkId}] ${result.status} - ${result.reason}`);
        this.completedChecks.set(checkId, result);

        // Cleanup after retention time
        setTimeout(() => {
          this.completedChecks.delete(checkId);
        }, this.config.resultRetentionTime);
      })
      .catch(error => {
        console.warn(`[StatusCheck:${checkId}] Failed: ${error.message}`);
        this.completedChecks.set(checkId, {
          status: 'ERROR',
          reason: error.message,
          ts: Date.now(),
        });
      })
      .finally(() => {
        this.runningChecks.delete(checkId);
      });

    return true;
  }

  /**
   * Run LLM inference to analyze agent status
   */
  async _runStatusCheck(context) {
    const prompt = `You are monitoring an autonomous agent's progress.

**Agent Context**:
- Session ID: ${context.sessionId || 'unknown'}
- Current Iteration: ${context.iteration || 'unknown'}
- Current Task: ${context.currentTask || 'unknown'}

**Recent Actions** (last 3):
${JSON.stringify(context.recentActions || [], null, 2)}

**Recent Tool Results**:
${JSON.stringify(context.recentResults || [], null, 2)}

**Question**: Is this agent:
A) Making progress (slow but working correctly)
B) Stuck in a loop (repeating same actions without progress)
C) Blocked (waiting for external resource or condition)
D) Failed (error condition that requires intervention)

Respond with ONLY one letter (A/B/C/D) followed by a brief 1-sentence reason.

Example: "A - Agent is writing files and making commits, just slow due to LLM inference time."`;

    try {
      const response = await this.llmClient.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.0,
      });

      const content = response.choices[0].message.content.trim();
      const status = content[0]; // A, B, C, or D
      const reason = content.slice(2).trim();

      return {
        status,
        reason,
        ts: Date.now(),
        context: context.sessionId,
      };
    } catch (error) {
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Get latest status check result
   *
   * @param {string} checkId - Check identifier
   * @param {number} waitMs - Max time to wait for result (0 = don't wait)
   * @returns {object|null} Result or null if not ready
   */
  async getLatestResult(checkId, waitMs = 0) {
    // Check if already completed
    const completed = this.completedChecks.get(checkId);
    if (completed) return completed;

    // Check if still running
    const running = this.runningChecks.get(checkId);
    if (!running) return null; // Not found

    if (waitMs === 0) {
      return null; // Don't wait, return null
    }

    // Wait up to waitMs for result
    try {
      return await Promise.race([
        running,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Wait timeout')), waitMs)
        ),
      ]);
    } catch {
      return null; // Still running after timeout
    }
  }

  /**
   * Check if a specific check is running
   */
  isRunning(checkId) {
    return this.runningChecks.has(checkId);
  }

  /**
   * Get count of running checks
   */
  getRunningCount() {
    return this.runningChecks.size;
  }

  /**
   * Cancel a running check
   */
  cancelCheck(checkId) {
    this.runningChecks.delete(checkId);
    this.completedChecks.delete(checkId);
  }

  /**
   * Get all completed results
   */
  getCompletedResults() {
    return Array.from(this.completedChecks.entries()).map(([id, result]) => ({
      checkId: id,
      ...result,
    }));
  }
}
