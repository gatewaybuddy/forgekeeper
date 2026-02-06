/**
 * Context Flush Module for Forgekeeper
 *
 * Automatically extracts and persists important context before hitting
 * token limits, ensuring continuity across context resets.
 *
 * Features:
 * - Detects when approaching context limit
 * - Extracts key insights, decisions, action items
 * - Persists to journal and working memory
 * - Auto-loads working memory on startup
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { query } from './claude.js';
import { rotateIfNeeded } from './jsonl-rotate.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const MEMORY_DIR = join(PERSONALITY_PATH, 'memory');
const CONTEXT_FLUSHES_PATH = join(JOURNAL_DIR, 'context_flushes.jsonl');
const WORKING_MEMORY_PATH = join(MEMORY_DIR, 'working_memory.md');

// Settings from config
const ENABLED = config.contextFlush?.enabled ?? true;
const THRESHOLD = config.contextFlush?.threshold ?? 0.8;
const CHARS_PER_TOKEN = 4; // Rough estimate

// State
let lastFlushTime = 0;
let flushCount = 0;

/**
 * Ensure directories exist
 */
function ensureDirectories() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/**
 * Estimate token count from text
 * Uses character count / 4 as rough approximation
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Detect if approaching context limit
 *
 * @param {number} currentTokens - Current token usage
 * @param {number} maxTokens - Maximum context tokens
 * @returns {boolean} True if should flush
 */
export function detectApproachingLimit(currentTokens, maxTokens) {
  if (!ENABLED) return false;
  if (!maxTokens || maxTokens <= 0) return false;

  const ratio = currentTokens / maxTokens;
  return ratio >= THRESHOLD;
}

/**
 * Extract key context from conversation history
 *
 * @param {Array} conversationHistory - Array of {role, content} messages
 * @returns {Promise<Object>} Extracted context
 */
export async function extractKeyContext(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    return {
      success: false,
      reason: 'No conversation history',
      extraction: null,
    };
  }

  // Format conversation for extraction
  const conversationText = conversationHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n')
    .slice(-10000); // Limit to last ~2500 tokens for extraction

  const extractionPrompt = `Analyze this conversation and extract the most important context that should be preserved for continuity. Be concise.

CONVERSATION:
${conversationText}

Extract and format as follows:
**DECISIONS MADE:**
- List any decisions that were made

**ACTION ITEMS:**
- List any tasks or actions that were agreed upon

**KEY INSIGHTS:**
- List important discoveries, realizations, or learnings

**UNRESOLVED QUESTIONS:**
- List any open questions or pending decisions

**IMPORTANT FACTS:**
- List critical facts, names, paths, or values mentioned

If a category has nothing, write "None."`;

  try {
    const result = await query(extractionPrompt, {
      timeout: 30000, // 30 second timeout for extraction
    });

    if (!result.success || !result.output) {
      return {
        success: false,
        reason: result.error || 'Extraction failed',
        extraction: null,
      };
    }

    return {
      success: true,
      extraction: {
        raw: result.output,
        ts: new Date().toISOString(),
        messageCount: conversationHistory.length,
      },
    };
  } catch (err) {
    console.error('[ContextFlush] Extraction failed:', err.message);
    return {
      success: false,
      reason: err.message,
      extraction: null,
    };
  }
}

/**
 * Flush extracted context to memory
 *
 * @param {Object} extraction - Extracted context from extractKeyContext
 * @param {Object} metadata - Additional metadata (sessionId, userId, etc.)
 * @returns {Object} Flush result
 */
