// Server-side chat orchestration with OpenAI-style tool calls.
// Portable: depends only on fetch and the local tool registry.

import { TOOL_DEFS, runTool } from './server.tools.mjs';

/**
 * Call upstream chat/completions (OpenAI-compatible) non-streaming.
 * Expects `messages` in OpenAI format.
 */
async function callUpstream({ baseUrl, model, messages, tools, tool_choice }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages,
    temperature: 0.0,
    stream: false,
    max_tokens: 512,
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Upstream HTTP ${resp.status}: ${txt}`);
  }
  return resp.json();
}

function toAppMsgOpenAI(msg) {
  // Normalize content string from OpenAI-like variants
  const content = extractContent(msg?.content ?? null);
  const reasoning = typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : null;
  return { content, reasoning };
}

function extractContent(c) {
  if (typeof c === 'string') return c;
  if (!c) return null;
  if (Array.isArray(c)) {
    let out = '';
    for (const part of c) {
      if (!part) continue;
      if (typeof part === 'string') { out += part; continue; }
      if (typeof part.text === 'string') out += part.text;
      else if (typeof part.content === 'string') out += part.content;
      else if (typeof part.value === 'string') out += part.value;
    }
    return out || null;
  }
  return null;
}

/**
 * Orchestrate tool calls until a final assistant message without tool_calls.
 * @param {Object} params
 * @param {string} params.baseUrl upstream OpenAI-compatible base (ends with /v1)
 * @param {string} params.model model name
 * @param {Array} params.messages OpenAI-format messages
 * @param {Array} [params.tools] optional tool defs; defaults to TOOL_DEFS
 * @param {number} [params.maxIterations] safety cap
 */
export async function orchestrateWithTools({ baseUrl, model, messages, tools = TOOL_DEFS, maxIterations = 4 }) {
  const convo = Array.isArray(messages) ? [...messages] : [];
  const diagnostics = [];
  for (let iter = 0; iter < maxIterations; iter++) {
    const json = await callUpstream({ baseUrl, model, messages: convo, tools, tool_choice: 'auto' });
    const choice = json?.choices?.[0] ?? {};
    const msg = choice?.message || choice;
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
    diagnostics.push({ iter, finish_reason: choice?.finish_reason, tool_calls_count: toolCalls.length });

    if (!toolCalls.length) {
      // Final answer
      const { content, reasoning } = toAppMsgOpenAI(msg);
      return { assistant: { role: 'assistant', content, reasoning }, messages: convo, debug: { diagnostics, raw: json } };
    }

    // Append assistant msg with tool_calls to history (as upstream would expect)
    convo.push(msg);

    // Execute each tool and append tool results
    for (const tc of toolCalls) {
      try {
        const name = tc?.function?.name;
        let args = {};
        try { args = tc?.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch {}
        const result = await runTool(name, args);
        convo.push({
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result),
          tool_call_id: tc?.id || undefined,
        });
      } catch (e) {
        convo.push({
          role: 'tool',
          content: `Tool execution error: ${e?.message || String(e)}`,
          tool_call_id: tc?.id || undefined,
        });
      }
    }
    // Loop will continue; upstream now sees tool results and can produce final
  }
  return { error: 'max_iterations_reached', messages: convo, debug: { diagnostics: 'max iters' } };
}

