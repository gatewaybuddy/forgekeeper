import { describe, it, expect } from 'vitest';
import { isProbablyIncomplete, incompleteReason } from '../server/core/finishers.mjs';

describe('finishers: isProbablyIncomplete()', () => {
  it('detects short text as incomplete', () => {
    expect(isProbablyIncomplete('Hello world')).toBe(true);
    expect(incompleteReason('Hello world')).toBe('short');
  });

  it('detects missing terminal punctuation', () => {
    const t = 'This sentence ends without punctuation';
    expect(isProbablyIncomplete(t)).toBe(true);
    expect(incompleteReason(t)).toBe('punct');
  });

  it('detects dangling code fence', () => {
    const t = 'Here is code:\n```js\nconsole.log(42)';
    expect(isProbablyIncomplete(t)).toBe(true);
    expect(incompleteReason(t)).toBe('fence');
  });

  it('accepts balanced code fence as complete', () => {
    const t = 'Here is code:\n```js\nconsole.log(42)\n```';
    expect(isProbablyIncomplete(t)).toBe(false);
    expect(incompleteReason(t)).toBe(null);
  });

  it('accepts multilingual punctuation', () => {
    expect(isProbablyIncomplete('这是完整的。')).toBe(false);
    expect(incompleteReason('这是完整的。')).toBe(null);
  });
});

