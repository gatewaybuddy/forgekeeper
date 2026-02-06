/**
 * Persistent Memory Search for Forgekeeper
 *
 * Implements efficient search across forgekeeper's persistent memory
 * (journal entries, conversation summaries, learnings) using an inverted index.
 *
 * Supports:
 * - Keyword search with AND, OR, quotes for exact match, - for exclusion
 * - Date range filtering
 * - Type filtering (thought, shared, context_flush, etc.)
 * - Auto-indexing when new entries are written
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';
import { join, basename } from 'path';
import { config } from '../config.js';

// Configuration
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const JOURNAL_DIR = join(PERSONALITY_PATH, 'journal');
const MEMORY_DIR = join(PERSONALITY_PATH, 'memory');
const INDEX_PATH = join(MEMORY_DIR, 'search_index.json');

// Stopwords to exclude from indexing
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
]);

// In-memory index structure
let index = null;
let indexDirty = false;

/**
 * Load the search index from disk
 */
function loadIndex() {
  if (index !== null) return index;

  if (existsSync(INDEX_PATH)) {
    try {
      index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
      console.log(`[MemorySearch] Loaded index with ${Object.keys(index.terms || {}).length} terms`);
    } catch (err) {
      console.error(`[MemorySearch] Failed to load index: ${err.message}`);
      index = createEmptyIndex();
    }
  } else {
    index = createEmptyIndex();
  }

  return index;
}

/**
 * Create empty index structure
 */
function createEmptyIndex() {
  return {
    version: 1,
    lastUpdated: null,
    terms: {},      // term -> [{ docId, positions, score }]
    documents: {},  // docId -> { path, type, ts, title, preview }
    stats: {
      totalDocs: 0,
      totalTerms: 0,
    },
  };
}

/**
 * Ensure memory directory exists
 */
function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/**
 * Save the index to disk
 */
function saveIndex() {
  if (!indexDirty) return;

  try {
    ensureMemoryDir();
    const idx = loadIndex();
    idx.lastUpdated = new Date().toISOString();
    idx.stats.totalTerms = Object.keys(idx.terms).length;

    atomicWriteFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
    indexDirty = false;
    console.log(`[MemorySearch] Saved index (${idx.stats.totalDocs} docs, ${idx.stats.totalTerms} terms)`);
  } catch (err) {
    console.error(`[MemorySearch] Failed to save index: ${err.message}`);
  }
}

/**
 * Tokenize text into searchable terms
 */
