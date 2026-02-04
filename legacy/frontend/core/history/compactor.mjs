/**
 * History Compaction Service
 *
 * Automatically detects when conversation history is too long and
 * summarizes it to fit within context window.
 *
 * Inspired by Codex's history compaction strategy.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { contextLogEvents } from '../services/contextlog-events.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} CompactionConfig
 * @property {number} maxHistoryTokens - Max tokens before triggering compaction
 * @property {number} recentMessagesKeep - Number of recent messages to preserve
 * @property {Function} llmClient - LLM client for summarization
 * @property {string} model - Model to use for summarization
 * @property {string} promptPath - Path to summarization prompt
 */

/**
 * @typedef {Object} CompactionResult
 * @property {boolean} compacted - Whether compaction was performed
 * @property {Array} messages - Compacted message array
 * @property {string} [summary] - Summary text (if compacted)
 * @property {Object} [stats] - Compaction statistics
 */

export class HistoryCompactor {
  /**
   * @param {CompactionConfig} config
   */
  constructor(config) {
    this.maxHistoryTokens = config.maxHistoryTokens || 20000;
    this.recentMessagesKeep = config.recentMessagesKeep || 10;
    this.llmClient = config.llmClient;
    this.model = config.model || 'core';
    this.promptPath = config.promptPath || resolve(__dirname, '../../prompts/summarization.md');
    this.summarizationPrompt = null;
    this.tokenEstimator = new TokenEstimator();
  }

  /**
   * Load summarization prompt
   *
   * @returns {Promise<string>}
   */
  async loadSummarizationPrompt() {
    if (!this.summarizationPrompt) {
      this.summarizationPrompt = await readFile(this.promptPath, 'utf-8');
    }
    return this.summarizationPrompt;
  }

  /**
   * Check if history needs compaction and compact if needed
   *
   * @param {Array} messages - Conversation messages
   * @param {Object} context - Execution context
   * @returns {Promise<CompactionResult>}
   */
  async checkAndCompact(messages, context) {
    // Estimate token count
    const totalTokens = this.tokenEstimator.estimateTokens(messages);

    // Check if compaction needed
    if (totalTokens < this.maxHistoryTokens) {
      return {
        compacted: false,
        messages,
      };
    }

    console.log(`[HistoryCompactor] Compaction triggered: ${totalTokens} tokens exceeds ${this.maxHistoryTokens}`);

    const t0 = Date.now();

    try {
      // Separate system prompt, old messages, and recent messages
      const systemPrompt = messages.find(m => m.role === 'system') || messages[0];
      const conversationMessages = messages.filter(m => m.role !== 'system');
      const recentMessages = conversationMessages.slice(-this.recentMessagesKeep);
      const oldMessages = conversationMessages.slice(0, -this.recentMessagesKeep);

      // Generate summary
      const summary = await this.summarizeMessages(oldMessages, context);

      // Extract key user requests for continuity
      const userRequests = this.extractUserRequests(oldMessages);

      // Create bridge message
      const bridgeMessage = this.createBridgeMessage(summary, userRequests);

      // Build compacted history
      const compacted = [
        systemPrompt,
        bridgeMessage,
        ...recentMessages,
      ];

      const compactedTokens = this.tokenEstimator.estimateTokens(compacted);

      // Emit compaction event
      await contextLogEvents.emitHistoryCompaction(
        context.convId,
        context.turnId,
        {
          original_messages: messages.length,
          original_tokens: totalTokens,
          compacted_messages: compacted.length,
          compacted_tokens: compactedTokens,
          summary_length: summary.length,
        }
      );

      const elapsed_ms = Date.now() - t0;

      console.log(`[HistoryCompactor] Compaction complete in ${elapsed_ms}ms: ${messages.length} → ${compacted.length} messages, ${totalTokens} → ${compactedTokens} tokens`);

      return {
        compacted: true,
        messages: compacted,
        summary,
        stats: {
          original_messages: messages.length,
          original_tokens: totalTokens,
          compacted_messages: compacted.length,
          compacted_tokens: compactedTokens,
          saved_tokens: totalTokens - compactedTokens,
          saved_percent: ((totalTokens - compactedTokens) / totalTokens * 100).toFixed(1),
          elapsed_ms,
        },
      };

    } catch (error) {
      console.error('[HistoryCompactor] Compaction failed:', error);

      // Emit error event
      await contextLogEvents.emitError(context.convId, context.turnId, error);

      // Return original messages on error
      return {
        compacted: false,
        messages,
        error: error.message,
      };
    }
  }

  /**
   * Summarize messages using LLM
   *
   * @param {Array} messages - Messages to summarize
   * @param {Object} context - Execution context
   * @returns {Promise<string>}
   */
  async summarizeMessages(messages, context) {
    const prompt = await this.loadSummarizationPrompt();

    // Build summarization request
    const summarizationMessages = [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: this.buildSummarizationRequest(messages),
      },
    ];

    const response = await this.llmClient.chat({
      model: this.model,
      messages: summarizationMessages,
      temperature: 0.0, // Deterministic
      max_tokens: 2000, // Summary target length
    });

