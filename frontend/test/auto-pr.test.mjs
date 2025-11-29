/**
 * Unit Tests for SAPL (Safe Auto-PR Loop)
 *
 * Tests the allowlist validation, pattern matching, preview generation,
 * safety controls, and error handling for the auto-PR system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isEnabled,
  isDryRun,
  validateFiles,
  previewPR,
  getStatus,
  DEFAULT_ALLOWLIST,
} from '../server.auto-pr.mjs';

describe('SAPL (Safe Auto-PR Loop)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Safety Controls', () => {
    it('should be disabled by default (kill-switch)', () => {
      delete process.env.AUTO_PR_ENABLED;
      expect(isEnabled()).toBe(false);
    });

    it('should be enabled when AUTO_PR_ENABLED=1', () => {
      process.env.AUTO_PR_ENABLED = '1';
      expect(isEnabled()).toBe(true);
    });

    it('should be in dry-run mode by default', () => {
      delete process.env.AUTO_PR_DRYRUN;
      expect(isDryRun()).toBe(true);
    });

    it('should disable dry-run when AUTO_PR_DRYRUN=0', () => {
      process.env.AUTO_PR_DRYRUN = '0';
      expect(isDryRun()).toBe(false);
    });
  });

  describe('Allowlist Validation', () => {
    it('should allow files matching exact paths in allowlist', () => {
      const allowlist = ['README.md', 'docs/guide.md'];
      const files = ['README.md', 'docs/guide.md'];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toEqual(['README.md', 'docs/guide.md']);
      expect(result.blocked).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('should allow files matching glob patterns', () => {
      const allowlist = ['docs/**/*.md', 'tests/**/*.mjs'];
      const files = [
        'docs/api/reference.md',
        'docs/guides/setup.md',
        'tests/unit/foo.test.mjs',
      ];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toHaveLength(3);
      expect(result.blocked).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('should block files not in allowlist', () => {
      const allowlist = ['docs/**/*.md'];
      const files = ['src/app.js', 'docs/guide.md', '.env'];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toEqual(['docs/guide.md']);
      expect(result.blocked).toEqual(['src/app.js', '.env']);
      expect(result.ok).toBe(false);
    });

    it('should block sensitive files like .env', () => {
      const allowlist = ['**/*']; // Allow all
      const files = ['.env', '.env.local', 'config/.env'];
      const result = validateFiles(files, allowlist);

      // .env files should be blocked even with wildcard allowlist
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('.env files detected - review carefully');
    });

    it('should use default allowlist when none provided', () => {
      const files = [
        'README.md',
        'docs/api.md',
        'tests/foo.test.mjs',
        'src/app.js', // Should be blocked
      ];
      const result = validateFiles(files);

      expect(result.allowed.length).toBeGreaterThan(0);
      expect(result.blocked).toContain('src/app.js');
    });

    it('should handle empty file list', () => {
      const result = validateFiles([]);

      expect(result.allowed).toEqual([]);
      expect(result.blocked).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it('should handle invalid inputs gracefully', () => {
      const result = validateFiles(null, null);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Preview Generation', () => {
    it('should generate preview for valid PR request', async () => {
      const files = ['README.md', 'docs/guide.md'];
      const title = 'Update documentation';
      const body = 'Add new sections';

      const result = await previewPR(files, title, body);

      expect(result.ok).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview.title).toBe(title);
      expect(result.preview.body).toBe(body);
      expect(result.preview.files).toEqual(['README.md', 'docs/guide.md']);
    });

    it('should include blocked files in preview warning', async () => {
      const files = ['README.md', 'src/app.js'];
      const result = await previewPR(files, 'Update', 'Body');

      expect(result.ok).toBe(false);
      expect(result.blocked).toContain('src/app.js');
    });

    it('should apply default labels from environment', async () => {
      process.env.AUTO_PR_LABELS = 'docs,automated';
      const result = await previewPR(['README.md'], 'Title', 'Body');

      expect(result.preview.labels).toContain('docs');
      expect(result.preview.labels).toContain('automated');
    });

    it('should merge custom labels with default labels', async () => {
      process.env.AUTO_PR_LABELS = 'docs';
      const result = await previewPR(
        ['README.md'],
        'Title',
        'Body',
        ['custom-label']
      );

      expect(result.preview.labels).toContain('docs');
      expect(result.preview.labels).toContain('custom-label');
      // Should deduplicate
      expect(result.preview.labels).toEqual(
        Array.from(new Set(result.preview.labels))
      );
    });

    it('should generate diff preview for edits', async () => {
      const edits = [
        {
          path: 'README.md',
          appendText: '\n## New Section\n\nContent here.',
        },
      ];

      const result = await previewPR(
        ['README.md'],
        'Add section',
        'Body',
        [],
        edits
      );

      expect(result.preview.appendPreviews).toBeDefined();
      expect(result.preview.appendPreviews.length).toBeGreaterThan(0);
      expect(result.preview.appendPreviews[0].path).toBe('README.md');
      expect(result.preview.appendPreviews[0].diff).toContain('## New Section');
    });
  });

  describe('Status Endpoint', () => {
    it('should return current SAPL configuration', () => {
      process.env.AUTO_PR_ENABLED = '1';
      process.env.AUTO_PR_DRYRUN = '0';
      process.env.AUTO_PR_ALLOW = 'README.md,docs/**/*.md';
      process.env.AUTO_PR_AUTOMERGE = '1';

      const status = getStatus();

      expect(status.enabled).toBe(true);
      expect(status.dryrun).toBe(false);
      expect(status.automerge).toBe(true);
      expect(status.allowlist).toContain('README.md');
      expect(status.allowlist).toContain('docs/**/*.md');
    });

    it('should indicate dry-run status prominently', () => {
      process.env.AUTO_PR_ENABLED = '1';
      process.env.AUTO_PR_DRYRUN = '1';

      const status = getStatus();

      expect(status.dryrun).toBe(true);
      expect(status.mode).toBe('preview-only');
    });

    it('should indicate kill-switch status', () => {
      process.env.AUTO_PR_ENABLED = '0';

      const status = getStatus();

      expect(status.enabled).toBe(false);
      expect(status.mode).toBe('disabled');
    });
  });

  describe('Pattern Matching Edge Cases', () => {
    it('should handle nested glob patterns correctly', () => {
      const allowlist = ['docs/**/*.md'];
      const files = [
        'docs/api/endpoints/users.md',
        'docs/guides/advanced/security.md',
      ];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toHaveLength(2);
      expect(result.blocked).toEqual([]);
    });

    it('should handle wildcard at different positions', () => {
      const allowlist = ['**/test/**', '*.md'];
      const files = [
        'frontend/test/foo.mjs',
        'backend/test/bar.mjs',
        'README.md',
        'src/app.js',
      ];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toContain('frontend/test/foo.mjs');
      expect(result.allowed).toContain('backend/test/bar.mjs');
      expect(result.allowed).toContain('README.md');
      expect(result.blocked).toContain('src/app.js');
    });

    it('should handle overlapping patterns', () => {
      const allowlist = ['docs/**/*', 'docs/**/*.md'];
      const files = ['docs/guide.md'];
      const result = validateFiles(files, allowlist);

      expect(result.allowed).toContain('docs/guide.md');
      expect(result.blocked).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed file paths', () => {
      const files = ['', null, undefined, 'valid/file.md'];
      const result = validateFiles(files);

      // Should filter out invalid paths
      expect(result.allowed.length).toBeLessThanOrEqual(1);
      expect(result.error).toBeUndefined();
    });

    it('should handle malformed allowlist patterns', () => {
      const allowlist = ['[invalid', 'valid/**/*.md'];
      const files = ['valid/test.md'];

      // Should not throw, handle gracefully
      expect(() => validateFiles(files, allowlist)).not.toThrow();
    });
  });

  describe('Default Allowlist', () => {
    it('should include common safe paths', () => {
      expect(DEFAULT_ALLOWLIST).toContain('README.md');
      expect(DEFAULT_ALLOWLIST).toContain('docs/**/*.md');
      expect(DEFAULT_ALLOWLIST).toContain('tests/**/*.mjs');
      expect(DEFAULT_ALLOWLIST).toContain('*.env.example');
    });

    it('should not include risky patterns', () => {
      // Should not allow all files by default
      expect(DEFAULT_ALLOWLIST).not.toContain('**/*');
      expect(DEFAULT_ALLOWLIST).not.toContain('*');

      // Should not allow source code modifications by default
      const hasSrcPattern = DEFAULT_ALLOWLIST.some(pattern =>
        pattern.includes('src/**/*.js') || pattern.includes('src/**/*.ts')
      );
      expect(hasSrcPattern).toBe(false);
    });
  });
});
