/**
 * Thought World - Phase 2: Tool Execution with Multi-Agent Consensus
 *
 * Iterative loop where agents propose, review, and execute tools
 */

import { runTool } from './tools/index.mjs';
import { getToolDefs } from './server.tools.mjs';
import { callLLMStreaming, loadPrompt, extractJSON } from './server.thought-world.mjs';
import { ulid } from 'ulid';
import * as scoutMetrics from './server.scout-metrics.mjs';

const MAX_ITERATIONS = 10;

// Global map of pending human input requests
const pendingHumanInputs = new Map();

/**
 * Request human input and pause execution until response received
 *
 * @param {string} question - Question to ask the human
 * @param {object} context - Additional context for the question
 * @param {Array} suggestedActions - Array of {label, action, icon}
 * @param {Function} onEvent - Event emitter function
 * @returns {Promise<{action: string, response: string}>}
 */
export async function requestHumanInput(question, context, suggestedActions, onEvent) {
  const inputId = ulid();

  return new Promise((resolve, reject) => {
    // Store resolver
    pendingHumanInputs.set(inputId, {
      resolve,
      timestamp: Date.now()
    });

    // Emit event to UI
    onEvent('human_input_requested', {
      inputId,
      question,
      context,
      suggestedActions,
      urgency: context.urgency || 'medium',
      timestamp: new Date().toISOString()
    });

    console.log(`[Human Input] Waiting for response to: ${inputId}`);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingHumanInputs.has(inputId)) {
        pendingHumanInputs.delete(inputId);
        console.log(`[Human Input] Timeout for: ${inputId}`);
        resolve({
          action: 'timeout',
          response: null,
          message: 'No response received - continuing with best guess'
        });
      }
    }, 300000); // 5 min
  });
}

/**
 * Resolve pending human input request
 *
 * @param {string} inputId - ID of the input request
 * @param {object} response - {action, response}
 * @returns {boolean} - True if request was found and resolved
 */
export function resolveHumanInput(inputId, response) {
  if (pendingHumanInputs.has(inputId)) {
    const { resolve } = pendingHumanInputs.get(inputId);
    pendingHumanInputs.delete(inputId);
    resolve(response);
    return true;
  }
  return false;
}

/**
 * Run thought world with tool execution (Phase 2)
 *
 * @param {string} task - The task to accomplish
 * @param {object} options - { agentConfig, onEvent, humanInput }
 */