    return response.choices[0].message.content;
  }

  /**
   * Build summarization request message
   *
   * @param {Array} messages - Messages to summarize
   * @returns {string}
   */
  buildSummarizationRequest(messages) {
    let request = `Please summarize the following conversation history concisely.

Focus on:
- Key decisions made
- Important context established
- Files modified
- Problems solved
- Ongoing work

Keep the summary under 1500 words but ensure all critical context is preserved.

## Conversation History

`;

    // Add each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const content = this.extractMessageContent(msg);

      if (!content) continue;

      request += `### Message ${i + 1} (${msg.role})

${content}

`;
    }

    request += `---

Provide a structured summary following the format specified in your instructions.`;

    return request;
  }

  /**
   * Extract content from message (handle tool calls, etc.)
   *
   * @param {Object} message
   * @returns {string}
   */
  extractMessageContent(message) {
    if (message.content) {
      return message.content;
    }

    if (message.tool_calls) {
      // Summarize tool calls
      const toolSummary = message.tool_calls.map(tc =>
        `Called tool: ${tc.function.name}`
      ).join(', ');
      return `[Tool usage: ${toolSummary}]`;
    }

    if (message.role === 'tool') {
      // Tool result (truncate if very long)
      const content = String(message.content || '');
      if (content.length > 500) {
        return `[Tool result: ${content.slice(0, 500)}... (truncated)]`;
      }
      return `[Tool result: ${content}]`;
    }

    return '';
  }

  /**
   * Extract user requests from messages
   *
   * @param {Array} messages
   * @returns {Array<string>}
   */
  extractUserRequests(messages) {
    return messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .slice(-5); // Last 5 user messages
  }

  /**
   * Create bridge message connecting old context to new
   *
   * @param {string} summary
   * @param {Array<string>} userRequests
   * @returns {Object}
   */
  createBridgeMessage(summary, userRequests) {
    let content = `## Previous Conversation Summary

${summary}

`;

    if (userRequests.length > 0) {
      content += `## Recent User Requests

`;
      for (let i = 0; i < userRequests.length; i++) {
        const request = userRequests[i];
        const truncated = request.length > 200
          ? request.slice(0, 200) + '...'
          : request;
        content += `${i + 1}. ${truncated}\n`;
      }

      content += `\n`;
    }

    content += `---

**Note**: The conversation history above this point has been summarized to maintain context window efficiency. Continue working with full awareness of the summarized context.`;

    return {
      role: 'system',
      content,
    };
  }

  /**
   * Force compaction (for testing or manual trigger)
   *
   * @param {Array} messages
   * @param {Object} context
   * @returns {Promise<CompactionResult>}
   */
  async forceCompact(messages, context) {
    // Temporarily set threshold to 0 to force compaction
    const originalThreshold = this.maxHistoryTokens;
    this.maxHistoryTokens = 0;

    const result = await this.checkAndCompact(messages, context);

    this.maxHistoryTokens = originalThreshold;

    return result;
  }

  /**
   * Estimate if compaction will be needed soon
   *
   * @param {Array} messages
   * @returns {boolean}
   */
  willNeedCompactionSoon(messages) {
    const tokens = this.tokenEstimator.estimateTokens(messages);
    // Trigger warning at 80% of threshold
    return tokens > this.maxHistoryTokens * 0.8;
  }

  /**
   * Get compaction statistics
   *
   * @param {Array} messages
   * @returns {Object}
   */
  getStats(messages) {
    const tokens = this.tokenEstimator.estimateTokens(messages);

    return {
      messages: messages.length,
      estimated_tokens: tokens,
      threshold: this.maxHistoryTokens,
      usage_percent: (tokens / this.maxHistoryTokens * 100).toFixed(1),
      needs_compaction: tokens >= this.maxHistoryTokens,
      will_need_soon: this.willNeedCompactionSoon(messages),
    };
  }
}

/**
 * Token Estimator
 *
 * Simple token estimation (4 chars per token for English).
 * For production, use tiktoken or similar.
 */
class TokenEstimator {
  /**
   * Estimate token count for messages
   *
   * @param {Array} messages
   * @returns {number}
   */
  estimateTokens(messages) {
    let totalChars = 0;

    for (const msg of messages) {
      // Regular content
      if (msg.content) {
        totalChars += msg.content.length;
      }

      // Reasoning content (if present)
      if (msg.reasoning_content) {
        totalChars += msg.reasoning_content.length;
      }

      // Tool calls
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += JSON.stringify(tc).length;
        }
      }

      // Role overhead
      totalChars += 10; // Approximate overhead per message
    }

    // Rough estimate: 4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Estimate tokens for single message
   *
   * @param {Object} message
   * @returns {number}
   */
  estimateMessageTokens(message) {
    return this.estimateTokens([message]);
  }
}

/**
 * Create default compactor instance
 *
 * @param {CompactionConfig} config
 * @returns {HistoryCompactor}
 */
export function createCompactor(config) {
  return new HistoryCompactor(config);
}
