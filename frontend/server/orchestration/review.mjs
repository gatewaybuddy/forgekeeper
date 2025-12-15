// Self-review orchestration module (M2: Quality Improvement)
// Provides iterative review cycles to improve response quality before delivery

import {
  buildHarmonyReviewPrompt,
  buildOpenAIReviewPrompt,
  buildRegenerationPrompt,
  extractQualityScore,
  extractCritique,
  getReviewConfig,
  shouldTriggerReview,
} from '../../config/review_prompts.mjs';
import {
  appendEvent,
  createReviewCycleEvent,
  createRegenerationEvent,
  createReviewSummaryEvent,
} from '../telemetry/contextlog.mjs';
import { extractHarmonyFinalStrict } from './harmony.mjs';

/**
 * Check if model name indicates Harmony protocol usage.
 */
function isHarmonyModel(modelName) {
  try {
    const n = String(modelName || '').toLowerCase();
    return n.includes('gpt-oss') || n.includes('gpt_oss') || n.includes('gptoss') || n.includes('oss-') || n.includes('harmony');
  } catch {
    return false;
  }
}

/**
 * Call upstream to evaluate a generated response.
 * Returns { score, critique, reviewText }.
 */
async function evaluateResponse({
  baseUrl,
  model,
  userQuestion,
  generatedResponse,
  useHarmony = false,
  maxTokens = 512,
}) {
  const t0 = Date.now();

  // Build review prompt
  const messages = useHarmony
    ? buildHarmonyReviewPrompt(userQuestion, generatedResponse)
    : buildOpenAIReviewPrompt(userQuestion, generatedResponse);

  // Call upstream
  const url = baseUrl.replace(/\/$/, '') + (useHarmony ? '/completions' : '/chat/completions');
  const body = useHarmony
    ? {
        model,
        prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n\n') + '\n\nassistant:',
        max_tokens: maxTokens,
        temperature: 0.0,
        stream: false,
      }
    : {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.0,
        stream: false,
      };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Review evaluation failed: HTTP ${resp.status}: ${txt}`);
  }

  const json = await resp.json();
  const choice = json?.choices?.[0] ?? {};

  // Extract review text
  let reviewText = '';
  if (useHarmony) {
    reviewText = String(choice?.text || '');
  } else {
    reviewText = String(choice?.message?.content || '');
  }

  // Parse score and critique
  const score = extractQualityScore(reviewText);
  const critique = extractCritique(reviewText);
  const elapsed_ms = Date.now() - t0;

  return {
    score: score !== null ? score : 0.5, // Default to 0.5 if not found
    critique: critique || reviewText,
    reviewText,
    elapsed_ms,
  };
}

/**
 * Regenerate response with critique feedback.
 * Returns new response content.
 */
async function regenerateWithCritique({
  baseUrl,
  model,
  originalMessages,
  critique,
  qualityScore,
  useHarmony = false,
  maxTokens = 4096,
  temperature = 0.0,
  topP = 0.4,
  orchestrator,
}) {
  const t0 = Date.now();

  // Build regeneration prompt with critique
  const messages = buildRegenerationPrompt(originalMessages, critique, qualityScore);

  // Use existing orchestrator to handle regeneration (which may include tool calls)
  const result = await orchestrator({
    baseUrl,
    model,
    messages,
    tools: [], // No tools during regeneration to keep it focused
    maxTokens,
    temperature,
    topP,
  });

  const elapsed_ms = Date.now() - t0;

  return {
    content: result.assistant?.content || '',
    reasoning: result.assistant?.reasoning || null,
    elapsed_ms,
    debug: result.debug,
  };
}

/**
 * Main review orchestration function.
 * Wraps existing orchestrator with iterative review cycles.
 *
 * @param {Object} params - Orchestration parameters
 * @param {Function} params.orchestrator - Base orchestrator function (e.g., orchestrateWithTools)
 * @param {Object} params.context - Context for review triggering
 * @returns {Object} Final response with review metadata
 */
export async function orchestrateWithReview({
  orchestrator,
  baseUrl,
  model,
  messages,
  tools,
  maxIterations = 4,
  maxTokens = 4096,
  temperature = 0.0,
  topP = 0.4,
  presencePenalty = 0.0,
  frequencyPenalty = 0.2,
  traceId = null,
  convId = null,
  context = {},
}) {
  const config = getReviewConfig();

  // Check if review should be triggered
  if (!config.enabled || !shouldTriggerReview(config.mode, context)) {
    // Review disabled or not triggered - use base orchestrator
    return orchestrator({
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
      traceId,
    });
  }

  const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') || isHarmonyModel(model);
  const trace_id = traceId || `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const conv_id = convId || `conv-${Date.now()}`;
  const totalT0 = Date.now();

  let bestResponse = null;
  let bestScore = 0.0;
  let totalRegenerations = 0;
  let reviewPasses = 0;
  let totalToolCalls = 0; // Track total tool calls made across all passes

  // Initial generation
  const initialResult = await orchestrator({
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
    traceId: trace_id,
  });

  let currentResponse = initialResult.assistant?.content || '';
  let currentReasoning = initialResult.assistant?.reasoning || null;
  let currentDebug = initialResult.debug;

  // Count initial tool calls
  if (currentDebug?.diagnostics && Array.isArray(currentDebug.diagnostics)) {
    for (const diag of currentDebug.diagnostics) {
      if (Array.isArray(diag?.tools)) {
        totalToolCalls += diag.tools.length;
      }
    }
  }

  // Extract user question for review context
  const userMessages = messages.filter(m => m?.role === 'user');
  const userQuestion = userMessages.length > 0 ? String(userMessages[userMessages.length - 1]?.content || '') : '';

  // Review loop
  for (let pass = 1; pass <= config.iterations; pass++) {
    reviewPasses = pass;
    const passT0 = Date.now();

    try {
      // Evaluate current response
      const evaluation = await evaluateResponse({
        baseUrl,
        model,
        userQuestion,
        generatedResponse: currentResponse,
        useHarmony,
        maxTokens: config.evalTokens,
      });

      const { score, critique, elapsed_ms: evalElapsedMs } = evaluation;

      // Log review cycle event
      const accepted = score >= config.threshold;
      const reviewEvent = createReviewCycleEvent({
        conv_id,
        trace_id,
        iteration: pass,
        review_pass: pass,
        quality_score: score,
        threshold: config.threshold,
        critique,
        accepted,
        elapsed_ms: evalElapsedMs,
        status: 'ok',
      });
      appendEvent(reviewEvent);

      // Track best response
      if (score > bestScore) {
        bestScore = score;
        bestResponse = {
          content: currentResponse,
          reasoning: currentReasoning,
          debug: currentDebug,
          score,
          critique,
        };
      }

      // DEADLOCK DETECTION: If we've done 2+ review passes with NO tool execution and tools are available,
      // this is likely a review loop deadlock (system generating plans instead of executing tools)
      const hasTools = Array.isArray(tools) && tools.length > 0;
      if (reviewPasses >= 2 && totalToolCalls === 0 && hasTools) {
        console.warn('[Review Loop Deadlock] Detected: %d review passes, 0 tool calls, %d tools available', reviewPasses, tools.length);
        console.warn('[Review Loop Deadlock] Breaking review loop to prevent infinite planning without action');
        console.warn('[Review Loop Deadlock] Recommendation: Consider using autonomous mode for tool-heavy requests');

        // Accept current best response with warning
        break;
      }

      // Check if accepted
      if (accepted) {
        // Response meets quality threshold
        break;
      }

      // Check if we should regenerate
      if (totalRegenerations >= config.maxRegenerations) {
        // Max regenerations reached
        break;
      }

      if (pass >= config.iterations) {
        // Last iteration - don't regenerate
        break;
      }

      // Regenerate with critique
      totalRegenerations += 1;
      const regenT0 = Date.now();

      const regenerationEvent = createRegenerationEvent({
        conv_id,
        trace_id,
        iteration: pass,
        attempt: totalRegenerations,
        reason: critique,
        previous_score: score,
        elapsed_ms: 0, // Will update after regeneration
        status: 'ok',
      });

      const regenResult = await regenerateWithCritique({
        baseUrl,
        model,
        originalMessages: messages,
        critique,
        qualityScore: score,
        useHarmony,
        maxTokens,
        temperature,
        topP,
        orchestrator,
      });

      // Update regeneration event with elapsed time
      regenerationEvent.elapsed_ms = Date.now() - regenT0;
      appendEvent(regenerationEvent);

      // Update current response
      currentResponse = regenResult.content;
      currentReasoning = regenResult.reasoning;
      currentDebug = regenResult.debug;

      // Count tool calls from regeneration
      if (regenResult.debug?.diagnostics && Array.isArray(regenResult.debug.diagnostics)) {
        for (const diag of regenResult.debug.diagnostics) {
          if (Array.isArray(diag?.tools)) {
            totalToolCalls += diag.tools.length;
          }
        }
      }

    } catch (error) {
      // Review or regeneration failed - log and break
      const errorEvent = createReviewCycleEvent({
        conv_id,
        trace_id,
        iteration: pass,
        review_pass: pass,
        quality_score: 0.0,
        threshold: config.threshold,
        critique: `Error: ${error?.message || String(error)}`,
        accepted: false,
        elapsed_ms: Date.now() - passT0,
        status: 'error',
      });
      appendEvent(errorEvent);
      break;
    }
  }

  // Use best response if no accepted response found
  const finalResponse = bestResponse || {
    content: currentResponse,
    reasoning: currentReasoning,
    debug: currentDebug,
    score: bestScore,
    critique: '',
  };

  // Log summary
  const totalElapsedMs = Date.now() - totalT0;
  const summaryEvent = createReviewSummaryEvent({
    conv_id,
    trace_id,
    iteration: reviewPasses,
    total_passes: reviewPasses,
    final_score: finalResponse.score,
    regeneration_count: totalRegenerations,
    accepted: finalResponse.score >= config.threshold,
    total_elapsed_ms: totalElapsedMs,
    status: 'ok',
  });
  appendEvent(summaryEvent);

  // Return result with review metadata
  return {
    assistant: {
      role: 'assistant',
      content: finalResponse.content,
      reasoning: finalResponse.reasoning,
    },
    messages: [...messages, { role: 'assistant', content: finalResponse.content }],
    debug: {
      ...finalResponse.debug,
      review: {
        enabled: true,
        passes: reviewPasses,
        regenerations: totalRegenerations,
        finalScore: finalResponse.score,
        threshold: config.threshold,
        accepted: finalResponse.score >= config.threshold,
        totalElapsedMs,
      },
    },
  };
}
