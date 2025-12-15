/**
 * Message Bus - Event-driven messaging system for conversation spaces
 *
 * Provides pub/sub pattern for agents and UI components to communicate asynchronously.
 * Built on Node.js EventEmitter with typed events for type safety and IDE support.
 *
 * Event Types:
 * - message_created: New message posted to channel
 * - message_edited: Message content updated
 * - agent_thinking: Agent is processing but hasn't decided to contribute yet
 * - agent_contributing: Agent has decided to post a message
 * - agent_chunk: Streaming content chunk from agent
 * - agent_complete: Agent finished posting message
 * - reaction_added: Reaction (e.g., "tracking") added to message
 * - reaction_removed: Reaction removed from message
 * - channel_created: New channel created
 * - channel_updated: Channel metadata updated
 * - topic_changed: Channel topic/focus updated
 * - agent_online: Agent started monitoring
 * - agent_offline: Agent stopped monitoring
 */

import { EventEmitter } from 'node:events';

// Singleton message bus instance
class ConversationMessageBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many agents + UI connections
    this.eventCounts = new Map(); // Track event counts for monitoring
  }

  /**
   * Emit a typed event with automatic counting
   *
   * @param {string} eventType - Event type identifier
   * @param {object} data - Event data
   */
  async emitEvent(eventType, data) {
    // Track event counts
    const count = this.eventCounts.get(eventType) || 0;
    this.eventCounts.set(eventType, count + 1);

    // Add timestamp if not present
    const eventData = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
      event_type: eventType
    };

    // Emit to listeners
    this.emit(eventType, eventData);

    // Also emit to wildcard listeners (for logging/monitoring)
    this.emit('*', eventData);

    return eventData;
  }

  /**
   * Get event statistics (for monitoring/debugging)
   *
   * @returns {object} Event counts by type
   */
  getStats() {
    return {
      listenerCount: this.eventNames().length,
      events: Object.fromEntries(this.eventCounts),
      totalEvents: Array.from(this.eventCounts.values()).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Reset event statistics
   */
  resetStats() {
    this.eventCounts.clear();
  }
}

// Export singleton instance
export const MessageBus = new ConversationMessageBus();

// Event creator helpers for type safety

/**
 * Create a message_created event
 *
 * @param {string} channelId - Channel where message was created
 * @param {object} message - The full message object
 * @returns {Promise<object>} Event data
 */
export async function emitMessageCreated(channelId, message) {
  return MessageBus.emitEvent('message_created', {
    channel_id: channelId,
    message
  });
}

/**
 * Create a message_edited event
 *
 * @param {string} channelId - Channel where message was edited
 * @param {string} messageId - Message ID that was edited
 * @param {string} newContent - New message content
 * @param {string} editedAt - Timestamp of edit
 * @returns {Promise<object>} Event data
 */
export async function emitMessageEdited(channelId, messageId, newContent, editedAt) {
  return MessageBus.emitEvent('message_edited', {
    channel_id: channelId,
    message_id: messageId,
    new_content: newContent,
    edited_at: editedAt
  });
}

/**
 * Create an agent_thinking event
 *
 * @param {string} agentId - Agent ID (e.g., "forge", "scout")
 * @param {string} channelId - Channel being monitored
 * @param {string} messageId - Message being assessed
 * @param {number} relevanceScore - Relevance score (0.0-1.0)
 * @returns {Promise<object>} Event data
 */
export async function emitAgentThinking(agentId, channelId, messageId, relevanceScore) {
  return MessageBus.emitEvent('agent_thinking', {
    agent_id: agentId,
    channel_id: channelId,
    message_id: messageId,
    relevance_score: relevanceScore
  });
}

/**
 * Create an agent_contributing event
 *
 * @param {string} agentId - Agent ID
 * @param {string} channelId - Channel where agent is posting
 * @param {string} messageId - Message ID being created
 * @param {string} status - Status (generating | streaming | complete)
 * @returns {Promise<object>} Event data
 */
export async function emitAgentContributing(agentId, channelId, messageId, status = 'generating') {
  return MessageBus.emitEvent('agent_contributing', {
    agent_id: agentId,
    channel_id: channelId,
    message_id: messageId,
    status
  });
}

/**
 * Create an agent_chunk event (streaming content)
 *
 * @param {string} agentId - Agent ID
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID being streamed
 * @param {string} chunk - Content chunk
 * @returns {Promise<object>} Event data
 */
export async function emitAgentChunk(agentId, channelId, messageId, chunk) {
  return MessageBus.emitEvent('agent_chunk', {
    agent_id: agentId,
    channel_id: channelId,
    message_id: messageId,
    chunk
  });
}

/**
 * Create an agent_complete event
 *
 * @param {string} agentId - Agent ID
 * @param {string} channelId - Channel ID
 * @param {string} messageId - Message ID that was completed
 * @param {number} elapsedMs - Time taken in milliseconds
 * @returns {Promise<object>} Event data
 */
export async function emitAgentComplete(agentId, channelId, messageId, elapsedMs) {
  return MessageBus.emitEvent('agent_complete', {
    agent_id: agentId,
    channel_id: channelId,
    message_id: messageId,
    elapsed_ms: elapsedMs
  });
}

/**
 * Create a reaction_added event
 *
 * @param {string} messageId - Message that received reaction
 * @param {string} reactionType - Reaction type (e.g., "tracking", "agree", "question")
 * @param {string} authorId - Who added the reaction
 * @returns {Promise<object>} Event data
 */
export async function emitReactionAdded(messageId, reactionType, authorId) {
  return MessageBus.emitEvent('reaction_added', {
    message_id: messageId,
    reaction_type: reactionType,
    author_id: authorId
  });
}

/**
 * Create a reaction_removed event
 *
 * @param {string} messageId - Message that lost reaction
 * @param {string} reactionType - Reaction type removed
 * @param {string} authorId - Who removed the reaction
 * @returns {Promise<object>} Event data
 */
export async function emitReactionRemoved(messageId, reactionType, authorId) {
  return MessageBus.emitEvent('reaction_removed', {
    message_id: messageId,
    reaction_type: reactionType,
    author_id: authorId
  });
}

/**
 * Create a channel_created event
 *
 * @param {string} channelId - New channel ID
 * @param {string} channelName - Channel name
 * @param {string} createdBy - Who created the channel
 * @param {Array} agents - Array of agent IDs monitoring this channel
 * @returns {Promise<object>} Event data
 */
export async function emitChannelCreated(channelId, channelName, createdBy, agents = []) {
  return MessageBus.emitEvent('channel_created', {
    channel_id: channelId,
    channel_name: channelName,
    created_by: createdBy,
    agents
  });
}

/**
 * Create a topic_changed event
 *
 * @param {string} channelId - Channel ID
 * @param {string} topic - New topic/focus
 * @param {string} changedBy - Who changed the topic
 * @returns {Promise<object>} Event data
 */
export async function emitTopicChanged(channelId, topic, changedBy) {
  return MessageBus.emitEvent('topic_changed', {
    channel_id: channelId,
    topic,
    changed_by: changedBy
  });
}

/**
 * Create an agent_online event
 *
 * @param {string} agentId - Agent ID
 * @param {Array} channels - Channels agent is monitoring
 * @returns {Promise<object>} Event data
 */
export async function emitAgentOnline(agentId, channels = []) {
  return MessageBus.emitEvent('agent_online', {
    agent_id: agentId,
    channels
  });
}

/**
 * Create an agent_offline event
 *
 * @param {string} agentId - Agent ID
 * @returns {Promise<object>} Event data
 */
export async function emitAgentOffline(agentId) {
  return MessageBus.emitEvent('agent_offline', {
    agent_id: agentId
  });
}

/**
 * Subscribe to all events (for logging/monitoring)
 *
 * @param {Function} listener - Listener function that receives all events
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAllEvents(listener) {
  MessageBus.on('*', listener);

  return () => {
    MessageBus.off('*', listener);
  };
}

/**
 * Subscribe to a specific event type
 *
 * @param {string} eventType - Event type to subscribe to
 * @param {Function} listener - Listener function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(eventType, listener) {
  MessageBus.on(eventType, listener);

  return () => {
    MessageBus.off(eventType, listener);
  };
}

/**
 * Subscribe to multiple event types
 *
 * @param {Array<string>} eventTypes - Array of event types
 * @param {Function} listener - Listener function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToMany(eventTypes, listener) {
  for (const eventType of eventTypes) {
    MessageBus.on(eventType, listener);
  }

  return () => {
    for (const eventType of eventTypes) {
      MessageBus.off(eventType, listener);
    }
  };
}
