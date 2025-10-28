/**
 * Session Memory - Track autonomous session learnings
 *
 * Stores successful patterns and common failures to help
 * the agent improve over time.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * @typedef {Object} SessionMemory
 * @property {string} task_type - Type of task (research, multi-step, etc.)
 * @property {boolean} success - Whether task completed successfully
 * @property {number} iterations - How many iterations it took
 * @property {Array<string>} tools_used - Which tools were effective
 * @property {string} strategy - What approach worked/failed
 * @property {number} confidence - Final confidence score
 * @property {string} timestamp - When this session happened
 */

export class SessionMemoryStore {
  constructor(playgroundRoot) {
    this.playgroundRoot = playgroundRoot;
    this.memoryFile = path.join(playgroundRoot, '.session_memory.jsonl');
  }

  /**
   * Initialize memory store (create file if needed)
   */
  async initialize() {
    try {
      await fs.mkdir(this.playgroundRoot, { recursive: true });

      // Check if file exists, create if not
      try {
        await fs.access(this.memoryFile);
      } catch {
        await fs.writeFile(this.memoryFile, '', 'utf8');
      }
    } catch (error) {
      console.error('[SessionMemory] Initialization failed:', error);
    }
  }

  /**
   * Record a completed session
   *
   * @param {Object} session
   */
  async recordSession(session) {
    try {
      await this.initialize();

      const memory = {
        task_type: session.task_type,
        success: session.success,
        iterations: session.iterations,
        tools_used: session.tools_used || [],
        strategy: session.strategy || '',
        confidence: session.confidence || 0,
        timestamp: new Date().toISOString(),
        task_summary: session.task?.slice(0, 100) || '',
        // [Day 10] Enhanced failure tracking
        failure_reason: session.failure_reason || null,
        failed_tools: session.failed_tools || [],
        repetitive_actions: session.repetitive_actions || false,
        error_count: session.error_count || 0,
      };

      const line = JSON.stringify(memory) + '\n';
      await fs.appendFile(this.memoryFile, line, 'utf8');

      console.log('[SessionMemory] Recorded session:', memory.task_type, memory.success ? '✓' : '✗');
    } catch (error) {
      console.error('[SessionMemory] Failed to record:', error);
    }
  }

  /**
   * Retrieve successful patterns for a task type
   *
   * @param {string} taskType
   * @returns {Promise<Array>}
   */
  async getSuccessfulPatterns(taskType) {
    try {
      await this.initialize();

      const content = await fs.readFile(this.memoryFile, 'utf8');
      if (!content.trim()) return [];

      const lines = content.trim().split('\n');
      const memories = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(m => m !== null);

      // Filter by task type and success
      return memories.filter(
        m => m.task_type === taskType && m.success && m.confidence >= 0.8
      );
    } catch (error) {
      console.error('[SessionMemory] Failed to retrieve:', error);
      return [];
    }
  }

  /**
   * Get common failure patterns for a task type
   *
   * @param {string} taskType
   * @returns {Promise<Array>}
   */
  async getFailurePatterns(taskType) {
    try {
      await this.initialize();

      const content = await fs.readFile(this.memoryFile, 'utf8');
      if (!content.trim()) return [];

      const lines = content.trim().split('\n');
      const memories = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(m => m !== null);

      // Filter by task type and failure
      return memories.filter(m => m.task_type === taskType && !m.success);
    } catch (error) {
      console.error('[SessionMemory] Failed to retrieve failures:', error);
      return [];
    }
  }

  /**
   * Generate guidance based on past sessions
   *
   * @param {string} taskType
   * @returns {Promise<string>}
   */
  async getGuidance(taskType) {
    const successes = await this.getSuccessfulPatterns(taskType);
    const failures = await this.getFailurePatterns(taskType);

    if (successes.length === 0 && failures.length === 0) {
      return 'No previous experience with this task type.';
    }

    let guidance = `**Learnings from ${successes.length + failures.length} past sessions:**\n\n`;

    if (successes.length > 0) {
      guidance += `**What worked:**\n`;

      // Find most common tools
      const toolCounts = {};
      successes.forEach(s => {
        s.tools_used.forEach(tool => {
          toolCounts[tool] = (toolCounts[tool] || 0) + 1;
        });
      });

      const topTools = Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tool]) => tool);

      guidance += `- Effective tools: ${topTools.join(', ')}\n`;
      guidance += `- Average iterations: ${Math.round(successes.reduce((sum, s) => sum + s.iterations, 0) / successes.length)}\n`;
    }

    if (failures.length > 0) {
      guidance += `\n**Common pitfalls to avoid (${failures.length} failures analyzed):**\n`;

      // [Day 10] Analyze failure patterns
      const failureReasons = {};
      const failedToolsCount = {};
      let repetitiveCount = 0;

      failures.forEach(f => {
        if (f.failure_reason) {
          failureReasons[f.failure_reason] = (failureReasons[f.failure_reason] || 0) + 1;
        }
        if (f.failed_tools) {
          f.failed_tools.forEach(tool => {
            failedToolsCount[tool] = (failedToolsCount[tool] || 0) + 1;
          });
        }
        if (f.repetitive_actions) {
          repetitiveCount++;
        }
      });

      // Most common failure reasons
      const topReasons = Object.entries(failureReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topReasons.length > 0) {
        topReasons.forEach(([reason, count]) => {
          guidance += `- ${reason} (${count}x)\n`;
        });
      }

      // Tools that commonly fail
      const problemTools = Object.entries(failedToolsCount)
        .filter(([_, count]) => count >= 2)
        .map(([tool]) => tool);

      if (problemTools.length > 0) {
        guidance += `- Avoid relying solely on: ${problemTools.join(', ')}\n`;
      }

      // Repetition warnings
      if (repetitiveCount >= 2) {
        guidance += `- ⚠️ ${repetitiveCount} sessions failed due to repetitive actions - vary your approach!\n`;
      }
    }

    return guidance;
  }

  /**
   * Get statistics about past sessions
   *
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    try {
      await this.initialize();

      const content = await fs.readFile(this.memoryFile, 'utf8');
      if (!content.trim()) {
        return { total: 0, success: 0, failure: 0, by_type: {} };
      }

      const lines = content.trim().split('\n');
      const memories = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(m => m !== null);

      const stats = {
        total: memories.length,
        success: memories.filter(m => m.success).length,
        failure: memories.filter(m => !m.success).length,
        by_type: {},
      };

      memories.forEach(m => {
        if (!stats.by_type[m.task_type]) {
          stats.by_type[m.task_type] = { total: 0, success: 0 };
        }
        stats.by_type[m.task_type].total++;
        if (m.success) {
          stats.by_type[m.task_type].success++;
        }
      });

      return stats;
    } catch (error) {
      console.error('[SessionMemory] Failed to get stats:', error);
      return { total: 0, success: 0, failure: 0, by_type: {} };
    }
  }
}

/**
 * Create session memory store
 *
 * @param {string} playgroundRoot
 * @returns {SessionMemoryStore}
 */
export function createSessionMemory(playgroundRoot) {
  return new SessionMemoryStore(playgroundRoot);
}
