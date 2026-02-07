// Memory system - JSONL-based storage for conversations, tasks, goals, learnings
import { readFileSync, appendFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { rotateIfNeeded, readJsonl } from './jsonl-rotate.js';

function appendJsonl(filePath, record) {
  appendFileSync(filePath, JSON.stringify(record) + '\n');
  rotateIfNeeded(filePath);
}

function writeJsonl(filePath, records) {
  atomicWriteFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n') + '\n');
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

// ID generation
function generateId(prefix = '') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return prefix ? `${prefix}-${ts}-${rand}` : `${ts}-${rand}`;
}

// Conversations
export const conversations = {
  getPath(userId) {
    return join(config.paths.conversations, `${userId}.jsonl`);
  },

  get(userId, limit = 50) {
    const messages = readJsonl(this.getPath(userId));
    return limit ? messages.slice(-limit) : messages;
  },

  append(userId, message) {
    const record = {
      id: generateId('msg'),
      ts: new Date().toISOString(),
      ...message,
    };
    appendJsonl(this.getPath(userId), record);
    return record;
  },

  clear(userId) {
    const path = this.getPath(userId);
    if (existsSync(path)) atomicWriteFileSync(path, '');
  },
};

// Tasks
export const tasks = {
  getPath(taskId) {
    return join(config.paths.tasks, `${taskId}.json`);
  },

  listPath() {
    return join(config.paths.tasks, '_index.jsonl');
  },

  create(task) {
    const record = {
      id: generateId('task'),
      status: 'pending',
      origin: 'user',
      requires_approval: false,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      attempts: [],
      artifacts: [],
      ...task,
    };
    writeJson(this.getPath(record.id), record);
    appendJsonl(this.listPath(), { id: record.id, status: record.status, description: record.description });
    return record;
  },

  get(taskId) {
    return readJson(this.getPath(taskId));
  },

  // Note: read-modify-write is safe here because all ops are synchronous.
  // If this ever becomes async, use withLock from ./file-lock.js
  update(taskId, updates) {
    const task = this.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const updated = { ...task, ...updates, updated: new Date().toISOString() };
    writeJson(this.getPath(taskId), updated);

    // Also update the index if status changed
    if (updates.status) {
      const index = readJsonl(this.listPath());
      const newIndex = index.map(entry =>
        entry.id === taskId ? { ...entry, status: updates.status } : entry
      );
      writeJsonl(this.listPath(), newIndex);
    }
    return updated;
  },

  list(filter = {}) {
    const index = readJsonl(this.listPath());
    return index.filter(entry => {
      if (filter.status && entry.status !== filter.status) return false;
      return true;
    }).map(entry => this.get(entry.id)).filter(Boolean);
  },

  pending() {
    // Get pending tasks, excluding decomposed ones
    return this.list({ status: 'pending' }).filter(t => t.status !== 'decomposed');
  },

  addAttempt(taskId, attempt) {
    const task = this.get(taskId);
    task.attempts.push({
      ts: new Date().toISOString(),
      ...attempt,
    });
    return this.update(taskId, { attempts: task.attempts });
  },
};

// Goals
export const goals = {
  getPath(goalId) {
    return join(config.paths.goals, `${goalId}.json`);
  },

  listPath() {
    return join(config.paths.goals, '_index.jsonl');
  },

  create(goal) {
    const record = {
      id: generateId('goal'),
      status: 'proposed',
      origin: 'user',
      priority: 'medium',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tasks: [],
      context: {},
      // Goal pursuit fields (optional, backward-compatible)
      deadline: null,
      recurring: null,
      progress: null,
      progressPattern: 'linear', // 'linear' or 'lumpy' — lumpy dampens urgency escalation
      strategy: null,
      evaluations: [],
      urgency: 0,
      resourcePool: null, // e.g. 'rado-time' — goals sharing a pool compete for the same resource
      ...goal,  // Caller overrides
    };
    writeJson(this.getPath(record.id), record);
    appendJsonl(this.listPath(), { id: record.id, status: record.status, description: record.description });
    return record;
  },

  get(goalId) {
    return readJson(this.getPath(goalId));
  },

  update(goalId, updates) {
    const goal = this.get(goalId);
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    const updated = { ...goal, ...updates, updated: new Date().toISOString() };
    writeJson(this.getPath(goalId), updated);
    return updated;
  },

  list(filter = {}) {
    const index = readJsonl(this.listPath());
    return index.filter(entry => {
      if (filter.status && entry.status !== filter.status) return false;
      return true;
    }).map(entry => this.get(entry.id)).filter(Boolean);
  },

  active() {
    return this.list({ status: 'active' });
  },

  complete(goalId, summary) {
    return this.update(goalId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      completionSummary: summary,
    });
  },

  fail(goalId, reason) {
    return this.update(goalId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      failureReason: reason,
    });
  },

  withDeadlines() {
    return this.active().filter(g => g.deadline || g.recurring);
  },

  addTask(goalId, taskId) {
    const goal = this.get(goalId);
    if (!goal.tasks.includes(taskId)) {
      goal.tasks.push(taskId);
      return this.update(goalId, { tasks: goal.tasks });
    }
    return goal;
  },
};

// Learnings
export const learnings = {
  path() {
    return join(config.paths.learnings, 'learnings.jsonl');
  },

  add(learning) {
    const record = {
      id: generateId('learn'),
      ts: new Date().toISOString(),
      confidence: 0.5,
      ...learning,
    };
    appendJsonl(this.path(), record);
    return record;
  },

  find(tags = [], minConfidence = 0) {
    const all = readJsonl(this.path());
    return all.filter(l => {
      if (l.confidence < minConfidence) return false;
      if (tags.length === 0) return true;
      const lTags = l.applies_to || [];
      return tags.some(t => lTags.includes(t));
    });
  },

  all() {
    return readJsonl(this.path());
  },
};

// Approvals queue (for self-extension and destructive ops)
export const approvals = {
  path() {
    return join(config.paths.data, 'approvals.jsonl');
  },

  request(approval) {
    const record = {
      id: generateId('approval'),
      status: 'pending',
      requested: new Date().toISOString(),
      ...approval,
    };
    appendJsonl(this.path(), record);
    return record;
  },

  pending() {
    return readJsonl(this.path()).filter(a => a.status === 'pending');
  },

  // Note: read-modify-write is safe here because all ops are synchronous.
  // If this ever becomes async, use withLock from ./file-lock.js
  resolve(approvalId, decision, resolvedBy) {
    const all = readJsonl(this.path());
    const updated = all.map(a => {
      if (a.id === approvalId) {
        return { ...a, status: decision, resolvedBy, resolvedAt: new Date().toISOString() };
      }
      return a;
    });
    writeJsonl(this.path(), updated);
    return updated.find(a => a.id === approvalId);
  },
};

export default { conversations, tasks, goals, learnings, approvals, generateId };
