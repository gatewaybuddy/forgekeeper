// Session Manager - Handles session rotation, topic routing, and stuck detection
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

const SESSIONS_FILE = join(config.dataDir, 'user_sessions.json');
const SESSION_META_FILE = join(config.dataDir, 'session_metadata.json');
const TOPICS_FILE = join(config.dataDir, 'topics.json');

// Session metadata structure:
// {
//   "userId": {
//     "default": { sessionId, messageCount, createdAt, lastUsed, topic: "general" },
//     "topic_code": { sessionId, messageCount, createdAt, lastUsed, topic: "code" },
//     ...
//   }
// }

// Default config values
const DEFAULT_CONFIG = {
  maxMessagesPerSession: 50,      // Rotate after this many messages
  maxSessionAgeHours: 24,         // Rotate after this many hours
  enableTopicRouting: true,       // Enable topic-based routing
  resumeTimeoutMs: 60000,         // Fail fast if resume takes > 60s
};

// Default topic patterns (can be extended via topics.json)
const DEFAULT_TOPICS = {
  code: {
    keywords: ['code', 'function', 'bug', 'error', 'implement', 'refactor', 'test', 'debug', 'fix', 'class', 'method', 'variable', 'syntax'],
    description: 'Programming and code-related discussions',
    active: true,
  },
  research: {
    keywords: ['research', 'find', 'search', 'look up', 'what is', 'how does', 'explain', 'learn', 'understand'],
    description: 'Research and learning topics',
    active: true,
  },
  planning: {
    keywords: ['plan', 'goal', 'task', 'project', 'roadmap', 'strategy', 'design', 'architecture', 'feature'],
    description: 'Project planning and strategy',
    active: true,
  },
  journal: {
    keywords: ['journal', 'reflect', 'thought', 'feeling', 'observe', 'note', 'diary'],
    description: 'Personal reflections and journaling',
    active: true,
  },
  chat: {
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'how are you', 'thanks', 'thank you', 'bye'],
    description: 'General conversation and greetings',
    active: true,
  },
};

// Load custom topics (merged with defaults)
function loadTopics() {
  let customTopics = {};
  if (existsSync(TOPICS_FILE)) {
    try {
      customTopics = JSON.parse(readFileSync(TOPICS_FILE, 'utf-8'));
    } catch (error) {
      console.error('[SessionManager] Failed to load custom topics:', error.message);
    }
  }
  // Merge: custom topics override defaults
  return { ...DEFAULT_TOPICS, ...customTopics };
}

// Save topics config
function saveTopics(topics) {
  try {
    writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2));
    console.log('[SessionManager] Saved topics config');
  } catch (error) {
    console.error('[SessionManager] Failed to save topics:', error.message);
  }
}

// Add or update a topic
export function addTopic(name, keywords, description = '') {
  const topics = loadTopics();
  topics[name] = {
    keywords: Array.isArray(keywords) ? keywords : [keywords],
    description,
    active: true,
    createdAt: new Date().toISOString(),
  };
  saveTopics(topics);
  console.log(`[SessionManager] Added/updated topic: ${name}`);
  return topics[name];
}

// Archive (disable) a topic
export function archiveTopic(name) {
  const topics = loadTopics();
  if (topics[name]) {
    topics[name].active = false;
    topics[name].archivedAt = new Date().toISOString();
    saveTopics(topics);
    console.log(`[SessionManager] Archived topic: ${name}`);
    return true;
  }
  return false;
}

// Reactivate an archived topic
export function reactivateTopic(name) {
  const topics = loadTopics();
  if (topics[name]) {
    topics[name].active = true;
    delete topics[name].archivedAt;
    saveTopics(topics);
    console.log(`[SessionManager] Reactivated topic: ${name}`);
    return true;
  }
  return false;
}

// List all topics
export function listTopics(includeArchived = false) {
  const topics = loadTopics();
  if (includeArchived) return topics;
  return Object.fromEntries(
    Object.entries(topics).filter(([_, t]) => t.active !== false)
  );
}

// Get topic patterns for detection (only active topics)
function getActiveTopicPatterns() {
  const topics = loadTopics();
  const patterns = {};
  for (const [name, topic] of Object.entries(topics)) {
    if (topic.active !== false) {
      patterns[name] = topic.keywords;
    }
  }
  return patterns;
}

// Load session metadata
function loadMetadata() {
  if (!existsSync(SESSION_META_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(SESSION_META_FILE, 'utf-8'));
  } catch (error) {
    console.error('[SessionManager] Failed to load metadata:', error.message);
    return {};
  }
}

