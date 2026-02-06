/**
 * Lazy Session Hydration for Forgekeeper
 *
 * Implements lazy loading of session context to reduce memory usage and startup time.
 * Sessions are stored as chunks and loaded on-demand.
 *
 * Storage Structure:
 *   data/sessions/<session-id>/
 *     metadata.json    - session info, timestamps, message count
 *     summary.json     - rolling summary for quick context
 *     chunk-0.jsonl    - messages 0-99
 *     chunk-1.jsonl    - messages 100-199
 *     ...
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { rotateIfNeeded } from './jsonl-rotate.js';
import { join, dirname } from 'path';
import { config } from '../config.js';

// Configuration
const SESSIONS_DIR = join(config.dataDir || './data', 'sessions');
const CHUNK_SIZE = parseInt(process.env.FK_SESSION_CHUNK_SIZE || '100');
const CACHE_SIZE = parseInt(process.env.FK_SESSION_CACHE_SIZE || '5');
const RETENTION_DAYS = parseInt(process.env.FK_SESSION_RETENTION_DAYS || '30');
const SUMMARY_MESSAGES = 10; // Number of recent messages to include in summary context

// LRU Cache for session chunks
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Remove if already exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }
}

// Session chunk cache
const chunkCache = new LRUCache(CACHE_SIZE);

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Get session directory path
 */
function getSessionDir(sessionId) {
  return join(SESSIONS_DIR, sessionId);
}

/**
 * Get chunk file path
 */
function getChunkPath(sessionId, chunkIndex) {
  return join(getSessionDir(sessionId), `chunk-${chunkIndex}.jsonl`);
}

/**
 * Get metadata file path
 */
function getMetadataPath(sessionId) {
  return join(getSessionDir(sessionId), 'metadata.json');
}

/**
 * Get summary file path
 */
function getSummaryPath(sessionId) {
  return join(getSessionDir(sessionId), 'summary.json');
}

/**
 * Read JSONL file
 */
function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Append to JSONL file
 */
function appendJsonl(filePath, record) {
  ensureSessionsDir();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(filePath, JSON.stringify(record) + '\n');
  rotateIfNeeded(filePath);
}

/**
 * Create or update session metadata
 */
