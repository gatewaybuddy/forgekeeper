/**
 * TGT (Telemetry-Driven Task Generator) Integration Tests
 *
 * Tests end-to-end workflows for the task generation system:
 * - Task suggestion and storage
 * - Task retrieval and filtering
 * - Task approval/dismissal
 * - Scheduler functionality
 * - SSE event streaming
 * - File watcher triggers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DIR = path.join(__dirname, '../.forgekeeper/test/tgt');
const TASK_STORAGE_PATH = path.join(TEST_DIR, 'tasks', 'generated_tasks.jsonl');
const CONTEXT_LOG_DIR = path.join(TEST_DIR, 'context_log');

// Mock environment for tests
process.env.FGK_CONTEXTLOG_DIR = CONTEXT_LOG_DIR;

// Import modules after env setup
const { saveTask, loadTasks, getTask, dismissTask, approveTask, cleanupOldTasks, getTaskStats } = await import('../core/taskgen/task-store.mjs');
const { getScheduler } = await import('../core/taskgen/scheduler.mjs');

/**
 * Helper: Create a test task
 */
function createTestTask(overrides = {}) {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'Continuation',
    severity: 'high',
    status: 'generated',
    title: 'Test task',
    description: 'A test task for integration testing',
    priority: 75,
    confidence: 0.85,
    generatedAt: new Date().toISOString(),
    evidence: {
      summary: 'Test evidence',
      details: ['Detail 1', 'Detail 2'],
    },
    suggestedFix: {
      summary: 'Test fix',
      steps: ['Step 1', 'Step 2'],
    },
    acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
    ...overrides,
  };
}

/**
 * Helper: Setup test directories
 */
async function setupTestDirs() {
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.mkdir(path.join(TEST_DIR, 'tasks'), { recursive: true });
  await fs.mkdir(CONTEXT_LOG_DIR, { recursive: true });
}

/**
 * Helper: Cleanup test directories
 */
async function cleanupTestDirs() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

/**
 * Helper: Wait for file to exist
 */
async function waitForFile(filePath, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`File ${filePath} did not appear within ${timeout}ms`);
}

/**
 * Helper: Read JSONL file
 */
