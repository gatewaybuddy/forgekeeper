/**
 * Semantic Memory for Forgekeeper
 *
 * Enables forgekeeper to recall relevant past experiences during reflection
 * by embedding thoughts, decisions, and learnings for semantic retrieval.
 *
 * Uses @xenova/transformers for local embeddings (no external API).
 * Gracefully disables if transformers.js is not installed.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { join } from 'path';
import { config } from '../config.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const MEMORY_DIR = join(PERSONALITY_PATH, 'memory');
const EMBEDDINGS_PATH = join(MEMORY_DIR, 'embeddings.json');

// Settings from config
const ENABLED = config.semanticMemory?.enabled ?? false;
const TOP_K = config.semanticMemory?.topK ?? 3;
const MODEL_NAME = config.semanticMemory?.model || 'Xenova/all-MiniLM-L6-v2';

// Module state
let pipeline = null;
let embedder = null;
let initialized = false;
let initError = null;

// In-memory cache
let embeddingsCache = null;
let cacheLoaded = false;

/**
 * Load transformers.js dynamically (optional dependency)
 */
async function loadTransformers() {
  try {
    const { pipeline: transformersPipeline } = await import('@xenova/transformers');
    pipeline = transformersPipeline;
    return true;
  } catch (err) {
    console.log('[SemanticMemory] @xenova/transformers not installed. Semantic memory disabled.');
    console.log('[SemanticMemory] To enable: npm install @xenova/transformers');
    return false;
  }
}

/**
 * Initialize the semantic memory system
 */
export async function initSemanticMemory() {
  if (initialized) return isAvailable();

  if (!ENABLED) {
    console.log('[SemanticMemory] Disabled by config (FK_SEMANTIC_MEMORY_ENABLED=0)');
    initialized = true;
    return false;
  }

  // Try to load transformers
  const loaded = await loadTransformers();
  if (!loaded) {
    initialized = true;
    initError = 'transformers not installed';
    return false;
  }

  // Initialize the embedding pipeline
  try {
    console.log(`[SemanticMemory] Loading embedding model: ${MODEL_NAME}...`);
    embedder = await pipeline('feature-extraction', MODEL_NAME);
    console.log('[SemanticMemory] Embedding model loaded successfully');
    initialized = true;

    // Ensure memory directory exists
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }

    return true;
  } catch (err) {
    console.error('[SemanticMemory] Failed to load embedding model:', err.message);
    initError = err.message;
    initialized = true;
    return false;
  }
}

/**
 * Check if semantic memory is available
 */
export function isAvailable() {
  return initialized && embedder !== null;
}

/**
 * Load embeddings from disk
 */
function loadEmbeddings() {
  if (cacheLoaded) return embeddingsCache;

  if (existsSync(EMBEDDINGS_PATH)) {
    try {
      embeddingsCache = JSON.parse(readFileSync(EMBEDDINGS_PATH, 'utf-8'));
      console.log(`[SemanticMemory] Loaded ${embeddingsCache.entries?.length || 0} embeddings`);
    } catch (err) {
      console.error('[SemanticMemory] Failed to load embeddings:', err.message);
      embeddingsCache = createEmptyStore();
    }
  } else {
    embeddingsCache = createEmptyStore();
  }

  cacheLoaded = true;
  return embeddingsCache;
}

/**
 * Create empty embeddings store
 */
function createEmptyStore() {
  return {
    version: 1,
    model: MODEL_NAME,
    lastUpdated: null,
    entries: [],
  };
}

/**
 * Save embeddings to disk
 */
function saveEmbeddings() {
  if (!embeddingsCache) return;

  try {
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }

    embeddingsCache.lastUpdated = new Date().toISOString();
    atomicWriteFileSync(EMBEDDINGS_PATH, JSON.stringify(embeddingsCache, null, 2));
  } catch (err) {
    console.error('[SemanticMemory] Failed to save embeddings:', err.message);
  }
}

/**
 * Generate embedding for text
 *
 * @param {string} text - Text to embed
 * @returns {Promise<Float32Array|null>} Embedding vector or null if unavailable
 */
export async function embed(text) {
  if (!isAvailable()) {
    return null;
  }

  try {
    // Get embedding from model
    const output = await embedder(text, { pooling: 'mean', normalize: true });

    // Extract the embedding data
    return Array.from(output.data);
  } catch (err) {
    console.error('[SemanticMemory] Embedding failed:', err.message);
    return null;
  }
}

/**
 * Store text with its embedding
 *
 * @param {string} text - Text to store
 * @param {Object} metadata - Metadata (id, type, ts, source, etc.)
 * @returns {Promise<boolean>} Success
 */
