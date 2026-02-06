// Agent Coordinator - Task locking for multi-agent coordination
import { EventEmitter } from 'events';

// Lock expiration timeout (5 minutes)
const LOCK_EXPIRY_MS = 5 * 60 * 1000;

/**
 * CoordinatorLock - Manages task locks between agents to prevent conflicts
 */
export class CoordinatorLock extends EventEmitter {
  constructor(options = {}) {
    super();
    this.locks = new Map(); // taskId -> { agentId, acquiredAt }
    this.expiryMs = options.expiryMs ?? LOCK_EXPIRY_MS;
  }

  /**
   * Check if a lock is expired
   * @param {Object} lock - The lock to check
   * @returns {boolean} True if expired
   */
  isExpired(lock) {
    if (!lock?.acquiredAt) return true;
    const acquiredTime = new Date(lock.acquiredAt).getTime();
    return Date.now() - acquiredTime > this.expiryMs;
  }

  /**
   * Acquire a lock for a task
   * @param {string} taskId - The task to lock
   * @param {string} agentId - The agent requesting the lock
   * @returns {boolean} True if lock acquired, false if already held by another agent
   */
  acquire(taskId, agentId) {
    const existing = this.locks.get(taskId);

    if (existing) {
      // Check if lock is expired - allow takeover
      if (this.isExpired(existing)) {
        const previousAgent = existing.agentId;
        console.log(`[CoordinatorLock] Lock expired: task ${taskId} was held by ${previousAgent}, takeover by ${agentId}`);
        this.emit('lock:expired', { taskId, previousAgent, newAgent: agentId });
        // Fall through to acquire the lock
      } else if (existing.agentId === agentId) {
        // Same agent already holds the lock - refresh it
        existing.acquiredAt = new Date().toISOString();
        return true;
      } else {
        // Another agent holds a valid (non-expired) lock
        console.log(`[CoordinatorLock] Lock denied: task ${taskId} held by ${existing.agentId}, requested by ${agentId}`);
        return false;
      }
    }

    // Acquire the lock with ISO timestamp
    this.locks.set(taskId, {
      agentId,
      acquiredAt: new Date().toISOString(),
    });

    console.log(`[CoordinatorLock] Lock acquired: task ${taskId} by ${agentId}`);
    this.emit('lock:acquired', { taskId, agentId });
    return true;
  }

  /**
   * Release a lock for a task
   * @param {string} taskId - The task to unlock
   * @param {string} agentId - The agent releasing the lock
   * @returns {boolean} True if released, false if lock not held by this agent
   */
  release(taskId, agentId) {
    const existing = this.locks.get(taskId);

    if (!existing) {
      console.log(`[CoordinatorLock] Release ignored: task ${taskId} not locked`);
      return false;
    }

    if (existing.agentId !== agentId) {
      console.log(`[CoordinatorLock] Release denied: task ${taskId} held by ${existing.agentId}, not ${agentId}`);
      return false;
    }

    this.locks.delete(taskId);
    console.log(`[CoordinatorLock] Lock released: task ${taskId} by ${agentId}`);
    this.emit('lock:released', { taskId, agentId });
    return true;
  }

  /**
   * Refresh a lock's timestamp to prevent expiry (heartbeat)
   * @param {string} taskId - The task to refresh
   * @param {string} agentId - The agent holding the lock
   * @returns {boolean} True if refreshed, false if lock not held by this agent
   */
  heartbeat(taskId, agentId) {
    const existing = this.locks.get(taskId);

    if (!existing) {
      console.log(`[CoordinatorLock] Heartbeat ignored: task ${taskId} not locked`);
      return false;
    }

    if (existing.agentId !== agentId) {
      console.log(`[CoordinatorLock] Heartbeat denied: task ${taskId} held by ${existing.agentId}, not ${agentId}`);
      return false;
    }

    existing.acquiredAt = new Date().toISOString();
    console.log(`[CoordinatorLock] Heartbeat: task ${taskId} refreshed by ${agentId}`);
    this.emit('lock:heartbeat', { taskId, agentId });
    return true;
  }

  /**
   * Check if a task is locked
   * @param {string} taskId - The task to check
   * @returns {string|null} The agentId holding the lock, or null if unlocked
   */
  isLocked(taskId) {
    const lock = this.locks.get(taskId);
    return lock ? lock.agentId : null;
  }

  /**
   * Get all locks held by an agent
   * @param {string} agentId - The agent to query
   * @returns {string[]} Array of taskIds locked by this agent
   */
  getAgentLocks(agentId) {
    const tasks = [];
    for (const [taskId, lock] of this.locks) {
      if (lock.agentId === agentId) {
        tasks.push(taskId);
      }
    }
    return tasks;
  }

  /**
   * Release all locks held by an agent (e.g., on agent crash)
   * @param {string} agentId - The agent whose locks to release
   * @returns {number} Number of locks released
   */
  releaseAll(agentId) {
    const tasks = this.getAgentLocks(agentId);
    for (const taskId of tasks) {
      this.locks.delete(taskId);
      this.emit('lock:released', { taskId, agentId });
    }
    if (tasks.length > 0) {
      console.log(`[CoordinatorLock] Released ${tasks.length} locks for agent ${agentId}`);
    }
    return tasks.length;
  }

  /**
   * Get lock status summary
   * @returns {Object} Summary of current locks
   */
  getStatus() {
    const lockList = [];
    for (const [taskId, lock] of this.locks) {
      const acquiredTime = new Date(lock.acquiredAt).getTime();
      const heldMs = Date.now() - acquiredTime;
      lockList.push({
        taskId,
        agentId: lock.agentId,
        acquiredAt: lock.acquiredAt,
        heldMs,
        expired: heldMs > this.expiryMs,
      });
    }
    return {
      totalLocks: this.locks.size,
      expiryMs: this.expiryMs,
      locks: lockList,
    };
  }

  /**
   * Clean up all expired locks
   * @returns {number} Number of expired locks cleaned up
   */
  cleanupExpired() {
    const expired = [];
    for (const [taskId, lock] of this.locks) {
      if (this.isExpired(lock)) {
        expired.push({ taskId, agentId: lock.agentId });
      }
    }
    for (const { taskId, agentId } of expired) {
      this.locks.delete(taskId);
      this.emit('lock:expired', { taskId, agentId });
    }
    if (expired.length > 0) {
      console.log(`[CoordinatorLock] Cleaned up ${expired.length} expired locks`);
    }
    return expired.length;
  }
}

export default CoordinatorLock;
