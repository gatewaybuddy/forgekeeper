/**
 * Thought World - Phase 2: Tool Execution with Multi-Agent Consensus
 *
 * Iterative loop where agents propose, review, and execute tools
 */

import { runTool } from './tools/index.mjs';
import { callLLMStreaming, loadPrompt, extractJSON } from './server.thought-world.mjs';
import { ulid } from 'ulid';

const MAX_ITERATIONS = 10;

/**
 * Run thought world with tool execution (Phase 2)
 *
 * @param {string} task - The task to accomplish
 * @param {object} options - { agentConfig, onEvent, humanInput }
 */
export async function runThoughtWorldWithTools(task, options = {}) {
  const { agentConfig: customConfig, onEvent, humanInput } = options;

  // Merge custom config with defaults (imported from main file)
  const config = {
    forge: customConfig?.forge || AGENTS.forge,
    loom: customConfig?.loom || AGENTS.loom,
    anvil: customConfig?.anvil || AGENTS.anvil
  };

  const context = {
    humanInput: humanInput || null,
    conversationHistory: [],
    toolResults: []
  };

  let iteration = 0;
  let taskComplete = false;

  try {
    onEvent('session_start', {
      task,
      maxIterations: MAX_ITERATIONS,
      timestamp: new Date().toISOString()
    });

    while (iteration < MAX_ITERATIONS && !taskComplete) {
      iteration++;

      onEvent('iteration_start', { iteration });

      // 1. FORGE PROPOSES (with tool call or completion)
      onEvent('forge_start', { agent: 'forge', role: 'executor', status: 'thinking', iteration });

      const forgePrompt = await loadPrompt('executor', 'v2');
      const forgeContext = buildForgeContext(task, context, iteration);

      let forgeContent = '';
      const forgeStartTime = Date.now();

      const forgeFullContent = await callLLMStreaming(
        config.forge,
        forgePrompt,
        forgeContext,
        4096,
        (chunk) => {
          forgeContent += chunk;
          onEvent('forge_chunk', { agent: 'forge', content: chunk, iteration });
        }
      );

      const executorResponse = {
        id: ulid(),
        agent: 'forge',
        role: 'executor',
        content: forgeFullContent,
        iteration,
        timestamp: new Date().toISOString()
      };

      // Parse Forge's response for tool calls or completion
      const forgeProposal = extractJSON(forgeFullContent);

      onEvent('forge_done', {
        agent: 'forge',
        elapsed: Date.now() - forgeStartTime,
        proposal: forgeProposal,
        iteration
      });

      // Check if task is complete
      if (forgeProposal?.action === 'complete') {
        taskComplete = true;
        onEvent('task_complete', {
          summary: forgeProposal.summary,
          reasoning: forgeProposal.reasoning,
          iteration
        });
        break;
      }

      // If no tool call, treat as discussion turn
      if (forgeProposal?.action !== 'tool_call') {
        context.conversationHistory.push({
          role: 'forge',
          content: forgeFullContent,
          iteration
        });
        continue;
      }

      // 2. LOOM REVIEWS the tool proposal
      onEvent('loom_start', { agent: 'loom', role: 'verifier', status: 'reviewing', iteration });

      const loomPrompt = await loadPrompt('verifier', 'v2');
      const loomContext = buildLoomContext(forgeProposal, forgeFullContent);

      let loomContent = '';
      const loomStartTime = Date.now();

      const loomFullContent = await callLLMStreaming(
        config.loom,
        loomPrompt,
        loomContext,
        2048,
        (chunk) => {
          loomContent += chunk;
          onEvent('loom_chunk', { agent: 'loom', content: chunk, iteration });
        }
      );

      const verifierResponse = {
        id: ulid(),
        agent: 'loom',
        role: 'verifier',
        content: loomFullContent,
        executorId: executorResponse.id,
        iteration,
        timestamp: new Date().toISOString()
      };

      const loomAssessment = extractJSON(loomFullContent);

      onEvent('loom_done', {
        agent: 'loom',
        elapsed: Date.now() - loomStartTime,
        assessment: loomAssessment,
        iteration
      });

      // 3. ANVIL DECIDES
      onEvent('anvil_start', { agent: 'anvil', role: 'integrator', status: 'deciding', iteration });

      const anvilPrompt = await loadPrompt('integrator', 'v2');
      const anvilContext = buildAnvilContext(forgeProposal, loomAssessment, task);

      let anvilContent = '';
      const anvilStartTime = Date.now();

      const anvilFullContent = await callLLMStreaming(
        config.anvil,
        anvilPrompt,
        anvilContext,
        2048,
        (chunk) => {
          anvilContent += chunk;
          onEvent('anvil_chunk', { agent: 'anvil', content: chunk, iteration });
        }
      );

      const integratorResponse = {
        id: ulid(),
        agent: 'anvil',
        role: 'integrator',
        content: anvilFullContent,
        executorId: executorResponse.id,
        verifierId: verifierResponse.id,
        iteration,
        timestamp: new Date().toISOString()
      };

      const anvilDecision = extractJSON(anvilFullContent);

      onEvent('anvil_done', {
        agent: 'anvil',
        elapsed: Date.now() - anvilStartTime,
        decision: anvilDecision,
        iteration
      });

      // 4. EXECUTE TOOL (if approved)
      if (anvilDecision?.decision === 'execute' || anvilDecision?.decision === 'modify_and_execute') {
        const toolName = anvilDecision.decision === 'modify_and_execute'
          ? anvilDecision.modifications?.tool
          : forgeProposal.tool;

        const toolArgs = anvilDecision.decision === 'modify_and_execute'
          ? anvilDecision.modifications?.arguments
          : forgeProposal.arguments;

        onEvent('tool_executing', {
          tool: toolName,
          arguments: toolArgs,
          iteration
        });

        try {
          const toolResult = await runTool(toolName, toolArgs);

          onEvent('tool_result', {
            tool: toolName,
            result: toolResult,
            success: true,
            iteration
          });

          // Add to context
          context.toolResults.push({
            tool: toolName,
            arguments: toolArgs,
            result: toolResult,
            iteration
          });

          context.conversationHistory.push({
            role: 'tool',
            tool: toolName,
            result: toolResult,
            iteration
          });

        } catch (error) {
          onEvent('tool_error', {
            tool: toolName,
            error: error.message,
            iteration
          });

          context.conversationHistory.push({
            role: 'tool_error',
            tool: toolName,
            error: error.message,
            iteration
          });
        }

      } else if (anvilDecision?.decision === 'reject') {
        onEvent('tool_rejected', {
          tool: forgeProposal.tool,
          reasoning: anvilDecision.reasoning,
          iteration
        });

        context.conversationHistory.push({
          role: 'rejection',
          tool: forgeProposal.tool,
          reasoning: anvilDecision.reasoning,
          iteration
        });

      } else if (anvilDecision?.decision === 'escalate') {
        onEvent('escalated', {
          tool: forgeProposal.tool,
          reasoning: anvilDecision.reasoning,
          iteration
        });

        taskComplete = true;
        break;
      }

      // Add agent responses to history
      context.conversationHistory.push(
        { role: 'forge', content: forgeFullContent, iteration },
        { role: 'loom', content: loomFullContent, iteration },
        { role: 'anvil', content: anvilFullContent, iteration }
      );

      onEvent('iteration_end', { iteration });
    }

    // Final summary
    if (iteration >= MAX_ITERATIONS && !taskComplete) {
      onEvent('max_iterations_reached', {
        iterations: iteration,
        message: 'Task did not complete within iteration limit'
      });
    }

    onEvent('session_end', {
      iterations: iteration,
      taskComplete,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    onEvent('error', {
      message: error?.message || String(error),
      stack: error?.stack,
      iteration
    });
    throw error;
  }
}

// Helper: Build context for Forge
function buildForgeContext(task, context, iteration) {
  let message = `Task: ${task}\n\n`;

  if (iteration > 1 && context.toolResults.length > 0) {
    message += `=== PREVIOUS TOOL RESULTS ===\n`;
    context.toolResults.forEach((tr, idx) => {
      message += `${idx + 1}. ${tr.tool}(${JSON.stringify(tr.arguments)})\n`;
      message += `   Result: ${JSON.stringify(tr.result).substring(0, 500)}\n\n`;
    });
  }

  if (context.humanInput) {
    message += `\nHuman context: ${context.humanInput}`;
  }

  message += `\n\nCurrent iteration: ${iteration}/${MAX_ITERATIONS}\n`;
  message += `Propose the next step (tool call or completion).`;

  return message;
}

// Helper: Build context for Loom
function buildLoomContext(forgeProposal, forgeFullContent) {
  return `Review this tool proposal from Forge:\n\n${forgeFullContent}\n\n` +
    `Parsed proposal:\n${JSON.stringify(forgeProposal, null, 2)}\n\n` +
    `Your task: Assess safety, validity, and efficiency. Provide your review in JSON format.`;
}

// Helper: Build context for Anvil
function buildAnvilContext(forgeProposal, loomAssessment, task) {
  return `Task: ${task}\n\n` +
    `=== FORGE'S PROPOSAL ===\n${JSON.stringify(forgeProposal, null, 2)}\n\n` +
    `=== LOOM'S ASSESSMENT ===\n${JSON.stringify(loomAssessment, null, 2)}\n\n` +
    `Your task: Make the final decision (execute, modify_and_execute, reject, or escalate). Use JSON format.`;
}

// Export the AGENTS constant so it can be imported by this file
import { AGENTS } from './server.thought-world.mjs';
