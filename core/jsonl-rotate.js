// JSONL file rotation for Forgekeeper
// Prevents unbounded growth of append-only log files.
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, unlinkSync } from 'fs';
import { atomicWriteFileSync } from './atomic-write.js';

// Default: rotate when file exceeds 2MB, keep 2 rotated copies
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_ROTATIONS = 2;

/**
 * Check if a JSONL file needs rotation and rotate if so.
 * Call this after appending to a JSONL file.
 *
 * Rotation scheme: file.jsonl -> file.jsonl.1 -> file.jsonl.2 (deleted)
 *
 * @param {string} filePath - Path to the JSONL file
 * @param {Object} options
 * @param {number} options.maxBytes - Max file size before rotation (default 2MB)
 * @param {number} options.maxRotations - Number of rotated files to keep (default 2)
 * @param {number} options.keepLines - If set, truncate to this many most-recent lines instead of rotating
 */
export function rotateIfNeeded(filePath, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRotations = options.maxRotations ?? DEFAULT_MAX_ROTATIONS;

  if (!existsSync(filePath)) return false;

  let size;
  try {
    size = statSync(filePath).size;
  } catch {
    return false;
  }

  if (size < maxBytes) return false;

  // If keepLines is set, truncate the file to the last N lines
  if (options.keepLines) {
    return truncateToLastN(filePath, options.keepLines);
  }

  // Otherwise, do file rotation
  try {
    // Shift existing rotated files: .2 -> deleted, .1 -> .2, current -> .1
    for (let i = maxRotations; i >= 1; i--) {
      const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
      const dst = `${filePath}.${i}`;
      if (i === maxRotations && existsSync(dst)) {
        unlinkSync(dst);
      }
      if (existsSync(src)) {
        renameSync(src, dst);
      }
    }
    // Create empty new file
    writeFileSync(filePath, '');
    return true;
  } catch (err) {
    console.error(`[JSONL Rotate] Failed to rotate ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Truncate a JSONL file to the last N lines.
 * More space-efficient than rotation for files where old data is rarely needed.
 */
export function truncateToLastN(filePath, keepLines) {
  if (!existsSync(filePath)) return false;

  try {
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return false;

    const lines = content.split('\n');
    if (lines.length <= keepLines) return false;

    const kept = lines.slice(-keepLines);
    atomicWriteFileSync(filePath, kept.join('\n') + '\n');
    console.log(`[JSONL Rotate] Truncated ${filePath}: ${lines.length} -> ${kept.length} lines`);
    return true;
  } catch (err) {
    console.error(`[JSONL Rotate] Failed to truncate ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Read only the last N lines from a JSONL file, parsed as JSON.
 * Much more efficient than reading the entire file for recent-only queries.
 */
export function readLastN(filePath, n = 10) {
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];

    const lines = content.split('\n');
    const lastLines = lines.slice(-n);

    return lastLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export default { rotateIfNeeded, truncateToLastN, readLastN };
