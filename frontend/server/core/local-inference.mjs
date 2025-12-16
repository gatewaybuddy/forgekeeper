/**
 * Local Inference Client
 *
 * Wrapper for local llama.cpp inference server.
 * Provides OpenAI-compatible API for routing simple requests locally.
 *
 * Benefits:
 * - Zero API cost for simple tasks
 * - Fast response for basic queries
 * - Unlimited iterations
 *
 * @module server/core/local-inference
 */

import fetch from 'node-fetch';

/**
 * Get local inference configuration
 */
function getConfig() {
  return {
    apiBase: process.env.FK_CORE_API_BASE || 'http://localhost:8001/v1',
    model: process.env.FRONTEND_VLLM_MODEL || 'core',
    maxTokens: parseInt(process.env.FRONTEND_MAX_TOKENS || '8192', 10),
    temperature: parseFloat(process.env.FRONTEND_TEMP || '0.0'),
    enabled: process.env.FK_CORE_KIND !== 'none',
  };
}

/**
 * Local inference client for llama.cpp
 */
export class LocalInferenceClient {
  constructor(options = {}) {
    const config = getConfig();

    this.apiBase = options.apiBase || config.apiBase;
    this.model = options.model || config.model;
    this.maxTokens = options.maxTokens || config.maxTokens;
    this.temperature = options.temperature ?? config.temperature;
    this.enabled = config.enabled;
  }

  /**
   * Chat completion (OpenAI-compatible)
   *
   * @param {Object} params - Request parameters
   * @param {Array<Object>} params.messages - Conversation messages
   * @param {number} [params.max_tokens] - Max tokens to generate
   * @param {number} [params.temperature] - Temperature (0-2)
   * @param {Array<Object>} [params.tools] - Tool definitions
   * @param {string} [params.tool_choice] - Tool choice strategy
   * @returns {Promise<Object>} Completion response
   */
  async chat(params) {
    if (!this.enabled) {
      throw new Error('Local inference is not enabled (FK_CORE_KIND=none)');
    }

    const url = `${this.apiBase}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: params.messages,
      max_tokens: params.max_tokens || this.maxTokens,
      temperature: params.temperature ?? this.temperature,
      stream: false,
    };

    // Add tools if provided
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
      if (params.tool_choice) {
        requestBody.tool_choice = params.tool_choice;
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local inference request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        tool_calls: data.choices[0].message.tool_calls,
        finish_reason: data.choices[0].finish_reason,
        usage: data.usage,
        model: data.model,
        provider: 'local',
      };
    } catch (err) {
      console.error('[LocalInference] Chat request failed:', err.message);
      throw err;
    }
  }

  /**
   * Simple completion (no tools, just text generation)
   *
   * @param {string} prompt - Prompt text
   * @param {Object} [options] - Generation options
   * @returns {Promise<string>} Generated text
   */
  async complete(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];

    const response = await this.chat({
      messages,
      max_tokens: options.max_tokens || 512,
      temperature: options.temperature ?? this.temperature,
    });

    return response.content;
  }

  /**
   * Check if local inference is available
   *
   * @returns {Promise<boolean>} Whether service is available
   */
  async isAvailable() {
    if (!this.enabled) return false;

    try {
      const url = `${this.apiBase}/models`;
      const response = await fetch(url, { method: 'GET', timeout: 2000 });
      return response.ok;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get model information
   *
   * @returns {Promise<Object>} Model info
   */
  async getModelInfo() {
    const url = `${this.apiBase}/models`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[LocalInference] Failed to get model info:', err.message);
      return null;
    }
  }
}

/**
 * Create local inference client instance
 *
 * @param {Object} [options] - Client options
 * @returns {LocalInferenceClient} Client instance
 */
export function createLocalClient(options) {
  return new LocalInferenceClient(options);
}

/**
 * Test local inference with a simple prompt
 *
 * @param {string} [prompt] - Test prompt
 * @returns {Promise<Object>} Test result
 */
export async function testLocalInference(prompt = 'Hello! Please respond with "OK"') {
  const client = createLocalClient();

  const startTime = Date.now();

  try {
    const available = await client.isAvailable();
    if (!available) {
      return {
        success: false,
        error: 'Local inference service not available',
        elapsedMs: Date.now() - startTime,
      };
    }

    const response = await client.complete(prompt, { max_tokens: 50 });

    return {
      success: true,
      response,
      elapsedMs: Date.now() - startTime,
      provider: 'local',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      elapsedMs: Date.now() - startTime,
    };
  }
}
