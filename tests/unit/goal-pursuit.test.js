// Tests for core/goal-pursuit.js — urgency math boundary conditions
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeUrgency, getUrgencyLabel } from '../../core/goal-pursuit.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Goal Pursuit - computeUrgency', () => {
  describe('deadline is today (timeRatio = 1.0)', () => {
    it('should return 1.0 with no progress tracking', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date().toISOString(),
      });
      assert.equal(u, 1.0);
    });

    it('should return 1.0 with 0% progress (linear)', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date().toISOString(),
        progress: { current: 0, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 1.0);
    });

    it('should return 1.0 with 50% progress (linear)', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date().toISOString(),
        progress: { current: 50, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 1.0);
    });

    it('should return 0.6 with 50% progress (lumpy)', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date().toISOString(),
        progress: { current: 50, target: 100 },
        progressPattern: 'lumpy',
      });
      assert.ok(Math.abs(u - 0.6) < 0.001);
    });

    it('should return 0.0 with 100% progress', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date().toISOString(),
        progress: { current: 100, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 0.0);
    });
  });

  describe('deadline in the past', () => {
    it('should clamp timeRatio to 1.0', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 30 * DAY).toISOString(),
        deadline: new Date(Date.now() - DAY).toISOString(),
        progress: { current: 0, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 1.0);
    });
  });

  describe('currentStart === currentEnd (zero-length period)', () => {
    it('should return 0 for recurring goal', () => {
      const u = computeUrgency({
        recurring: {
          currentStart: '2026-02-01T00:00:00.000Z',
          currentEnd: '2026-02-01T00:00:00.000Z',
        },
        progress: { current: 0, target: 100 },
      });
      assert.equal(u, 0);
    });

    it('should return 0 for one-shot goal', () => {
      const u = computeUrgency({
        created: '2026-02-01T00:00:00.000Z',
        deadline: '2026-02-01T00:00:00.000Z',
        progress: { current: 0, target: 100 },
      });
      assert.equal(u, 0);
    });
  });

  describe('progress exceeds target (negative deficit)', () => {
    it('should clamp to 0 at 120% progress', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 15 * DAY).toISOString(),
        deadline: new Date(Date.now() + 15 * DAY).toISOString(),
        progress: { current: 120, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 0.0);
    });

    it('should clamp to 0 at 300% progress', () => {
      const u = computeUrgency({
        created: new Date(Date.now() - 28 * DAY).toISOString(),
        deadline: new Date(Date.now() + 2 * DAY).toISOString(),
        progress: { current: 300, target: 100 },
        progressPattern: 'linear',
      });
      assert.equal(u, 0.0);
    });
  });

  describe('no deadline or recurring', () => {
    it('should return 0 for bare goal', () => {
      const u = computeUrgency({
        created: new Date().toISOString(),
        progress: { current: 50, target: 100 },
      });
      assert.equal(u, 0);
    });
  });

  describe('lumpy vs linear dampening', () => {
    it('should produce lower urgency for lumpy at same deficit', () => {
      const base = {
        recurring: {
          currentStart: new Date(Date.now() - 15 * DAY).toISOString(),
          currentEnd: new Date(Date.now() + 15 * DAY).toISOString(),
        },
        progress: { current: 0, target: 6000 },
      };
      const linear = computeUrgency({ ...base, progressPattern: 'linear' });
      const lumpy = computeUrgency({ ...base, progressPattern: 'lumpy' });
      assert.ok(lumpy < linear, `lumpy (${lumpy}) should be less than linear (${linear})`);
    });
  });
});

describe('Goal Pursuit - getUrgencyLabel', () => {
  it('should return correct labels at thresholds', () => {
    assert.equal(getUrgencyLabel(0), 'none');
    assert.equal(getUrgencyLabel(0.29), 'none');
    assert.equal(getUrgencyLabel(0.3), 'low');
    assert.equal(getUrgencyLabel(0.59), 'low');
    assert.equal(getUrgencyLabel(0.6), 'medium');
    assert.equal(getUrgencyLabel(0.79), 'medium');
    assert.equal(getUrgencyLabel(0.8), 'high');
    assert.equal(getUrgencyLabel(0.94), 'high');
    assert.equal(getUrgencyLabel(0.95), 'critical');
    assert.equal(getUrgencyLabel(1.0), 'critical');
  });
});
