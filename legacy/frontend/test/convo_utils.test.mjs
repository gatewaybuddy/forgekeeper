import { describe, it, expect } from 'vitest';
import { injectDeveloperNoteBeforeLastUser } from '../src/lib/convoUtils.ts';

describe('injectDeveloperNoteBeforeLastUser', () => {
  it('inserts before last user', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ];
    const out = injectDeveloperNoteBeforeLastUser(msgs, 'note');
    const idx = out.findIndex(m => m.role === 'developer');
    expect(idx).toBe(3); // before last user (which was index 3 in original, now shifted)
    expect(out[idx + 1].role).toBe('user');
    expect(out[idx].content).toBe('note');
  });

  it('inserts after system if no user exists', () => {
    const msgs = [ { role: 'system', content: 's' } ];
    const out = injectDeveloperNoteBeforeLastUser(msgs, 'n');
    expect(out[1].role).toBe('developer');
  });

  it('does not mutate original', () => {
    const msgs = [ { role: 'system', content: 's' }, { role: 'user', content: 'u' } ];
    const copy = [...msgs];
    const out = injectDeveloperNoteBeforeLastUser(msgs, 'x');
    expect(msgs).toEqual(copy);
    expect(out).not.toBe(msgs);
  });
});

