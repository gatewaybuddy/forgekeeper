/**
 * Abstract LLM provider interface
 */
import { z } from 'zod';

// Zod schemas for type safety
export const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});

export const completionOptionsSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
  topP: z.number().min(0).max(1).optional(),
  stop: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.unknown()).optional(),
  toolChoice: z.union([z.literal('auto'), z.literal('none'), z.object({})]).optional(),
  // Extended thinking for Claude Opus
  extendedThinking: z.boolean().optional(),
  thinkingTokens: z.number().optional(),
});

export const completionResultSchema = z.object({
  content: z.string(),
  thinkingContent: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional(),
  stopReason: z.enum(['stop', 'length', 'tool_calls', 'error']).optional(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
  cost: z.number().default(0),
  model: z.string(),
  provider: z.string(),
});

// TypeScript types
export type Message = z.infer<typeof messageSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type CompletionOptions = z.infer<typeof completionOptionsSchema>;
export type CompletionResult = z.infer<typeof completionResultSchema>;

// Provider health status
export interface ProviderHealth {
  available: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Abstract LLM provider interface
 */
export abstract class LLMProvider {
  abstract readonly name: string;
  abstract readonly models: string[];

  /**
   * Complete a chat conversation
   */
  abstract complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult>;

  /**
   * Stream completion (optional, not all providers support)
   */
  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<string, CompletionResult> {
    // Default: fall back to non-streaming
    const result = await this.complete(messages, options);
    yield result.content;
    return result;
  }

  /**
   * Health check
   */
  abstract healthCheck(): Promise<ProviderHealth>;

  /**
   * Estimate tokens for messages
   */
  abstract estimateTokens(messages: Message[]): number;
}