export async function runThoughtWorldWithTools(task, options = {}) {
  const { agentConfig: customConfig, onEvent, humanInput } = options;

  console.log('[Thought World Tools] 🔍 DEBUG: onEvent type:', typeof onEvent);
  console.log('[Thought World Tools] 🔍 DEBUG: onEvent is function?', typeof onEvent === 'function');

  // Merge custom config with defaults (imported from main file)
  const config = {
    forge: customConfig?.forge || AGENTS.forge,
    scout: customConfig?.scout || AGENTS.scout,
    loom: customConfig?.loom || AGENTS.loom,
    anvil: customConfig?.anvil || AGENTS.anvil
  };

  // Load available tools dynamically
  const availableTools = await getToolDefs();
  console.log(`[Thought World Tools] Loaded ${availableTools.length} tools dynamically`);

  const context = {
    humanInput: humanInput || null,
    conversationHistory: [],
    toolResults: [],
    availableTools  // Add tools to context
  };

  let iteration = 0;
  let taskComplete = false;

  // Initialize Scout metrics for this session
  const metricsSessionId = await scoutMetrics.initScoutMetrics();

  try {
    console.log('[Thought World Tools] Session starting:', { task: task.substring(0, 50) + '...' });
    console.log('[Thought World Tools] 🔍 DEBUG: About to call onEvent("session_start")');
    if (typeof onEvent === 'function') {
      onEvent('session_start', {
        task,
        maxIterations: MAX_ITERATIONS,
        metricsSessionId,
        timestamp: new Date().toISOString()
      });
      console.log('[Thought World Tools] 🔍 DEBUG: onEvent("session_start") called successfully');
    } else {
      console.error('[Thought World Tools] ❌ ERROR: onEvent is not a function!', typeof onEvent);
    }

    while (iteration < MAX_ITERATIONS && !taskComplete) {
      iteration++;
      console.log(`[Thought World Tools] Iteration ${iteration}/${MAX_ITERATIONS} starting`);

      onEvent('iteration_start', { iteration });

      // 1. FORGE PROPOSES (with tool call or completion)
      console.log(`[Thought World Tools] Forge proposing...`);
      onEvent('forge_start', { agent: 'forge', role: 'executor', status: 'thinking', iteration });

      const forgePrompt = await loadPrompt('executor', 'v2');
      const forgeContext = buildForgeContext(task, context, iteration);

      let forgeContent = '';
      const forgeStartTime = Date.now();

      console.log(`[Thought World Tools] Calling Forge LLM (${config.forge.provider}/${config.forge.model})...`);
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

      console.log(`[Thought World Tools] Forge completed in ${Date.now() - forgeStartTime}ms`);
      onEvent('forge_done', {
        agent: 'forge',
        elapsed: Date.now() - forgeStartTime,
        proposal: forgeProposal,
        iteration
      });

      // Check if task is complete
      if (forgeProposal?.action === 'complete') {
        taskComplete = true;

        // Record task completion in Scout metrics
        scoutMetrics.recordTaskComplete({
          summary: forgeProposal.summary,
          iterations: iteration
        });

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

      // 2. SCOUT CHALLENGES (if limitation language detected)
      console.log(`[Thought World Tools] Scout reviewing Forge's proposal...`);
      const scoutResult = await runScoutChallenge(
        config.scout,
        forgeFullContent,
        forgeProposal,
        context,
        iteration,
        onEvent
      );
      console.log(`[Thought World Tools] Scout ${scoutResult.approved ? 'approved' : 'challenged'} (escalated: ${scoutResult.escalated})`);

      // If Scout escalated or requires human intervention
      if (scoutResult.escalated) {
        onEvent('escalated', {
          reasoning: scoutResult.reasoning,
          iteration
        });
        taskComplete = true;
        break;
      }

      // If Scout is not satisfied, continue to next iteration
      if (!scoutResult.approved) {
        context.conversationHistory.push({
          role: 'scout_challenge',
          content: scoutResult.challenge,
          iteration
        });
        continue;
      }

      // Scout approved - continue to Loom
      context.conversationHistory.push({
        role: 'scout_approved',
        content: scoutResult.reasoning,
        iteration
      });

      // 3. LOOM REVIEWS the tool proposal (after Scout approval)
      console.log(`[Thought World Tools] Loom reviewing tool proposal...`);
      onEvent('loom_start', { agent: 'loom', role: 'verifier', status: 'reviewing', iteration });

      const loomPrompt = await loadPrompt('verifier', 'v2');
      const loomContext = buildLoomContext(forgeProposal, forgeFullContent, context.availableTools);

      let loomContent = '';
      const loomStartTime = Date.now();

      console.log(`[Thought World Tools] Calling Loom LLM (${config.loom.provider}/${config.loom.model})...`);
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

      console.log(`[Thought World Tools] Loom completed in ${Date.now() - loomStartTime}ms`);
      onEvent('loom_done', {
        agent: 'loom',
        elapsed: Date.now() - loomStartTime,
        assessment: loomAssessment,
        iteration
      });

      // 4. ANVIL DECIDES
      console.log(`[Thought World Tools] Anvil making final decision...`);
      onEvent('anvil_start', { agent: 'anvil', role: 'integrator', status: 'deciding', iteration });

      const anvilPrompt = await loadPrompt('integrator', 'v2');
      const anvilContext = buildAnvilContext(forgeProposal, loomAssessment, task);

      let anvilContent = '';
      const anvilStartTime = Date.now();

      console.log(`[Thought World Tools] Calling Anvil LLM (${config.anvil.provider}/${config.anvil.model})...`);
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

      console.log(`[Thought World Tools] Anvil completed in ${Date.now() - anvilStartTime}ms, decision: ${anvilDecision?.decision}`);
      onEvent('anvil_done', {
        agent: 'anvil',
        elapsed: Date.now() - anvilStartTime,
        decision: anvilDecision,
        iteration
      });

      // 5. EXECUTE TOOL (if approved by Anvil)
      if (anvilDecision?.decision === 'execute' || anvilDecision?.decision === 'modify_and_execute') {
        const toolName = anvilDecision.decision === 'modify_and_execute'
          ? anvilDecision.modifications?.tool
          : forgeProposal.tool;

        const toolArgs = anvilDecision.decision === 'modify_and_execute'
          ? anvilDecision.modifications?.arguments
          : forgeProposal.arguments;

        console.log(`[Thought World Tools] Executing tool: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)}...)`);
        onEvent('tool_executing', {
          tool: toolName,
          arguments: toolArgs,
          iteration
        });

        try {
          const toolStartTime = Date.now();
          const toolResult = await runTool(toolName, toolArgs);
          console.log(`[Thought World Tools] Tool ${toolName} completed successfully in ${Date.now() - toolStartTime}ms`);

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
          console.log(`[Thought World Tools] Tool ${toolName} failed: ${error.message}`);
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
        console.log(`[Thought World Tools] Anvil rejected tool: ${forgeProposal.tool}`);
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
        console.log(`[Thought World Tools] Anvil escalated to human for: ${forgeProposal.tool}`);
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

      console.log(`[Thought World Tools] Iteration ${iteration} complete`);
      onEvent('iteration_end', { iteration });
    }

    // Final summary
    if (iteration >= MAX_ITERATIONS && !taskComplete) {
      onEvent('max_iterations_reached', {
        iterations: iteration,
        message: 'Task did not complete within iteration limit'
      });
    }

    // Persist Scout metrics at end of session
    await scoutMetrics.persistMetrics();

    // Send metrics summary in session_end event
    const finalMetrics = scoutMetrics.calculateMetrics();

    onEvent('session_end', {
      iterations: iteration,
      taskComplete,
      scoutMetrics: finalMetrics,
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

  // Add available tools dynamically
  if (context.availableTools && context.availableTools.length > 0) {
    message += `=== AVAILABLE TOOLS ===\n`;
    message += `You have access to ${context.availableTools.length} tools:\n\n`;

    context.availableTools.forEach(toolDef => {
      const fn = toolDef.function;
      message += `**${fn.name}**\n`;
      message += `Description: ${fn.description || 'No description'}\n`;

      if (fn.parameters && fn.parameters.properties) {
        message += `Arguments:\n`;
        Object.entries(fn.parameters.properties).forEach(([param, spec]) => {
          const required = fn.parameters.required?.includes(param) ? ' (required)' : ' (optional)';
          message += `  - ${param}${required}: ${spec.description || spec.type}\n`;
        });
      }
      message += `\n`;
    });
    message += `\n`;
  }

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
function buildLoomContext(forgeProposal, forgeFullContent, availableTools) {
  let message = `Review this tool proposal from Forge:\n\n${forgeFullContent}\n\n`;
  message += `Parsed proposal:\n${JSON.stringify(forgeProposal, null, 2)}\n\n`;

  // Add tool spec for validation
  if (availableTools && forgeProposal.tool) {
    const toolDef = availableTools.find(t => t.function.name === forgeProposal.tool);
    if (toolDef) {
      message += `=== TOOL SPECIFICATION ===\n`;
      message += `${toolDef.function.name}: ${toolDef.function.description}\n`;
      if (toolDef.function.parameters) {
        message += `Expected parameters: ${JSON.stringify(toolDef.function.parameters, null, 2)}\n\n`;
      }
    }
  }

  message += `Your task: Assess safety, validity, and efficiency. Provide your review in JSON format.`;
  return message;
}

// Helper: Build context for Anvil
function buildAnvilContext(forgeProposal, loomAssessment, task) {
  return `Task: ${task}\n\n` +
    `=== FORGE'S PROPOSAL ===\n${JSON.stringify(forgeProposal, null, 2)}\n\n` +
    `=== LOOM'S ASSESSMENT ===\n${JSON.stringify(loomAssessment, null, 2)}\n\n` +
    `Your task: Make the final decision (execute, modify_and_execute, reject, or escalate). Use JSON format.`;
}

// Helper: Check if content contains limitation language
function containsLimitationLanguage(content) {
  const limitationPhrases = [
    'cannot', 'unable to', 'impossible',
    'requires human', 'needs external', 'must have',
    "we don't have access to", 'we lack',
    'need user to', 'user must', 'ask user'
  ];

  const lowerContent = content.toLowerCase();
  return limitationPhrases.some(phrase => lowerContent.includes(phrase));
}

// Helper: Run Scout challenge
async function runScoutChallenge(scoutConfig, forgeContent, forgeProposal, context, iteration, onEvent) {
  // Check if Forge's proposal contains limitation language
  const hasLimitation = containsLimitationLanguage(forgeContent);

  // Check if there's previous empirical evidence in context
  const hasPreviousEvidence = context.toolResults.some(tr =>
    tr.tool === forgeProposal.tool || tr.error
  );

  // Scout only activates if limitation language is detected and no previous evidence
  if (!hasLimitation || hasPreviousEvidence) {
    // Fast approval path
    console.log(`[Thought World Tools] Scout fast approval: hasLimitation=${hasLimitation}, hasPreviousEvidence=${hasPreviousEvidence}`);

    // Emit Scout events even for fast approval (so UI shows Scout activity)
    const startTime = Date.now();
    onEvent('scout_start', { agent: 'scout', role: 'challenger', status: 'reviewing', iteration });

    const reasoning = hasLimitation
      ? 'Previous empirical evidence exists in session memory'
      : 'No limitation claims detected - proceeding';

    console.log(`[Thought World Tools] Scout reasoning: ${reasoning}`);

    // Send reasoning as content so it displays in UI
    onEvent('scout_chunk', { agent: 'scout', content: `✓ ${reasoning}`, iteration });

    // Small delay to show Scout is active
    await new Promise(resolve => setTimeout(resolve, 100));

    onEvent('scout_done', {
      agent: 'scout',
      elapsed: Date.now() - startTime,
      response: { approved: true, reasoning },
      iteration
    });

    onEvent('scout_approved', {
      reasoning,
      boundary_type: 'none',
      iteration
    });

    // Record Scout approval (no challenge needed)
    scoutMetrics.recordScoutApproval({
      reasoning: hasLimitation
        ? 'Previous empirical evidence exists'
        : 'No limitation claims detected',
      iteration
    });

    return {
      approved: true,
      reasoning,
      escalated: false
    };
  }

  // Scout challenges the limitation
  console.log(`[Thought World Tools] Scout detected limitation language - issuing challenge`);
  onEvent('scout_start', { agent: 'scout', role: 'challenger', status: 'challenging', iteration });

  const scoutPrompt = await loadPrompt('scout', 'v2');
  const scoutContext = buildScoutContext(forgeContent, forgeProposal, context);

  let scoutContent = '';
  const scoutStartTime = Date.now();

  console.log(`[Thought World Tools] Calling Scout LLM (${scoutConfig.provider}/${scoutConfig.model})...`);
  const scoutFullContent = await callLLMStreaming(
    scoutConfig,
    scoutPrompt,
    scoutContext,
    2048,
    (chunk) => {
      scoutContent += chunk;
      onEvent('scout_chunk', { agent: 'scout', content: chunk, iteration });
    }
  );

  const scoutResponse = extractJSON(scoutFullContent);

  console.log(`[Thought World Tools] Scout completed in ${Date.now() - scoutStartTime}ms, approved: ${scoutResponse?.approved}, has challenge: ${!!scoutResponse?.challenge}`);
  onEvent('scout_done', {
    agent: 'scout',
    elapsed: Date.now() - scoutStartTime,
    response: scoutResponse,
    iteration
  });

  // Check Scout's response

  // NEW: Scout requests human input
  if (scoutResponse?.action === 'request_human_input') {
    console.log(`[Scout] Requesting human input: ${scoutResponse.question}`);

    const humanResponse = await requestHumanInput(
      scoutResponse.question,
      scoutResponse.context || {},
      scoutResponse.suggested_actions || [],
      onEvent
    );

    console.log(`[Scout] Human responded with: ${humanResponse.action}`);

    // Add human response to context
    context.conversationHistory.push({
      role: 'human',
      content: humanResponse.response || humanResponse.action,
      action: humanResponse.action,
      iteration
    });

    // Record in metrics
    scoutMetrics.recordHumanIntervention({
      question: scoutResponse.question,
      response: humanResponse.response,
      action: humanResponse.action,
      iteration
    });

    // Continue with human's guidance
    return {
      approved: true,
      reasoning: `Human provided: ${humanResponse.response || humanResponse.action}`,
      humanContext: humanResponse,
      escalated: false
    };
  }

  if (scoutResponse?.approved) {
    console.log(`[Thought World Tools] Scout approved with boundary type: ${scoutResponse.boundary_type}`);
    // Record boundary discovered
    scoutMetrics.recordBoundaryDiscovered({
      boundaryType: scoutResponse.boundary_type || 'empirical',
      reasoning: scoutResponse.reasoning,
      iteration
    });

    onEvent('scout_approved', {
      reasoning: scoutResponse.reasoning,
      boundary_type: scoutResponse.boundary_type,
      iteration
    });

    return {
      approved: true,
      reasoning: scoutResponse.reasoning,
      boundary_type: scoutResponse.boundary_type,
      escalated: false
    };
  }

  // Scout issued a challenge
  if (scoutResponse?.challenge) {
    console.log(`[Thought World Tools] Scout issued challenge: ${scoutResponse.challenge.substring(0, 100)}...`);
    // Record the challenge
    scoutMetrics.recordChallenge({
      challenge: scoutResponse.challenge,
      specific_action: scoutResponse.specific_action,
      why_asking: scoutResponse.why_asking,
      iteration,
      forgeProposal: forgeProposal.tool
    });

    onEvent('scout_challenge', {
      challenge: scoutResponse.challenge,
      specific_action: scoutResponse.specific_action,
      why_asking: scoutResponse.why_asking,
      iteration
    });

    return {
      approved: false,
      challenge: scoutResponse.challenge,
      specific_action: scoutResponse.specific_action,
      escalated: false
    };
  }

  // Default: approve if Scout's response is unclear
  return {
    approved: true,
    reasoning: 'Scout response unclear - proceeding with caution',
    escalated: false
  };
}

// Helper: Build context for Scout
function buildScoutContext(forgeContent, forgeProposal, context) {
  let message = `Review Forge's proposal:\n\n${forgeContent}\n\n`;

  if (forgeProposal) {
    message += `Parsed proposal:\n${JSON.stringify(forgeProposal, null, 2)}\n\n`;
  }

  if (context.conversationHistory.length > 0) {
    message += `=== SESSION CONTEXT ===\n`;
    const recentHistory = context.conversationHistory.slice(-3);
    recentHistory.forEach((entry, idx) => {
      message += `${idx + 1}. ${entry.role}: ${JSON.stringify(entry).substring(0, 200)}\n`;
    });
    message += `\n`;
  }

  message += `Your task: If this proposal contains limitation claims without empirical proof, challenge it. `;
  message += `Otherwise, approve. Respond in JSON format.`;

  return message;
}

// Export the AGENTS constant so it can be imported by this file
import { AGENTS } from './server.thought-world.mjs';
