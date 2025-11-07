// Chunked reasoning orchestration module (M2: Overcoming Context Limits)
// Breaks down complex responses into multiple reasoning + writing chunks

import {
  buildHarmonyOutlinePrompt,
  buildOpenAIOutlinePrompt,
  buildHarmonyChunkPrompt,
  buildOpenAIChunkPrompt,
  parseOutline,
  extractChunkParts,
  getChunkedConfig,
  estimateTokens,
} from './config/chunked_prompts.mjs';
import {
  appendEvent,
  createChunkOutlineEvent,
  createChunkWriteEvent,
  createChunkAssemblyEvent,
} from './server.contextlog.mjs';
import { extractHarmonyFinalStrict, extractHarmonyAnalysisStrict } from './server.harmony.mjs';

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
 * Generate an outline by calling the model with outline prompt.
 * Returns array of chunk labels.
 */
async function generateOutline({
  baseUrl,
  model,
  userQuestion,
  useHarmony = false,
  maxChunks = 5,
  maxTokens = 512,
  convId,
  traceId,
}) {
  const t0 = Date.now();

  // Build outline prompt
  const messages = useHarmony
    ? buildHarmonyOutlinePrompt(userQuestion, maxChunks)
    : buildOpenAIOutlinePrompt(userQuestion, maxChunks);

  // Call upstream
  const url = baseUrl.replace(/\/$/, '') + (useHarmony ? '/completions' : '/chat/completions');
  const body = useHarmony
    ? {
        model,
        prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n\n') + '\n\nassistant:',
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      }
    : {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Outline generation failed: HTTP ${resp.status}: ${txt}`);
  }

  const json = await resp.json();
  const choice = json?.choices?.[0] ?? {};

  // Extract outline text
  let outlineText = '';
  if (useHarmony) {
    outlineText = String(choice?.text || '');
  } else {
    outlineText = String(choice?.message?.content || '');
  }

  // Parse outline into chunk labels
  const outline = parseOutline(outlineText);
  const elapsed_ms = Date.now() - t0;

  // Log outline event
  if (convId) {
    const event = createChunkOutlineEvent({
      conv_id: convId,
      trace_id: traceId,
      chunk_count: outline.length,
      outline,
      raw_outline: outlineText,
      elapsed_ms,
    });
    await appendEvent(event);
  }

  return {
    outline,
    outlineText,
    elapsed_ms,
  };
}

/**
 * Generate a single chunk by calling the model with chunk prompt.
 * Returns { reasoning, content, elapsed_ms }.
 */
async function generateChunk({
  baseUrl,
  model,
  userQuestion,
  chunkLabel,
  chunkIndex,
  totalChunks,
  accumulatedResponse,
  outline,
  useHarmony = false,
  maxTokens = 1024,
  convId,
  traceId,
}) {
  const t0 = Date.now();

  // Build chunk prompt
  const messages = useHarmony
    ? buildHarmonyChunkPrompt(userQuestion, chunkLabel, chunkIndex, totalChunks, accumulatedResponse, outline)
    : buildOpenAIChunkPrompt(userQuestion, chunkLabel, chunkIndex, totalChunks, accumulatedResponse, outline);

  // Call upstream
  const url = baseUrl.replace(/\/$/, '') + (useHarmony ? '/completions' : '/chat/completions');
  const body = useHarmony
    ? {
        model,
        prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n\n') + '\n\nassistant:',
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      }
    : {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false,
      };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Chunk generation failed: HTTP ${resp.status}: ${txt}`);
  }

  const json = await resp.json();
  const choice = json?.choices?.[0] ?? {};

  // Extract chunk text
  let chunkText = '';
  if (useHarmony) {
    chunkText = String(choice?.text || '');
  } else {
    chunkText = String(choice?.message?.content || '');
  }

  // Extract reasoning and content parts
  let reasoning = '';
  let content = '';

  if (useHarmony) {
    // For Harmony, use the harmony module extractors
    reasoning = extractHarmonyAnalysisStrict(chunkText) || '';
    content = extractHarmonyFinalStrict(chunkText) || chunkText;
  } else {
    // For OpenAI, use the chunk prompt extractor
    const parts = extractChunkParts(chunkText, false);
    reasoning = parts.reasoning;
    content = parts.content;
  }

  const elapsed_ms = Date.now() - t0;
  const reasoning_tokens = estimateTokens(reasoning);
  const content_tokens = estimateTokens(content);

  // Log chunk write event
  if (convId) {
    const event = createChunkWriteEvent({
      conv_id: convId,
      trace_id: traceId,
      iter: chunkIndex,
      chunk_index: chunkIndex,
      chunk_label: chunkLabel,
      reasoning_tokens,
      content_tokens,
      elapsed_ms,
    });
    await appendEvent(event);
  }

  return {
    reasoning,
    content,
    reasoning_tokens,
    content_tokens,
    elapsed_ms,
  };
}

/**
 * Assemble chunks into final response with optional joining text.
 */
function assembleChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';

  // Simply join all chunk contents with double newlines
  return chunks.map(chunk => chunk.content).filter(c => c).join('\n\n');
}

