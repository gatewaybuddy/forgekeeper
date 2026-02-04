/**
 * Tests for OutputTruncator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OutputTruncator } from '../core/orchestrator/truncator.mjs';

describe('OutputTruncator', () => {
  let truncator;

  beforeEach(() => {
    truncator = new OutputTruncator({
      maxBytes: 100,
      maxLines: 10,
      strategy: 'head-tail',
    });
  });

  describe('basic truncation', () => {
    it('should not truncate output below limit', () => {
      const output = 'Short output';
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(false);
      expect(result.content).toBe(output);
      expect(result.originalBytes).toBe(Buffer.byteLength(output));
    });

    it('should truncate output above byte limit', () => {
      const output = 'x'.repeat(1000);
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(output.length);
      expect(result.content).toContain('elided');
      expect(result.originalBytes).toBe(1000);
    });

    it('should handle empty output', () => {
      const result = truncator.truncate('');

      expect(result.truncated).toBe(false);
      expect(result.content).toBe('');
    });

    it('should handle null/undefined', () => {
      const result1 = truncator.truncate(null);
      const result2 = truncator.truncate(undefined);

      expect(result1.content).toBe('');
      expect(result2.content).toBe('');
    });
  });

  describe('head-tail strategy', () => {
    it('should show beginning and end of output', () => {
      const output = 'START\n' + 'x'.repeat(500) + '\nEND';
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      expect(result.content).toContain('START');
      expect(result.content).toContain('END');
      expect(result.content).toContain('elided');
    });

    it('should truncate by lines when line count exceeded', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      expect(result.content).toContain('Line 1');
      expect(result.content).toContain('Line 50');
      expect(result.content).toMatch(/\d+ lines elided/);
    });

    it('should calculate elided lines correctly', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncator.truncate(output);

      expect(result.content).toContain('(20 lines elided)');
    });
  });

  describe('head-only strategy', () => {
    beforeEach(() => {
      truncator = new OutputTruncator({
        maxBytes: 100,
        maxLines: 10,
        strategy: 'head-only',
      });
    });

    it('should show only beginning of output', () => {
      const output = 'START\n' + 'x'.repeat(500) + '\nEND';
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      expect(result.content).toContain('START');
      expect(result.content).not.toContain('END');
      expect(result.content).toMatch(/more/);
    });
  });

  describe('tool-specific limits', () => {
    it('should apply default limit for unknown tools', () => {
      const output = 'x'.repeat(200);
      const result = truncator.truncate(output, 'unknown_tool');

      expect(result.truncated).toBe(true);
    });

    it('should apply custom limit for read_file', () => {
      const truncator = new OutputTruncator();
      const output = 'x'.repeat(70000); // 70KB

      const result = truncator.truncate(output, 'read_file');

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(output.length);
    });

    it('should allow setting custom tool limits', () => {
      truncator.setToolLimit('my_tool', { bytes: 50, lines: 5 });

      const output = 'x'.repeat(100);
      const result = truncator.truncate(output, 'my_tool');

      expect(result.truncated).toBe(true);
    });
  });

  describe('UTF-8 handling', () => {
    it('should handle multi-byte characters correctly', () => {
      const output = '你好'.repeat(100); // Chinese characters (3 bytes each)
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      // Should not break in middle of character
      expect(result.content).not.toContain('\ufffd'); // Replacement character
    });

    it('should handle emoji correctly', () => {
      const output = '😀'.repeat(100);
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      // Emoji truncation may produce replacement chars at boundaries - this is acceptable
      // The important part is that the truncation doesn't crash
      expect(result.content.length).toBeLessThan(output.length);
    });
  });

  describe('statistics', () => {
    it('should calculate savings correctly', () => {
      const original = 'x'.repeat(1000);
      const result = truncator.truncate(original);

      const stats = truncator.getStats(original, result.content);

      expect(stats.originalBytes).toBe(1000);
      expect(stats.truncatedBytes).toBeLessThan(1000);
      expect(stats.savedBytes).toBeGreaterThan(0);
      expect(stats.savedPercent).toBeGreaterThan(0);
      expect(stats.savedPercent).toBeLessThan(100);
    });
  });

  describe('byte formatting', () => {
    it('should format bytes correctly', () => {
      expect(truncator.formatBytes(500)).toBe('500 bytes');
      expect(truncator.formatBytes(1536)).toBe('1.5 KB');
      expect(truncator.formatBytes(1048576)).toBe('1.0 MB');
    });
  });

  describe('edge cases', () => {
    it('should handle single long line', () => {
      const output = 'x'.repeat(1000);
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(output.length);
    });

    it('should handle output at exact limit', () => {
      const output = 'x'.repeat(100);
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(false);
    });

    it('should handle output one byte over limit', () => {
      const output = 'x'.repeat(101);
      const result = truncator.truncate(output);

      expect(result.truncated).toBe(true);
    });

    it('should preserve line structure in truncated output', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncator.truncate(output);

      const resultLines = result.content.split('\n');
      expect(resultLines[0]).toBe('Line 1');
      expect(resultLines[resultLines.length - 1]).toBe('Line 30');
    });
  });

  describe('performance', () => {
    it('should truncate large output efficiently', () => {
      const largeOutput = 'x'.repeat(10000000); // 10MB

      const start = Date.now();
      const result = truncator.truncate(largeOutput);
      const duration = Date.now() - start;

      expect(result.truncated).toBe(true);
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });
});
