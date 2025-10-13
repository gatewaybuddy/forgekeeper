// Server-side chat orchestration with OpenAI-style tool calls.
// Portable: depends only on fetch and the local tool registry.

import { getToolDefs, runTool } from './server.tools.mjs';
import { buildHarmonySystem, buildHarmonyDeveloper, toolsToTypeScript, renderHarmonyConversation, renderHarmonyMinimal, extractHarmonyFinalStrict, extractHarmonyAnalysisStrict } from './server.harmony.mjs';

function isGptOssModel(name) {
  try {
    const n = String(name || '').toLowerCase();
    return n.includes('gpt-oss') || n.includes('gpt_oss') || n.includes('gptoss') || n.includes('oss-') || n.includes('harmony');
  } catch { return false; }
}

function isIncomplete(text) {
  try {
    if (!text) return true;
    const t = String(text).trim();
    if (t.length < 32) return true;
    const last = t.slice(-1);
    if (!'.!?'.includes(last)) return true;
    const ticks = (t.match(/```/g) || []).length;
    return (ticks % 2 === 1);
  } catch {
    return false;
  }
}

// Drop orphan tool messages (those not immediately following an assistant tool_calls message)
function sanitizeMessagesForTools(messages) {
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
      } else {
        continue;
      }
    } else {
      lastHadToolCalls = false;
      out.push(m);
    }
  }
  return out;
}

const STOP_CHAT = ['\nUSER:', '\nUser:', '\nASSISTANT:', '\nAssistant:'];

async function callUpstream({ baseUrl, model, messages, tools, tool_choice, maxTokens, temperature, topP, presencePenalty, frequencyPenalty }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages: sanitizeMessagesForTools(messages),
    temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : Number(process.env.FRONTEND_TEMP || '0.0'),
    top_p: (typeof topP === 'number' && !Number.isNaN(topP)) ? topP : Number(process.env.FRONTEND_TOP_P || '0.4'),
    stream: false,
    presence_penalty: (typeof presencePenalty === 'number' && !Number.isNaN(presencePenalty)) ? presencePenalty : (Number(process.env.FRONTEND_PRESENCE_PENALTY || '0.0')),
    frequency_penalty: (typeof frequencyPenalty === 'number' && !Number.isNaN(frequencyPenalty)) ? frequencyPenalty : (Number(process.env.FRONTEND_FREQUENCY_PENALTY || '0.2')),
    stop: STOP_CHAT,
    max_tokens: (typeof maxTokens === 'number' && maxTokens > 0) ? maxTokens : Number(process.env.FRONTEND_MAX_TOKENS || '4096'),
  };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) { const txt = await resp.text().catch(() => ''); throw new Error(`Upstream HTTP ${resp.status}: ${txt}`); }
  return resp.json();
}

function splitContentAndReasoningFromMessage(msg) {
  try {
    // Native reasoning field
    if (typeof msg?.reasoning_content === 'string' && msg.reasoning_content) {
      const visible = extractContent(msg?.content ?? null);
      return { content: visible || null, reasoning: msg.reasoning_content };
    }
    // Content array with typed parts: identify reasoning-like parts
    const c = msg?.content;
    let content = '';
    let reasoning = '';
    if (Array.isArray(c)) {
      for (const part of c) {
        if (!part) continue;
        const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
        const channel = typeof part.channel === 'string' ? part.channel.toLowerCase() : '';
        const text = (typeof part.text === 'string' && part.text)
          || (typeof part.content === 'string' && part.content)
          || (typeof part.value === 'string' && part.value)
          || '';
        if (!text) continue;
        if (type === 'reasoning' || type === 'analysis' || channel === 'analysis' || channel === 'reasoning') {
          reasoning += text;
        } else {
          content += text;
        }
      }
      return { content: content || null, reasoning: reasoning || null };
    }
    // Simple string
    const s = extractContent(c ?? null);
    const fallbackText = typeof msg?.text === 'string' ? msg.text : null;
    return { content: s || fallbackText || null, reasoning: null };
  } catch {
    const fallback = extractContent(msg?.content ?? null) || (typeof msg?.text === 'string' ? msg.text : null) || null;
    return { content: fallback, reasoning: null };
  }
}

function toAppMsgOpenAI(msg) {
  return splitContentAndReasoningFromMessage(msg);
}

async function callUpstreamHarmony({ baseUrl, model, messages, tools, maxTokens, temperature, topP }) {
  const url = baseUrl.replace(/\/$/, '') + '/completions';
  const useTools = Array.isArray(tools) && tools.length > 0;
  const toolsTs = useTools ? toolsToTypeScript(tools) : '';
  const useMinimal = (process.env.FRONTEND_HARMONY_MINIMAL || '1') === '1';
  let rendered;
  if (useMinimal && !useTools) {
    // Minimal prompt: user + prefilled final
    rendered = renderHarmonyMinimal(messages);
  } else {
    const disableSystem = process.env.FRONTEND_DISABLE_SYSTEM === '1';
    const parts = [];
    if (!disableSystem) {
      parts.push(buildHarmonySystem());
    }
    parts.push(buildHarmonyDeveloper({ instructions: 'Follow user instructions precisely.', toolsTs }));
    parts.push(renderHarmonyConversation(messages, { prefillFinal: true }));
    rendered = parts.join('\n');
  }
  // Small max_tokens for short prompts; scale modestly with user text length
  let desiredMax = Number(process.env.FRONTEND_MAX_TOKENS || '2048');
  try {
    const users = (Array.isArray(messages) ? messages : []).filter(m => m?.role === 'user');
    const last = users.length ? String(users[users.length - 1]?.content || '') : '';
    const chars = last.length;
    const smallCap = Math.max(24, Math.min(128, Math.floor(chars / 3) + 24));
    desiredMax = Math.min(desiredMax, smallCap);
  } catch {}
  const body = {
    model,
    prompt: rendered,
    temperature: (typeof temperature === 'number' && !Number.isNaN(temperature)) ? temperature : Number(process.env.FRONTEND_TEMP || '0.0'),
    top_p: (typeof topP === 'number' && !Number.isNaN(topP)) ? topP : Number(process.env.FRONTEND_TOP_P || '0.4'),
    max_tokens: (typeof maxTokens === 'number' && maxTokens > 0) ? Math.min(maxTokens, desiredMax) : desiredMax,
    stream: false,
    stop: ['<|end|>', '<|channel|>', '<|return|>'],
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Upstream HTTP ${resp.status}: ${txt}`);
  }
  return resp.json();
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

// --- Long-context helpers ---
function approxTokensFromMessages(msgs) {
  try {
    let chars = 0;
    for (const m of (Array.isArray(msgs) ? msgs : [])) {
      const c = typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map(p => (typeof p === 'string' ? p : (p?.text||p?.content||p?.value||''))).join('') : '';
      chars += c.length + 20; // headroom per message
    }
    return Math.ceil(chars / 4);
  } catch { return 0; }
}

function formatTranscript(msgs) {
  const lines = [];
  for (const m of (Array.isArray(msgs) ? msgs : [])) {
    const role = m?.role || 'user';
    let content = '';
    if (role === 'tool') {
      content = (typeof m?.content === 'string') ? m.content : JSON.stringify(m?.content||'');
    } else {
      content = (typeof m?.content === 'string') ? m.content : Array.isArray(m?.content) ? m.content.map(p => (typeof p === 'string' ? p : (p?.text||p?.content||p?.value||''))).join('') : '';
    }
    lines.push(`[${role}] ${content}`);
  }
  return lines.join('\n\n');
}

async function ensureContextBudget({ baseUrl, model, messages, desiredMaxTokens }) {
  const ctxLimit = Number(process.env.FRONTEND_CTX_LIMIT || process.env.VLLM_MAX_MODEL_LEN || process.env.LLAMA_N_CTX || '4096');
  const fallbackMax = Number(process.env.FRONTEND_MAX_TOKENS || '4096');
  const budget = Math.max(1024, ctxLimit - (typeof desiredMaxTokens === 'number' ? desiredMaxTokens : fallbackMax) - 256);
  const est = approxTokensFromMessages(messages);
  if (est <= budget) return { messages, compaction: null };
  // Attempt summarization
  try {
    const transcript = formatTranscript(messages);
    const sumPrompt = [
      { role: 'system', content: 'You are a concise assistant that compresses prior conversation into a compact summary preserving facts, constraints, decisions, and tool results. Keep names, IDs, and paths. Avoid verbosity.' },
      { role: 'user', content: `Summarize the following conversation so it can be used as context for subsequent turns. Target <= ${Math.floor(budget/2)} tokens.\n\n${transcript}` },
    ];
    const summaryJson = await callUpstream({ baseUrl, model, messages: sumPrompt, tool_choice: 'none', maxTokens: Math.floor(Math.max(512, budget/2)) });
    const choice = summaryJson?.choices?.[0] ?? {};
    const summary = extractContent(choice?.message?.content ?? choice?.content ?? '') || '';
    if (summary) {
      const kept = messages.filter(m => m?.role === 'system').slice(-1);
      const lastUser = [...messages].reverse().find(m => m?.role === 'user');
      const tail = lastUser ? [ lastUser ] : [];
      const nextMsgs = [...kept, { role: 'system', content: `Conversation summary:\n${summary}` }, ...tail];
      return { messages: nextMsgs, compaction: { method: 'summary', before: est, budget, after: approxTokensFromMessages(nextMsgs) } };
    }
  } catch {}
  // Fallback: sliding window
  const out = [];
  const sys = messages.find(m => m?.role === 'system');
  if (sys) out.push(sys);
  const tail = messages.slice(-10);
  const nextMsgs = [...out, ...tail];
  return { messages: nextMsgs, compaction: { method: 'sliding', before: est, budget, after: approxTokensFromMessages(nextMsgs) } };
}

/**
 * Orchestrate tool calls until a final assistant message without tool_calls.
 */
export async function orchestrateWithTools({ baseUrl, model, messages, tools, maxIterations = 4, maxTokens, temperature, topP, presencePenalty, frequencyPenalty }) {
  const convo = Array.isArray(messages) ? [...messages] : [];
  const diagnostics = [];
  let compactionInfo = null;
  const contLimit = Math.max(0, Number(process.env.FRONTEND_CONT_ATTEMPTS || '0'));
  const mdlName = model || process.env.FRONTEND_VLLM_MODEL || process.env.FRONTEND_MODEL || '';
  const useHarmony = (process.env.FRONTEND_USE_HARMONY === '1') || isGptOssModel(mdlName);
  for (let iter = 0; iter < maxIterations; iter++) {
    // For Harmony, avoid injecting tools/types — keep prompt minimal for stability
    const toolDefs = useHarmony ? [] : (Array.isArray(tools) && tools.length ? tools : await getToolDefs());
    const { messages: budgetedIn, compaction } = await ensureContextBudget({ baseUrl, model, messages: convo, desiredMaxTokens: maxTokens });
    if (compaction) compactionInfo = compactionInfo || compaction;
    const json = useHarmony
      ? await callUpstreamHarmony({ baseUrl, model, messages: budgetedIn, tools: toolDefs, maxTokens, temperature, topP })
      : await callUpstream({ baseUrl, model, messages: budgetedIn, tools: toolDefs, tool_choice: 'auto', maxTokens, temperature, topP, presencePenalty, frequencyPenalty });
    const choice = json?.choices?.[0] ?? {};
    const msg = choice?.message || choice;
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
    const step = { iter, finish_reason: choice?.finish_reason, tool_calls_count: toolCalls.length, tools: [] };

    if (useHarmony || !toolCalls.length) {
      // Final answer
      let { content, reasoning } = useHarmony
        ? { content: extractHarmonyFinalStrict(choice?.text || ''), reasoning: extractHarmonyAnalysisStrict(choice?.text || '') || null }
        : toAppMsgOpenAI(msg);
      let finish = choice?.finish_reason;
      let continued = 0;
      // Lightweight auto-continue if truncated or too short
      while ((finish === 'length') && continued < contLimit) {
        convo.push({ role: 'user', content: 'Continue.' });
        const { messages: budgeted2, compaction: comp2 } = await ensureContextBudget({ baseUrl, model, messages: convo, desiredMaxTokens: maxTokens });
        if (comp2) compactionInfo = compactionInfo || comp2;
        const next = useHarmony
          ? await callUpstreamHarmony({ baseUrl, model, messages: budgeted2, tools: [], maxTokens, temperature, topP })
          : await callUpstream({ baseUrl, model, messages: budgeted2, tool_choice: 'none', maxTokens, temperature, topP, presencePenalty, frequencyPenalty });
        const ch2 = next?.choices?.[0] ?? {};
        const msg2 = ch2?.message || ch2;
        if (useHarmony) {
          const c2 = extractHarmonyFinalStrict(ch2?.text || '');
          content = (content || '') + (c2 || '');
        } else {
          const { content: c2, reasoning: r2 } = toAppMsgOpenAI(msg2);
          content = (content || '') + (c2 || '');
          if (r2) reasoning = (reasoning || '') + r2;
        }
        finish = ch2?.finish_reason;
        continued += 1;
      }
      step.continued = continued;
      diagnostics.push(step);
      const continuedTotal = diagnostics.reduce((s, st) => s + (st.continued || 0), 0);
      return { assistant: { role: 'assistant', content, reasoning }, messages: convo, debug: { diagnostics, continuedTotal, raw: json, compaction: compactionInfo } };
    }

    // Append assistant msg with tool_calls to history (as upstream would expect)
    convo.push(msg);

    // Execute each tool and append tool results
    for (const tc of toolCalls) {
      try {
        const name = tc?.function?.name;
        let args = {};
        try { args = tc?.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch {}
        const t0 = Date.now();
        const result = await runTool(name, args);
        const ms = Date.now() - t0;
        convo.push({ role: 'tool', content: typeof result === 'string' ? result : JSON.stringify(result), name: name || undefined, tool_call_id: tc?.id || undefined });
        const preview = typeof result === 'string' ? result : (JSON.stringify(result).slice(0, 160) + (JSON.stringify(result).length > 160 ? '.' : ''));
        step.tools.push({ id: tc?.id || null, name, args, ms, preview });
      } catch (e) {
        convo.push({ role: 'tool', content: `Tool execution error: ${e?.message || String(e)}`, name: tc?.function?.name || undefined, tool_call_id: tc?.id || undefined });
        step.tools.push({ id: tc?.id || null, name: tc?.function?.name || null, error: e?.message || String(e) });
      }
    }
    diagnostics.push(step);
  }
  return { error: 'max_iterations_reached', messages: convo, debug: { diagnostics: 'max iters' } };
}