export function flushToMemory(extraction, metadata = {}) {
  if (!extraction || !extraction.raw) {
    return { success: false, reason: 'No extraction to flush' };
  }

  ensureDirectories();

  try {
    // 1. Append to context_flushes.jsonl (journal)
    const journalEntry = {
      id: `flush-${Date.now()}`,
      type: 'context_flush',
      ts: extraction.ts || new Date().toISOString(),
      messageCount: extraction.messageCount,
      content: extraction.raw,
      sessionId: metadata.sessionId,
      userId: metadata.userId,
    };

    appendFileSync(CONTEXT_FLUSHES_PATH, JSON.stringify(journalEntry) + '\n');
    rotateIfNeeded(CONTEXT_FLUSHES_PATH);

    // 2. Update working_memory.md
    const workingMemoryContent = formatWorkingMemory(extraction, metadata);
    atomicWriteFileSync(WORKING_MEMORY_PATH, workingMemoryContent);

    flushCount++;
    lastFlushTime = Date.now();

    console.log(`[ContextFlush] Flushed to memory (flush #${flushCount})`);

    return {
      success: true,
      journalPath: CONTEXT_FLUSHES_PATH,
      workingMemoryPath: WORKING_MEMORY_PATH,
      flushCount,
    };
  } catch (err) {
    console.error('[ContextFlush] Flush failed:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Format working memory content
 */
function formatWorkingMemory(extraction, metadata) {
  const lines = [
    '# Working Memory',
    '',
    `Last updated: ${new Date().toISOString()}`,
    metadata.sessionId ? `Session: ${metadata.sessionId}` : '',
    '',
    '## Context from Previous Session',
    '',
    extraction.raw,
    '',
    '---',
    '',
    '*This file is auto-generated by context flush. It will be loaded on startup.*',
  ];

  return lines.filter(l => l !== null).join('\n');
}

/**
 * Load flushed context from working memory
 *
 * @returns {Object} Loaded context
 */
export function loadFlushedContext() {
  if (!existsSync(WORKING_MEMORY_PATH)) {
    return {
      available: false,
      reason: 'No working memory file',
      content: null,
    };
  }

  try {
    const content = readFileSync(WORKING_MEMORY_PATH, 'utf-8');

    // Extract just the context section (skip header/footer)
    const lines = content.split('\n');
    const contextStart = lines.findIndex(l => l.includes('Context from Previous Session'));
    const contextEnd = lines.findIndex(l => l.startsWith('---'));

    if (contextStart === -1) {
      return {
        available: true,
        content: content,
        ts: getWorkingMemoryTimestamp(content),
      };
    }

    const contextLines = lines.slice(contextStart + 2, contextEnd > contextStart ? contextEnd : undefined);
    const contextContent = contextLines.join('\n').trim();

    return {
      available: true,
      content: contextContent,
      ts: getWorkingMemoryTimestamp(content),
    };
  } catch (err) {
    console.error('[ContextFlush] Failed to load working memory:', err.message);
    return {
      available: false,
      reason: err.message,
      content: null,
    };
  }
}

/**
 * Extract timestamp from working memory content
 */
function getWorkingMemoryTimestamp(content) {
  const match = content.match(/Last updated: (.+)/);
  return match ? match[1] : null;
}

/**
 * Perform a full context flush
 *
 * @param {Array} conversationHistory - Conversation messages
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Flush result
 */
export async function performFlush(conversationHistory, metadata = {}) {
  console.log('[ContextFlush] Starting context flush...');

  // Extract key context
  const extractResult = await extractKeyContext(conversationHistory);
  if (!extractResult.success) {
    return {
      success: false,
      reason: extractResult.reason,
    };
  }

  // Flush to memory
  const flushResult = flushToMemory(extractResult.extraction, metadata);

  if (flushResult.success) {
    console.log(`[ContextFlush] Context flush complete - preserved ${extractResult.extraction.messageCount} messages worth of context`);
  }

  return {
    success: flushResult.success,
    extraction: extractResult.extraction,
    ...flushResult,
  };
}

/**
 * Get context flush statistics
 */
export function getStats() {
  return {
    enabled: ENABLED,
    threshold: THRESHOLD,
    flushCount,
    lastFlushTime: lastFlushTime ? new Date(lastFlushTime).toISOString() : null,
    workingMemoryExists: existsSync(WORKING_MEMORY_PATH),
    contextFlushesExists: existsSync(CONTEXT_FLUSHES_PATH),
  };
}

/**
 * Get recent flush entries from journal
 */
export function getRecentFlushes(limit = 5) {
  if (!existsSync(CONTEXT_FLUSHES_PATH)) return [];

  try {
    const lines = readFileSync(CONTEXT_FLUSHES_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Clear working memory (for testing or reset)
 */
export function clearWorkingMemory() {
  if (existsSync(WORKING_MEMORY_PATH)) {
    atomicWriteFileSync(WORKING_MEMORY_PATH, '# Working Memory\n\n*No context available.*\n');
    return true;
  }
  return false;
}

export default {
  estimateTokens,
  detectApproachingLimit,
  extractKeyContext,
  flushToMemory,
  loadFlushedContext,
  performFlush,
  getStats,
  getRecentFlushes,
  clearWorkingMemory,
};
