// Combined mode orchestration module (T209: Review + Chunked)
// Provides strategies for using review and chunked modes together

import { orchestrateChunked } from './chunked.mjs';
import { getReviewConfig } from '../../config/review_prompts.mjs';
import { buildHarmonyReviewPrompt, buildOpenAIReviewPrompt, extractQualityScore, extractCritique } from '../../config/review_prompts.mjs';
import {
  appendEvent,
  createCombinedModeStartEvent,
  createCombinedModeCompleteEvent,
  createReviewCycleEvent,
} from '../telemetry/contextlog.mjs';

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
 * Review a chunk or assembled response
 * Wrapper around review logic to make it reusable for chunks
 */
async function reviewContent({
  baseUrl,
  model,
  userQuestion,
  content,
  context = '',
  useHarmony = false,
  maxTokens = 512,
  conv_id,
  trace_id,
  iteration = 1,
}) {
  const t0 = Date.now();

  // Build review prompt
  const messages = useHarmony
    ? buildHarmonyReviewPrompt(userQuestion, content)
    : buildOpenAIReviewPrompt(userQuestion, content);

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

  // Log review event
  const reviewConfig = getReviewConfig();
  const accepted = score >= reviewConfig.threshold;
  const reviewEvent = createReviewCycleEvent({
    conv_id,
    trace_id,
    iteration,
    review_pass: iteration,
    quality_score: score !== null ? score : 0.5,
    threshold: reviewConfig.threshold,
    critique: `${context ? context + ': ' : ''}${critique || reviewText}`,
    accepted,
    elapsed_ms,
    status: 'ok',
  });
  appendEvent(reviewEvent);

  return {
    score: score !== null ? score : 0.5,
    critique: critique || reviewText,
    reviewText,
    accepted,
    elapsed_ms,
  };
}

/**
 * Per-chunk strategy: Review each chunk before moving to next
 * Generate chunk → Review chunk → Next chunk
 */
async function orchestratePerChunk({
  baseUrl,
  model,
  messages,
  maxTokens = 1024,
  convId,
  traceId,
  config,
}) {
  const t0 = Date.now();
  const useHarmony = isHarmonyModel(model);
  const reviewConfig = getReviewConfig();

  // Extract user question from messages
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  console.log(`[CombinedMode:per_chunk] Starting per-chunk review strategy`);

  // Step 1: Generate chunks WITHOUT review (use orchestrateChunked)
  // We'll review each chunk individually as they're generated
  const chunkedResult = await orchestrateChunked({
    baseUrl,
    model,
    messages,
    maxTokens,
    convId,
    traceId,
    config,
  });

  const { chunks, outline } = chunkedResult;

  // Step 2: Review each chunk
  let totalReviewPasses = 0;
  let finalScore = 0.0;
  const reviewedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkContext = `Chunk ${i + 1}/${chunks.length}: ${chunk.label}`;

    console.log(`[CombinedMode:per_chunk] Reviewing chunk ${i + 1}/${chunks.length}: "${chunk.label}"`);

    try {
      const review = await reviewContent({
        baseUrl,
        model,
        userQuestion,
        content: chunk.content,
        context: chunkContext,
        useHarmony,
        maxTokens: reviewConfig.evalTokens,
        conv_id: convId,
        trace_id: traceId,
        iteration: totalReviewPasses + 1,
      });

      totalReviewPasses++;
      finalScore = Math.max(finalScore, review.score);

      // Keep the chunk as-is (we're just reviewing quality, not regenerating)
      reviewedChunks.push(chunk);

      console.log(`[CombinedMode:per_chunk] Chunk ${i + 1} review: score=${review.score.toFixed(2)}, accepted=${review.accepted}`);
    } catch (error) {
      console.error(`[CombinedMode:per_chunk] Review failed for chunk ${i + 1}:`, error.message);
      // Continue with unreviewed chunk
      reviewedChunks.push(chunk);
    }
  }

  // Step 3: Assemble reviewed chunks (same as chunked result)
  const finalContent = reviewedChunks.map(c => c.content).filter(c => c).join('\n\n');
  const totalElapsedMs = Date.now() - t0;

  return {
    content: finalContent,
    reasoning: chunkedResult.reasoning,
    chunks: reviewedChunks,
    outline,
    debug: {
      ...chunkedResult.debug,
      combined: {
        strategy: 'per_chunk',
        total_review_passes: totalReviewPasses,
        final_score: finalScore,
        total_elapsed_ms: totalElapsedMs,
      },
    },
    combinedMode: {
      strategy: 'per_chunk',
      totalReviewPasses,
      finalScore,
    },
  };
}