// Save session metadata
function saveMetadata(metadata) {
  try {
    writeFileSync(SESSION_META_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('[SessionManager] Failed to save metadata:', error.message);
  }
}

// Load legacy sessions file (for backwards compatibility)
function loadLegacySessions() {
  if (!existsSync(SESSIONS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch (error) {
    return {};
  }
}

// Save to legacy sessions file (for backwards compatibility)
function saveLegacySessions(sessions) {
  try {
    writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error('[SessionManager] Failed to save sessions:', error.message);
  }
}

// Detect topic from message
export function detectTopic(message) {
  const lowerMsg = message.toLowerCase();
  const topicPatterns = getActiveTopicPatterns();

  // Score each topic
  const scores = {};
  for (const [topic, keywords] of Object.entries(topicPatterns)) {
    scores[topic] = keywords.filter(kw => lowerMsg.includes(kw)).length;
  }

  // Find highest scoring topic
  let bestTopic = 'general';
  let bestScore = 0;
  for (const [topic, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  // If no clear topic detected, use 'general'
  return bestScore > 0 ? bestTopic : 'general';
}

// Check if session needs rotation
function needsRotation(sessionMeta) {
  if (!sessionMeta) return true;

  const cfg = config.sessionManager || DEFAULT_CONFIG;
  const maxMessages = cfg.maxMessagesPerSession || DEFAULT_CONFIG.maxMessagesPerSession;
  const maxAgeHours = cfg.maxSessionAgeHours || DEFAULT_CONFIG.maxSessionAgeHours;

  // Check message count
  if (sessionMeta.messageCount >= maxMessages) {
    console.log(`[SessionManager] Session rotation: message count ${sessionMeta.messageCount} >= ${maxMessages}`);
    return true;
  }

  // Check age
  const ageHours = (Date.now() - new Date(sessionMeta.createdAt).getTime()) / (1000 * 60 * 60);
  if (ageHours >= maxAgeHours) {
    console.log(`[SessionManager] Session rotation: age ${ageHours.toFixed(1)}h >= ${maxAgeHours}h`);
    return true;
  }

  return false;
}

// Create new session metadata
function createSessionMeta(topic = 'general') {
  return {
    sessionId: randomUUID(),
    messageCount: 0,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    topic,
  };
}

// Get or create session for user (simplified - one session per user)
export function getSession(userId, message) {
  const metadata = loadMetadata();

  // Initialize user metadata if needed
  if (!metadata[userId]) {
    metadata[userId] = {};
  }

  // SIMPLIFIED: One session per user, no topic routing
  const sessionKey = 'default';
  let sessionMeta = metadata[userId][sessionKey];

  // Check if we need to rotate or create new
  if (needsRotation(sessionMeta)) {
    console.log(`[SessionManager] Creating new session for user ${userId}`);
    sessionMeta = createSessionMeta('default');
    metadata[userId][sessionKey] = sessionMeta;
    saveMetadata(metadata);

    // Update legacy sessions file for backwards compatibility
    const legacySessions = loadLegacySessions();
    legacySessions[userId] = sessionMeta.sessionId;
    saveLegacySessions(legacySessions);
  }

  return {
    sessionId: sessionMeta.sessionId,
    topic: 'default',
    messageCount: sessionMeta.messageCount,
    isNew: sessionMeta.messageCount === 0,
  };
}

// Record that a message was sent on a session
export function recordMessage(userId, sessionId) {
  const metadata = loadMetadata();

  if (!metadata[userId]) return;

  // Find and update the session
  for (const [key, meta] of Object.entries(metadata[userId])) {
    if (meta.sessionId === sessionId) {
      meta.messageCount++;
      meta.lastUsed = new Date().toISOString();
      saveMetadata(metadata);
      console.log(`[SessionManager] Session ${sessionId.slice(0, 8)}... message count: ${meta.messageCount}`);
      return;
    }
  }
}

// Force rotate session for user (e.g., /newsession command)
// Clears ALL sessions for the user to prevent smart routing from reconnecting to old sessions
export function rotateSession(userId, topic = 'default') {
  const metadata = loadMetadata();

  // IMPORTANT: Clear ALL sessions for this user to prevent smart routing reconnects
  metadata[userId] = {};

  // Create fresh session
  const sessionKey = topic === 'default' ? 'default' : `topic_${topic}`;
  const sessionMeta = createSessionMeta(topic);
  metadata[userId][sessionKey] = sessionMeta;
  saveMetadata(metadata);

  // Update legacy sessions file
  const legacySessions = loadLegacySessions();
  legacySessions[userId] = sessionMeta.sessionId;
  saveLegacySessions(legacySessions);

  console.log(`[SessionManager] Cleared all sessions and rotated for user ${userId}: ${sessionMeta.sessionId.slice(0, 8)}...`);

  return sessionMeta.sessionId;
}

// Get all sessions for a user (for status/debug)
export function getUserSessions(userId) {
  const metadata = loadMetadata();
  return metadata[userId] || {};
}

// Get resume timeout (for stuck detection)
export function getResumeTimeout() {
  const cfg = config.sessionManager || DEFAULT_CONFIG;
  return cfg.resumeTimeoutMs || DEFAULT_CONFIG.resumeTimeoutMs;
}

// Clean up old sessions (can be called periodically)
export function cleanupOldSessions(maxAgeDays = 7) {
  const metadata = loadMetadata();
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;

  for (const userId of Object.keys(metadata)) {
    for (const [key, meta] of Object.entries(metadata[userId])) {
      const lastUsed = new Date(meta.lastUsed).getTime();
      if (lastUsed < cutoff) {
        delete metadata[userId][key];
        cleaned++;
      }
    }
    // Remove user if no sessions left
    if (Object.keys(metadata[userId]).length === 0) {
      delete metadata[userId];
    }
  }

  if (cleaned > 0) {
    saveMetadata(metadata);
    console.log(`[SessionManager] Cleaned up ${cleaned} old sessions`);
  }

  return cleaned;
}

export default {
  detectTopic,
  getSession,
  recordMessage,
  rotateSession,
  getUserSessions,
  getResumeTimeout,
  cleanupOldSessions,
  // Topic management
  addTopic,
  archiveTopic,
  reactivateTopic,
  listTopics,
};
