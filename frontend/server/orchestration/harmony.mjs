// Minimal Harmony prompt renderer for OSS models that expect the Harmony template.
// Docs: https://github.com/openai/harmony and OpenAI cookbook article.

function tsTypeFromJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') return 'any';
  const t = schema.type;
  if (Array.isArray(t)) {
    const uniq = [...new Set(t.flatMap(v => (typeof v === 'string' ? [v] : [])))];
    if (uniq.length === 1) return tsTypeFromJsonSchema({ ...schema, type: uniq[0] });
    return uniq.map(v => tsTypeFromJsonSchema({ type: v })).join(' | ');
  }
  if (t === 'string') return 'string';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'array') {
    const it = schema.items || {};
    return tsTypeFromJsonSchema(Array.isArray(it) ? { anyOf: it } : it) + '[]';
  }
  if (t === 'object' || (schema.properties || schema.additionalProperties)) {
    const props = schema.properties || {};
    const keys = Object.keys(props);
    const req = new Set(Array.isArray(schema.required) ? schema.required : []);
    const fields = keys.map(k => `${k}${req.has(k) ? '' : '?'}: ${tsTypeFromJsonSchema(props[k])};`);
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      fields.push(`[key: string]: ${tsTypeFromJsonSchema(schema.additionalProperties)};`);
    } else if (schema.additionalProperties === true) {
      fields.push(`[key: string]: any;`);
    }
    return `{ ${fields.join(' ')} }`;
  }
  if (schema.anyOf) return schema.anyOf.map(tsTypeFromJsonSchema).join(' | ');
  if (schema.oneOf) return schema.oneOf.map(tsTypeFromJsonSchema).join(' | ');
  return 'any';
}

export function buildHarmonySystem({ date = new Date().toISOString().slice(0,10), knowledgeCutoff = 'unknown', reasoning = 'high' } = {}) {
  return [
    '<|start|>system<|message|>',
    `You are a precise, helpful assistant. Current date: ${date}. Knowledge cutoff: ${knowledgeCutoff}.`,
    `<|end|>`,
    '<|start|>system<|channel|>policies<|message|>',
    'Valid channels: analysis, final.',
    'Write your private chain-of-thought in the analysis channel. Then produce the user-facing answer in the final channel. Use only analysis and final channels; do not use any others.',
    `<|end|>`,
    '<|start|>system<|channel|>metadata<|message|>',
    `Reasoning: ${reasoning}.`,
    `<|end|>`,
  ].join('\n');
}

export function buildHarmonyDeveloper({ instructions = '', toolsTs = '' } = {}) {
  const parts = [];
  parts.push('<|start|>developer<|message|>');
  if (instructions) parts.push(`# Instructions\n${instructions}`);
  if (toolsTs) {
    parts.push('\n# Tools (TypeScript)');
    parts.push('namespace functions {');
    parts.push(toolsTs);
    parts.push('}');
  }
  parts.push('<|end|>');
  return parts.join('\n');
}

export function toolsToTypeScript(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return '';
  const lines = [];
  for (const t of tools) {
    const name = t?.function?.name || 'tool';
    const desc = t?.function?.description || '';
    const schema = t?.function?.parameters || { type: 'object', properties: {} };
    const tsType = tsTypeFromJsonSchema(schema);
    lines.push(`// ${desc}`);
    lines.push(`export function ${name}(args: ${tsType}): string;`);
  }
  return lines.join('\n');
}

export function renderHarmonyConversation(messages, {prefillFinal=true} = {}) {
  // Convert generic OpenAI messages to Harmony segments.
  const out = [];
  for (const m of (Array.isArray(messages) ? messages : [])) {
    const role = m?.role;
    if (!role) continue;
    const content = toText(m?.content);
    if (!content) continue;
    if (role === 'system') { out.push(`<|start|>system<|message|>\n${content}\n<|end|>`); continue; }
    if (role === 'developer') { out.push(`<|start|>developer<|message|>\n${content}\n<|end|>`); continue; }
    if (role === 'user') { out.push(`<|start|>user<|message|>\n${content}\n<|end|>`); continue; }
    if (role === 'assistant') {
      const ch = 'final';
      out.push(`<|start|>assistant<|channel|>${ch}<|message|>\n${content}\n<|end|>`);
      continue;
    }
  }
  // The assistant turn to continue:
  if (prefillFinal) out.push('<|start|>assistant<|channel|>final<|message|>');
  else out.push('<|start|>assistant');
  return out.join('\n');
}