export async function store(text, metadata = {}) {
  if (!isAvailable()) {
    return false;
  }

  const store = loadEmbeddings();

  // Check if already stored (by ID)
  if (metadata.id) {
    const existing = store.entries.findIndex(e => e.id === metadata.id);
    if (existing >= 0) {
      // Already stored, skip
      return true;
    }
  }

  // Generate embedding
  const vector = await embed(text);
  if (!vector) {
    return false;
  }

  // Create entry
  const entry = {
    id: metadata.id || `emb-${Date.now()}`,
    text: text.slice(0, 500), // Store preview
    vector,
    ts: metadata.ts || new Date().toISOString(),
    type: metadata.type || 'unknown',
    source: metadata.source || null,
    journalEntry: metadata.journalEntry || null,
  };

  store.entries.push(entry);

  // Save periodically (every 10 entries)
  if (store.entries.length % 10 === 0) {
    saveEmbeddings();
  }

  return true;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for semantically similar entries
 *
 * @param {string} query - Search query
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Similar entries with scores
 */
export async function search(query, topK = TOP_K) {
  if (!isAvailable()) {
    return [];
  }

  const store = loadEmbeddings();
  if (!store.entries || store.entries.length === 0) {
    return [];
  }

  // Embed the query
  const queryVector = await embed(query);
  if (!queryVector) {
    return [];
  }

  // Calculate similarities
  const scored = store.entries.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryVector, entry.vector),
  }));

  // Sort by similarity and return top K
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ vector, ...rest }) => rest);
}

/**
 * Get relevant context for current thought/reflection
 *
 * @param {string} currentThought - Current thought or context
 * @returns {Promise<Object>} Relevant context object
 */
export async function getRelevantContext(currentThought) {
  if (!isAvailable()) {
    return {
      available: false,
      reason: initError || 'not initialized',
      relatedThoughts: [],
    };
  }

  const results = await search(currentThought, TOP_K);

  // Filter out very low similarity results
  const relevant = results.filter(r => r.score > 0.5);

  return {
    available: true,
    relatedThoughts: relevant.map(r => ({
      date: r.ts,
      type: r.type,
      preview: r.text,
      similarity: (r.score * 100).toFixed(1) + '%',
    })),
    prompt: relevant.length > 0
      ? formatContextPrompt(relevant)
      : null,
  };
}

/**
 * Format relevant context as a prompt addition
 */
function formatContextPrompt(entries) {
  const lines = entries.map((e, i) => {
    const date = new Date(e.ts).toLocaleDateString();
    return `${i + 1}. [${date}] ${e.text.slice(0, 150)}...`;
  });

  return `\n\nRelated past thoughts:\n${lines.join('\n')}`;
}

/**
 * Index a journal entry (async, non-blocking)
 *
 * @param {Object} entry - Journal entry
 * @param {string} source - Source file path
 */
export function indexJournalEntry(entry, source) {
  if (!ENABLED) return;

  // Get text content
  const text = entry.content || entry.thought || entry.message || entry.summary;
  if (!text || text.length < 20) return; // Skip short entries

  // Store in background (don't await)
  store(text, {
    id: entry.id || `${source}:${entry.ts}`,
    type: entry.type,
    ts: entry.ts,
    source,
    journalEntry: entry.id,
  }).catch(err => {
    console.error('[SemanticMemory] Failed to index entry:', err.message);
  });
}

/**
 * Get statistics about the embeddings store
 */
export function getStats() {
  const store = loadEmbeddings();

  return {
    available: isAvailable(),
    enabled: ENABLED,
    model: MODEL_NAME,
    totalEntries: store.entries?.length || 0,
    lastUpdated: store.lastUpdated,
    initError,
  };
}

/**
 * Rebuild embeddings from journal (expensive operation)
 */
export async function rebuildFromJournal() {
  if (!isAvailable()) {
    return { success: false, reason: 'not available' };
  }

  console.log('[SemanticMemory] Rebuilding embeddings from journal...');

  // Clear existing
  embeddingsCache = createEmptyStore();

  // Load journal files
  const journalDir = join(PERSONALITY_PATH, 'journal');
  const journalFiles = ['thoughts.jsonl', 'shared.jsonl'];

  let indexed = 0;
  for (const file of journalFiles) {
    const path = join(journalDir, file);
    if (!existsSync(path)) continue;

    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const text = entry.thought || entry.content;
        if (text && text.length >= 20) {
          await store(text, {
            id: entry.id || `${file}:${entry.ts}`,
            type: entry.type,
            ts: entry.ts,
            source: path,
          });
          indexed++;

          // Progress logging
          if (indexed % 50 === 0) {
            console.log(`[SemanticMemory] Indexed ${indexed} entries...`);
          }
        }
      } catch {
        // Skip invalid lines
      }
    }
  }

  saveEmbeddings();
  console.log(`[SemanticMemory] Rebuilt complete: ${indexed} entries indexed`);

  return { success: true, indexed };
}

/**
 * Force save embeddings
 */
export function flush() {
  saveEmbeddings();
}

export default {
  initSemanticMemory,
  isAvailable,
  embed,
  store,
  search,
  getRelevantContext,
  indexJournalEntry,
  getStats,
  rebuildFromJournal,
  flush,
};
