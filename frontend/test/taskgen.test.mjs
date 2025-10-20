import { describe, it, expect } from 'vitest';
import { suggestTasksFromStats } from '../server.taskgen.mjs';

describe('taskgen: suggestTasksFromStats', () => {
  it('suggests continuation tuning when ratio exceeds threshold', () => {
    const stats = { windowMin: 60, assistantMsgs: 100, cont: { total: 20, fence: 8, punct: 6, short: 6 }, ratio: 0.20 };
    const out = suggestTasksFromStats(stats, { ratioThreshold: 0.15, minCount: 5 });
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    const ids = out.map(x => x.id);
    expect(ids).toContain('TGT-CONT-1');
  });

  it('does not suggest when below threshold', () => {
    const stats = { windowMin: 60, assistantMsgs: 100, cont: { total: 5, fence: 1, punct: 2, short: 2 }, ratio: 0.05 };
    const out = suggestTasksFromStats(stats, { ratioThreshold: 0.15, minCount: 5 });
    expect(out.length).toBe(0);
  });
});

