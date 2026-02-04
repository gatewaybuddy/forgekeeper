/**
 * Autonomous async start + status + stop integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';

const FRONTEND_PORT = 3000; // align with existing integration tests
const LLM_PORT = 8001; // matches server default FRONTEND_VLLM_API_BASE
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

let llmServer = null;
let ready = false;

function startMockLLM(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const messages = Array.isArray(payload.messages) ? payload.messages : [];
            const userMsg = messages.find(m => m && m.role === 'user');
            const content = String(userMsg?.content || '');

            let reflection = {
              assessment: 'continue',
              progress_percent: 0,
              confidence: 0.5,
              next_action: 'noop',
              reasoning: 'mock loop',
              tool_plan: { tool: 'get_time', purpose: 'tick' },
            };

            if (/mode:complete/i.test(content)) {
              reflection = {
                assessment: 'complete',
                progress_percent: 100,
                confidence: 0.95,
                next_action: 'done',
                reasoning: 'mock complete',
                tool_plan: { tool: 'get_time', purpose: 'finalize' },
              };
            }

            const resp = { choices: [{ message: { content: JSON.stringify(reflection) } }] };
            const buf = Buffer.from(JSON.stringify(resp), 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Length', String(buf.length));
            res.end(buf);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e?.message || e));
          }
        });
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

beforeAll(async () => {
  llmServer = await startMockLLM(LLM_PORT);
  // Detect if a frontend server is already running (expected in CI/dev)
  const start = Date.now();
  while (Date.now() - start < 2000) {
    try { const r = await fetch(`${BASE_URL}/config.json`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) console.warn('[Test] Skipping autonomous async tests (frontend not running)');
}, 10000);

afterAll(async () => {
  try { llmServer?.close?.(); } catch {}
});

describe('Autonomous async operations', () => {
  it('should start asynchronously and complete (mode:complete) and status returns result', async () => {
    if (!ready) return;
    const startResp = await fetch(`${BASE_URL}/api/chat/autonomous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'Test autonomous (mode:complete)', max_iterations: 4, async: true }),
    });
    expect(startResp.status).toBe(202);
    const start = await startResp.json();
    expect(start.ok).toBe(true);
    expect(start.running).toBe(true);
    expect(typeof start.session_id).toBe('string');

    const sid = start.session_id;
    const t0 = Date.now();
    let done = null;
    while (Date.now() - t0 < 20000) {
      const st = await fetch(`${BASE_URL}/api/chat/autonomous/status?session_id=${encodeURIComponent(sid)}`);
      expect(st.status).toBe(200);
      const data = await st.json();
      if (!data.running) { done = data; break; }
      await new Promise(r => setTimeout(r, 150));
    }
    expect(done).not.toBeNull();
    expect(done.result).toBeDefined();
    expect(done.result.completed).toBe(true);
    expect(['task_complete','max_iterations'].includes(done.result.reason || done.reason || '')).toBe(true);
  }, 30000);

  it('should support stop-while-running (mode:loop)', async () => {
    if (!ready) return;
    const startResp = await fetch(`${BASE_URL}/api/chat/autonomous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'Looping task (mode:loop)', max_iterations: 8, async: true }),
    });
    expect(startResp.status).toBe(202);
    const start = await startResp.json();
    const sid = start.session_id;

    // Request stop quickly
    const stopResp = await fetch(`${BASE_URL}/api/chat/autonomous/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid }),
    });
    expect(stopResp.status).toBe(200);

    const t0 = Date.now();
    let done = null;
    while (Date.now() - t0 < 20000) {
      const st = await fetch(`${BASE_URL}/api/chat/autonomous/status?session_id=${encodeURIComponent(sid)}`);
      if (st.status === 404) break; // expired or removed
      const data = await st.json();
      if (!data.running) { done = data; break; }
      await new Promise(r => setTimeout(r, 150));
    }
    expect(done).not.toBeNull();
    expect(done.result).toBeDefined();
    expect(done.result.completed).toBe(false);
    expect(done.result.reason).toBe('user_stop');
  }, 30000);
});
