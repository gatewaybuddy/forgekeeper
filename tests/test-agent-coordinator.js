// Tests for core/agent-coordinator.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CoordinatorLock } from '../core/agent-coordinator.js';

describe('CoordinatorLock', () => {
  let coordinator;

  beforeEach(() => {
    // Fresh coordinator for each test with short expiry for testing
    coordinator = new CoordinatorLock({ expiryMs: 100 });
  });

  describe('acquire - basic behavior', () => {
    it('should acquire a lock for an unlocked task', () => {
      const result = coordinator.acquire('task-1', 'agent-A');
      assert.strictEqual(result, true);
    });

    it('should allow same agent to re-acquire their own lock', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.acquire('task-1', 'agent-A');
      assert.strictEqual(result, true);
    });

    it('should deny lock if held by another agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.acquire('task-1', 'agent-B');
      assert.strictEqual(result, false);
    });

    it('should allow acquiring multiple different tasks', () => {
      const result1 = coordinator.acquire('task-1', 'agent-A');
      const result2 = coordinator.acquire('task-2', 'agent-A');
      const result3 = coordinator.acquire('task-3', 'agent-B');
      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
      assert.strictEqual(result3, true);
    });

    it('should emit lock:acquired event', () => {
      const events = [];
      coordinator.on('lock:acquired', (data) => events.push(data));

      coordinator.acquire('task-1', 'agent-A');

      assert.strictEqual(events.length, 1);
      assert.deepStrictEqual(events[0], { taskId: 'task-1', agentId: 'agent-A' });
    });

    it('should not emit event when re-acquiring own lock', () => {
      coordinator.acquire('task-1', 'agent-A');

      const events = [];
      coordinator.on('lock:acquired', (data) => events.push(data));
      coordinator.acquire('task-1', 'agent-A');

      assert.strictEqual(events.length, 0);
    });

    it('should refresh timestamp when re-acquiring own lock', async () => {
      coordinator.acquire('task-1', 'agent-A');
      const firstTime = coordinator.locks.get('task-1').acquiredAt;

      // Wait a bit to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));
      coordinator.acquire('task-1', 'agent-A');
      const secondTime = coordinator.locks.get('task-1').acquiredAt;

      assert.notStrictEqual(firstTime, secondTime);
    });
  });

  describe('release - basic behavior', () => {
    it('should release a lock held by the agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.release('task-1', 'agent-A');
      assert.strictEqual(result, true);
    });

    it('should return false when releasing unlocked task', () => {
      const result = coordinator.release('task-1', 'agent-A');
      assert.strictEqual(result, false);
    });

    it('should deny release if held by different agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.release('task-1', 'agent-B');
      assert.strictEqual(result, false);
    });

    it('should allow another agent to acquire after release', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.release('task-1', 'agent-A');
      const result = coordinator.acquire('task-1', 'agent-B');
      assert.strictEqual(result, true);
    });

    it('should emit lock:released event', () => {
      coordinator.acquire('task-1', 'agent-A');

      const events = [];
      coordinator.on('lock:released', (data) => events.push(data));
      coordinator.release('task-1', 'agent-A');

      assert.strictEqual(events.length, 1);
      assert.deepStrictEqual(events[0], { taskId: 'task-1', agentId: 'agent-A' });
    });
  });

  describe('expiry scenarios', () => {
    it('should allow takeover of expired lock', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      // Wait for lock to expire
      await new Promise((r) => setTimeout(r, 60));

      const result = shortExpiry.acquire('task-1', 'agent-B');
      assert.strictEqual(result, true);
    });

    it('should emit lock:expired event on takeover', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      await new Promise((r) => setTimeout(r, 60));

      const events = [];
      shortExpiry.on('lock:expired', (data) => events.push(data));
      shortExpiry.acquire('task-1', 'agent-B');

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].taskId, 'task-1');
      assert.strictEqual(events[0].previousAgent, 'agent-A');
      assert.strictEqual(events[0].newAgent, 'agent-B');
    });

    it('should deny lock if not expired', async () => {
      const longExpiry = new CoordinatorLock({ expiryMs: 10000 });
      longExpiry.acquire('task-1', 'agent-A');

      const result = longExpiry.acquire('task-1', 'agent-B');
      assert.strictEqual(result, false);
    });

    it('should use default expiry when not specified', () => {
      const defaultCoord = new CoordinatorLock();
      assert.strictEqual(defaultCoord.expiryMs, 5 * 60 * 1000); // 5 minutes
    });

    it('should correctly identify expired locks via isExpired', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      const lockBefore = shortExpiry.locks.get('task-1');
      assert.strictEqual(shortExpiry.isExpired(lockBefore), false);

      await new Promise((r) => setTimeout(r, 60));

      assert.strictEqual(shortExpiry.isExpired(lockBefore), true);
    });

    it('should treat null/undefined locks as expired', () => {
      assert.strictEqual(coordinator.isExpired(null), true);
      assert.strictEqual(coordinator.isExpired(undefined), true);
      assert.strictEqual(coordinator.isExpired({}), true);
    });
  });

  describe('heartbeat', () => {
    it('should refresh lock timestamp', async () => {
      coordinator.acquire('task-1', 'agent-A');
      const firstTime = coordinator.locks.get('task-1').acquiredAt;

      await new Promise((r) => setTimeout(r, 10));
      coordinator.heartbeat('task-1', 'agent-A');
      const secondTime = coordinator.locks.get('task-1').acquiredAt;

      assert.notStrictEqual(firstTime, secondTime);
    });

    it('should return true when heartbeat succeeds', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.heartbeat('task-1', 'agent-A');
      assert.strictEqual(result, true);
    });

    it('should return false for unlocked task', () => {
      const result = coordinator.heartbeat('task-1', 'agent-A');
      assert.strictEqual(result, false);
    });

    it('should deny heartbeat from wrong agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.heartbeat('task-1', 'agent-B');
      assert.strictEqual(result, false);
    });

    it('should emit lock:heartbeat event', () => {
      coordinator.acquire('task-1', 'agent-A');

      const events = [];
      coordinator.on('lock:heartbeat', (data) => events.push(data));
      coordinator.heartbeat('task-1', 'agent-A');

      assert.strictEqual(events.length, 1);
      assert.deepStrictEqual(events[0], { taskId: 'task-1', agentId: 'agent-A' });
    });

    it('should prevent expiry when heartbeat is sent', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      // Send heartbeat before expiry
      await new Promise((r) => setTimeout(r, 30));
      shortExpiry.heartbeat('task-1', 'agent-A');

      // Try to acquire after original expiry time
      await new Promise((r) => setTimeout(r, 30));
      const result = shortExpiry.acquire('task-1', 'agent-B');
      assert.strictEqual(result, false); // Still locked by agent-A
    });
  });

  describe('isLocked', () => {
    it('should return agentId for locked task', () => {
      coordinator.acquire('task-1', 'agent-A');
      const result = coordinator.isLocked('task-1');
      assert.strictEqual(result, 'agent-A');
    });

    it('should return null for unlocked task', () => {
      const result = coordinator.isLocked('task-1');
      assert.strictEqual(result, null);
    });

    it('should return null after release', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.release('task-1', 'agent-A');
      const result = coordinator.isLocked('task-1');
      assert.strictEqual(result, null);
    });
  });

  describe('getAgentLocks', () => {
    it('should return all tasks locked by an agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.acquire('task-2', 'agent-A');
      coordinator.acquire('task-3', 'agent-B');

      const locks = coordinator.getAgentLocks('agent-A');
      assert.deepStrictEqual(locks.sort(), ['task-1', 'task-2']);
    });

    it('should return empty array for agent with no locks', () => {
      coordinator.acquire('task-1', 'agent-A');
      const locks = coordinator.getAgentLocks('agent-B');
      assert.deepStrictEqual(locks, []);
    });

    it('should return empty array when no locks exist', () => {
      const locks = coordinator.getAgentLocks('agent-A');
      assert.deepStrictEqual(locks, []);
    });
  });

  describe('releaseAll', () => {
    it('should release all locks held by an agent', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.acquire('task-2', 'agent-A');
      coordinator.acquire('task-3', 'agent-B');

      const count = coordinator.releaseAll('agent-A');

      assert.strictEqual(count, 2);
      assert.strictEqual(coordinator.isLocked('task-1'), null);
      assert.strictEqual(coordinator.isLocked('task-2'), null);
      assert.strictEqual(coordinator.isLocked('task-3'), 'agent-B');
    });

    it('should return 0 when agent has no locks', () => {
      coordinator.acquire('task-1', 'agent-A');
      const count = coordinator.releaseAll('agent-B');
      assert.strictEqual(count, 0);
    });

    it('should emit lock:released for each released lock', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.acquire('task-2', 'agent-A');

      const events = [];
      coordinator.on('lock:released', (data) => events.push(data));
      coordinator.releaseAll('agent-A');

      assert.strictEqual(events.length, 2);
      const taskIds = events.map((e) => e.taskId).sort();
      assert.deepStrictEqual(taskIds, ['task-1', 'task-2']);
    });
  });

  describe('getStatus', () => {
    it('should return status with no locks', () => {
      const status = coordinator.getStatus();
      assert.strictEqual(status.totalLocks, 0);
      assert.strictEqual(status.expiryMs, 100);
      assert.deepStrictEqual(status.locks, []);
    });

    it('should return status with active locks', () => {
      coordinator.acquire('task-1', 'agent-A');
      coordinator.acquire('task-2', 'agent-B');

      const status = coordinator.getStatus();

      assert.strictEqual(status.totalLocks, 2);
      assert.strictEqual(status.locks.length, 2);

      const task1Lock = status.locks.find((l) => l.taskId === 'task-1');
      assert.strictEqual(task1Lock.agentId, 'agent-A');
      assert.ok(task1Lock.acquiredAt);
      assert.ok(typeof task1Lock.heldMs === 'number');
      assert.strictEqual(task1Lock.expired, false);
    });

    it('should mark expired locks in status', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      await new Promise((r) => setTimeout(r, 60));

      const status = shortExpiry.getStatus();
      assert.strictEqual(status.locks[0].expired, true);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired locks', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');
      shortExpiry.acquire('task-2', 'agent-B');

      await new Promise((r) => setTimeout(r, 60));

      const count = shortExpiry.cleanupExpired();

      assert.strictEqual(count, 2);
      assert.strictEqual(shortExpiry.isLocked('task-1'), null);
      assert.strictEqual(shortExpiry.isLocked('task-2'), null);
    });

    it('should not remove active locks', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 100 });
      shortExpiry.acquire('task-1', 'agent-A');

      await new Promise((r) => setTimeout(r, 30));
      shortExpiry.acquire('task-2', 'agent-B'); // Acquired later

      await new Promise((r) => setTimeout(r, 80)); // task-1 expired, task-2 not

      const count = shortExpiry.cleanupExpired();

      assert.strictEqual(count, 1);
      assert.strictEqual(shortExpiry.isLocked('task-1'), null);
      assert.strictEqual(shortExpiry.isLocked('task-2'), 'agent-B');
    });

    it('should emit lock:expired for each cleaned lock', async () => {
      const shortExpiry = new CoordinatorLock({ expiryMs: 50 });
      shortExpiry.acquire('task-1', 'agent-A');

      await new Promise((r) => setTimeout(r, 60));

      const events = [];
      shortExpiry.on('lock:expired', (data) => events.push(data));
      shortExpiry.cleanupExpired();

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].taskId, 'task-1');
      assert.strictEqual(events[0].agentId, 'agent-A');
    });

    it('should return 0 when no locks are expired', () => {
      coordinator.acquire('task-1', 'agent-A');
      const count = coordinator.cleanupExpired();
      assert.strictEqual(count, 0);
    });

    it('should return 0 when no locks exist', () => {
      const count = coordinator.cleanupExpired();
      assert.strictEqual(count, 0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string taskId', () => {
      const result = coordinator.acquire('', 'agent-A');
      assert.strictEqual(result, true);
      assert.strictEqual(coordinator.isLocked(''), 'agent-A');
    });

    it('should handle empty string agentId', () => {
      const result = coordinator.acquire('task-1', '');
      assert.strictEqual(result, true);
      assert.strictEqual(coordinator.isLocked('task-1'), '');
    });

    it('should handle special characters in IDs', () => {
      const taskId = 'task/with:special@chars#!';
      const agentId = 'agent-with-dashes_and_underscores';
      const result = coordinator.acquire(taskId, agentId);
      assert.strictEqual(result, true);
      assert.strictEqual(coordinator.isLocked(taskId), agentId);
    });

    it('should handle rapid acquire/release cycles', () => {
      for (let i = 0; i < 100; i++) {
        coordinator.acquire('task-1', 'agent-A');
        coordinator.release('task-1', 'agent-A');
      }
      assert.strictEqual(coordinator.isLocked('task-1'), null);
    });

    it('should handle many concurrent locks', () => {
      for (let i = 0; i < 100; i++) {
        coordinator.acquire(`task-${i}`, `agent-${i % 10}`);
      }
      assert.strictEqual(coordinator.getStatus().totalLocks, 100);
    });
  });

  describe('event emitter behavior', () => {
    it('should support multiple event listeners', () => {
      const events1 = [];
      const events2 = [];
      coordinator.on('lock:acquired', (data) => events1.push(data));
      coordinator.on('lock:acquired', (data) => events2.push(data));

      coordinator.acquire('task-1', 'agent-A');

      assert.strictEqual(events1.length, 1);
      assert.strictEqual(events2.length, 1);
    });

    it('should support removing event listeners', () => {
      const events = [];
      const listener = (data) => events.push(data);
      coordinator.on('lock:acquired', listener);
      coordinator.off('lock:acquired', listener);

      coordinator.acquire('task-1', 'agent-A');

      assert.strictEqual(events.length, 0);
    });
  });
});
