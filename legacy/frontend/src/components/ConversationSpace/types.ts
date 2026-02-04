/**
 * Type definitions for Conversation Space UI components
 */

export type AgentId = 'forge' | 'scout' | 'loom' | 'anvil';
export type AuthorType = 'agent' | 'human' | 'system';
export type AgentState = 'thinking' | 'contributing' | 'complete';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

/**
 * Message object as stored in backend
 */
export interface Message {
  id: string;
  channel_id: string;
  thread_parent_id?: string | null;
  author_type: AuthorType;
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  metadata?: MessageMetadata | null;
  created_at: string;
  edited_at?: string | null;
  agent_state?: AgentState;
  elapsed_ms?: number;
}

/**
 * Message metadata (Assumption Transparency Protocol + Response Style)
 */
export interface MessageMetadata {
  primary_optimization?: string;
  assumed_constraints?: string[];
  tradeoffs_accepted?: string[];
  confidence?: 'low' | 'medium' | 'high';
  would_reconsider_if?: string[];
  challenge_type?: string;
  target_message_id?: string;
  response_style?: 'minimal' | 'conversational' | 'detailed';
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: AgentId;
  name: string;
  icon: string;
  color: string;
  role: string;
  threshold: number;
}

/**
 * Agent status (for presence bar)
 */
export interface AgentStatus {
  id: string;
  name: string;
  icon: string;
  role: string;
  running: boolean;
  channels: string[];
  threshold: number;
  state?: 'idle' | 'thinking' | 'contributing';
  relevance_score?: number;
}

/**
 * SSE Event types
 */
export interface SSEEvent {
  type: string;
  data: any;
  timestamp?: string;
}

export interface MessageCreatedEvent extends SSEEvent {
  type: 'message_created';
  data: {
    channel_id: string;
    message: Message;
  };
}

export interface AgentThinkingEvent extends SSEEvent {
  type: 'agent_thinking';
  data: {
    agent_id: string;
    channel_id: string;
    message_id: string;
    relevance_score: number;
  };
}

export interface AgentContributingEvent extends SSEEvent {
  type: 'agent_contributing';
  data: {
    agent_id: string;
    channel_id: string;
    message_id: string;
    status: string;
  };
}

export interface AgentChunkEvent extends SSEEvent {
  type: 'agent_chunk';
  data: {
    agent_id: string;
    channel_id: string;
    message_id: string;
    chunk: string;
  };
}

export interface AgentCompleteEvent extends SSEEvent {
  type: 'agent_complete';
  data: {
    agent_id: string;
    channel_id: string;
    message_id: string;
    elapsed_ms: number;
  };
}

export interface ReactionAddedEvent extends SSEEvent {
  type: 'reaction_added';
  data: {
    message_id: string;
    reaction_type: string;
    author_id: string;
  };
}

/**
 * Conversation Space status response
 */
export interface ConversationSpaceStatus {
  success: boolean;
  status: string;
  agents: AgentStatus[];
  channels: Array<{
    id: string;
    active_connections: number;
  }>;
  message_bus: {
    listenerCount: number;
    events: Record<string, number>;
    totalEvents: number;
  };
  timestamp: string;
}

/**
 * API response types
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MessagesResponse {
  success: boolean;
  messages: Message[];
  count: number;
}

export interface PostMessageRequest {
  content: string;
  metadata?: MessageMetadata;
  thread_parent_id?: string;
}

export interface PostMessageResponse {
  success: boolean;
  message: Message;
}

/**
 * Agent configuration map
 */
export const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  forge: {
    id: 'forge',
    name: 'Forge',
    icon: '🔨',
    color: '#f97316',
    role: 'Executor',
    threshold: 0.65
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    icon: '🔭',
    color: '#a855f7',
    role: 'Guardian',
    threshold: 0.55
  },
  loom: {
    id: 'loom',
    name: 'Loom',
    icon: '🧵',
    color: '#3b82f6',
    role: 'Verifier',
    threshold: 0.70
  },
  anvil: {
    id: 'anvil',
    name: 'Anvil',
    icon: '⚒️',
    color: '#10b981',
    role: 'Integrator',
    threshold: 0.75
  }
};