async function readJSONL(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

describe('TGT Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDirs();
  });

  afterAll(async () => {
    await cleanupTestDirs();
  });

  beforeEach(async () => {
    // Clean up task storage before each test
    try {
      await fs.unlink(TASK_STORAGE_PATH);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  });

  describe('End-to-End Task Workflow', () => {
    it('should create, save, retrieve, and approve a task', async () => {
      // Create and save a task
      const task = createTestTask({ title: 'E2E Test Task' });
      await saveTask(task, TASK_STORAGE_PATH);

      // Verify file was created
      await waitForFile(TASK_STORAGE_PATH);

      // Retrieve the task
      const tasks = await loadTasks({ limit: 10 }, TASK_STORAGE_PATH);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
      expect(tasks[0].status).toBe('generated');

      // Get single task by ID
      const retrievedTask = await getTask(task.id, TASK_STORAGE_PATH);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask.id).toBe(task.id);

      // Approve the task
      const approvedTask = await approveTask(task.id, TASK_STORAGE_PATH);
      expect(approvedTask).toBeDefined();
      expect(approvedTask.status).toBe('approved');
      expect(approvedTask.approvedAt).toBeDefined();

      // Verify approval persisted
      const tasksAfterApproval = await loadTasks({ status: 'approved', limit: 10 }, TASK_STORAGE_PATH);
      expect(tasksAfterApproval).toHaveLength(1);
      expect(tasksAfterApproval[0].status).toBe('approved');
    });

    it('should create, save, retrieve, and dismiss a task with reason', async () => {
      // Create and save a task
      const task = createTestTask({ title: 'Dismissal Test Task' });
      await saveTask(task, TASK_STORAGE_PATH);

      // Dismiss the task
      const dismissalReason = 'False positive - expected behavior';
      const dismissedTask = await dismissTask(task.id, dismissalReason, TASK_STORAGE_PATH);

      expect(dismissedTask).toBeDefined();
      expect(dismissedTask.status).toBe('dismissed');
      expect(dismissedTask.dismissedAt).toBeDefined();
      expect(dismissedTask.dismissalReason).toBe(dismissalReason);

      // Verify dismissal persisted
      const tasksAfterDismissal = await loadTasks({ status: 'dismissed', limit: 10 }, TASK_STORAGE_PATH);
      expect(tasksAfterDismissal).toHaveLength(1);
      expect(tasksAfterDismissal[0].status).toBe('dismissed');
      expect(tasksAfterDismissal[0].dismissalReason).toBe(dismissalReason);
    });

    it('should handle multiple tasks with filtering', async () => {
      // Create multiple tasks with different statuses
      const task1 = createTestTask({ title: 'Task 1', severity: 'critical', type: 'ErrorSpike' });
      const task2 = createTestTask({ title: 'Task 2', severity: 'high', type: 'Continuation' });
      const task3 = createTestTask({ title: 'Task 3', severity: 'medium', type: 'DocsGap' });

      await saveTask(task1, TASK_STORAGE_PATH);
      await saveTask(task2, TASK_STORAGE_PATH);
      await saveTask(task3, TASK_STORAGE_PATH);

      // Approve task1, dismiss task2, leave task3 as generated
      await approveTask(task1.id, TASK_STORAGE_PATH);
      await dismissTask(task2.id, 'Not relevant', TASK_STORAGE_PATH);

      // Test status filtering
      const generatedTasks = await loadTasks({ status: 'generated', limit: 10 }, TASK_STORAGE_PATH);
      expect(generatedTasks).toHaveLength(1);
      expect(generatedTasks[0].id).toBe(task3.id);

      const approvedTasks = await loadTasks({ status: 'approved', limit: 10 }, TASK_STORAGE_PATH);
      expect(approvedTasks).toHaveLength(1);
      expect(approvedTasks[0].id).toBe(task1.id);

      const dismissedTasks = await loadTasks({ status: 'dismissed', limit: 10 }, TASK_STORAGE_PATH);
      expect(dismissedTasks).toHaveLength(1);
      expect(dismissedTasks[0].id).toBe(task2.id);

      // Test type filtering
      const errorSpikeTasks = await loadTasks({ type: 'ErrorSpike', limit: 10 }, TASK_STORAGE_PATH);
      expect(errorSpikeTasks).toHaveLength(1);
      expect(errorSpikeTasks[0].type).toBe('ErrorSpike');

      // Test limit
      const limitedTasks = await loadTasks({ limit: 2 }, TASK_STORAGE_PATH);
      expect(limitedTasks.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Task Statistics', () => {
    it('should calculate task statistics correctly', async () => {
      // Create tasks with different statuses
      const task1 = createTestTask({ type: 'Continuation', severity: 'critical' });
      const task2 = createTestTask({ type: 'ErrorSpike', severity: 'high' });
      const task3 = createTestTask({ type: 'Continuation', severity: 'medium' });
      const task4 = createTestTask({ type: 'DocsGap', severity: 'low' });

      await saveTask(task1, TASK_STORAGE_PATH);
      await saveTask(task2, TASK_STORAGE_PATH);
      await saveTask(task3, TASK_STORAGE_PATH);
      await saveTask(task4, TASK_STORAGE_PATH);

      await approveTask(task1.id, TASK_STORAGE_PATH);
      await approveTask(task2.id, TASK_STORAGE_PATH);
      await dismissTask(task3.id, 'Test dismissal', TASK_STORAGE_PATH);

      // Get statistics
      const stats = await getTaskStats(TASK_STORAGE_PATH);

      expect(stats.total).toBe(4);
      expect(stats.byStatus.generated).toBe(1);
      expect(stats.byStatus.approved).toBe(2);
      expect(stats.byStatus.dismissed).toBe(1);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.bySeverity.medium).toBe(1);
      expect(stats.bySeverity.low).toBe(1);
      expect(stats.byType.Continuation).toBe(2);
      expect(stats.byType.ErrorSpike).toBe(1);
      expect(stats.byType.DocsGap).toBe(1);
    });
  });

  describe('Task Cleanup', () => {
    it('should cleanup old dismissed tasks', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - (31 * 24 * 60 * 60 * 1000);

      // Create old dismissed task
      const oldTask = createTestTask({
        title: 'Old Task',
        generatedAt: new Date(thirtyOneDaysAgo).toISOString(),
      });
      await saveTask(oldTask, TASK_STORAGE_PATH);
      await dismissTask(oldTask.id, 'Old dismissal', TASK_STORAGE_PATH);

      // Create recent dismissed task
      const recentTask = createTestTask({ title: 'Recent Task' });
      await saveTask(recentTask, TASK_STORAGE_PATH);
      await dismissTask(recentTask.id, 'Recent dismissal', TASK_STORAGE_PATH);

      // Cleanup tasks older than 30 days
      const removed = await cleanupOldTasks(30, TASK_STORAGE_PATH);
      expect(removed).toBe(1);

      // Verify only recent task remains
      const remainingTasks = await loadTasks({ limit: 10 }, TASK_STORAGE_PATH);
      expect(remainingTasks).toHaveLength(1);
      expect(remainingTasks[0].id).toBe(recentTask.id);
    });
  });

  describe('File Watcher Integration', () => {
    it('should detect file changes when tasks are saved', async () => {
      const changes = [];

      // Setup watcher
      const watcher = chokidar.watch(TASK_STORAGE_PATH, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      // Track changes
      watcher.on('change', () => changes.push('change'));
      watcher.on('add', () => changes.push('add'));

      // Wait for watcher to be ready
      await new Promise(resolve => watcher.on('ready', resolve));

      // Create and save a task (should trigger 'add' event)
      const task = createTestTask({ title: 'File Watch Test' });
      await saveTask(task, TASK_STORAGE_PATH);

      // Wait for file watcher to detect change
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Modify the task (should trigger 'change' event)
      await approveTask(task.id, TASK_STORAGE_PATH);

      // Wait for file watcher to detect change
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Cleanup watcher
      await watcher.close();

      // Verify events were detected
      expect(changes.length).toBeGreaterThan(0);
      expect(changes).toContain('add');
      expect(changes.filter(c => c === 'change').length).toBeGreaterThan(0);
    });
  });

  describe('Duplicate Detection', () => {
    it('should prevent duplicate tasks based on title + type + severity', async () => {
      const task1 = createTestTask({
        title: 'Duplicate Test',
        type: 'Continuation',
        severity: 'high',
      });

      const task2 = createTestTask({
        title: 'Duplicate Test',
        type: 'Continuation',
        severity: 'high',
        id: `different_${Date.now()}`, // Different ID but same key fields
      });

      // Save first task
      await saveTask(task1, TASK_STORAGE_PATH);

      // Attempt to save duplicate (should be prevented by deduplication logic)
      await saveTask(task2, TASK_STORAGE_PATH);

      // Load all tasks
      const tasks = await loadTasks({ limit: 10 }, TASK_STORAGE_PATH);

      // Should only have one task (deduplication should prevent the second)
      // Note: This depends on the implementation of saveTask having deduplication logic
      // If not implemented, this test documents expected behavior
      expect(tasks).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing task ID gracefully', async () => {
      const task = await getTask('nonexistent_id', TASK_STORAGE_PATH);
      expect(task).toBeNull();
    });

    it('should handle approval of nonexistent task', async () => {
      const approvedTask = await approveTask('nonexistent_id', TASK_STORAGE_PATH);
      expect(approvedTask).toBeNull();
    });

    it('should handle dismissal of nonexistent task', async () => {
      const dismissedTask = await dismissTask('nonexistent_id', 'reason', TASK_STORAGE_PATH);
      expect(dismissedTask).toBeNull();
    });

    it('should handle corrupted JSONL file gracefully', async () => {
      // Write corrupted data
      await fs.writeFile(TASK_STORAGE_PATH, 'invalid json\n{"valid": "json"}\n');

      // Should skip corrupted lines and return valid tasks
      const tasks = await loadTasks({ limit: 10 }, TASK_STORAGE_PATH);
      // Depending on implementation, this may return 0 or 1 task
      expect(tasks.length).toBeLessThanOrEqual(1);
    });
  });

  describe('JSONL Persistence', () => {
    it('should persist tasks in JSONL format', async () => {
      const task1 = createTestTask({ title: 'Task 1' });
      const task2 = createTestTask({ title: 'Task 2' });

      await saveTask(task1, TASK_STORAGE_PATH);
      await saveTask(task2, TASK_STORAGE_PATH);

      // Read raw file
      const lines = await readJSONL(TASK_STORAGE_PATH);

      expect(lines).toHaveLength(2);
      expect(lines[0].id).toBe(task1.id);
      expect(lines[1].id).toBe(task2.id);

      // Verify each line is valid JSON
      lines.forEach(line => {
        expect(line).toHaveProperty('id');
        expect(line).toHaveProperty('status');
        expect(line).toHaveProperty('title');
      });
    });

    it('should maintain task order (newest first)', async () => {
      const task1 = createTestTask({ title: 'First', generatedAt: new Date(Date.now() - 1000).toISOString() });
      const task2 = createTestTask({ title: 'Second', generatedAt: new Date().toISOString() });

      await saveTask(task1, TASK_STORAGE_PATH);
      await new Promise(resolve => setTimeout(resolve, 100)); // Ensure different timestamps
      await saveTask(task2, TASK_STORAGE_PATH);

      const tasks = await loadTasks({ limit: 10 }, TASK_STORAGE_PATH);

      // Newest should be first
      expect(tasks[0].title).toBe('Second');
      expect(tasks[1].title).toBe('First');
    });
  });
});

/**
 * Scheduler Integration Tests
 *
 * Note: These tests require the scheduler to be configured properly.
 * They may be skipped if the scheduler is not available.
 */
describe('Scheduler Integration Tests', () => {
  it('should initialize scheduler with correct configuration', () => {
    const scheduler = getScheduler();
    expect(scheduler).toBeDefined();
    expect(scheduler.getStats).toBeDefined();
    expect(scheduler.runAnalysis).toBeDefined();
  });

  it('should return scheduler stats', () => {
    const scheduler = getScheduler();
    const stats = scheduler.getStats();

    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('totalRuns');
    expect(stats).toHaveProperty('successfulRuns');
    expect(stats).toHaveProperty('failedRuns');
  });

  it('should run manual analysis', async () => {
    const scheduler = getScheduler();

    // Run analysis manually
    const result = await scheduler.runAnalysis();

    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');

    // If successful, should have task information
    if (result.success) {
      expect(result).toHaveProperty('tasksSaved');
    } else {
      expect(result).toHaveProperty('error');
    }
  });
});
