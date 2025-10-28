/**
 * Enhanced Server Orchestrator with Phase 1-3 Features
 *
 * Integrates:
 * - Output truncation (Phase 1)
 * - Enhanced events (Phase 1)
 * - Tool executor wrapper (Phase 1)
 * - History compaction (Phase 3)
 */

import { ulid } from 'ulid';
import { getToolDefs, runTool } from './server.tools.mjs';
import { createExecutor } from './core/tools/executor.mjs';
import { createTruncator } from './core/orchestrator/truncator.mjs';
import { contextLogEvents } from './core/services/contextlog-events.mjs';
import { createCompactor } from './core/history/compactor.mjs';

// Import existing orchestrator functions
import {
  orchestrateWithTools as originalOrchestrate
} from './server.orchestrator.mjs';

/**
 * Enhanced orchestrator with all Phase 1-3 features
 */
export async function orchestrateWithToolsEnhanced({
  baseUrl,
  model,
  messages,
  tools,
  maxIterations = 4,
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  traceId = null,
  convId = null,
  enablePhase1 = true, // Output truncation + events
  enablePhase3 = true, // History compaction
}) {
  const conv_id = convId || `conv-${ulid()}`;
  const trace_id = traceId || `trace-${ulid()}`;
  const turn_id = Date.now();

  const startTime = Date.now();

  try {
    // Phase 3: History Compaction (before orchestration)
    let workingMessages = messages;
    let compactionStats = null;

    if (enablePhase3) {
      const compactor = createCompactor({
        maxHistoryTokens: parseInt(process.env.FRONTEND_MAX_HISTORY_TOKENS) || 20000,
        recentMessagesKeep: parseInt(process.env.FRONTEND_RECENT_MESSAGES_KEEP) || 10,
        llmClient: {
          chat: async (params) => {
            // Use the existing upstream call
            const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model,
                messages: params.messages,
                temperature: params.temperature || 0.0,
                max_tokens: params.max_tokens || 2000,
              }),
            });
            return await resp.json();
          },
        },
        model,
      });

      const compactionResult = await compactor.checkAndCompact(workingMessages, {
        convId: conv_id,
        turnId: turn_id,
      });

      if (compactionResult.compacted) {
        console.log('[Enhanced Orchestrator] History compacted:', compactionResult.stats);
        workingMessages = compactionResult.messages;
        compactionStats = compactionResult.stats;
      }
    }

    // Phase 1: Enhanced Tool Execution
    if (enablePhase1) {
      // Emit task started event
      await contextLogEvents.emitTaskStarted(conv_id, turn_id, {
        model,
        approvalPolicy: 'auto', // Can be configured
        sandboxPolicy: 'workspace',
        reasoningEffort: undefined,
      });

      // Create enhanced executor
      const executor = createExecutor({
        toolRegistry: await createToolRegistry(),
        truncatorConfig: {
          maxBytes: parseInt(process.env.TOOLS_MAX_OUTPUT_BYTES) || 10240,
          maxLines: parseInt(process.env.TOOLS_MAX_OUTPUT_LINES) || 256,
          strategy: process.env.TOOLS_TRUNCATION_STRATEGY || 'head-tail',
        },
        sandboxLevel: 'workspace',
      });

      // Use enhanced orchestration
      return await orchestrateWithToolsEnhancedInternal({
        baseUrl,
        model,
        messages: workingMessages,
        tools,
        maxIterations,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        frequencyPenalty,
        executor,
        conv_id,
        turn_id,
        trace_id,
        startTime,
        compactionStats,
      });
    }

    // Fallback to original orchestrator
    return await originalOrchestrate({
      baseUrl,
      model,
      messages: workingMessages,
      tools,
      maxIterations,
      maxTokens,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty,
      traceId: trace_id,
    });

  } catch (error) {
    // Emit error event
    await contextLogEvents.emitError(conv_id, turn_id, error);
    throw error;
  }
}

/**
 * Internal orchestration with enhanced tool execution
 */