/**
 * Final-only strategy: Generate all chunks, then review assembled response
 * Generate all chunks → Assemble → Review final
 */
async function orchestrateFinalOnly({
  baseUrl,
  model,
  messages,
  maxTokens = 1024,
  convId,
  traceId,
  config,
}) {
  const t0 = Date.now();
  const useHarmony = isHarmonyModel(model);
  const reviewConfig = getReviewConfig();

  // Extract user question from messages
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  console.log(`[CombinedMode:final_only] Starting final-only review strategy`);

  // Step 1: Generate all chunks without review
  const chunkedResult = await orchestrateChunked({
    baseUrl,
    model,
    messages,
    maxTokens,
    convId,
    traceId,
    config,
  });

  const { content: assembledContent, chunks, outline } = chunkedResult;

  // Step 2: Review final assembled response
  console.log(`[CombinedMode:final_only] Reviewing final assembled response (${assembledContent.length} chars)`);

  let finalScore = 0.5;
  let totalReviewPasses = 0;

  try {
    const review = await reviewContent({
      baseUrl,
      model,
      userQuestion,
      content: assembledContent,
      context: 'Final assembled response',
      useHarmony,
      maxTokens: reviewConfig.evalTokens,
      conv_id: convId,
      trace_id: traceId,
      iteration: 1,
    });

    totalReviewPasses = 1;
    finalScore = review.score;

    console.log(`[CombinedMode:final_only] Final review: score=${review.score.toFixed(2)}, accepted=${review.accepted}`);
  } catch (error) {
    console.error(`[CombinedMode:final_only] Final review failed:`, error.message);
  }

  const totalElapsedMs = Date.now() - t0;

  return {
    content: assembledContent,
    reasoning: chunkedResult.reasoning,
    chunks,
    outline,
    debug: {
      ...chunkedResult.debug,
      combined: {
        strategy: 'final_only',
        total_review_passes: totalReviewPasses,
        final_score: finalScore,
        total_elapsed_ms: totalElapsedMs,
      },
    },
    combinedMode: {
      strategy: 'final_only',
      totalReviewPasses,
      finalScore,
    },
  };
}

/**
 * Both strategy: Review each chunk AND final assembly
 * (per_chunk strategy) + Review final assembly
 */
