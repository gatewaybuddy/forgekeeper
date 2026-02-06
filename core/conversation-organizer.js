// Conversation Organizer - Summarizes and indexes conversations for quick routing
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { query } from './claude.js';
import { atomicWriteFileSync } from './atomic-write.js';

const SUMMARIES_FILE = join(config.dataDir, 'conversation_summaries.json');
const CONVERSATIONS_DIR = join(config.dataDir, 'conversations');

// Summary structure:
// {
//   "userId": {
//     "sessionId": {
//       topic: "code",
//       summary: "Working on Forgekeeper session management...",
//       keywords: ["session", "routing", "timeout"],
//       messageCount: 15,
//       lastActivity: "2024-02-04T...",
//       status: "active" | "archived",
//       createdAt: "2024-02-04T...",
//       summarizedAt: "2024-02-04T..."
//     }
//   }
// }

// Load summaries
function loadSummaries() {
  if (!existsSync(SUMMARIES_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(SUMMARIES_FILE, 'utf-8'));
  } catch (error) {
    console.error('[Organizer] Failed to load summaries:', error.message);
    return {};
  }
}

// Save summaries
function saveSummaries(summaries) {
  try {
    atomicWriteFileSync(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));
  } catch (error) {
    console.error('[Organizer] Failed to save summaries:', error.message);
  }
}

// Load conversation history for a user
function loadConversation(userId) {
  const convFile = join(CONVERSATIONS_DIR, `${userId}.jsonl`);
  if (!existsSync(convFile)) return [];

  try {
    const lines = readFileSync(convFile, 'utf-8').split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l));
  } catch (error) {
    console.error(`[Organizer] Failed to load conversation ${userId}:`, error.message);
    return [];
  }
}

// Get recent messages (for context in routing decisions)
export function getRecentMessages(userId, limit = 10) {
  const messages = loadConversation(userId);
  return messages.slice(-limit);
}

// Get summary for a session
export function getSessionSummary(userId, sessionId) {
  const summaries = loadSummaries();
  return summaries[userId]?.[sessionId] || null;
}

// Get all summaries for a user
export function getUserSummaries(userId) {
  const summaries = loadSummaries();
  return summaries[userId] || {};
}

// Find best matching session based on message content
export function findBestSession(userId, message, options = {}) {
  const summaries = loadSummaries();
  const userSummaries = summaries[userId] || {};
  const maxAgeMinutes = options.maxAgeMinutes || 60; // Only consider sessions active in last hour
  const now = Date.now();

  let bestMatch = null;
  let bestScore = 0;

  const lowerMsg = message.toLowerCase();

  for (const [sessionId, summary] of Object.entries(userSummaries)) {
    // Skip archived sessions
    if (summary.status === 'archived') continue;

    // Check if session is recent enough
    const lastActivity = new Date(summary.lastActivity).getTime();
    const ageMinutes = (now - lastActivity) / (1000 * 60);
    if (ageMinutes > maxAgeMinutes) continue;

    // Score based on keyword matches
    let score = 0;

    // Check topic match
    if (summary.topic && lowerMsg.includes(summary.topic)) {
      score += 5;
    }

    // Check keyword matches
    if (summary.keywords) {
      for (const keyword of summary.keywords) {
        if (lowerMsg.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }
    }

    // Bonus for more recent activity
    const recencyBonus = Math.max(0, (maxAgeMinutes - ageMinutes) / maxAgeMinutes) * 3;
    score += recencyBonus;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { sessionId, summary, score };
    }
  }

  // Return match if score is good enough
  if (bestMatch && bestMatch.score >= 3) {
    console.log(`[Organizer] Found matching session ${bestMatch.sessionId.slice(0, 8)}... (score: ${bestMatch.score.toFixed(1)})`);
    return bestMatch;
  }

  return null;
}

