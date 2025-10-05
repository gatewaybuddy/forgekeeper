// Server-side chat orchestration with OpenAI-style tool calls.
// Portable: depends only on fetch and the local tool registry.

import { TOOL_DEFS, runTool } from './server.tools.mjs';

function isIncomplete(text) {
  if (!text) return true;
  const t = String(text).trim();
  if (t.length < 32) return true;
  const terminals = '.!?"”’›»}]`';
  const last = t.slice(-1);
  if (!terminals.includes(last)) return true;
  const ticks = (t.match(/```/g) || []).length;
  if (ticks % 2 === 1) return true;
  return false;
}

/**
 * Call upstream chat/completions (OpenAI-compatible) non-streaming.
 * Expects `messages` in OpenAI format.
 */
function sanitizeMessagesForTools(messages) {
  // Drop orphan tool messages (those not immediately following an assistant tool_calls message)
  const out = [];
  let lastHadToolCalls = false;
  for (const m of (Array.isArray(messages) ? messages : [])) {
    const role = m?.role;
    if (role === 'assistant') {
      const tcs = Array.isArray(m?.tool_calls) ? m.tool_calls : [];
      lastHadToolCalls = tcs.length > 0;
      out.push(m);
    } else if (role === 'tool') {
      if (lastHadToolCalls) {
        out.push(m);
        // after a tool result, expect possibly more tool results; keep lastHadToolCalls true
      } else {
        // orphan tool message; skip to satisfy Jinja template expectations
        continue;
      }
    } else {
      lastHadToolCalls = false;
      out.push(m);
    }
  }
  return out;
}

async function callUpstream({ baseUrl, model, messages, tools, tool_choice }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages: sanitizeMessagesForTools(messages),
    temperature: 0.0,
    stream: false,
    max_tokens: 1024,
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
    const step = { iter, finish_reason: choice?.finish_reason, tool_calls_count: toolCalls.length, tools: [] };

    if (!toolCalls.length) {
      // Final answer
      let { content, reasoning } = toAppMsgOpenAI(msg);
      let finish = choice?.finish_reason;
      let continued = 0;
      // Lightweight auto-continue if truncated or too short
      while ((finish === 'length' || isIncomplete(content)) && continued < 2) {
        convo.push({ role: 'user', content: 'Continue.' });
        const next = await callUpstream({ baseUrl, model, messages: convo, tool_choice: 'none' });
        const ch2 = next?.choices?.[0] ?? {};
        const msg2 = ch2?.message || ch2;
        const { content: c2, reasoning: r2 } = toAppMsgOpenAI(msg2);
        content = (content || '') + (c2 || '');
        if (r2) reasoning = (reasoning || '') + r2;
        finish = ch2?.finish_reason;
        continued += 1;
      }
      step.continued = continued;
      diagnostics.push(step);
      const continuedTotal = diagnostics.reduce((s, st) => s + (st.continued || 0), 0);
      return { assistant: { role: 'assistant', content, reasoning }, messages: convo, debug: { diagnostics, continuedTotal, raw: json } };
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
          name: name || undefined,
          tool_call_id: tc?.id || undefined,
        });
        // record minimal diagnostics for debugging
        step.tools.push({ id: tc?.id || null, name, args });
      } catch (e) {
        convo.push({
          role: 'tool',
          content: `Tool execution error: ${e?.message || String(e)}`,
          name: tc?.function?.name || undefined,
          tool_call_id: tc?.id || undefined,
        });
        step.tools.push({ id: tc?.id || null, name: tc?.function?.name || null, error: e?.message || String(e) });
      }
    }
    diagnostics.push(step);
    // Loop will continue; upstream now sees tool results and can produce final
  }
  return { error: 'max_iterations_reached', messages: convo, debug: { diagnostics: 'max iters' } };
}
