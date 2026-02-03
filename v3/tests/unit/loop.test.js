// Tests for core/loop.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = join(__dirname, '..', 'test-data-loop');

// Set up test environment
process.env.FK_DATA_DIR = TEST_DATA_DIR;
process.env.FK_LOOP_INTERVAL_MS = '60000'; // Long interval to prevent auto-ticks

describe('Loop Module', async () => {
  before(() => {
    const dirs = ['conversations', 'tasks', 'goals', 'learnings'];
    for (const dir of dirs) {
      const path = join(TEST_DATA_DIR, dir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
  });

  after(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('Event System', async () => {
    it('should register and emit events', async () => {
      const { on, emit } = await import('../../core/loop.js');

      let received = null;
      on('test:event', (data) => {
        received = data;
      });

      emit('test:event', { message: 'hello' });

      assert.deepStrictEqual(received, { message: 'hello' });
    });

    it('should support multiple listeners', async () => {
      const { on, emit } = await import('../../core/loop.js');

      let count = 0;
      on('test:multi', () => count++);
      on('test:multi', () => count++);

      emit('test:multi', {});

      assert.strictEqual(count, 2);
    });

    it('should handle listener errors gracefully', async () => {
      const { on, emit } = await import('../../core/loop.js');

      let afterError = false;
      on('test:error', () => {
        throw new Error('Listener error');
      });
      on('test:error', () => {
        afterError = true;
      });

      // Should not throw
      emit('test:error', {});

      assert.strictEqual(afterError, true);
    });
  });

  describe('Status', async () => {
    it('should return status object', async () => {
      const { status } = await import('../../core/loop.js');

      const s = status();

      assert.ok('running' in s);
      assert.ok('currentTask' in s);
      assert.ok('pendingTasks' in s);
      assert.ok('activeGoals' in s);
      assert.ok('pendingApprovals' in s);
    });
  });

  describe('Task Creation', async () => {
    it('should create task via createAndRun', async () => {
      const { createAndRun } = await import('../../core/loop.js');
      const { tasks } = await import('../../core/memory.js');

      const task = await createAndRun('Test task from loop', {
        immediate: false, // Don't actually run it
        tags: ['test'],
      });

      assert.ok(task.id);
      assert.strictEqual(task.description, 'Test task from loop');
      assert.strictEqual(task.origin, 'user');

      // Verify it was saved
      const retrieved = tasks.get(task.id);
      assert.ok(retrieved);
    });
  });

  describe('Start/Stop', async () => {
    it('should start and stop without error', async () => {
      const { start, stop, status } = await import('../../core/loop.js');

      start();
      const runningStatus = status();
      assert.strictEqual(runningStatus.running, true);

      stop();
      const stoppedStatus = status();
      assert.strictEqual(stoppedStatus.running, false);
    });

    it('should be idempotent on start', async () => {
      const { start, stop, status } = await import('../../core/loop.js');

      start();
      start(); // Second call should be no-op
      const s = status();
      assert.strictEqual(s.running, true);

      stop();
    });
  });
});
