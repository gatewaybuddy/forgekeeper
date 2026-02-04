/**
 * Context Log Integration
 * JSONL-based event logging for orchestration telemetry
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { ContextLogEntry } from './types.js';

// Context log directory
const CONTEXTLOG_DIR = process.env.FGK_CONTEXTLOG_DIR || path.join(process.cwd(), '.forgekeeper', 'context_log');
const MAX_FILE_SIZE = parseInt(process.env.FGK_CONTEXTLOG_MAX_BYTES || '10485760', 10); // 10MB
const RETENTION_DAYS = parseInt(process.env.FGK_CONTEXTLOG_RETENTION_DAYS || '7', 10);

/**
 * Context Log Client
 * Writes structured events to rotating JSONL files
 */
export class ContextLogClient {
  private currentFile: string | null = null;
  private currentSize: number = 0;
  private initialized: boolean = false;

  /**
   * Initialize context log directory
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.mkdir(CONTEXTLOG_DIR, { recursive: true });
      await this.rotateIfNeeded();
      await this.cleanupOldFiles();
      this.initialized = true;
      logger.info({ dir: CONTEXTLOG_DIR }, 'Context log initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize context log');
      throw error;
    }
  }

  /**
   * Append an entry to the context log
   */
  async append(entry: Omit<ContextLogEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.initialize();

    try {
      const fullEntry: ContextLogEntry = {
        id: randomUUID(),
        timestamp: Date.now(),
        ...entry,
      };

      const line = JSON.stringify(fullEntry) + '\n';
      const buffer = Buffer.from(line, 'utf-8');

      await this.rotateIfNeeded();

      if (!this.currentFile) {
        throw new Error('No current log file available');
      }

      await fs.appendFile(this.currentFile, buffer);
      this.currentSize += buffer.length;

      logger.debug(
        {
          file: path.basename(this.currentFile),
          actor: entry.actor,
          action: entry.action,
        },
        'Context log entry appended'
      );
    } catch (error) {
      logger.error({ error, entry }, 'Failed to append context log entry');
      throw error;
    }
  }

  /**
   * Read recent entries (tail)
   */
  async tail(limit: number = 100): Promise<ContextLogEntry[]> {
    await this.initialize();

    try {
      const files = await this.getLogFiles();
      const entries: ContextLogEntry[] = [];

      // Read files in reverse chronological order
      for (const file of files.reverse()) {
        const filePath = path.join(CONTEXTLOG_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines.reverse()) {
          try {
            entries.push(JSON.parse(line));
            if (entries.length >= limit) {
              return entries.reverse();
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      return entries.reverse();
    } catch (error) {
      logger.error({ error }, 'Failed to tail context log');
      return [];
    }
  }

  /**
   * Filter entries by criteria
   */
  async query(options: {
    sessionId?: string;
    actor?: string;
    action?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<ContextLogEntry[]> {
    await this.initialize();

    try {
      const allEntries = await this.tail(10000); // Get large set

      let filtered = allEntries;

      if (options.sessionId) {
        filtered = filtered.filter((e) => e.sessionId === options.sessionId);
      }

      if (options.actor) {
        filtered = filtered.filter((e) => e.actor === options.actor);
      }

      if (options.action) {
        filtered = filtered.filter((e) => e.action === options.action);
      }

      if (options.startTime !== undefined) {
        filtered = filtered.filter((e) => e.timestamp >= options.startTime!);
      }

      if (options.endTime !== undefined) {
        filtered = filtered.filter((e) => e.timestamp <= options.endTime!);
      }

      const limit = options.limit || filtered.length;
      return filtered.slice(0, limit);
    } catch (error) {
      logger.error({ error, options }, 'Failed to query context log');
      return [];
    }
  }

  /**
   * Get statistics for a session
   */
  async getSessionStats(sessionId: string): Promise<{
    totalEvents: number;
    totalDuration: number;
    actorCounts: Record<string, number>;
    actionCounts: Record<string, number>;
    iterations: number;
  }> {
    const entries = await this.query({ sessionId });

    const actorCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    let totalDuration = 0;
    let maxIteration = 0;

    for (const entry of entries) {
      actorCounts[entry.actor] = (actorCounts[entry.actor] || 0) + 1;
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;

      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
      }

      if (entry.iteration !== undefined && entry.iteration > maxIteration) {
        maxIteration = entry.iteration;
      }
    }

    return {
      totalEvents: entries.length,
      totalDuration,
      actorCounts,
      actionCounts,
      iterations: maxIteration + 1,
    };
  }

  /**
   * Rotate log file if needed
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      // Check current file size
      if (this.currentFile) {
        try {
          const stats = await fs.stat(this.currentFile);
          this.currentSize = stats.size;

          if (stats.size < MAX_FILE_SIZE) {
            return; // No rotation needed
          }
        } catch {
          // File doesn't exist, create new one
        }
      }

      // Create new log file with timestamp
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');

      const filename = `ctx-${year}${month}${day}-${hour}${minute}.jsonl`;
      this.currentFile = path.join(CONTEXTLOG_DIR, filename);
      this.currentSize = 0;

      logger.info({ file: filename }, 'Context log rotated');
    } catch (error) {
      logger.error({ error }, 'Failed to rotate context log');
      throw error;
    }
  }

  /**
   * Get sorted list of log files
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(CONTEXTLOG_DIR);
      return files
        .filter((f) => f.startsWith('ctx-') && f.endsWith('.jsonl'))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Clean up old log files
   */
  private async cleanupOldFiles(): Promise<void> {
    try {
      const files = await this.getLogFiles();
      const now = Date.now();
      const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(CONTEXTLOG_DIR, file);
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > maxAge) {
            await fs.unlink(filePath);
            logger.info({ file }, 'Deleted old context log file');
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to cleanup old context log files');
    }
  }

  /**
   * Clear all log files
   */
  async clear(): Promise<void> {
    try {
      const files = await this.getLogFiles();
      for (const file of files) {
        await fs.unlink(path.join(CONTEXTLOG_DIR, file));
      }
      this.currentFile = null;
      this.currentSize = 0;
      logger.info('Context log cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear context log');
      throw error;
    }
  }
}

// Singleton instance
let instance: ContextLogClient | null = null;

export function getContextLog(): ContextLogClient {
  if (!instance) {
    instance = new ContextLogClient();
  }
  return instance;
}
