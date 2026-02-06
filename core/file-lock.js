// Simple per-file async mutex for read-modify-write operations.
// Prevents concurrent modifications when async operations are involved.
//
// Note: Synchronous readFileSync/writeFileSync operations in a single Node.js
// process cannot interleave, so they are inherently safe. This lock is for
// async code paths (or future async migrations) where read-modify-write
// sequences span multiple event loop ticks.

const locks = new Map();

/**
 * Acquire a lock on a file path, execute the callback, then release.
 * If the lock is already held, waits until it's released.
 *
 * @param {string} key - Lock key (typically a file path)
 * @param {Function} fn - Async function to execute while holding the lock
 * @returns {Promise<*>} - Result of fn()
 */
export async function withLock(key, fn) {
  while (locks.has(key)) {
    await locks.get(key);
  }

  let resolve;
  const promise = new Promise(r => { resolve = r; });
  locks.set(key, promise);

  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve();
  }
}

export default { withLock };
