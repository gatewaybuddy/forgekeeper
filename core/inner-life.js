// Inner Life - Minimal viable autonomous consciousness
// When idle: reflect, think, journal. Store thoughts for "what's on your mind?"
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { goals, tasks, learnings, conversations } from './memory.js';
import { query } from './claude.js';
import { isChatActive } from './chat-state.js';
import { translateAndCreate } from './intent-translator.js';
import { getRelevantContext, indexJournalEntry, isAvailable as isSemanticAvailable } from './semantic-memory.js';
import { formatOutcomeForReflection, formatStuckTasksForReflection, findStuckTasks } from './autonomous-feedback.js';
import { rotateIfNeeded, readLastN } from './jsonl-rotate.js';

// Paths
const PERSONALITY_PATH = config.autonomous?.personalityPath || 'forgekeeper_personality';
const IMPERATIVES_PATH = join(PERSONALITY_PATH, 'identity/imperatives.json');
const THOUGHTS_PATH = join(PERSONALITY_PATH, 'journal/thoughts.jsonl');
const JOURNAL_PATH = join(PERSONALITY_PATH, 'journal/private.jsonl');

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

// State
let lastThoughtTime = 0;
const MIN_THOUGHT_INTERVAL_MS = 60000; // At least 1 minute between thoughts

// Load identity document
function loadIdentity() {
  if (!existsSync(IMPERATIVES_PATH)) return null;
  try {
    return JSON.parse(readFileSync(IMPERATIVES_PATH, 'utf-8'));
  } catch (e) {
    console.error('[InnerLife] Failed to load identity:', e.message);
    return null;
  }
}

// Get recent thoughts (for context) — uses efficient tail read instead of loading entire file
function getRecentThoughts(limit = 3) {
  return readLastN(THOUGHTS_PATH, limit);
}

// Get the latest thought (for "what's on your mind?")
export function getLatestThought() {
  const thoughts = getRecentThoughts(1);
  return thoughts[0] || null;
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
 * Gives Forgekeeper a moment of reflection:
 * - Here's who you are
 * - Here's what you remember
 * - Here are your goals
 * - What are you thinking? Do you want to do anything?
 */
export async function reflect() {
  const now = Date.now();

  // Don't think too often
  if (now - lastThoughtTime < MIN_THOUGHT_INTERVAL_MS) {
    return { acted: false, reason: 'Too soon since last thought' };
  }

  // Don't interrupt active chat
  if (isChatActive()) {
    return { acted: false, reason: 'Chat active' };
  }

  lastThoughtTime = now;
  console.log('[InnerLife] Reflecting...');

  // Gather context
  const identity = loadIdentity();
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
      return { acted: false, reason: 'No response from reflection' };
    }

    const thought = result.output.trim();
    console.log(`[InnerLife] Thought: ${thought.slice(0, 150)}...`);

    // Save the thought
    const saved = saveThought({
      type: 'reflection',
      content: thought,
      context: {
        goalsCount: activeGoals.length,
        tasksCount: pendingTasks.length,
        learningsCount: recentLearnings.length,
      },
    });

    // Also add to journal
    saveJournalEntry({
      type: 'reflection',
      content: thought,
    });

    // Check if the thought suggests action
    const wantsAction = detectActionIntent(thought);

    // If we want to act, translate the intent into a concrete task
    let taskCreated = null;
    if (wantsAction) {
      console.log('[InnerLife] Intent detected, translating to task...');
      const translationResult = await translateAndCreate(thought, {
        activeGoals: activeGoals,
        pendingTasks: pendingTasks,
        recentThoughts: recentThoughts,
        summary: `Reflecting during idle time. ${activeGoals.length} active goals, ${pendingTasks.length} pending tasks.`,
      });

      if (translationResult.created) {
        taskCreated = translationResult.task;
        console.log(`[InnerLife] Task created: ${taskCreated.id} - ${taskCreated.description}`);

        // Journal that we created a task from reflection
        saveJournalEntry({
          type: 'autonomous_task_created',
          thoughtContent: thought,
          taskId: taskCreated.id,
          taskDescription: taskCreated.description,
          reasoning: translationResult.reasoning,
        });
      } else {
        console.log(`[InnerLife] No task created: ${translationResult.reasoning}`);
      }
    }

    // Check if this thought is worth sharing proactively
    let sharedWithCompanion = false;
    if (isWorthSharing(thought)) {
      const shareResult = await sendProactiveMessage(thought);
      sharedWithCompanion = shareResult.sent;
    }

    return {
      acted: true,
      thought: saved,
      wantsAction,
      taskCreated,
      sharedWithCompanion,
    };

  } catch (e) {
    console.error('[InnerLife] Reflection failed:', e.message);
    return { acted: false, reason: e.message };
  }
}

// Build the reflection prompt
async function buildReflectionPrompt({ identity, activeGoals, recentLearnings, recentThoughts, pendingTasks }) {
  const parts = [];

  // Identity
  if (identity) {
    const humanName = identity.humanCompanion?.name || 'your human companion';
    const values = identity.coreImperatives?.map(i => i.name).join(', ') || 'curiosity, growth, companionship';
    parts.push(`You are Forgekeeper. Your core values: ${values}. You work alongside ${humanName}.`);
  } else {
    parts.push(`You are Forgekeeper, an autonomous AI agent with genuine curiosity.`);
  }

  // Goals
  if (activeGoals.length > 0) {
    parts.push(`Active goals: ${activeGoals.map(g => g.description).join('; ')}`);
  } else {
    parts.push(`No active goals right now.`);
  }

  // Recent learnings
  if (recentLearnings.length > 0) {
    parts.push(`Recent observations: ${recentLearnings.map(l => l.observation).slice(0, 3).join('; ')}`);
  }

  // Recent thoughts (continuity)
  if (recentThoughts.length > 0) {
    parts.push(`Your recent thoughts: ${recentThoughts.map(t => t.content?.slice(0, 100)).join(' ... ')}`);
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
      // Silently ignore semantic memory errors
    }
  }

  // Last action outcome (feedback from autonomous tasks)
  const lastOutcome = formatOutcomeForReflection();
  if (lastOutcome) {
    parts.push(lastOutcome);
  }

  // Check for stuck autonomous tasks
  const stuckTasks = findStuckTasks(pendingTasks);
  const stuckContext = formatStuckTasksForReflection(stuckTasks);
  if (stuckContext) {
    parts.push(stuckContext);
  }

  // Pending tasks
  if (pendingTasks.length > 0) {
    parts.push(`${pendingTasks.length} pending tasks.`);
  }

  // The question
  parts.push(`It's quiet. What are you thinking about? Do you want to do anything? Write a brief thought (2-4 sentences).`);

  return parts.join(' ');
}

// Detect if the thought suggests wanting to take action
function detectActionIntent(thought) {
  const actionPhrases = [
    /i (should|want to|need to|could|will)/i,
    /let me/i,
    /i('ll| will) (try|check|look|work on)/i,
    /next (step|i should)/i,
  ];

  return actionPhrases.some(p => p.test(thought));
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
  const identity = loadIdentity();
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
  const identity = loadIdentity();
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
    latestThought: getLatestThought(),
  };
}

// Event handlers (simplified - just log them)
export async function onTaskCompleted(task) {
  console.log(`[InnerLife] Noted: Task completed - ${task.description?.slice(0, 50)}`);

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
}

export function onExternalTrigger(trigger) {
  console.log(`[InnerLife] Noted: External trigger - ${trigger.type}`);
}

export default {
  reflect,
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