function tokenize(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Remove punctuation except hyphens
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Generate document ID
 */
function generateDocId(path, lineNum = 0) {
  return `${basename(path)}:${lineNum}`;
}

/**
 * Index a single entry
 */
export function indexEntry(entry, source) {
  const idx = loadIndex();

  // Generate doc ID
  const docId = entry.id || generateDocId(source, entry.lineNum || Date.now());

  // Skip if already indexed (unless content changed)
  if (idx.documents[docId] && idx.documents[docId].indexed === entry.ts) {
    return false;
  }

  // Extract searchable text
  const searchableText = [
    entry.content,
    entry.thought,
    entry.message,
    entry.summary,
    entry.title,
    entry.description,
    ...(entry.topics || []),
    ...(entry.tags || []),
  ].filter(Boolean).join(' ');

  // Tokenize
  const tokens = tokenize(searchableText);
  if (tokens.length === 0) return false;

  // Count term frequency
  const termFreq = {};
  tokens.forEach((token, position) => {
    if (!termFreq[token]) {
      termFreq[token] = { count: 0, positions: [] };
    }
    termFreq[token].count++;
    termFreq[token].positions.push(position);
  });

  // Add to index
  for (const [term, data] of Object.entries(termFreq)) {
    if (!idx.terms[term]) {
      idx.terms[term] = [];
    }

    // Remove old entry if exists
    idx.terms[term] = idx.terms[term].filter(e => e.docId !== docId);

    // Add new entry
    idx.terms[term].push({
      docId,
      score: data.count / tokens.length,  // TF score
      positions: data.positions.slice(0, 10),  // Keep first 10 positions
    });
  }

  // Store document metadata
  idx.documents[docId] = {
    path: source,
    type: entry.type || 'unknown',
    ts: entry.ts || new Date().toISOString(),
    indexed: entry.ts,
    title: entry.title || entry.thought?.slice(0, 50) || entry.content?.slice(0, 50),
    preview: (entry.content || entry.thought || entry.message || '').slice(0, 200),
  };

  idx.stats.totalDocs = Object.keys(idx.documents).length;
  indexDirty = true;

  return true;
}

/**
 * Index a JSONL file
 */
export function indexJsonlFile(filePath) {
  if (!existsSync(filePath)) return 0;

  let indexed = 0;
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return 0;

  const lines = content.split('\n');
  lines.forEach((line, lineNum) => {
    try {
      const entry = JSON.parse(line);
      entry.lineNum = lineNum;
      if (indexEntry(entry, filePath)) {
        indexed++;
      }
    } catch {
      // Skip invalid lines
    }
  });

  return indexed;
}

/**
 * Rebuild the entire index from scratch
 */
export function rebuildIndex() {
  console.log('[MemorySearch] Rebuilding index...');

  // Reset index
  index = createEmptyIndex();
  indexDirty = true;

  let totalIndexed = 0;

  // Index journal files
  if (existsSync(JOURNAL_DIR)) {
    const journalFiles = readdirSync(JOURNAL_DIR).filter(f => f.endsWith('.jsonl'));
    for (const file of journalFiles) {
      const count = indexJsonlFile(join(JOURNAL_DIR, file));
      totalIndexed += count;
      console.log(`[MemorySearch] Indexed ${count} entries from ${file}`);
    }
  }

  // Save the rebuilt index
  saveIndex();

  console.log(`[MemorySearch] Rebuild complete: ${totalIndexed} entries indexed`);
  return totalIndexed;
}

/**
 * Parse search query into structured format
 *
 * Supports:
 * - Simple terms: "hello world" -> AND(hello, world)
 * - Quoted phrases: "\"hello world\"" -> PHRASE("hello world")
 * - OR: "hello OR world" -> OR(hello, world)
 * - Exclusion: "-goodbye" -> NOT(goodbye)
 */
function parseQuery(queryString) {
  const query = {
    must: [],      // AND terms
    should: [],    // OR terms
    mustNot: [],   // NOT terms
    phrases: [],   // Exact phrases
  };

  // Extract quoted phrases first
  const phraseRegex = /"([^"]+)"/g;
  let match;
  while ((match = phraseRegex.exec(queryString)) !== null) {
    query.phrases.push(match[1].toLowerCase());
  }

  // Remove quoted phrases from query
  let remaining = queryString.replace(phraseRegex, ' ').trim();

  // Split by OR
  const orParts = remaining.split(/\s+OR\s+/i);

  if (orParts.length > 1) {
    // Handle OR query
    for (const part of orParts) {
      const tokens = tokenize(part);
      query.should.push(...tokens);
    }
  } else {
    // Handle AND query with possible exclusions
    const tokens = remaining.split(/\s+/);
    for (const token of tokens) {
      if (token.startsWith('-') && token.length > 1) {
        const term = token.slice(1).toLowerCase();
        if (term.length > 2) {
          query.mustNot.push(term);
        }
      } else {
        const terms = tokenize(token);
        query.must.push(...terms);
      }
    }
  }

  return query;
}

/**
 * Search the index
 *
 * @param {string} queryString - Search query
 * @param {Object} options - Search options
 * @param {string} options.type - Filter by entry type
 * @param {string} options.startDate - Filter entries after this date
 * @param {string} options.endDate - Filter entries before this date
 * @param {number} options.limit - Maximum results (default: 20)
 * @returns {Array} Search results with scores
 */