async function orchestrateWithToolsEnhancedInternal({
  baseUrl,
  model,
  messages,
  tools,
  maxIterations,
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  executor,
  conv_id,
  turn_id,
  trace_id,
  startTime,
  compactionStats,
}) {
  const convo = [...messages];
  let toolCallsCount = 0;
  const tokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };

  // Build reasoning transcript from orchestration steps
  let reasoningTranscript = '';

  // Get tool definitions
  const toolDefs = Array.isArray(tools) && tools.length > 0
    ? tools
    : await getToolDefs();

  for (let iter = 0; iter < maxIterations; iter++) {
    // Call upstream
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
    const body = {
      model,
      messages: convo,
      tools: toolDefs,
      temperature: temperature || parseFloat(process.env.FRONTEND_TEMP) || 0.0,
      top_p: topP || parseFloat(process.env.FRONTEND_TOP_P) || 0.4,
      max_tokens: maxTokens || parseInt(process.env.FRONTEND_MAX_TOKENS) || 4096,
      presence_penalty: presencePenalty || 0.0,
      frequency_penalty: frequencyPenalty || 0.2,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Upstream HTTP ${resp.status}: ${txt}`);
    }

    const json = await resp.json();
    const choice = json.choices?.[0];
    const msg = choice?.message;

    // Track tokens
    if (json.usage) {
      tokenUsage.input_tokens += json.usage.prompt_tokens || 0;
      tokenUsage.output_tokens += json.usage.completion_tokens || 0;
      if (json.usage.completion_tokens_details?.reasoning_tokens) {
        tokenUsage.reasoning_output_tokens += json.usage.completion_tokens_details.reasoning_tokens;
      }
    }

    // Check for tool calls
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // No more tool calls - final response
      convo.push(msg);

      // Finalize reasoning transcript
      if (reasoningTranscript) {
        reasoningTranscript += `\n\n✅ Final Response Ready\n`;
        reasoningTranscript += `Total tool calls: ${toolCallsCount}\n`;
        reasoningTranscript += `Iterations: ${iter + 1}\n`;
        reasoningTranscript += `Duration: ${Date.now() - startTime}ms`;
      }

      // Emit task complete
      const duration = Date.now() - startTime;
      await contextLogEvents.emitTaskComplete(
        conv_id,
        turn_id,
        duration,
        toolCallsCount,
        tokenUsage
      );

      // Emit token count
      await contextLogEvents.emitTokenCount(
        conv_id,
        turn_id,
        tokenUsage,
        tokenUsage // cumulative for now
      );

      // Combine native reasoning (if any) with orchestration transcript
      const finalReasoning = msg.reasoning_content
        ? `${msg.reasoning_content}\n\n---\n\n${reasoningTranscript}`
        : reasoningTranscript || null;

      return {
        assistant: {
          role: 'assistant',
          content: msg.content,
          reasoning: finalReasoning,
        },
        messages: convo,
        debug: {
          tool_calls: toolCallsCount,
          iterations: iter + 1,
          duration_ms: duration,
          tokens: tokenUsage,
          compaction: compactionStats,
          enhanced: true,
        },
      };
    }

    // Execute tool calls
    convo.push(msg);

    // Add iteration header to reasoning
    if (reasoningTranscript) reasoningTranscript += '\n\n';
    reasoningTranscript += `🔧 Iteration ${iter + 1}${msg.content ? `: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}` : ''}\n`;

    for (const toolCall of msg.tool_calls) {
      toolCallsCount++;

      // Add tool call to reasoning
      const argsStr = typeof toolCall.function.arguments === 'string'
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function.arguments);
      const argsPreview = argsStr.length > 200 ? argsStr.slice(0, 200) + '...' : argsStr;
      reasoningTranscript += `  → Calling: ${toolCall.function.name}(${argsPreview})\n`;

      const toolStartTime = Date.now();
      const result = await executor.execute(toolCall, {
        convId: conv_id,
        turnId: turn_id,
        cwd: process.cwd(),
        sandboxRoot: process.env.TOOLS_FS_ROOT || '.forgekeeper/sandbox',
      });

      // Add tool result to reasoning
      const resultPreview = result.content.length > 300
        ? result.content.slice(0, 300) + `... (${result.content.length} total chars)`
        : result.content;
      const elapsed = Date.now() - toolStartTime;
      reasoningTranscript += `  ← Result (${elapsed}ms): ${resultPreview.replace(/\n/g, '\n     ')}\n`;

      // Add tool result to conversation
      convo.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content,
      });
    }
  }

  // Max iterations reached
  const lastMsg = convo[convo.length - 1];
  const duration = Date.now() - startTime;

  // Finalize reasoning transcript for max iterations case
  if (reasoningTranscript) {
    reasoningTranscript += `\n\n⚠️ Max Iterations Reached (${maxIterations})\n`;
    reasoningTranscript += `Total tool calls: ${toolCallsCount}\n`;
    reasoningTranscript += `Duration: ${duration}ms`;
  }

  await contextLogEvents.emitTaskComplete(
    conv_id,
    turn_id,
    duration,
    toolCallsCount,
    tokenUsage
  );

  // Combine native reasoning (if any) with orchestration transcript
  const finalReasoning = lastMsg.reasoning_content
    ? `${lastMsg.reasoning_content}\n\n---\n\n${reasoningTranscript}`
    : reasoningTranscript || null;

  return {
    assistant: {
      role: 'assistant',
      content: lastMsg.content || '(max iterations reached)',
      reasoning: finalReasoning,
    },
    messages: convo,
    debug: {
      tool_calls: toolCallsCount,
      iterations: maxIterations,
      duration_ms: duration,
      tokens: tokenUsage,
      compaction: compactionStats,
      enhanced: true,
      max_iterations_reached: true,
    },
  };
}

/**
 * Create tool registry for executor
 */
async function createToolRegistry() {
  const toolDefs = await getToolDefs();
  const registry = new Map();

  for (const toolDef of toolDefs) {
    const name = toolDef?.function?.name;
    if (name) {
      registry.set(name, {
        name,
        description: toolDef.function.description,
        parameters: toolDef.function.parameters,
        execute: async (args, context) => {
          // Use existing runTool function
          return await runTool(name, args);
        },
      });
    }
  }

  return registry;
}

/**
 * Feature detection helper
 */
export function shouldUseEnhancedOrchestrator() {
  // Check if Phase 1 features are enabled
  const phase1Enabled = process.env.FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR !== '0';

  // Check if truncation is configured
  const truncationConfigured = process.env.TOOLS_MAX_OUTPUT_BYTES ||
                                 process.env.TOOLS_TRUNCATION_STRATEGY;

  // Check if compaction is enabled
  const compactionEnabled = process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1';

  return phase1Enabled && (truncationConfigured || compactionEnabled);
}