export function updateMetadata(sessionId, updates = {}) {
  ensureSessionsDir();
  const sessionDir = getSessionDir(sessionId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  const metadataPath = getMetadataPath(sessionId);
  let metadata = {
    sessionId,
    createdAt: new Date().toISOString(),
    messageCount: 0,
    chunkCount: 0,
    totalTokensEstimate: 0,
  };

  if (existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
    } catch {
      // Use defaults
    }
  }

  metadata = { ...metadata, ...updates, lastUpdated: new Date().toISOString() };
  atomicWriteFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

/**
 * Get session metadata
 */
export function getMetadata(sessionId) {
  const metadataPath = getMetadataPath(sessionId);
  if (!existsSync(metadataPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Append a message to a session
 */
export function appendMessage(sessionId, message) {
  const metadata = getMetadata(sessionId) || updateMetadata(sessionId);
  const chunkIndex = Math.floor(metadata.messageCount / CHUNK_SIZE);
  const chunkPath = getChunkPath(sessionId, chunkIndex);

  // Create message record
  const record = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    index: metadata.messageCount,
    ...message,
  };

  // Append to chunk
  appendJsonl(chunkPath, record);

  // Update metadata
  const newChunkCount = chunkIndex + 1;
  const tokenEstimate = (message.content?.length || 0) / 4; // Rough estimate

  updateMetadata(sessionId, {
    messageCount: metadata.messageCount + 1,
    chunkCount: Math.max(metadata.chunkCount || 0, newChunkCount),
    totalTokensEstimate: (metadata.totalTokensEstimate || 0) + tokenEstimate,
  });

  // Invalidate cache for this chunk
  chunkCache.set(`${sessionId}:${chunkIndex}`, null);

  return record;
}

/**
 * Load a specific chunk (with caching)
 */
export function loadChunk(sessionId, chunkIndex) {
  const cacheKey = `${sessionId}:${chunkIndex}`;

  // Check cache first
  const cached = chunkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Load from disk
  const chunkPath = getChunkPath(sessionId, chunkIndex);
  const messages = readJsonl(chunkPath);

  // Cache the result
  chunkCache.set(cacheKey, messages);

  return messages;
}

/**
 * Get recent messages (for quick context)
 */
export function getRecentMessages(sessionId, count = SUMMARY_MESSAGES) {
  const metadata = getMetadata(sessionId);
  if (!metadata || metadata.messageCount === 0) {
    return [];
  }

  const messages = [];
  const totalMessages = metadata.messageCount;
  const lastChunkIndex = Math.floor((totalMessages - 1) / CHUNK_SIZE);

  // Load from most recent chunks until we have enough
  for (let i = lastChunkIndex; i >= 0 && messages.length < count; i--) {
    const chunk = loadChunk(sessionId, i);
    messages.unshift(...chunk);
  }

  // Return only the last N messages
  return messages.slice(-count);
}

/**
 * Get session summary (stored summary + recent messages)
 */
export function getSessionContext(sessionId) {
  const metadata = getMetadata(sessionId);
  if (!metadata) {
    return null;
  }

  const summaryPath = getSummaryPath(sessionId);
  let summary = null;
  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    } catch {
      summary = null;
    }
  }

  const recentMessages = getRecentMessages(sessionId, SUMMARY_MESSAGES);

  return {
    metadata,
    summary,
    recentMessages,
    hasOlderHistory: metadata.messageCount > SUMMARY_MESSAGES,
  };
}

/**
 * Update session summary
 */
export function updateSummary(sessionId, summary) {
  ensureSessionsDir();
  const sessionDir = getSessionDir(sessionId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  const summaryPath = getSummaryPath(sessionId);
  const summaryData = {
    updatedAt: new Date().toISOString(),
    ...summary,
  };
  atomicWriteFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
  return summaryData;
}

/**
 * Hydrate session (load all messages - use sparingly)
 */
export function hydrateSession(sessionId) {
  const metadata = getMetadata(sessionId);
  if (!metadata) {
    return [];
  }

  const allMessages = [];
  for (let i = 0; i <= (metadata.chunkCount || 0); i++) {
    const chunk = loadChunk(sessionId, i);
    allMessages.push(...chunk);
  }

  return allMessages;
}

/**
 * Dehydrate session (compact old messages into summary)
 */
export async function dehydrateSession(sessionId, summarizer) {
  const metadata = getMetadata(sessionId);
  if (!metadata || metadata.messageCount <= CHUNK_SIZE) {
    return false; // No need to dehydrate small sessions
  }

  // Get all messages except the most recent chunk
  const lastChunkIndex = Math.floor((metadata.messageCount - 1) / CHUNK_SIZE);
  const messagesToSummarize = [];

  for (let i = 0; i < lastChunkIndex; i++) {
    messagesToSummarize.push(...loadChunk(sessionId, i));
  }

  if (messagesToSummarize.length === 0) {
    return false;
  }

  // Generate summary if summarizer provided
  let summaryText = null;
  if (summarizer && typeof summarizer === 'function') {
    try {
      summaryText = await summarizer(messagesToSummarize);
    } catch (err) {
      console.error(`[SessionHydration] Failed to summarize: ${err.message}`);
    }
  }

  // Update summary
  const existingSummary = getSessionContext(sessionId)?.summary || {};
  updateSummary(sessionId, {
    ...existingSummary,
    compactedMessages: (existingSummary.compactedMessages || 0) + messagesToSummarize.length,
    lastCompaction: new Date().toISOString(),
    summaryText: summaryText || existingSummary.summaryText,
  });

  // Optionally delete old chunks (for now, keep them for safety)
  // Future: Add FK_SESSION_DELETE_COMPACTED=1 flag

  return true;
}

/**
 * Prune old sessions
 */
export function pruneOldSessions() {
  ensureSessionsDir();
  const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let pruned = 0;

  try {
    const sessionDirs = readdirSync(SESSIONS_DIR);

    for (const sessionId of sessionDirs) {
      const sessionDir = getSessionDir(sessionId);
      const metadataPath = getMetadataPath(sessionId);

      if (!existsSync(metadataPath)) continue;

      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        const lastUpdated = new Date(metadata.lastUpdated || metadata.createdAt).getTime();

        if (lastUpdated < cutoffTime) {
          // Delete all files in session directory
          const files = readdirSync(sessionDir);
          for (const file of files) {
            unlinkSync(join(sessionDir, file));
          }
          // Remove directory
          require('fs').rmdirSync(sessionDir);
          pruned++;
        }
      } catch {
        // Skip problematic sessions
      }
    }
  } catch (err) {
    console.error(`[SessionHydration] Prune error: ${err.message}`);
  }

  if (pruned > 0) {
    console.log(`[SessionHydration] Pruned ${pruned} old sessions`);
  }

  return pruned;
}

/**
 * Get session statistics
 */
export function getSessionStats(sessionId) {
  const metadata = getMetadata(sessionId);
  if (!metadata) {
    return null;
  }

  const sessionDir = getSessionDir(sessionId);
  let totalSize = 0;

  try {
    const files = readdirSync(sessionDir);
    for (const file of files) {
      const stats = statSync(join(sessionDir, file));
      totalSize += stats.size;
    }
  } catch {
    totalSize = 0;
  }

  return {
    sessionId,
    messageCount: metadata.messageCount,
    chunkCount: metadata.chunkCount || 0,
    totalTokensEstimate: metadata.totalTokensEstimate || 0,
    diskSizeBytes: totalSize,
    createdAt: metadata.createdAt,
    lastUpdated: metadata.lastUpdated,
  };
}

/**
 * List all sessions
 */
export function listSessions() {
  ensureSessionsDir();
  try {
    const sessionDirs = readdirSync(SESSIONS_DIR);
    return sessionDirs
      .map(sessionId => getSessionStats(sessionId))
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  } catch {
    return [];
  }
}

/**
 * Clear chunk cache
 */
export function clearCache() {
  chunkCache.clear();
}

export default {
  appendMessage,
  loadChunk,
  getRecentMessages,
  getSessionContext,
  hydrateSession,
  dehydrateSession,
  updateMetadata,
  getMetadata,
  updateSummary,
  pruneOldSessions,
  getSessionStats,
  listSessions,
  clearCache,
};
