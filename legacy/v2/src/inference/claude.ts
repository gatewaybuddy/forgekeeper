/**
 * Claude provider for Anthropic API
 * Supports Opus 4.5, Sonnet 4.5, Haiku 4.5
 * Includes extended thinking for Opus
 */
import { LLMProvider, Message, CompletionOptions, CompletionResult, ProviderHealth } from './provider.js';
import { logger } from '../utils/logger.js';
import { estimateTokensFromMessages } from '../utils/tokens.js';
import { config } from '../utils/config.js';

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'thinking' | 'text';
    text: string;
    thinking?: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Pricing per million tokens (as of 2025-01)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
};

export class ClaudeProvider extends LLMProvider {
  readonly name = 'claude';
  readonly models = [config.opusModel, config.sonnetModel, config.haikuModel];

  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor() {
    super();

    if (!config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
    }

    this.apiKey = config.anthropicApiKey;
  }

  async complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const startTime = Date.now();
    const model = options?.model || config.sonnetModel;

    // Separate system messages from conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    try {
      const requestBody: any = {
        model,
        max_tokens: options?.maxTokens || 8192,
        messages: conversationMessages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature;
      }

      if (options?.topP !== undefined) {
        requestBody.top_p = options.topP;
      }

      // Extended thinking for Opus
      if (
        config.enableExtendedThinking &&
        options?.extendedThinking &&
        model.includes('opus')
      ) {
        requestBody.thinking = {
          type: 'enabled',
          budget_tokens: options.thinkingTokens || config.maxThinkingTokens,
        };
      }

      const response = await this.fetchWithRetry(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as AnthropicResponse;

      // Extract thinking and content
      let thinkingContent = '';
      let textContent = '';

      for (const block of data.content) {
        if (block.type === 'thinking') {
          thinkingContent += block.thinking || '';
        } else if (block.type === 'text') {
          textContent += block.text;
        }
      }

      const duration = Date.now() - startTime;
      const cost = this.calculateCost(model, data.usage.input_tokens, data.usage.output_tokens);

      logger.debug(
        { duration, model, cost, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
        'Claude completion'
      );

      return {
        content: textContent,
        thinkingContent: thinkingContent || undefined,
        stopReason: this.mapStopReason(data.stop_reason),
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        cost,
        model: data.model,
        provider: this.name,
      };
    } catch (error) {
      logger.error({ error, duration: Date.now() - startTime, model }, 'Claude completion failed');
      throw error;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      // Simple health check - try to complete with minimal tokens
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.haikuModel, // Use cheapest model
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(10000),
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

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          return response;
        }

        // Retry on 5xx errors
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn({ attempt, delay, error: lastError.message }, 'Retrying Claude API request');
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Find pricing by model family
    const modelFamily = Object.keys(PRICING).find((key) => model.includes(key));

    if (!modelFamily) {
      logger.warn({ model }, 'Unknown model for cost calculation');
      return 0;
    }

    const pricing = PRICING[modelFamily];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  private mapStopReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