// Minimal Harmony rendering: user + prefilled assistant final, no policies
export function renderHarmonyMinimal(messages) {
  const out = [];
  const msgs = Array.isArray(messages) ? messages : [];
  // Optionally suppress any system steer entirely
  const disableSystem = process.env.FRONTEND_DISABLE_SYSTEM === '1';
  if (!disableSystem) {
    // Add a tiny system steer for cleaner outputs
    out.push('<|start|>system<|message|>');
    out.push('Answer in one short, plain-English sentence. Do not include tags, code, or special symbols.');
    out.push('<|end|>');
  }
  const sys = msgs.find(m => m?.role === 'system');
  if (sys && !disableSystem) out.push(`<|start|>system<|message|>\n${toText(sys.content)}\n<|end|>`);
  for (const m of msgs) {
    if (!m || m.role !== 'user') continue;
    out.push(`<|start|>user<|message|>\n${toText(m.content)}\n<|end|>`);
  }
  out.push('<|start|>assistant<|channel|>final<|message|>');
  return out.join('\n');
}

function toText(c) {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : (p?.text || p?.content || p?.value || ''))).join('');
  if (typeof c === 'object') return c.text || c.content || c.value || '';
  return String(c);
}

export function extractHarmonyFinal(text) {
  if (!text) return '';
  const t = String(text);
  // Prefer final channel content between <|channel|>final<|message|> and <|return|> or <|end|>
  const ch = '<|channel|>final<|message|>';
  const i = t.lastIndexOf(ch);
  if (i >= 0) {
    const seg = t.slice(i + ch.length);
    const endIdx = findFirst(seg, ['<|return|>', '<|end|>', '<|start|>', '<|channel|>']);
    return seg.slice(0, endIdx >= 0 ? endIdx : seg.length).trim();
  }
  // Fallback: entire text minus any leading commentary
  return t.trim();
}

export function extractHarmonyFinalStrict(text) {
  let out = extractHarmonyFinal(text);
  if (!out) return '';
  // Strip any residual Harmony tags if the model leaked them
  out = out.replace(/<\|[^>]*\|>/g, '');
  // Collapse excessive whitespace
  out = out.replace(/[ \t\f\v]+/g, ' ');
  out = out.replace(/\s*\n\s*/g, '\n').trim();
  // Remove dangling unmatched braces or stray punctuation spam at the extremes
  out = out.replace(/^[)\]}#*\-\/.\s]+/, '').replace(/[({\[#*\-\/.\s]+$/, '');
  return out.trim();
}

// Extract the analysis channel (reasoning) from Harmony-formatted text
export function extractHarmonyAnalysis(text) {
  if (!text) return '';
  const t = String(text);
  const ch = '<|channel|>analysis<|message|>';
  // Prefer the last analysis segment if multiple
  const i = t.lastIndexOf(ch);
  if (i >= 0) {
    const seg = t.slice(i + ch.length);
    const endIdx = findFirst(seg, ['<|return|>', '<|end|>', '<|start|>', '<|channel|>']);
    return seg.slice(0, endIdx >= 0 ? endIdx : seg.length).trim();
  }
  return '';
}

export function extractHarmonyAnalysisStrict(text) {
  let out = extractHarmonyAnalysis(text);
  if (!out) return '';
  // Strip tags and tidy whitespace like the final extractor
  out = out.replace(/<\|[^>]*\|>/g, '');
  out = out.replace(/[ \t\f\v]+/g, ' ');
  out = out.replace(/\s*\n\s*/g, '\n').trim();
  return out.trim();
}

function findFirst(s, needles) {
  let best = -1;
  for (const n of needles) {
    const j = s.indexOf(n);
    if (j >= 0 && (best < 0 || j < best)) best = j;
  }
  return best;
}

// --- Simple tool-call protocol helpers for Harmony text prompts ---

// Parse one or more <tool_call>{...}</tool_call> blocks from text.
// Returns an array of objects with at least { name, arguments } when valid.
export function extractHarmonyToolCalls(text) {
  try {
    if (!text) return [];
    const t = String(text);
    const re = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    const out = [];
    for (const m of t.matchAll(re)) {
      const raw = (m[1] || '').trim();
      try {
        const obj = JSON.parse(raw);
        const name = obj?.name;
        const args = obj?.arguments;
        if (typeof name === 'string' && (typeof args === 'object' || typeof args === 'undefined')) {
          out.push({ name, arguments: args || {}, id: obj?.id || null });
        }
      } catch { /* ignore invalid blocks */ }
    }
    return out;
  } catch {
    return [];
  }
}

// Render tool results as one or more <tool_result>{...}</tool_result> blocks suitable
// for inclusion in a developer message so the model can continue.
export function renderHarmonyToolResults(results) {
  try {
    const blocks = [];
    for (const r of (Array.isArray(results) ? results : [])) {
      const payload = {
        name: r?.name || null,
        id: r?.id || null,
        result: r?.result,
      };
      blocks.push(`<tool_result>${JSON.stringify(payload)}</tool_result>`);
    }
    return blocks.join('\n');
  } catch {
    return '';
  }
}

// Strip any custom <tool_call> or <tool_result> blocks from text for clean display.
export function stripHarmonyToolTags(text) {
  try {
    return String(text || '').replace(/<tool_(?:call|result)>[\s\S]*?<\/tool_(?:call|result)>/g, '').trim();
  } catch {
    return String(text || '');
  }
}
