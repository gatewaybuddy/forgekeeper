/**
 * Agent Tool-Enabled LLM Calls
 *
 * Provides tool-enabled LLM calling capabilities for agents with:
 * - Tool call/response loop
 * - Permission-based tool filtering
 * - Execution logging
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { runTool } from './tools/index.mjs';
import { filterToolsByPermission } from './server.agent-permissions.mjs';

const MAX_TOOL_ITERATIONS = 10;  // Prevent infinite loops

/**
 * Call LLM with tools (non-streaming)
 * Handles tool call/response loop until completion
 */
export async function callLLMWithTools(agentConfig, systemPrompt, userMessage, tools = [], permissionLevel = 'read_only', maxTokens = 4096) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  // Filter tools by permission level
  const allowedTools = filterToolsByPermission(tools, permissionLevel);

  if (allowedTools.length === 0) {
    // No tools available - fall back to basic text completion
    return await callLLMBasic(agentConfig, systemPrompt, userMessage, maxTokens);
  }

  // Build messages array
  const messages = [{ role: 'user', content: userMessage }];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
        ],
        messages,
        tools: allowedTools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        }))
      });

      // Check for tool calls
      const toolCalls = response.content.filter(block => block.type === 'tool_use');

      if (toolCalls.length === 0) {
        // No more tool calls - return final text
        const textBlock = response.content.find(block => block.type === 'text');
        return textBlock?.text || '';
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Execute tools and collect results
      const toolResults = [];
      for (const toolCall of toolCalls) {
        console.log(`[agent-tools] Executing tool: ${toolCall.name} with args:`, toolCall.input);

        try {
          const result = await runTool(toolCall.name, toolCall.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result
          });
        } catch (error) {
          console.error(`[agent-tools] Tool execution error:`, error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify({ success: false, error: error.message }),
            is_error: true
          });
        }
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });

    } else if (provider === 'openai' || provider === 'local' || provider === 'vllm' || provider === 'llama') {
      const client = new OpenAI({
        apiKey: provider === 'openai' ? apiKey : 'dev-key',
        baseURL: apiBase
      });

      // Convert to OpenAI message format
      const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: openaiMessages,
        tools: allowedTools
      });

      const message = response.choices[0].message;

      // Check for tool calls
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tool calls - return final text
        return message.content || '';
      }

      // Add assistant response to messages
      messages.push(message);

      // Execute tools and collect results
      for (const toolCall of message.tool_calls) {
        console.log(`[agent-tools] Executing tool: ${toolCall.function.name}`);

        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await runTool(toolCall.function.name, args);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        } catch (error) {
          console.error(`[agent-tools] Tool execution error:`, error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: error.message })
          });
        }
      }
    } else {
      throw new Error(`Unsupported provider for tools: ${provider}`);
    }
  }

  // Max iterations reached
  console.warn(`[agent-tools] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached`);
  return 'I apologize, but I reached the maximum number of tool calls. Please try breaking down your request.';
}

/**
 * Call LLM with tools (streaming)
 * Handles tool call/response loop with streaming for final response
 */
export async function callLLMStreamingWithTools(agentConfig, systemPrompt, userMessage, tools = [], permissionLevel = 'read_only', maxTokens, onChunk) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  // Filter tools by permission level
  const allowedTools = filterToolsByPermission(tools, permissionLevel);

  if (allowedTools.length === 0) {
    // No tools available - fall back to basic streaming
    return await callLLMStreamingBasic(agentConfig, systemPrompt, userMessage, maxTokens, onChunk);
  }

  // Build messages array
  const messages = [{ role: 'user', content: userMessage }];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey });

      // For Anthropic, we can't stream tool use responses, so handle non-streaming
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
        ],
        messages,
        tools: allowedTools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        }))
      });

      const toolCalls = response.content.filter(block => block.type === 'tool_use');

      if (toolCalls.length === 0) {
        // No more tool calls - stream the final response
        const textBlock = response.content.find(block => block.type === 'text');
        const text = textBlock?.text || '';
        onChunk(text);  // Emit full text at once (streaming happened earlier)
        return text;
      }

      // Execute tools (same as non-streaming)
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const toolCall of toolCalls) {
        console.log(`[agent-tools] Executing tool: ${toolCall.name}`);

        try {
          const result = await runTool(toolCall.name, toolCall.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result
          });
        } catch (error) {
          console.error(`[agent-tools] Tool execution error:`, error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify({ success: false, error: error.message }),
            is_error: true
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });

    } else if (provider === 'openai' || provider === 'local' || provider === 'vllm' || provider === 'llama') {
      const client = new OpenAI({
        apiKey: provider === 'openai' ? apiKey : 'dev-key',
        baseURL: apiBase
      });

      const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: openaiMessages,
        tools: allowedTools,
        stream: false  // Can't stream while checking for tool calls
      });

      const message = response.choices[0].message;

      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tool calls - return final text
        const text = message.content || '';
        onChunk(text);
        return text;
      }

      // Execute tools
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        console.log(`[agent-tools] Executing tool: ${toolCall.function.name}`);

        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await runTool(toolCall.function.name, args);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        } catch (error) {
          console.error(`[agent-tools] Tool execution error:`, error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: error.message })
          });
        }
      }
    } else {
      throw new Error(`Unsupported provider for tools: ${provider}`);
    }
  }

  // Max iterations reached
  const errorMsg = 'I apologize, but I reached the maximum number of tool calls.';
  onChunk(errorMsg);
  return errorMsg;
}

/**
 * Basic LLM call without tools (fallback)
 */
async function callLLMBasic(agentConfig, systemPrompt, userMessage, maxTokens) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userMessage }]
    });

    return response.content[0].text;

  } else if (provider === 'openai' || provider === 'local' || provider === 'vllm' || provider === 'llama') {
    const client = new OpenAI({
      apiKey: provider === 'openai' ? apiKey : 'dev-key',
      baseURL: apiBase
    });

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });

    return response.choices[0].message.content;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Basic streaming LLM call without tools (fallback)
 */
async function callLLMStreamingBasic(agentConfig, systemPrompt, userMessage, maxTokens, onChunk) {
  const { provider, apiKey, model, apiBase } = agentConfig;

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: userMessage }]
    });

    let fullContent = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const delta = chunk.delta.text;
        fullContent += delta;
        onChunk(delta);
      }
    }
    return fullContent;

  } else if (provider === 'openai' || provider === 'local' || provider === 'vllm' || provider === 'llama') {
    const client = new OpenAI({
      apiKey: provider === 'openai' ? apiKey : 'dev-key',
      baseURL: apiBase
    });

    const stream = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        onChunk(delta);
      }
    }
    return fullContent;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export default {
  callLLMWithTools,
  callLLMStreamingWithTools
};
