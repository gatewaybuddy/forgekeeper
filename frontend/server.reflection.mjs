/**
 * Reflection Pass Orchestration
 *
 * Implements the reflection pass workflow:
 * 1. Generate initial response
 * 2. Run quick self-critique
 * 3. Apply corrections if needed
 * 4. Log everything to ContextLog
 */

import {
  getReflectionConfig,
  buildReflectionCritiquePrompt,
  buildReflectionCorrectionPrompt,
  parseReflectionCritique,
  extractCorrectedContent,
  createReflectionEvent,
  shouldSkipReflection,
} from './config/reflection_prompts.mjs';

/**
 * Run reflection pass on a generated response
 *
 * @param {Object} params - Reflection parameters
 * @param {string} params.userQuestion - Original user question
 * @param {string} params.generatedResponse - Response to reflect on
 * @param {string} params.baseUrl - LLM API base URL
 * @param {string} params.model - Model name
 * @param {Function} params.callUpstreamFn - Function to call LLM (from orchestrator)
 * @param {Function} params.appendEventFn - Function to append ContextLog events
 * @param {string} params.traceId - Trace ID for logging
 * @param {string} params.convId - Conversation ID
 * @param {Object} params.context - Additional context
 * @returns {Object} Reflection result with corrected response if applicable
 */
export async function runReflectionPass({
  userQuestion,
  generatedResponse,
  baseUrl,
  model,
  callUpstreamFn,
  appendEventFn,
  traceId = null,
  convId = null,
  context = {},
}) {
  const config = getReflectionConfig();

  // Check if should skip
  if (shouldSkipReflection(generatedResponse, context)) {
    return {
      skipped: true,
      reason: 'Response too short or not applicable for reflection',
      finalResponse: generatedResponse,
    };
  }

  const t0 = Date.now();

  try {
    // Step 1: Critique
    const critiqueMessages = buildReflectionCritiquePrompt(userQuestion, generatedResponse);
    const critiqueResult = await callUpstreamFn({
      baseUrl,
      model,
      messages: critiqueMessages,
      maxTokens: config.critiqueTokens,
      temperature: 0.0, // Deterministic
      tool_choice: 'none',
    });

    const critiqueText = extractContent(critiqueResult?.choices?.[0]?.message?.content);
    const critique = parseReflectionCritique(critiqueText);

    const critiqueElapsed = Date.now() - t0;

    // Log critique event
    if (appendEventFn) {
      const critiqueEvent = createReflectionEvent('critique', {
        assessment: critique.assessment,
        needsCorrection: critique.needsCorrection,
        confidence: critique.confidence,
        explanation: critique.explanation,
        elapsed_ms: critiqueElapsed,
        trace_id: traceId,
        conv_id: convId,
      });
      await appendEventFn(critiqueEvent);
    }

    // Step 2: Apply correction if needed and confidence is high enough
    if (critique.needsCorrection && critique.confidence >= config.minConfidence) {
      const t1 = Date.now();

      const correctionMessages = buildReflectionCorrectionPrompt(
        userQuestion,
        generatedResponse,
        critique.explanation || 'Address the issues found.'
      );

      const correctionResult = await callUpstreamFn({
        baseUrl,
        model,
        messages: correctionMessages,
        maxTokens: config.correctionTokens,
        temperature: 0.1, // Slightly creative for corrections
        tool_choice: 'none',
      });

      const correctionText = extractContent(correctionResult?.choices?.[0]?.message?.content);
      const correctedResponse = extractCorrectedContent(correctionText);

      const correctionElapsed = Date.now() - t1;

      // Log correction event
      if (appendEventFn) {
        const correctionEvent = createReflectionEvent('correction', {
          applied: true,
          originalLength: generatedResponse.length,
          correctedLength: correctedResponse.length,
          elapsed_ms: correctionElapsed,
          trace_id: traceId,
          conv_id: convId,
        });
        await appendEventFn(correctionEvent);
      }

      return {
        reflected: true,
        critique,
        correctionApplied: true,
        originalResponse: generatedResponse,
        finalResponse: correctedResponse,
        elapsed_ms: Date.now() - t0,
      };
    }

    // No correction needed or confidence too low
    return {
      reflected: true,
      critique,
      correctionApplied: false,
      finalResponse: generatedResponse,
      elapsed_ms: Date.now() - t0,
    };
  } catch (error) {
    console.error('[Reflection] Error during reflection pass:', error);

    // Log error but don't fail the request
    if (appendEventFn) {
      const errorEvent = {
        timestamp: new Date().toISOString(),
        actor: 'system',
        act: 'reflection_error',
        error: error.message,
        trace_id: traceId,
        conv_id: convId,
      };
      await appendEventFn(errorEvent);
    }

    return {
      reflected: false,
      error: error.message,
      finalResponse: generatedResponse, // Return original on error
      elapsed_ms: Date.now() - t0,
    };
  }
}

/**
 * Helper to extract content from LLM response
 */
function extractContent(content) {
  if (typeof content === 'string') return content;
  if (!content) return '';

  if (Array.isArray(content)) {
    let out = '';
    for (const part of content) {
      if (typeof part === 'string') {
        out += part;
      } else if (part?.text) {
        out += part.text;
      } else if (part?.content) {
        out += part.content;
      }
    }
    return out;
  }

  return String(content);
}

/**
 * Integrate reflection pass into orchestrateWithTools result
 * This can be called after orchestration completes
 *
 * @param {Object} orchestrationResult - Result from orchestrateWithTools
 * @param {Object} reflectionParams - Parameters for reflection pass
 * @returns {Object} Result with reflection applied
 */
export async function applyReflectionToOrchestration(
  orchestrationResult,
  reflectionParams
) {
  const { assistant, debug } = orchestrationResult;
  const originalContent = assistant?.content || '';

  // Run reflection pass
  const reflectionResult = await runReflectionPass({
    ...reflectionParams,
    generatedResponse: originalContent,
  });

  // Update assistant content if correction was applied
  const finalContent = reflectionResult.finalResponse || originalContent;

  return {
    ...orchestrationResult,
    assistant: {
      ...assistant,
      content: finalContent,
    },
    debug: {
      ...debug,
      reflection: reflectionResult,
    },
  };
}
