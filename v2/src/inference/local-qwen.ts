/**
 * Local Qwen provider using llama.cpp server
 * OpenAI-compatible API
 */
import { LLMProvider, Message, CompletionOptions, CompletionResult, ProviderHealth } from './provider.js';
import { logger } from '../utils/logger.js';
import { estimateTokensFromMessages } from '../utils/tokens.js';
import { config } from '../utils/config.js';

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LocalQwenProvider extends LLMProvider {
  readonly name = 'local-qwen';
  readonly models = ['qwen3-coder-32b', 'qwen2.5-coder:7b'];

  private baseUrl: string;
  private modelName: string;

  constructor() {
    super();
    this.baseUrl = config.localQwenUrl;
    this.modelName = config.localQwenModel;
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/chat/completions`;

    try {
      logger.debug({ url, model: options?.model || this.modelName }, 'Calling local Qwen');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options?.model || this.modelName,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.0,
          max_tokens: options?.maxTokens ?? 8192,
          top_p: options?.topP ?? 0.4,
          stop: options?.stop,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error body');
        logger.error(
          { url, status: response.status, statusText: response.statusText, body: errorText },
          'Local Qwen HTTP error'
        );
        throw new Error(`Local Qwen API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OpenAIResponse;
      const choice = data.choices[0];

      if (!choice) {
        throw new Error('No response from local Qwen');
      }

      const duration = Date.now() - startTime;
      logger.debug({ duration, model: data.model }, 'Local Qwen completion');

      return {
        content: choice.message.content || '',
        stopReason: this.mapFinishReason(choice.finish_reason),
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        cost: 0, // Local inference is free
        model: data.model,
        provider: this.name,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { error: errorMessage, stack: errorStack, duration: Date.now() - startTime },
        'Local Qwen completion failed'
      );
      throw error;
    }
  }

  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<string, CompletionResult> {
    const startTime = Date.now();
    let accumulated = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options?.model || this.modelName,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.0,
          max_tokens: options?.maxTokens ?? 8192,
          top_p: options?.topP ?? 0.4,
          stop: options?.stop,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Local Qwen API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;

            if (delta) {
              accumulated += delta;
              completionTokens++;
              yield delta;
            }

            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens;
              completionTokens = parsed.usage.completion_tokens;
            }
          } catch (e) {
            logger.warn({ line }, 'Failed to parse SSE line');
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.debug({ duration, tokens: completionTokens }, 'Local Qwen streaming complete');

      return {
        content: accumulated,
        stopReason: 'stop',
        usage: {
          promptTokens: promptTokens || this.estimateTokens(messages),
          completionTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        cost: 0,
        model: 'qwen3-coder-32b',
        provider: this.name,
      };
    } catch (error) {
      logger.error({ error, duration: Date.now() - startTime }, 'Local Qwen streaming failed');
      throw error;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      // For Ollama, check /v1/models endpoint (OpenAI-compatible)
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          available: true,
          latencyMs,
        };
      }

      return {
        available: false,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        available: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  estimateTokens(messages: Message[]): number {
    return estimateTokensFromMessages(messages);
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }
}
