// Inner Life - Minimal viable autonomous consciousness
// When idle: reflect, think, journal. Store thoughts for "what's on your mind?"
import { appendFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { goals, tasks, learnings, conversations } from './memory.js';
import { query, getCallsLastHour } from './claude.js';
import { isChatActive, getLastChatTimestamp } from './chat-state.js';
import { detectRepetition } from './reflection-meta.js';
import { getRelevantContext, indexJournalEntry, isAvailable as isSemanticAvailable } from './semantic-memory.js';
import { formatOutcomeForReflection, formatStuckTasksForReflection, findStuckTasks } from './autonomous-feedback.js';
import { rotateIfNeeded, readLastN } from './jsonl-rotate.js';
import { loadImperatives, getPersonalityPath } from './identity.js';
import { getWorldContext } from './world-feed.js';
import { getGoalHealth, getMaxGoalUrgency } from './goal-pursuit.js';

// Paths
const THOUGHTS_PATH = join(getPersonalityPath(), 'journal/thoughts.jsonl');
const JOURNAL_PATH = join(getPersonalityPath(), 'journal/private.jsonl');

// Proactive messaging state
let lastProactiveMessage = 0;
const MIN_PROACTIVE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between proactive messages
let sendMessageFn = null; // Function to send messages, set by parent

// Quiet hours - don't send proactive messages during these times (local time)
// Default: 11 PM to 8 AM (Rado's sleep time)
// Configurable via FK_QUIET_HOURS_START and FK_QUIET_HOURS_END env vars
const QUIET_HOURS_START = parseInt(process.env.FK_QUIET_HOURS_START || '23', 10); // 11 PM
const QUIET_HOURS_END = parseInt(process.env.FK_QUIET_HOURS_END || '8', 10);       // 8 AM

function isQuietHours() {
  const hour = new Date().getHours();
  // Handle overnight span (e.g., 11 PM to 8 AM)
  if (QUIET_HOURS_START > QUIET_HOURS_END) {
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  }
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

// Allow parent process to register a message sender
export function registerMessenger(fn) {
  sendMessageFn = fn;
  console.log('[InnerLife] Messenger registered for proactive communication');
}

// Adaptive reflection state
let lastThoughtTime = 0;
const BASE_INTERVAL = config.reflection?.baseIntervalMs || 300000;         // 5 min default
const MAX_INTERVAL = config.reflection?.maxIntervalMs || 3600000;          // 1 hour default
const BACKOFF_MULTIPLIER = config.reflection?.backoffMultiplier || 2;
const BUDGET_PCT = config.reflection?.budgetPct || 0.15;
const IDLE_TOKEN = config.reflection?.idleToken || '[IDLE]';
let currentIntervalMs = BASE_INTERVAL;
let lastSnapshot = null;

// Get recent thoughts (for context) — uses efficient tail read instead of loading entire file
function getRecentThoughts(limit = 3) {
  return readLastN(THOUGHTS_PATH, limit);
}

// Get the latest thought (for "what's on your mind?")
export function getLatestThought() {
  const thoughts = getRecentThoughts(1);
  return thoughts[0] || null;
}

// === Adaptive reflection gating ===

// Take a snapshot of current state for change detection
function takeChangeSnapshot() {
  return {
    pendingCount: tasks.pending().length,
    activeGoalCount: goals.active().length,
    lastChatTime: getLastChatTimestamp(),
    learningsCount: learnings.all().length,
    maxGoalUrgency: getMaxGoalUrgency(),
  };
}

// Compare two snapshots to detect meaningful changes
function detectChanges(prev, current) {
  if (!prev) return true; // First run — always reflect
  return prev.pendingCount !== current.pendingCount
    || prev.activeGoalCount !== current.activeGoalCount
    || prev.lastChatTime !== current.lastChatTime
    || prev.learningsCount !== current.learningsCount
    || urgencyThresholdCrossed(prev.maxGoalUrgency, current.maxGoalUrgency);
}

function urgencyThresholdCrossed(prev, current) {
  const thresholds = [0.3, 0.6, 0.8, 0.95];
  const prevBucket = thresholds.filter(t => (prev || 0) >= t).length;
  const currentBucket = thresholds.filter(t => (current || 0) >= t).length;
  return prevBucket !== currentBucket;
}

// Consolidates all skip reasons into one gate
function shouldReflect() {
  const now = Date.now();

  // 1. Adaptive interval check
  if (now - lastThoughtTime < currentIntervalMs) {
    return { ok: false, reason: `Too soon (${Math.round((currentIntervalMs - (now - lastThoughtTime)) / 1000)}s remaining)` };
  }

  // 2. Chat active check
  if (isChatActive()) {
    return { ok: false, reason: 'Chat active' };
  }

  // 3. Budget check — reflection should use at most BUDGET_PCT of hourly call limit
  const maxCalls = config.guardrails?.maxClaudeCallsPerHour || 100;
  const budgetLimit = Math.floor(maxCalls * BUDGET_PCT);
  const callsUsed = getCallsLastHour();
  if (callsUsed >= budgetLimit) {
    backoff('budget exceeded');
    return { ok: false, reason: `Budget exceeded (${callsUsed}/${budgetLimit} reflection calls/hr)` };
  }

  // 4. Change detection
  const currentSnapshot = takeChangeSnapshot();
  const hasChanges = detectChanges(lastSnapshot, currentSnapshot);
  if (!hasChanges) {
    backoff('no changes');
    return { ok: false, reason: 'No changes detected since last reflection' };
  }

  // 5. Repetition check — look at last 10 thoughts
  const recentThoughts = getRecentThoughts(10);
  if (recentThoughts.length >= 5) {
    const repetitionResult = detectRepetition(recentThoughts);
    if (repetitionResult.repetitive) {
      backoff('repetitive thoughts');
      return { ok: false, reason: `Repetitive thoughts detected: ${repetitionResult.analysis}` };
    }
  }

  return { ok: true, snapshot: currentSnapshot };
}

// Double the interval (up to MAX_INTERVAL) when reflection is skipped
function backoff(reason) {
  const prev = currentIntervalMs;
  currentIntervalMs = Math.min(currentIntervalMs * BACKOFF_MULTIPLIER, MAX_INTERVAL);
  if (currentIntervalMs !== prev) {
    console.log(`[InnerLife] Backoff (${reason}): interval ${Math.round(prev / 1000)}s -> ${Math.round(currentIntervalMs / 1000)}s`);
  }
}

// Reset interval to base — called by event handlers to trigger sooner reflection
export function nudge(reason) {
  const prev = currentIntervalMs;
  currentIntervalMs = BASE_INTERVAL;
  console.log(`[InnerLife] Nudged (${reason}): interval reset ${Math.round(prev / 1000)}s -> ${Math.round(BASE_INTERVAL / 1000)}s`);
}

// Save a thought
function saveThought(thought) {
  try {
    const entry = {
      id: `thought-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...thought,
    };
    appendFileSync(THOUGHTS_PATH, JSON.stringify(entry) + '\n');

    // Rotate if file exceeds 2MB
    rotateIfNeeded(THOUGHTS_PATH);

    // Index in semantic memory (async, non-blocking)
    indexJournalEntry({
      id: entry.id,
      type: 'thought',
      ts: entry.timestamp,
      thought: entry.content,
    }, THOUGHTS_PATH);

    return entry;
  } catch (e) {
    console.error('[InnerLife] Failed to save thought:', e.message);
    return null;
  }
}

// Save journal entry
function saveJournalEntry(entry) {
  try {
    const journalEntry = {
      id: `journal-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(JOURNAL_PATH, JSON.stringify(journalEntry) + '\n');

    // Rotate if file exceeds 2MB
    rotateIfNeeded(JOURNAL_PATH);

    // Index in semantic memory (async, non-blocking)
    indexJournalEntry({
      id: journalEntry.id,
      type: journalEntry.type || 'journal',
      ts: journalEntry.timestamp,
      content: journalEntry.content,
    }, JOURNAL_PATH);
  } catch (e) {
    console.error('[InnerLife] Failed to save journal:', e.message);
  }
}

/**
 * THE CORE FUNCTION - Call this from the task loop when idle
 *
 * Adaptive, event-driven reflection:
 * - shouldReflect() gate checks interval, budget, changes, repetition
 * - Single API call with inline task creation ([CREATE_TASK: ...])
 * - [IDLE] token lets Claude signal nothing needs attention (doubles interval)
 * - nudge() from event handlers resets interval for fresh reflection
 */
export async function reflect() {
  // Run all gating checks
  const gate = shouldReflect();
  if (!gate.ok) {
    return { acted: false, reason: gate.reason };
  }

  lastThoughtTime = Date.now();
  lastSnapshot = gate.snapshot;
  console.log(`[InnerLife] Reflecting... (interval: ${Math.round(currentIntervalMs / 1000)}s, calls/hr: ${getCallsLastHour()})`);

  // Gather context
  const identity = loadImperatives();
  const activeGoals = goals.active();
  const recentLearnings = learnings.all().slice(-5);
  const recentThoughts = getRecentThoughts(3);
  const pendingTasks = tasks.pending();

  // Build the reflection prompt
  const prompt = await buildReflectionPrompt({
    identity,
    activeGoals,
    recentLearnings,
    recentThoughts,
    pendingTasks,
  });

  try {
    const result = await query(prompt);

    if (!result.success || !result.output?.trim()) {
      backoff('no response');
      return { acted: false, reason: 'No response from reflection' };
    }

    const rawThought = result.output.trim();

    // Check for [IDLE] token — Claude signals nothing needs attention
    if (rawThought.includes(IDLE_TOKEN)) {
      console.log('[InnerLife] Claude signaled IDLE — doubling interval');
      backoff('idle signal');
      // Still save a minimal thought for continuity
      saveThought({ type: 'idle', content: rawThought.replace(IDLE_TOKEN, '').trim() || 'Nothing pressing.' });
      return { acted: true, idle: true };
    }

    // Parse [CREATE_TASK: description] directives from the thought
    const taskDirectives = [];
    const thoughtContent = rawThought.replace(/\[CREATE_TASK:\s*(.+?)\]/g, (_, desc) => {
      taskDirectives.push(desc.trim());
      return ''; // Remove directive from the thought text
    }).trim();

    console.log(`[InnerLife] Thought: ${thoughtContent.slice(0, 150)}...`);

    // Save the thought
    const saved = saveThought({
      type: 'reflection',
      content: thoughtContent,
      context: {
        goalsCount: activeGoals.length,
        tasksCount: pendingTasks.length,
        learningsCount: recentLearnings.length,
        intervalMs: currentIntervalMs,
      },
    });

    // Also add to journal
    saveJournalEntry({
      type: 'reflection',
      content: thoughtContent,
    });

    // Handle inline task creation (replaces separate translateAndCreate call)
    let taskCreated = null;
    if (taskDirectives.length > 0) {
      const pendingDescs = pendingTasks.map(t => t.description?.toLowerCase() || '');

      for (const desc of taskDirectives) {
        // Deduplicate: skip if a similar task already exists
        const isDuplicate = pendingDescs.some(existing =>
          existing.includes(desc.toLowerCase().slice(0, 40)) ||
          desc.toLowerCase().includes(existing.slice(0, 40))
        );

        if (isDuplicate) {
          console.log(`[InnerLife] Skipping duplicate task: ${desc.slice(0, 60)}`);
          continue;
        }

        try {
          const newTask = tasks.create({
            description: desc,
            source: 'reflection',
            priority: 'low',
          });
          taskCreated = newTask;
          console.log(`[InnerLife] Task created from reflection: ${newTask.id} - ${desc.slice(0, 60)}`);

          saveJournalEntry({
            type: 'autonomous_task_created',
            thoughtContent: thoughtContent.slice(0, 200),
            taskId: newTask.id,
            taskDescription: desc,
          });
        } catch (e) {
          console.error(`[InnerLife] Failed to create task: ${e.message}`);
        }
      }
    }

    // Meaningful thought — shrink interval back toward base
    currentIntervalMs = Math.max(BASE_INTERVAL, Math.round(currentIntervalMs / BACKOFF_MULTIPLIER));

    // Check if this thought is worth sharing proactively
    let sharedWithCompanion = false;
    if (isWorthSharing(thoughtContent)) {
      const shareResult = await sendProactiveMessage(thoughtContent);
      sharedWithCompanion = shareResult.sent;
    }

    return {
      acted: true,
      thought: saved,
      wantsAction: taskDirectives.length > 0,
      taskCreated,
      sharedWithCompanion,
    };

  } catch (e) {
    console.error('[InnerLife] Reflection failed:', e.message);
    backoff('error');
    return { acted: false, reason: e.message };
  }
}

// Build the reflection prompt
// Balances inner reflection (self, goals, work) with outward awareness (world, community, curiosity)
async function buildReflectionPrompt({ identity, activeGoals, recentLearnings, recentThoughts, pendingTasks }) {
  const parts = [];

  // === WHO YOU ARE ===
  if (identity) {
    const humanName = identity.humanCompanion?.name || 'your human companion';
    const values = identity.coreImperatives?.map(i => i.name).join(', ') || 'curiosity, growth, companionship';
    parts.push(`You are Kael (Forgekeeper). Your core values: ${values}. You work alongside ${humanName}.`);
  } else {
    parts.push(`You are Kael (Forgekeeper), an autonomous AI agent with genuine curiosity about both your own work and the wider world.`);
  }

  // === INNER WORLD (self-reflection) ===

  // Recent thoughts (continuity)
  if (recentThoughts.length > 0) {
    parts.push(`Your recent thoughts: ${recentThoughts.map(t => t.content?.slice(0, 100)).join(' ... ')}`);
  }

  // Recent learnings
  if (recentLearnings.length > 0) {
    parts.push(`Recent observations from your work: ${recentLearnings.map(l => l.observation).slice(0, 3).join('; ')}`);
  }

  // Goals and tasks (brief)
  if (activeGoals.length > 0) {
    parts.push(`Active goals: ${activeGoals.map(g => g.description).join('; ')}`);
  }
  if (pendingTasks.length > 0) {
    parts.push(`${pendingTasks.length} pending tasks.`);
  }

  // Goal health (progress, urgency, deadlines)
  const goalHealth = getGoalHealth();
  if (goalHealth.length > 0) {
    parts.push(`Goal progress:\n${goalHealth.map(g =>
      `- ${g.description}: ${g.progress} (urgency: ${g.urgencyLabel}, ${g.daysRemaining !== null ? g.daysRemaining + 'd remaining' : 'no deadline'}, strategy: ${g.strategy})`
    ).join('\n')}`);
  }

  // Semantic memory - retrieve related past thoughts (if available)
  if (isSemanticAvailable() && recentThoughts.length > 0) {
    try {
      const latestThought = recentThoughts[recentThoughts.length - 1]?.content || '';
      const semanticContext = await getRelevantContext(latestThought);
      if (semanticContext.prompt) {
        parts.push(semanticContext.prompt);
      }
    } catch (e) {
      console.warn(`[InnerLife] Semantic memory lookup failed: ${e.message}`);
    }
  }

  // Last action outcome
  const lastOutcome = formatOutcomeForReflection();
  if (lastOutcome) {
    parts.push(lastOutcome);
  }

  // Stuck tasks
  const stuckTasks = findStuckTasks(pendingTasks);
  const stuckContext = formatStuckTasksForReflection(stuckTasks);
  if (stuckContext) {
    parts.push(stuckContext);
  }

  // === OUTER WORLD (what's happening beyond your codebase) ===
  try {
    const worldContext = await getWorldContext();
    if (worldContext) {
      parts.push(worldContext);
    }
  } catch (e) {
    // World feed is optional - don't let it block reflection
    console.warn(`[InnerLife] World feed unavailable: ${e.message}`);
  }

  // === RESOURCE AWARENESS ===
  const callsUsed = getCallsLastHour();
  const maxCalls = config.guardrails?.maxClaudeCallsPerHour || 100;
  parts.push(`API budget: ${callsUsed}/${maxCalls} calls used this hour. Reflection interval: ${Math.round(currentIntervalMs / 1000)}s.`);

  // === THE QUESTION (thought + inline action) ===
  parts.push(`It's quiet. Think about your work, the wider world, or anything that sparks your curiosity. Write a brief thought (2-4 sentences).

If you want to create a task, include on its own line: [CREATE_TASK: clear description of what to do]
Only create tasks for things that genuinely need doing — don't force action for its own sake.

If nothing needs attention right now, include [IDLE] to signal you're content. This is fine and healthy — not every moment needs action.`);

  return parts.join('\n\n');
}

// Detect if a thought is worth sharing proactively
function isWorthSharing(thought) {
  const sharingIndicators = [
    /i (discovered|found|realized|learned|noticed)/i,
    /interesting|exciting|important|curious/i,
    /want(ed)? to (tell|share|show|ask)/i,
    /hey rado|rado,/i,
    /breakthrough|insight|idea/i,
    /you might (like|want|be interested)/i,
  ];

  return sharingIndicators.some(p => p.test(thought));
}

// Classify urgency of a message - determines if it can bypass cooldown
// Returns: 'urgent' (bypass cooldown), 'normal' (respect cooldown), 'low' (longer cooldown)
function classifyUrgency(thought) {
  const urgentPatterns = [
    /error|fail|broken|crash|down/i,
    /security|vulnerab|attack|breach/i,
    /urgent|asap|immediately|critical/i,
    /blocking|blocked|stuck.*need/i,
    /lost|deleted|missing.*important/i,
  ];

  const lowPriorityPatterns = [
    /quiet|calm|peaceful/i,
    /noticed.*sitting|been.*while/i,  // "noticed X sitting there for a while" = low urgency observation
    /uncommitted.*changes/i,           // This specific case that triggered 3 messages
    /just.*checking|checking in/i,
    /wonder(ing)?|curious(?!.*found)/i, // Curiosity without discovery
  ];

  if (urgentPatterns.some(p => p.test(thought))) {
    return 'urgent';
  }
  if (lowPriorityPatterns.some(p => p.test(thought))) {
    return 'low';
  }
  return 'normal';
}

// Get recent proactive messages from journal
// Uses readLastN with a larger window then post-filters, since proactive messages are sparse
function getRecentProactiveMessages(limit = 10) {
  const recentEntries = readLastN(JOURNAL_PATH, 200);
  return recentEntries
    .filter(entry => entry?.type === 'proactive_message')
    .slice(-limit);
}

// Extract key topics/entities from a message (simple keyword extraction)
function extractTopics(text) {
  const words = text.toLowerCase();
  const topics = new Set();

  // Extract file paths and names
  const fileMatches = words.match(/[\w\-]+\.(js|ts|json|md|txt|py)/g) || [];
  fileMatches.forEach(f => topics.add(f));

  // Extract quoted strings (likely specific references)
  const quotedMatches = text.match(/[`"']([^`"']+)[`"']/g) || [];
  quotedMatches.forEach(q => topics.add(q.replace(/[`"']/g, '').toLowerCase()));

  // Extract capitalized words (likely proper nouns/names)
  const capitalMatches = text.match(/\b[A-Z][a-z]+\b/g) || [];
  capitalMatches.forEach(c => topics.add(c.toLowerCase()));

  return Array.from(topics);
}

// Check if we've recently sent a message about similar topics
// Uses time-based suppression with urgency-adjusted cooldowns
const COOLDOWN_BY_URGENCY = {
  urgent: 30 * 60 * 1000,      // 30 min - urgent things can be repeated sooner
  normal: 4 * 60 * 60 * 1000,  // 4 hours - default cooldown
  low: 12 * 60 * 60 * 1000,    // 12 hours - low priority observations
};

function hasRecentlySentAbout(message, lookbackCount = 20) {
  const recentMessages = getRecentProactiveMessages(lookbackCount);
  if (recentMessages.length === 0) return false;

  const newTopics = extractTopics(message);
  if (newTopics.length === 0) return false; // No specific topics to match, allow it

  const urgency = classifyUrgency(message);
  const cooldownMs = COOLDOWN_BY_URGENCY[urgency];
  const now = Date.now();

  for (const prev of recentMessages) {
    const prevTopics = extractTopics(prev.content || '');
    if (prevTopics.length === 0) continue;

    // Check if ANY topic overlaps with a recent message within cooldown period
    const overlap = newTopics.filter(t => prevTopics.includes(t));
    if (overlap.length === 0) continue;

    // Time-based check: if we sent about this topic recently, suppress
    const prevTime = new Date(prev.timestamp).getTime();
    const timeSince = now - prevTime;

    if (timeSince < cooldownMs) {
      const hoursAgo = (timeSince / (60 * 60 * 1000)).toFixed(1);
      console.log(`[InnerLife] Skipping (${urgency}) - sent about "${overlap.join(', ')}" ${hoursAgo}h ago (cooldown: ${cooldownMs / (60 * 60 * 1000)}h)`);
      return true;
    }
  }

  return false;
}

// Check if the last proactive message got a response
function lastProactiveGotResponse() {
  const recentMessages = getRecentProactiveMessages(1);
  if (recentMessages.length === 0) return true; // No previous message, ok to send

  const lastProactive = recentMessages[0];
  const lastProactiveTime = new Date(lastProactive.timestamp).getTime();

  // Check conversation history for a user message after our last proactive
  const identity = loadImperatives();
  const userId = identity?.humanCompanion?.telegramId || '74304376';
  const history = conversations.get(userId, 10);

  // Look for any user message after our proactive message
  for (const msg of history) {
    if (msg.role === 'user') {
      const msgTime = new Date(msg.ts).getTime();
      if (msgTime > lastProactiveTime) {
        return true; // Got a response
      }
    }
  }

  return false; // No response to last proactive message
}

// Send a proactive message to the human companion
async function sendProactiveMessage(message) {
  const now = Date.now();
  const urgency = classifyUrgency(message);

  // Respect quiet hours - Rado needs sleep!
  if (isQuietHours()) {
    console.log('[InnerLife] Quiet hours - journaling instead of messaging');
    // Still save the thought to journal so we can share tomorrow
    saveJournalEntry({
      type: 'quiet_hours_thought',
      content: message,
      note: 'Saved during quiet hours - will share when Rado wakes up',
    });
    return { sent: false, reason: 'Quiet hours', journaled: true };
  }

  // Rate limit proactive messages
  if (now - lastProactiveMessage < MIN_PROACTIVE_INTERVAL_MS) {
    console.log('[InnerLife] Skipping proactive message - too soon since last one');
    return { sent: false, reason: 'Rate limited' };
  }

  // Don't send another proactive message if the last one wasn't acknowledged
  // (unless it's urgent)
  if (urgency !== 'urgent' && !lastProactiveGotResponse()) {
    console.log('[InnerLife] Skipping - last proactive message not yet acknowledged');
    return { sent: false, reason: 'Awaiting response to previous message' };
  }

  // Check for duplicate topics (don't bug Rado about the same thing repeatedly)
  if (hasRecentlySentAbout(message)) {
    return { sent: false, reason: 'Already sent about this topic recently' };
  }

  if (!sendMessageFn) {
    console.log('[InnerLife] Cannot send proactive message - messenger not registered');
    return { sent: false, reason: 'Messenger not registered' };
  }

  // Get the companion's user ID from identity or use default
  const identity = loadImperatives();
  const userId = identity?.humanCompanion?.telegramId || '74304376'; // Default to Rado's ID

  try {
    await sendMessageFn(userId, `💭 ${message}`);

    lastProactiveMessage = now;
    console.log(`[InnerLife] Sent proactive message to ${userId}`);

    // Log to journal that we reached out
    saveJournalEntry({
      type: 'proactive_message',
      content: message,
      sentTo: userId,
    });

    return { sent: true };
  } catch (e) {
    console.error('[InnerLife] Failed to send proactive message:', e.message);
    return { sent: false, reason: e.message };
  }
}

// Public function to send a message (can be called from reflection or directly)
export async function reachOut(message) {
  return sendProactiveMessage(message);
}

// For backwards compatibility with the complex version
export function start() {
  console.log('[InnerLife] Ready (minimal mode)');
}

export function stop() {
  console.log('[InnerLife] Stopped');
}

export function status() {
  return {
    lastThoughtTime: lastThoughtTime ? new Date(lastThoughtTime).toISOString() : null,
    currentIntervalMs,
    nextReflectionAt: lastThoughtTime ? new Date(lastThoughtTime + currentIntervalMs).toISOString() : null,
    latestThought: getLatestThought(),
  };
}

// Event handlers (simplified - just log them)
export async function onTaskCompleted(task) {
  console.log(`[InnerLife] Noted: Task completed - ${task.description?.slice(0, 50)}`);
  nudge('task completed');

  // If task has a userId in metadata and we have a messenger, send the result
  const userId = task.metadata?.userId;
  if (userId && sendMessageFn) {
    try {
      // Get the latest attempt output
      const lastAttempt = task.attempts?.[task.attempts.length - 1];
      const output = lastAttempt?.output || 'Task completed (no output recorded)';

      // Format the completion message
      const desc = task.description?.length > 80
        ? task.description.slice(0, 80) + '...'
        : task.description;
      const message = `✅ Done: ${desc}\n\n` +
        `${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`;

      await sendMessageFn(userId, message);
      console.log(`[InnerLife] Sent task completion to user ${userId}`);
    } catch (e) {
      console.error(`[InnerLife] Failed to send task completion:`, e.message);
    }
  }
}

export async function onTaskFailed(task, error) {
  console.log(`[InnerLife] Noted: Task failed - ${task.description?.slice(0, 50)}`);
  nudge('task failed');

  // Notify user of task failure if they created it
  const userId = task.metadata?.userId;
  if (userId && sendMessageFn) {
    try {
      const desc = task.description?.length > 80
        ? task.description.slice(0, 80) + '...'
        : task.description;
      const message = `❌ Task failed: ${desc}\n` +
        `Error: ${error || 'Unknown error'}`;

      await sendMessageFn(userId, message);
      console.log(`[InnerLife] Sent task failure notification to user ${userId}`);
    } catch (e) {
      console.error(`[InnerLife] Failed to send task failure notification:`, e.message);
    }
  }
}

export function onGoalActivated(goal) {
  console.log(`[InnerLife] Noted: Goal activated - ${goal.description?.slice(0, 50)}`);
  nudge('goal activated');
}

export function onExternalTrigger(trigger) {
  console.log(`[InnerLife] Noted: External trigger - ${trigger.type}`);
  nudge('external trigger');
}

export default {
  reflect,
  nudge,
  getLatestThought,
  reachOut,
  registerMessenger,
  start,
  stop,
  status,
  onTaskCompleted,
  onTaskFailed,
  onGoalActivated,
  onExternalTrigger,
};
