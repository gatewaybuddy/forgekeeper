import type { RequestInit } from 'node-fetch';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function inferBase(): { base: string | null; key: string | null; model: string } {
  const base =
    process.env.FK_CORE_API_BASE ||
    process.env.FGK_INFER_URL ||
    process.env.OPENAI_BASE_URL ||
    null; // expect OpenAI-compatible /v1
  const key = process.env.FK_API_KEY || process.env.FGK_INFER_KEY || process.env.OPENAI_API_KEY || null;
  const model = process.env.FK_OPENAI_MODEL || process.env.VLLM_MODEL_CORE || 'oss-gpt-20b';
  return { base, key, model };
}

export async function chatCompletion(messages: ChatMessage[]): Promise<string | null> {
  const { base, key, model } = inferBase();
  if (!base) return null;

  // Accept base with or without trailing /v1
  const cleaned = base.replace(/\/$/, '');
  const url = /\/v1$/i.test(cleaned)
    ? `${cleaned}/chat/completions`
    : `${cleaned}/v1/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const body = JSON.stringify({ model, messages, temperature: 0.2, stream: false, max_tokens: 256 });
  const init: RequestInit = { method: 'POST', headers, body } as any;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...(init as any), signal: controller.signal } as any);
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function inferAssistantReply(prompt: string): Promise<string | null> {
  const useDirect = (process.env.FGK_DIRECT_INFER_ON_SEND ?? '1') === '1';
  if (!useDirect) return null;
  return chatCompletion([{ role: 'user', content: prompt }]);
}
