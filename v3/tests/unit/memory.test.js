// Tests for core/memory.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = join(__dirname, '..', 'test-data');

// Set up test environment
process.env.FK_DATA_DIR = TEST_DATA_DIR;

describe('Memory Module', async () => {
  before(() => {
    // Create test data directories
    const dirs = ['conversations', 'tasks', 'goals', 'learnings'];
    for (const dir of dirs) {
      const path = join(TEST_DATA_DIR, dir);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
  });

  after(() => {
    // Clean up test data
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('Tasks', async () => {
    it('should create a task with default values', async () => {
      // Dynamic import to pick up the test env
      const { tasks } = await import('../../core/memory.js');

      const task = tasks.create({
        description: 'Test task',
      });

      assert.ok(task.id, 'Task should have an ID');
      assert.strictEqual(task.description, 'Test task');
      assert.strictEqual(task.status, 'pending');
      assert.strictEqual(task.origin, 'user');
      assert.ok(task.created, 'Task should have a created timestamp');
      assert.ok(Array.isArray(task.attempts), 'Task should have attempts array');
    });

    it('should retrieve a created task', async () => {
      const { tasks } = await import('../../core/memory.js');

      const created = tasks.create({
        description: 'Retrievable task',
        tags: ['test'],
      });

      const retrieved = tasks.get(created.id);

      assert.strictEqual(retrieved.id, created.id);
      assert.strictEqual(retrieved.description, 'Retrievable task');
      assert.deepStrictEqual(retrieved.tags, ['test']);
    });

    it('should update a task', async () => {
      const { tasks } = await import('../../core/memory.js');

      const task = tasks.create({ description: 'Updateable task' });
      // Wait a tiny bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      const updated = tasks.update(task.id, { status: 'active' });

      assert.strictEqual(updated.status, 'active');
      // Updated timestamp should exist
      assert.ok(updated.updated);
    });

    it('should list pending tasks', async () => {
      const { tasks } = await import('../../core/memory.js');

      const t1 = tasks.create({ description: 'List Pending 1' });
      const t2 = tasks.create({ description: 'List Pending 2' });

      const pending = tasks.pending();

      // Check that our created tasks are in the pending list
      const ids = pending.map(t => t.id);
      assert.ok(ids.includes(t1.id), 'Should include first task');
      assert.ok(ids.includes(t2.id), 'Should include second task');
      // All pending tasks should have status 'pending'
      const allPending = pending.filter(t => t.status === 'pending');
      assert.ok(allPending.length >= 2, 'Should have at least 2 pending tasks');
    });

    it('should add attempts to a task', async () => {
      const { tasks } = await import('../../core/memory.js');

      const task = tasks.create({ description: 'Task with attempts' });
      const updated = tasks.addAttempt(task.id, {
        success: false,
        error: 'Test error',
      });

      assert.strictEqual(updated.attempts.length, 1);
      assert.strictEqual(updated.attempts[0].success, false);
      assert.strictEqual(updated.attempts[0].error, 'Test error');
    });
  });

  describe('Goals', async () => {
    it('should create a goal with default values', async () => {
      const { goals } = await import('../../core/memory.js');

      const goal = goals.create({
        description: 'Test goal',
      });

      assert.ok(goal.id, 'Goal should have an ID');
      assert.strictEqual(goal.description, 'Test goal');
      assert.strictEqual(goal.status, 'proposed');
      assert.strictEqual(goal.priority, 'medium');
      assert.ok(Array.isArray(goal.tasks), 'Goal should have tasks array');
    });

    it('should add a task to a goal', async () => {
      const { goals, tasks } = await import('../../core/memory.js');

      const goal = goals.create({ description: 'Goal with tasks' });
      const task = tasks.create({ description: 'Task for goal', goal_id: goal.id });

      const updated = goals.addTask(goal.id, task.id);

      assert.ok(updated.tasks.includes(task.id));
    });

    it('should not duplicate task in goal', async () => {
      const { goals, tasks } = await import('../../core/memory.js');

      const goal = goals.create({ description: 'No duplicate goal' });
      const task = tasks.create({ description: 'Single task' });

      goals.addTask(goal.id, task.id);
      goals.addTask(goal.id, task.id); // Add again

      const retrieved = goals.get(goal.id);
      const count = retrieved.tasks.filter(t => t === task.id).length;

      assert.strictEqual(count, 1, 'Task should only appear once');
    });
  });

  describe('Learnings', async () => {
    it('should add a learning', async () => {
      const { learnings } = await import('../../core/memory.js');

      const learning = learnings.add({
        type: 'outcome',
        context: 'Test context',
        observation: 'Test observation',
        applies_to: ['test', 'memory'],
        confidence: 0.8,
      });

      assert.ok(learning.id);
      assert.strictEqual(learning.observation, 'Test observation');
      assert.strictEqual(learning.confidence, 0.8);
    });

    it('should find learnings by tags', async () => {
      const { learnings } = await import('../../core/memory.js');

      learnings.add({
        observation: 'Git learning',
        applies_to: ['git'],
        confidence: 0.9,
      });

      const found = learnings.find(['git'], 0.5);

      assert.ok(found.some(l => l.observation === 'Git learning'));
    });

    it('should filter by confidence threshold', async () => {
      const { learnings } = await import('../../core/memory.js');

      learnings.add({
        observation: 'Low confidence',
        applies_to: ['threshold-test'],
        confidence: 0.3,
      });

      learnings.add({
        observation: 'High confidence',
        applies_to: ['threshold-test'],
        confidence: 0.9,
      });

      const found = learnings.find(['threshold-test'], 0.7);

      assert.ok(!found.some(l => l.observation === 'Low confidence'));
      assert.ok(found.some(l => l.observation === 'High confidence'));
    });
  });

  describe('Approvals', async () => {
    it('should request an approval', async () => {
      const { approvals } = await import('../../core/memory.js');

      const approval = approvals.request({
        type: 'test',
        description: 'Test approval',
        reason: 'Testing',
      });

      assert.ok(approval.id);
      assert.strictEqual(approval.status, 'pending');
      assert.strictEqual(approval.type, 'test');
    });

    it('should list pending approvals', async () => {
      const { approvals } = await import('../../core/memory.js');

      approvals.request({ description: 'Pending approval 1' });

      const pending = approvals.pending();

      assert.ok(pending.length >= 1);
      assert.ok(pending.every(a => a.status === 'pending'));
    });

    it('should resolve an approval', async () => {
      const { approvals } = await import('../../core/memory.js');

      const approval = approvals.request({ description: 'To be resolved' });
      const resolved = approvals.resolve(approval.id, 'approved', 'test-user');

      assert.strictEqual(resolved.status, 'approved');
      assert.strictEqual(resolved.resolvedBy, 'test-user');
      assert.ok(resolved.resolvedAt);
    });
  });
});
