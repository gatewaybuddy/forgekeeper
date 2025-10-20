import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appendEvent, tailEvents } from '../server.contextlog.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('ContextLog rotation and tail ordering', () => {
  const origEnv = { ...process.env };
  const baseDir = path.resolve(process.cwd(), '.forgekeeper', 'context_log');

  beforeAll(() => {
    process.env.CTXLOG_MAX_BYTES = '200'; // force small rotations
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  afterAll(() => {
    Object.assign(process.env, origEnv);
  });

  it('tails across rotated files in correct order', async () => {
    const conv = 'test_conv_rot';
    for (let i = 0; i < 50; i++) {
      appendEvent({ actor: 'assistant', act: 'message', conv_id: conv, content_preview: `item_${i}` });
    }
    const rows = tailEvents(20, conv);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(20);
    const names = rows.map(r => r.content_preview);
    // Newest first; latest should be first element
    expect(names[0]).toBe('item_49');
  });
});
