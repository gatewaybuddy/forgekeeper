// Web Dashboard for Forgekeeper v3
// Minimal Express server with WebSocket for real-time updates
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tasks, goals, approvals, learnings, conversations } from '../core/memory.js';
import { status as loopStatus, on as onLoopEvent } from '../core/loop.js';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set();

// Broadcast to all clients
function broadcast(type, data) {
  const message = JSON.stringify({ type, data, ts: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}

// Activity log (in-memory, last 100 events)
const activityLog = [];
const MAX_LOG_SIZE = 100;

function logActivity(event, data) {
  const entry = { event, data, ts: new Date().toISOString() };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_SIZE) activityLog.pop();
  broadcast('activity', entry);
}

// Subscribe to loop events
onLoopEvent('task:started', (data) => {
  logActivity('task:started', { taskId: data.task.id, description: data.task.description });
  broadcast('status', getStatus());
});

onLoopEvent('task:completed', (data) => {
  logActivity('task:completed', { taskId: data.task.id, elapsed: data.elapsed });
  broadcast('status', getStatus());
  broadcast('tasks', getTasks());
});

onLoopEvent('task:failed', (data) => {
  logActivity('task:failed', { taskId: data.task.id, error: data.result?.error });
  broadcast('status', getStatus());
  broadcast('tasks', getTasks());
});

onLoopEvent('task:needs_approval', (data) => {
  logActivity('task:needs_approval', { taskId: data.task.id, reason: data.reason });
  broadcast('approvals', getApprovals());
});

onLoopEvent('goal:activated', (data) => {
  logActivity('goal:activated', { goalId: data.goal.id, taskCount: data.tasks.length });
  broadcast('goals', getGoals());
  broadcast('tasks', getTasks());
});

onLoopEvent('loop:error', (data) => {
  logActivity('loop:error', { error: data.error });
});

// API helpers
function getStatus() {
  return loopStatus();
}

function getTasks() {
  const all = tasks.list({});
  return {
    pending: all.filter(t => t.status === 'pending'),
    active: all.filter(t => t.status === 'active'),
    completed: all.filter(t => t.status === 'completed').slice(-10),
    failed: all.filter(t => t.status === 'failed').slice(-10),
  };
}

function getGoals() {
  const all = goals.list({});
  return {
    active: all.filter(g => g.status === 'active'),
    proposed: all.filter(g => g.status === 'proposed'),
    completed: all.filter(g => g.status === 'completed').slice(-5),
  };
}

function getApprovals() {
  return approvals.pending();
}

function getLearnings() {
  return learnings.all().slice(-20);
}

// Serve static files
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// API Routes
app.get('/api/status', (req, res) => {
  res.json(getStatus());
});

app.get('/api/tasks', (req, res) => {
  res.json(getTasks());
});

app.get('/api/goals', (req, res) => {
  res.json(getGoals());
});

app.get('/api/approvals', (req, res) => {
  res.json(getApprovals());
});

app.get('/api/learnings', (req, res) => {
  res.json(getLearnings());
});

app.get('/api/activity', (req, res) => {
  res.json(activityLog);
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { description, priority, tags } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Description required' });
  }
  const task = tasks.create({ description, priority, tags, origin: 'dashboard' });
  logActivity('task:created', { taskId: task.id, description });
  broadcast('tasks', getTasks());
  res.json(task);
});

// Create goal
app.post('/api/goals', (req, res) => {
  const { description, priority } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Description required' });
  }
  const goal = goals.create({ description, priority, origin: 'dashboard' });
  logActivity('goal:created', { goalId: goal.id, description });
  broadcast('goals', getGoals());
  res.json(goal);
});

// Resolve approval
app.post('/api/approvals/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or rejected' });
  }
  const result = approvals.resolve(id, decision, 'dashboard');
  logActivity('approval:resolved', { id, decision });
  broadcast('approvals', getApprovals());
  res.json(result);
});

// Activate goal
app.post('/api/goals/:id/activate', async (req, res) => {
  const { id } = req.params;
  try {
    const { activateGoal } = await import('../core/loop.js');
    const result = await activateGoal(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
wss.on('connection', (ws) => {
  clients.add(ws);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      status: getStatus(),
      tasks: getTasks(),
      goals: getGoals(),
      approvals: getApprovals(),
      activity: activityLog.slice(0, 20),
    },
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[Dashboard] WebSocket error:', error.message);
    clients.delete(ws);
  });
});

// Start server
export function startDashboard(port = config.dashboard.port) {
  server.listen(port, () => {
    console.log(`[Dashboard] Running at http://localhost:${port}`);
  });
  return server;
}

export default { startDashboard, broadcast, logActivity };