// Update session summary (quick update without full summarization)
export function updateSessionActivity(userId, sessionId, topic, messagePreview) {
  const summaries = loadSummaries();

  if (!summaries[userId]) {
    summaries[userId] = {};
  }

  if (!summaries[userId][sessionId]) {
    summaries[userId][sessionId] = {
      topic,
      summary: messagePreview.slice(0, 100),
      keywords: extractKeywords(messagePreview),
      messageCount: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
  }

  summaries[userId][sessionId].lastActivity = new Date().toISOString();
  summaries[userId][sessionId].messageCount++;
  summaries[userId][sessionId].topic = topic;

  saveSummaries(summaries);
}

// Extract keywords from text (simple extraction)
function extractKeywords(text) {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'can', 'let', 'just', 'now', 'also', 'very', 'really', 'please', 'thanks']);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Count frequency
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Return top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// Full summarization of a session (uses Claude)
export async function summarizeSession(userId, sessionId, messages) {
  if (!messages || messages.length < 3) {
    return null; // Not enough to summarize
  }

  // Get last N messages for summarization
  const recentMessages = messages.slice(-20);
  const messageText = recentMessages
    .map(m => `${m.role}: ${m.content?.slice(0, 200)}`)
    .join('\n');

  const prompt = `Summarize this conversation in 2-3 sentences. Also extract 5-10 key topic keywords.

CONVERSATION:
${messageText}

Respond in JSON format:
{
  "summary": "Brief summary...",
  "keywords": ["keyword1", "keyword2", ...],
  "mainTopic": "code|research|planning|journal|chat|general"
}`;

  try {
    const result = await query(prompt, { timeout: 30000 });

    if (!result.success) {
      console.error('[Organizer] Summarization failed:', result.error);
      return null;
    }

    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[Organizer] Summarization error:', error.message);
    return null;
  }
}

// Archive old sessions
export function archiveOldSessions(userId, maxAgeHours = 24) {
  const summaries = loadSummaries();
  const userSummaries = summaries[userId] || {};
  const now = Date.now();
  let archived = 0;

  for (const [sessionId, summary] of Object.entries(userSummaries)) {
    if (summary.status === 'archived') continue;

    const lastActivity = new Date(summary.lastActivity || summary.createdAt).getTime();
    const ageHours = (now - lastActivity) / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      summary.status = 'archived';
      summary.archivedAt = new Date().toISOString();
      archived++;
    }
  }

  if (archived > 0) {
    saveSummaries(summaries);
    console.log(`[Organizer] Archived ${archived} old sessions for user ${userId}`);
  }

  return archived;
}

// Background organization task - run periodically
export async function organizeConversations() {
  console.log('[Organizer] Starting conversation organization...');

  const summaries = loadSummaries();
  let organized = 0;

  // Find all users with conversations
  if (!existsSync(CONVERSATIONS_DIR)) return 0;

  const files = readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const userId = file.replace('.jsonl', '');

    // Archive old sessions
    archiveOldSessions(userId);

    // Check if any sessions need summarization
    const userSummaries = summaries[userId] || {};

    for (const [sessionId, summary] of Object.entries(userSummaries)) {
      if (summary.status === 'archived') continue;

      // Summarize if never summarized or has many new messages
      const needsSummary = !summary.summarizedAt ||
        (summary.messageCount > 10 && summary.messageCount > (summary.summarizedMessageCount || 0) + 5);

      if (needsSummary) {
        const messages = loadConversation(userId);
        const result = await summarizeSession(userId, sessionId, messages);

        if (result) {
          summary.summary = result.summary;
          summary.keywords = result.keywords;
          summary.topic = result.mainTopic || summary.topic;
          summary.summarizedAt = new Date().toISOString();
          summary.summarizedMessageCount = summary.messageCount;
          organized++;
        }
      }
    }
  }

  if (organized > 0) {
    saveSummaries(summaries);
    console.log(`[Organizer] Organized ${organized} conversations`);
  }

  return organized;
}

// Get conversation index for quick search
export function getConversationIndex() {
  const summaries = loadSummaries();
  const index = [];

  for (const [userId, userSummaries] of Object.entries(summaries)) {
    for (const [sessionId, summary] of Object.entries(userSummaries)) {
      index.push({
        userId,
        sessionId,
        topic: summary.topic,
        summary: summary.summary,
        keywords: summary.keywords,
        status: summary.status,
        lastActivity: summary.lastActivity,
        messageCount: summary.messageCount,
      });
    }
  }

  // Sort by last activity (most recent first)
  return index.sort((a, b) =>
    new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0)
  );
}

export default {
  getRecentMessages,
  getSessionSummary,
  getUserSummaries,
  findBestSession,
  updateSessionActivity,
  summarizeSession,
  archiveOldSessions,
  organizeConversations,
  getConversationIndex,
};
