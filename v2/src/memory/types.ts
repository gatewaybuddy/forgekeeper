/**
 * Memory system types
 */

// Episodic memory entry
export interface EpisodicEntry {
  sessionId: string;
  timestamp: number;
  summary: string;
  taskType: string;
  outcome: 'success' | 'failure' | 'partial';
  integrationScore: number;
  challengesIssued: number;
  iterations: number;
  filesChanged?: string[];
  toolsUsed?: string[];
  agentParticipation: {
    forge: number;
    loom: number;
    anvil: number;
    scout: number;
  };
  embedding?: number[]; // TF-IDF vector
  keywords: string[];
}

// Context log entry
export interface ContextLogEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  actor: string; // agent name or 'system' or 'user'
  action: string; // 'proposal', 'challenge', 'decision', 'tool_execution', etc.
  data: any;
  iteration?: number;
  duration?: number;
}

// Similarity match result
export interface SimilarityMatch {
  entry: EpisodicEntry;
  similarity: number;
  matchedKeywords: string[];
}

// Search query
export interface MemoryQuery {
  text?: string;
  taskType?: string;
  minScore?: number;
  limit?: number;
  timeRange?: {
    start: number;
    end: number;
  };
}
