/**
 * Conversation Metadata Management
 *
 * Manages conversations and projects with JSONL storage
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';

const METADATA_DIR = '.forgekeeper/conversation_spaces/metadata';
const CONVERSATIONS_FILE = path.join(METADATA_DIR, 'conversations.jsonl');
const PROJECTS_FILE = path.join(METADATA_DIR, 'projects.jsonl');
const CONVERSATIONS_DIR = '.forgekeeper/conversation_spaces/conversations';
const ARCHIVES_DIR = '.forgekeeper/conversation_spaces/archives';

/**
 * Ensure metadata directories exist
 */
export async function ensureMetadataDirectories() {
  await fs.mkdir(METADATA_DIR, { recursive: true });
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  await fs.mkdir(ARCHIVES_DIR, { recursive: true });
}

/**
 * Read all entries from a JSONL file
 */
async function readJSONL(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Append entry to JSONL file
 */
async function appendJSONL(filePath, entry) {
  await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Rewrite JSONL file (for updates/deletes)
 */
async function writeJSONL(filePath, entries) {
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf8');
}

// ==================== CONVERSATIONS ====================

/**
 * Get all conversations with optional filters
 */
export async function getAllConversations({ status, project_id, limit } = {}) {
  const conversations = await readJSONL(CONVERSATIONS_FILE);

  let filtered = conversations;

  if (status) {
    filtered = filtered.filter(c => c.status === status);
  }

  if (project_id !== undefined) {
    filtered = filtered.filter(c => c.project_id === project_id);
  }

  // Sort by updated_at descending
  filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  if (limit) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

/**
 * Get conversation by ID
 */
export async function getConversation(id) {
  const conversations = await readJSONL(CONVERSATIONS_FILE);
  return conversations.find(c => c.id === id);
}

/**
 * Create new conversation
 */
export async function createConversation({ title, project_id = null, channel_id = 'general' }) {
  const now = new Date().toISOString();

  const conversation = {
    id: ulid(),
    title: title || `Conversation ${new Date().toLocaleString()}`,
    project_id,
    channel_id,
    created_at: now,
    updated_at: now,
    status: 'active',
    message_count: 0,
    last_message_preview: ''
  };

  await appendJSONL(CONVERSATIONS_FILE, conversation);

  // Create empty messages file
  const messagesPath = path.join(CONVERSATIONS_DIR, `${conversation.id}.jsonl`);
  await fs.writeFile(messagesPath, '', 'utf8');

  return conversation;
}

/**
 * Update conversation metadata
 */
export async function updateConversation(id, updates) {
  const conversations = await readJSONL(CONVERSATIONS_FILE);
  const index = conversations.findIndex(c => c.id === id);

  if (index === -1) {
    throw new Error(`Conversation not found: ${id}`);
  }

  const updated = {
    ...conversations[index],
    ...updates,
    updated_at: new Date().toISOString()
  };

  conversations[index] = updated;
  await writeJSONL(CONVERSATIONS_FILE, conversations);

  return updated;
}

/**
 * Update conversation's message count and preview
 */
export async function updateConversationStats(id, message_count, last_message_preview) {
  return updateConversation(id, { message_count, last_message_preview });
}

/**
 * Archive conversation
 */
export async function archiveConversation(id) {
  const conversations = await readJSONL(CONVERSATIONS_FILE);
  const conversation = conversations.find(c => c.id === id);

  if (!conversation) {
    throw new Error(`Conversation not found: ${id}`);
  }

  // Read messages
  const messagesPath = path.join(CONVERSATIONS_DIR, `${id}.jsonl`);
  const messages = await readJSONL(messagesPath);

  // Write to archive
  const archivePath = path.join(ARCHIVES_DIR, `${id}.jsonl`);
  await writeJSONL(archivePath, messages);

  // Update status
  await updateConversation(id, { status: 'archived' });

  return {
    conversation,
    archived_messages: messages.length,
    archive_path: archivePath
  };
}

/**
 * Delete conversation permanently
 */
export async function deleteConversation(id) {
  const conversations = await readJSONL(CONVERSATIONS_FILE);
  const filtered = conversations.filter(c => c.id !== id);

  if (filtered.length === conversations.length) {
    throw new Error(`Conversation not found: ${id}`);
  }

  await writeJSONL(CONVERSATIONS_FILE, filtered);

  // Delete messages file
  const messagesPath = path.join(CONVERSATIONS_DIR, `${id}.jsonl`);
  try {
    await fs.unlink(messagesPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Delete archive if exists
  const archivePath = path.join(ARCHIVES_DIR, `${id}.jsonl`);
  try {
    await fs.unlink(archivePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Get messages for a conversation
 */
export async function getConversationMessages(id) {
  const messagesPath = path.join(CONVERSATIONS_DIR, `${id}.jsonl`);
  return readJSONL(messagesPath);
}

/**
 * Add message to conversation
 */
export async function addConversationMessage(id, message) {
  const messagesPath = path.join(CONVERSATIONS_DIR, `${id}.jsonl`);
  await appendJSONL(messagesPath, message);

  // Update conversation stats
  const messages = await readJSONL(messagesPath);
  const preview = message.content.slice(0, 100);
  await updateConversationStats(id, messages.length, preview);

  return message;
}

// ==================== PROJECTS ====================

/**
 * Get all projects
 */
export async function getAllProjects() {
  const projects = await readJSONL(PROJECTS_FILE);
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get project by ID
 */
export async function getProject(id) {
  const projects = await readJSONL(PROJECTS_FILE);
  return projects.find(p => p.id === id);
}

/**
 * Create new project
 */
export async function createProject({ name, description = '', color = '#3b82f6' }) {
  const project = {
    id: ulid(),
    name,
    description,
    color,
    created_at: new Date().toISOString()
  };

  await appendJSONL(PROJECTS_FILE, project);
  return project;
}

/**
 * Update project
 */
export async function updateProject(id, updates) {
  const projects = await readJSONL(PROJECTS_FILE);
  const index = projects.findIndex(p => p.id === id);

  if (index === -1) {
    throw new Error(`Project not found: ${id}`);
  }

  const updated = { ...projects[index], ...updates };
  projects[index] = updated;
  await writeJSONL(PROJECTS_FILE, projects);

  return updated;
}

/**
 * Delete project (moves conversations to null project_id)
 */
export async function deleteProject(id) {
  const projects = await readJSONL(PROJECTS_FILE);
  const filtered = projects.filter(p => p.id !== id);

  if (filtered.length === projects.length) {
    throw new Error(`Project not found: ${id}`);
  }

  await writeJSONL(PROJECTS_FILE, filtered);

  // Update all conversations in this project
  const conversations = await readJSONL(CONVERSATIONS_FILE);
  const updated = conversations.map(c =>
    c.project_id === id ? { ...c, project_id: null, updated_at: new Date().toISOString() } : c
  );
  await writeJSONL(CONVERSATIONS_FILE, updated);
}

// ==================== SEARCH ====================

/**
 * Search across conversations
 */
export async function searchConversations(query, { limit = 20, project_id, status = 'active' } = {}) {
  const conversations = await getAllConversations({ project_id, status });
  const results = [];

  const queryLower = query.toLowerCase();

  for (const conversation of conversations) {
    const messages = await getConversationMessages(conversation.id);

    for (const message of messages) {
      const contentLower = message.content.toLowerCase();

      if (contentLower.includes(queryLower)) {
        // Simple relevance scoring (can be improved)
        const score = message.content.split(new RegExp(query, 'gi')).length - 1;

        results.push({
          conversation,
          message,
          score
        });
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