async function orchestrateBoth({
  baseUrl,
  model,
  messages,
  maxTokens = 1024,
  convId,
  traceId,
  config,
}) {
  const t0 = Date.now();
  const useHarmony = isHarmonyModel(model);
  const reviewConfig = getReviewConfig();

  // Extract user question from messages
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  console.log(`[CombinedMode:both] Starting both review strategy (per-chunk + final)`);

  // Step 1: Use per-chunk strategy first
  const perChunkResult = await orchestratePerChunk({
    baseUrl,
    model,
    messages,
    maxTokens,
    convId,
    traceId,
    config,
  });

  const { content: assembledContent, chunks, outline } = perChunkResult;
  let totalReviewPasses = perChunkResult.combinedMode.totalReviewPasses;
  let finalScore = perChunkResult.combinedMode.finalScore;

  // Step 2: Review final assembly (in addition to per-chunk reviews)
  console.log(`[CombinedMode:both] Reviewing final assembled response (after per-chunk reviews)`);

  try {
    const finalReview = await reviewContent({
      baseUrl,
      model,
      userQuestion,
      content: assembledContent,
      context: 'Final assembled response (already chunk-reviewed)',
      useHarmony,
      maxTokens: reviewConfig.evalTokens,
      conv_id: convId,
      trace_id: traceId,
      iteration: totalReviewPasses + 1,
    });

    totalReviewPasses++;
    finalScore = Math.max(finalScore, finalReview.score);

    console.log(`[CombinedMode:both] Final review: score=${finalReview.score.toFixed(2)}, accepted=${finalReview.accepted}`);
  } catch (error) {
    console.error(`[CombinedMode:both] Final review failed:`, error.message);
  }

  const totalElapsedMs = Date.now() - t0;

  return {
    content: assembledContent,
    reasoning: perChunkResult.reasoning,
    chunks,
    outline,
    debug: {
      ...perChunkResult.debug,
      combined: {
        strategy: 'both',
        total_review_passes: totalReviewPasses,
        final_score: finalScore,
        total_elapsed_ms: totalElapsedMs,
      },
    },
    combinedMode: {
      strategy: 'both',
      totalReviewPasses,
      finalScore,
    },
  };
}

/**
 * Main combined mode orchestrator
 * Routes to appropriate strategy based on env var
 */
export async function orchestrateCombined({
  baseUrl,
  model,
  messages,
  maxTokens = 1024,
  convId,
  traceId,
  config,
}) {
  const strategy = (process.env.FRONTEND_COMBINED_REVIEW_STRATEGY || 'final_only').toLowerCase();
  const t0 = Date.now();

  console.log(`[CombinedMode] Starting combined mode with strategy: ${strategy}`);

  // Log start event
  const startEvent = createCombinedModeStartEvent({
    conv_id: convId,
    trace_id: traceId,
    strategy,
    chunk_count: 0, // Will be updated after outline generation
    status: 'ok',
  });
  appendEvent(startEvent);

  let result;

  try {
    switch (strategy) {
      case 'per_chunk':
        result = await orchestratePerChunk({ baseUrl, model, messages, maxTokens, convId, traceId, config });
        break;

      case 'final_only':
        result = await orchestrateFinalOnly({ baseUrl, model, messages, maxTokens, convId, traceId, config });
        break;

      case 'both':
        result = await orchestrateBoth({ baseUrl, model, messages, maxTokens, convId, traceId, config });
        break;

      default:
        console.warn(`[CombinedMode] Unknown strategy '${strategy}', falling back to 'final_only'`);
        result = await orchestrateFinalOnly({ baseUrl, model, messages, maxTokens, convId, traceId, config });
        break;
    }

    // Log completion event
    const totalElapsedMs = Date.now() - t0;
    const completeEvent = createCombinedModeCompleteEvent({
      conv_id: convId,
      trace_id: traceId,
      strategy,
      chunk_count: result.chunks?.length || 0,
      total_review_passes: result.combinedMode?.totalReviewPasses || 0,
      final_score: result.combinedMode?.finalScore || 0.0,
      total_elapsed_ms: totalElapsedMs,
      status: 'ok',
    });
    appendEvent(completeEvent);

    console.log(`[CombinedMode] Completed with strategy '${strategy}' in ${totalElapsedMs}ms`);

    return result;
  } catch (error) {
    console.error(`[CombinedMode] Failed with strategy '${strategy}':`, error);

    // Log error event
    const errorEvent = createCombinedModeCompleteEvent({
      conv_id: convId,
      trace_id: traceId,
      strategy,
      chunk_count: 0,
      total_review_passes: 0,
      final_score: 0.0,
      total_elapsed_ms: Date.now() - t0,
      status: 'error',
    });
    appendEvent(errorEvent);

    throw error;
  }
}
