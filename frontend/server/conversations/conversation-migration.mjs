/**
 * Migration Script: Channel Messages → Conversations
 *
 * Migrates existing channel-based messages to the new conversation system
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ensureMetadataDirectories,
  createConversation,
  createProject,
  addConversationMessage
} from './conversation-metadata.mjs';

const CHANNELS_DIR = '.forgekeeper/conversation_spaces/channels';

/**
 * Read JSONL file
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
 * Migrate all channel messages to conversations
 */
export async function migrateChannelsToConversations() {
  console.log('[Migration] Starting migration from channels to conversations...');

  // Ensure new directories exist
  await ensureMetadataDirectories();

  // Create "Legacy" project for migrated conversations
  console.log('[Migration] Creating "Legacy" project...');
  const legacyProject = await createProject({
    name: 'Legacy Conversations',
    description: 'Conversations migrated from the old channel-based system',
    color: '#9ca3af'  // Gray
  });
  console.log(`[Migration] Created project: ${legacyProject.id}`);

  // Get all channel files
  try {
    await fs.access(CHANNELS_DIR);
  } catch {
    console.log('[Migration] No channels directory found, nothing to migrate');
    return { migrated: 0, conversations: [] };
  }

  const channelFiles = await fs.readdir(CHANNELS_DIR);
  const jsonlFiles = channelFiles.filter(f => f.endsWith('.jsonl'));

  console.log(`[Migration] Found ${jsonlFiles.length} channel(s) to migrate`);

  const migratedConversations = [];
  let totalMessages = 0;

  for (const file of jsonlFiles) {
    const channelId = file.replace('.jsonl', '');
    const filePath = path.join(CHANNELS_DIR, file);

    console.log(`[Migration] Processing channel: ${channelId}...`);

    // Read messages
    const messages = await readJSONL(filePath);

    if (messages.length === 0) {
      console.log(`[Migration]   No messages in ${channelId}, skipping`);
      continue;
    }

    // Create conversation for this channel
    const conversation = await createConversation({
      title: `Legacy: #${channelId}`,
      project_id: legacyProject.id,
      channel_id: channelId
    });

    console.log(`[Migration]   Created conversation: ${conversation.id}`);
    console.log(`[Migration]   Migrating ${messages.length} messages...`);

    // Add all messages to the new conversation
    for (const message of messages) {
      await addConversationMessage(conversation.id, message);
    }

    totalMessages += messages.length;
    migratedConversations.push({
      conversation_id: conversation.id,
      channel_id: channelId,
      message_count: messages.length
    });

    console.log(`[Migration]   ✓ Migrated ${messages.length} messages`);

    // Optionally rename the old channel file to .migrated
    const migratedPath = filePath + '.migrated';
    await fs.rename(filePath, migratedPath);
    console.log(`[Migration]   ✓ Renamed ${file} to ${file}.migrated`);
  }

  console.log('[Migration] ✅ Migration complete!');
  console.log(`[Migration]   Migrated ${migratedConversations.length} channels`);
  console.log(`[Migration]   Migrated ${totalMessages} total messages`);

  return {
    migrated: migratedConversations.length,
    total_messages: totalMessages,
    conversations: migratedConversations,
    project_id: legacyProject.id
  };
}

/**
 * Check if migration is needed
 */
export async function needsMigration() {
  try {
    await fs.access(CHANNELS_DIR);
    const files = await fs.readdir(CHANNELS_DIR);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    return jsonlFiles.length > 0;
  } catch {
    return false;
  }
}
