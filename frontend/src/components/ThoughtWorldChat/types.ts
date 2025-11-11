/**
 * Types for Thought World Interactive Chat
 */

export interface AgentMessage {
  id: string;
  timestamp: Date;
  iteration: number;
  agent: 'forge' | 'scout' | 'loom' | 'anvil' | 'system' | 'human';
  role: 'executor' | 'challenger' | 'verifier' | 'integrator' | 'tool' | 'user';
  content: string;
  status: 'thinking' | 'streaming' | 'complete' | 'waiting_human';
  elapsed?: number;

  // For human input requests
  humanInputRequest?: HumanInputRequest;

  // For tool execution display
  toolExecution?: ToolExecution;
}

export interface HumanInputRequest {
  inputId: string;
  question: string;
  context: Record<string, any>;
  suggestedActions: SuggestedAction[];
  urgency: 'low' | 'medium' | 'high';
}

export interface SuggestedAction {
  label: string;
  action: string;
  icon: string;
}

export interface ToolExecution {
  tool: string;
  arguments: Record<string, any>;
  result?: any;
  success?: boolean;
  error?: string;
  elapsed?: number;
}

export interface AgentConfig {
  forge: { provider: string; model: string };
  scout: { provider: string; model: string };
  loom: { provider: string; model: string };
  anvil: { provider: string; model: string };
}

export interface SessionConfig {
  sessionId: string;
  task: string;
  maxIterations: number;
  autonomyLevel: number;
  agentConfig: AgentConfig;
}
