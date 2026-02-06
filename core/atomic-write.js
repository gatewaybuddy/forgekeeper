// Atomic file write utilities for Forgekeeper
// Prevents file corruption on crash by writing to a temp file then renaming.
import { writeFileSync, renameSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Write data to a file atomically.
 * Writes to a .tmp sibling file first, then renames over the target.
 * On crash mid-write, the original file remains intact.
 */
export function atomicWriteFileSync(filePath, data, encoding = 'utf-8') {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data, encoding);
  renameSync(tmpPath, filePath);
}

/**
 * Async version of atomic write.
 */
export async function atomicWriteFile(filePath, data, encoding = 'utf-8') {
  const { writeFile, rename, mkdir } = await import('fs/promises');
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, data, encoding);
  await rename(tmpPath, filePath);
}

/**
 * Safely append to a JSONL file.
 * appendFileSync is atomic for small writes on most OSes,
 * so this is a thin wrapper that ensures the directory exists.
 */
export function safeAppendFileSync(filePath, data, encoding = 'utf-8') {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  appendFileSync(filePath, data, encoding);
}

export default { atomicWriteFileSync, atomicWriteFile, safeAppendFileSync };
