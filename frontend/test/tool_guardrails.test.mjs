import { describe, it, expect } from 'vitest';

import { redactPreview, truncatePreview } from '../server.guardrails.mjs';

describe('server.guardrails', () => {
  it('redacts emails and tokens', () => {
    const s = 'contact me at alice@example.com with token sk_test_1234567890abcd';
    const out = redactPreview(s);
    expect(out).not.toContain('alice@example.com');
    expect(out).toContain('<redacted:email>');
    expect(out).toContain('<redacted:token>');
  });

  it('redacts url credentials', () => {
    const s = 'https://user:pass@example.com/path';
    const out = redactPreview(s);
    expect(out).toContain('<redacted:creds>@');
  });

  it('truncates long previews with marker', () => {
    const long = 'X'.repeat(9000);
    const out = truncatePreview(long, 64);
    expect(out).toContain('[TRUNCATED]');
  });
});