/**
 * Main chunked orchestration function.
 * Generates outline, writes each chunk, assembles final response.
 *
 * @param {Object} params - Parameters
 * @param {string} params.baseUrl - Upstream API base URL
 * @param {string} params.model - Model name
 * @param {Array<Object>} params.messages - Conversation messages
 * @param {number} params.maxTokens - Max tokens per chunk (default 1024)
 * @param {string} params.convId - Conversation ID
 * @param {string} params.traceId - Trace ID
 * @param {Object} params.config - Chunked config object (optional)
 * @returns {Object} Result with assembled response and debug info
 */
export async function orchestrateChunked({
  baseUrl,
  model,
  messages,
  maxTokens = 1024,
  convId,
  traceId,
  config = null,
}) {
  const t0 = Date.now();
  const cfg = config || getChunkedConfig();
  const useHarmony = isHarmonyModel(model);

  // Extract user question from messages
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  if (!userQuestion) {
    throw new Error('No user question found in messages');
  }

  console.log(`[ChunkedOrchestrator] Starting chunked generation for question (${userQuestion.length} chars)`);

  // Step 1: Generate outline
  let outline = [];
  let outlineText = '';
  let outlineRetries = cfg.outlineRetries;

  while (outlineRetries > 0) {
    try {
      const outlineResult = await generateOutline({
        baseUrl,
        model,
        userQuestion,
        useHarmony,
        maxChunks: cfg.maxChunks,
        maxTokens: cfg.outlineTokens,
        convId,
        traceId,
      });

      outline = outlineResult.outline;
      outlineText = outlineResult.outlineText;

      // Validate outline
      if (outline.length === 0) {
        throw new Error('Outline parsing failed - no chunks extracted');
      }

      if (outline.length > cfg.maxChunks) {
        console.log(`[ChunkedOrchestrator] Outline has ${outline.length} chunks, limiting to ${cfg.maxChunks}`);
        outline = outline.slice(0, cfg.maxChunks);
      }

      console.log(`[ChunkedOrchestrator] Generated outline with ${outline.length} chunks:`, outline);
      break;
    } catch (error) {
      outlineRetries--;
      console.warn(`[ChunkedOrchestrator] Outline generation failed, retries left: ${outlineRetries}`, error.message);

      if (outlineRetries === 0) {
        throw new Error(`Outline generation failed after ${cfg.outlineRetries} attempts: ${error.message}`);
      }

      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Step 2: Generate each chunk
  const chunks = [];
  let accumulatedResponse = '';

  for (let i = 0; i < outline.length; i++) {
    const chunkLabel = outline[i];
    console.log(`[ChunkedOrchestrator] Generating chunk ${i + 1}/${outline.length}: "${chunkLabel}"`);

    try {
      const chunkResult = await generateChunk({
        baseUrl,
        model,
        userQuestion,
        chunkLabel,
        chunkIndex: i,
        totalChunks: outline.length,
        accumulatedResponse,
        outline,
        useHarmony,
        maxTokens: cfg.tokensPerChunk,
        convId,
        traceId,
      });

      chunks.push({
        index: i,
        label: chunkLabel,
        reasoning: chunkResult.reasoning,
        content: chunkResult.content,
        reasoning_tokens: chunkResult.reasoning_tokens,
        content_tokens: chunkResult.content_tokens,
        elapsed_ms: chunkResult.elapsed_ms,
      });

      // Accumulate for next chunk
      accumulatedResponse += chunkResult.content + '\n\n';

      console.log(`[ChunkedOrchestrator] Chunk ${i + 1} complete: ${chunkResult.content_tokens} tokens, ${chunkResult.elapsed_ms}ms`);
    } catch (error) {
      console.error(`[ChunkedOrchestrator] Chunk ${i + 1} generation failed:`, error.message);
      throw new Error(`Chunk generation failed at chunk ${i + 1} ("${chunkLabel}"): ${error.message}`);
    }
  }

  // Step 3: Assemble final response
  const finalContent = assembleChunks(chunks);
  const totalElapsedMs = Date.now() - t0;

  // Calculate total tokens
  const totalReasoningTokens = chunks.reduce((sum, c) => sum + c.reasoning_tokens, 0);
  const totalContentTokens = chunks.reduce((sum, c) => sum + c.content_tokens, 0);

  console.log(`[ChunkedOrchestrator] Assembly complete: ${chunks.length} chunks, ${totalContentTokens} total tokens, ${totalElapsedMs}ms`);

  // Log assembly event
  if (convId) {
    const event = createChunkAssemblyEvent({
      conv_id: convId,
      trace_id: traceId,
      chunk_count: chunks.length,
      total_reasoning_tokens: totalReasoningTokens,
      total_content_tokens: totalContentTokens,
      total_tokens: totalReasoningTokens + totalContentTokens,
      elapsed_ms: totalElapsedMs,
    });
    await appendEvent(event);
  }

  return {
    content: finalContent,
    reasoning: chunks.map(c => `**${c.label}** (${c.content_tokens} tokens)\n${c.reasoning}`).join('\n\n'),
    chunks,
    outline,
    outlineText,
    debug: {
      chunked: true,
      chunk_count: chunks.length,
      outline,
      total_reasoning_tokens: totalReasoningTokens,
      total_content_tokens: totalContentTokens,
      total_elapsed_ms: totalElapsedMs,
      chunks_summary: chunks.map(c => ({
        index: c.index,
        label: c.label,
        content_tokens: c.content_tokens,
        elapsed_ms: c.elapsed_ms,
      })),
    },
  };
}
