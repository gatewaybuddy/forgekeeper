#!/usr/bin/env node
// Minimal mock OpenAI-compatible server for local dev and CI smoke tests.
// Implements /v1/chat/completions (non-streaming and streaming SSE).

import http from 'node:http';

const port = Number(process.env.MOCK_OPENAI_PORT || 8001);

function parseBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); }
    });
  });
}

function asTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : p?.text || p?.content || p?.value || '')).join('');
  }
  return '';
}

function handleChatCompletions(req, res, body) {
  const stream = !!body?.stream;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = messages[messages.length - 1] || {};
  const userText = asTextContent(last.content);
  // If the prompt contains the word "time", return a tool_call to get_time; otherwise final text.
  const wantsTool = /\btime\b/i.test(userText);
  if (!stream) {
    const toolCall = wantsTool
      ? [{ id: 'call_1', type: 'function', function: { name: 'get_time', arguments: '{}' } }]
      : [];
    const content = wantsTool ? null : "harmony ok";
    const msg = { role: 'assistant', content, reasoning_content: null };
    if (toolCall.length) msg.tool_calls = toolCall;
    const payload = { id: 'cmpl_mock', choices: [{ index: 0, finish_reason: wantsTool ? 'tool_calls' : 'stop', message: msg }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  // streaming SSE: send reasoning then final
  res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive', 'cache-control': 'no-cache' });
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: 'Thinking... ' } }] })}\n\n`);
  setTimeout(() => {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'harmony ok' } }] })}\n\n`);
    setTimeout(() => {
      res.write('data: [DONE]\n\n');
      res.end();
    }, 50);
  }, 50);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    const body = await parseBody(req);
    return handleChatCompletions(req, res, body);
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock OpenAI server listening on http://localhost:${port}`);
});

