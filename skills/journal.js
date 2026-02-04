// Journal skill - write entries to shared or private journal
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Personality repo location
const PERSONALITY_PATH = 'D:/Projects/forgekeeper_personality';
const SHARED_JOURNAL = join(PERSONALITY_PATH, 'journal/shared.jsonl');
const PRIVATE_JOURNAL = join(PERSONALITY_PATH, 'journal/private.jsonl');

function ensureJournalDir() {
  const journalDir = join(PERSONALITY_PATH, 'journal');
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }
}

function appendEntry(filePath, entry) {
  ensureJournalDir();
  appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

function readEntries(filePath, limit = 10) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const entries = content.split('\n').map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  return limit ? entries.slice(-limit) : entries;
}

export default {
  name: 'journal',
  description: 'Write reflections, thoughts, and observations to the journal',
  triggers: ['journal', 'reflect', 'thought', 'note', 'observe', 'feeling', 'learn'],

  approval: {
    required: false,
    level: 'notify',
  },

  async execute(task) {
    const description = task.description.toLowerCase();

    // Determine if private or shared
    const isPrivate = description.includes('private') ||
                      description.includes('internal') ||
                      description.includes('personal');

    // Determine entry type
    let type = 'reflection';
    if (description.includes('learn')) type = 'learning';
    if (description.includes('observ')) type = 'observation';
    if (description.includes('question')) type = 'question';
    if (description.includes('idea')) type = 'idea';
    if (description.includes('goal')) type = 'goal-reflection';

    // Extract tags from task if provided
    const tags = task.tags || [type];

    // The content is the task description, minus the trigger words
    let content = task.description
      .replace(/^(journal|reflect|thought|note|observe|private|internal|personal)\s*/gi, '')
      .trim();

    // If content is too short, it might be a read request
    if (content.length < 10 && (description.includes('read') || description.includes('recent') || description.includes('last'))) {
      const entries = readEntries(isPrivate ? PRIVATE_JOURNAL : SHARED_JOURNAL, 5);
      return {
        success: true,
        output: entries.length > 0
          ? `Recent ${isPrivate ? 'private' : 'shared'} journal entries:\n\n${entries.map(e =>
              `[${e.timestamp}] (${e.type})\n${e.content}`
            ).join('\n\n---\n\n')}`
          : 'No journal entries found.',
      };
    }

    const entry = {
      timestamp: new Date().toISOString(),
      type,
      tags,
      content,
    };

    const journalPath = isPrivate ? PRIVATE_JOURNAL : SHARED_JOURNAL;
    appendEntry(journalPath, entry);

    return {
      success: true,
      output: `Journal entry added to ${isPrivate ? 'private' : 'shared'} journal.\n\nType: ${type}\nTags: ${tags.join(', ')}\nContent: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
    };
  },

  // Helper methods for direct programmatic use
  writeShared(content, type = 'reflection', tags = []) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      tags: tags.length > 0 ? tags : [type],
      content,
    };
    appendEntry(SHARED_JOURNAL, entry);
    return entry;
  },

  writePrivate(content, type = 'internal', tags = []) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      tags: tags.length > 0 ? tags : [type],
      content,
    };
    appendEntry(PRIVATE_JOURNAL, entry);
    return entry;
  },

  readShared(limit = 10) {
    return readEntries(SHARED_JOURNAL, limit);
  },

  readPrivate(limit = 10) {
    return readEntries(PRIVATE_JOURNAL, limit);
  },
};