export function search(queryString, options = {}) {
  const { type, startDate, endDate, limit = 20 } = options;

  const idx = loadIndex();
  const query = parseQuery(queryString);

  // Score documents
  const scores = {};

  // Process MUST terms (AND)
  if (query.must.length > 0) {
    // Find documents that contain ALL must terms
    const mustDocs = new Set();
    let first = true;

    for (const term of query.must) {
      const termDocs = new Set((idx.terms[term] || []).map(e => e.docId));

      if (first) {
        termDocs.forEach(d => mustDocs.add(d));
        first = false;
      } else {
        // Intersection
        for (const doc of mustDocs) {
          if (!termDocs.has(doc)) {
            mustDocs.delete(doc);
          }
        }
      }
    }

    // Score matching documents
    for (const docId of mustDocs) {
      scores[docId] = 0;
      for (const term of query.must) {
        const termEntry = (idx.terms[term] || []).find(e => e.docId === docId);
        if (termEntry) {
          scores[docId] += termEntry.score;
        }
      }
    }
  }

  // Process SHOULD terms (OR)
  if (query.should.length > 0) {
    for (const term of query.should) {
      for (const entry of (idx.terms[term] || [])) {
        scores[entry.docId] = (scores[entry.docId] || 0) + entry.score;
      }
    }
  }

  // Process MUST NOT terms
  for (const term of query.mustNot) {
    for (const entry of (idx.terms[term] || [])) {
      delete scores[entry.docId];
    }
  }

  // Process phrases (check document content - both title and preview)
  if (query.phrases.length > 0) {
    for (const docId of Object.keys(scores)) {
      const doc = idx.documents[docId];
      if (!doc) continue;

      // Check both title and preview for phrase matches
      const searchableContent = [
        doc.preview || '',
        doc.title || '',
      ].join(' ').toLowerCase();

      for (const phrase of query.phrases) {
        if (!searchableContent.includes(phrase)) {
          delete scores[docId];
          break;
        }
      }
    }
  }

  // If ONLY phrases (no other terms), we need to find docs containing them
  if (query.phrases.length > 0 && query.must.length === 0 && query.should.length === 0) {
    // Search through all documents for phrase matches
    for (const [docId, doc] of Object.entries(idx.documents)) {
      if (scores[docId] !== undefined) continue; // Already scored

      const searchableContent = [
        doc.preview || '',
        doc.title || '',
      ].join(' ').toLowerCase();

      let allPhrasesMatch = true;
      for (const phrase of query.phrases) {
        if (!searchableContent.includes(phrase)) {
          allPhrasesMatch = false;
          break;
        }
      }

      if (allPhrasesMatch) {
        scores[docId] = 1; // Base score for phrase match
      }
    }
  }

  // Convert to results array
  let results = Object.entries(scores)
    .map(([docId, score]) => ({
      docId,
      score,
      ...idx.documents[docId],
    }))
    .filter(r => r.ts); // Filter out docs without metadata

  // Apply type filter
  if (type) {
    results = results.filter(r => r.type === type);
  }

  // Apply date filters
  if (startDate) {
    const start = new Date(startDate).getTime();
    results = results.filter(r => new Date(r.ts).getTime() >= start);
  }

  if (endDate) {
    const end = new Date(endDate).getTime();
    results = results.filter(r => new Date(r.ts).getTime() <= end);
  }

  // Sort by score (descending), then by date (descending)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.ts) - new Date(a.ts);
  });

  // Apply limit
  return results.slice(0, limit);
}

/**
 * Search by date range (returns all documents in range)
 */
export function searchByDate(startDate, endDate, options = {}) {
  const idx = loadIndex();
  const { limit = 20 } = options;

  let results = Object.entries(idx.documents)
    .map(([docId, doc]) => ({
      docId,
      score: 1,
      ...doc,
    }));

  // Apply date filters
  if (startDate) {
    const start = new Date(startDate).getTime();
    results = results.filter(r => new Date(r.ts).getTime() >= start);
  }

  if (endDate) {
    // Add one day to end date to make it inclusive
    const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000);
    results = results.filter(r => new Date(r.ts).getTime() <= end);
  }

  // Sort by date descending
  results.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return results.slice(0, limit);
}

/**
 * Search by type
 */
export function searchByType(type, options = {}) {
  const idx = loadIndex();

  let results = Object.entries(idx.documents)
    .filter(([_, doc]) => doc.type === type)
    .map(([docId, doc]) => ({
      docId,
      score: 1,
      ...doc,
    }));

  // Apply date filters
  if (options.startDate) {
    const start = new Date(options.startDate).getTime();
    results = results.filter(r => new Date(r.ts).getTime() >= start);
  }

  if (options.endDate) {
    const end = new Date(options.endDate).getTime();
    results = results.filter(r => new Date(r.ts).getTime() <= end);
  }

  // Sort by date descending
  results.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return results.slice(0, options.limit || 20);
}

/**
 * Get index statistics
 */
export function getStats() {
  const idx = loadIndex();
  return {
    totalDocs: idx.stats.totalDocs,
    totalTerms: idx.stats.totalTerms,
    lastUpdated: idx.lastUpdated,
    topTerms: Object.entries(idx.terms)
      .map(([term, entries]) => ({ term, count: entries.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };
}

/**
 * Auto-save index periodically
 */
let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveIndex();
    saveTimeout = null;
  }, 5000);  // Save after 5 seconds of inactivity
}

// Hook into indexEntry to schedule saves
const originalIndexEntry = indexEntry;
export { originalIndexEntry };

/**
 * Initialize the search system
 */
export function initSearch() {
  loadIndex();

  // Rebuild if index is empty or stale
  const idx = loadIndex();
  if (idx.stats.totalDocs === 0) {
    rebuildIndex();
  }

  console.log(`[MemorySearch] Initialized with ${idx.stats.totalDocs} documents`);
}

/**
 * Format search results for display
 */
export function formatResults(results) {
  return results.map(r => ({
    id: r.docId,
    type: r.type,
    date: r.ts,
    title: r.title,
    preview: r.preview,
    score: r.score.toFixed(3),
  }));
}

export default {
  search,
  searchByDate,
  searchByType,
  indexEntry,
  indexJsonlFile,
  rebuildIndex,
  getStats,
  initSearch,
  formatResults,
};
