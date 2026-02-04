/**
 * Safe Auto-PR Loop (SAPL)
 *
 * Provides safe, guarded auto-PR creation from TGT task suggestions.
 *
 * Features:
 * - Allowlist-based file filtering (docs, config, tests only)
 * - Dry-run preview mode (default)
 * - Full ContextLog audit trail
 * - Auto-merge only when CI passes (disabled by default)
 * - Kill-switch via environment variable
 *
 * Environment Variables:
 * - AUTO_PR_ENABLED=1          Enable SAPL (default: 0)
 * - AUTO_PR_ALLOW=...          Comma-separated file patterns (default: docs/**,README.md,*.example)
 * - AUTO_PR_DRYRUN=1           Dry-run mode (default: 1)
 * - AUTO_PR_AUTOMERGE=0        Auto-merge when CI passes (default: 0)
 * - AUTO_PR_LABELS=...         Comma-separated PR labels (default: 'auto-pr,safe,docs')
 *
 * @module server.auto-pr
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

const execAsync = promisify(exec);

// Default allowlist patterns (safe files only)
export const DEFAULT_ALLOWLIST = [
  'README.md',
  'docs/**/*.md',
  'forgekeeper/.env.example',
  'frontend/.env.example',
  '.env.example',
  'frontend/test/**/*.mjs',
  'frontend/tests/**/*.mjs',
  'tests/**/*.mjs',
  'frontend/**/*.test.mjs',
  'frontend/**/*.spec.mjs',
  'package.json',           // Allow package.json updates (version bumps, etc.)
  'frontend/package.json',
  'tsconfig.json',          // Allow TypeScript config
  'frontend/tsconfig.json',
];

/**
 * Check if SAPL is enabled
 */
export function isEnabled() {
  return String(process.env.AUTO_PR_ENABLED || '0') === '1';
}

/**
 * Check if in dry-run mode
 */
export function isDryRun() {
  return String(process.env.AUTO_PR_DRYRUN || '1') === '1';
}

/**
 * Get allowlist patterns
 */
export function getAllowlist() {
  const envList = process.env.AUTO_PR_ALLOW;
  if (envList) {
    return envList.split(',').map(p => p.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWLIST;
}

/**
 * Get PR labels
 */
export function getLabels() {
  const envLabels = process.env.AUTO_PR_LABELS;
  if (envLabels) {
    return envLabels.split(',').map(l => l.trim()).filter(Boolean);
  }
  return ['auto-pr', 'safe', 'documentation'];
}

/**
 * Get current SAPL status/configuration
 */
export function getStatus() {
  const enabled = isEnabled();
  const dryrun = isDryRun();
  const allowlist = getAllowlist();
  const automerge = String(process.env.AUTO_PR_AUTOMERGE || '0') === '1';

  return {
    enabled,
    dryrun,
    automerge,
    allowlist,
    mode: !enabled ? 'disabled' : (dryrun ? 'preview-only' : 'active'),
  };
}

/**
 * Check if file matches any allowlist pattern
 */
export function isFileAllowed(filePath, allowlist = getAllowlist()) {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of allowlist) {
    // Simple glob matching
    if (matchesPattern(normalized, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob pattern matcher
 */
function matchesPattern(filePath, pattern) {
  // Convert glob pattern to regex
  // ** matches any directory depth
  // * matches any characters except /
  const regexPattern = pattern
    .replace(/\./g, '\\.')           // Escape dots
    .replace(/\*\*/g, '§DOUBLESTAR§') // Placeholder for **
    .replace(/\*/g, '[^/]*')         // * matches non-slash
    .replace(/§DOUBLESTAR§/g, '.*')  // ** matches anything
    .replace(/\?/g, '.');            // ? matches single char

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Validate files against allowlist
 */
export function validateFiles(files, allowlist = getAllowlist()) {
  const allowed = [];
  const blocked = [];

  for (const file of files) {
    if (isFileAllowed(file, allowlist)) {
      allowed.push(file);
    } else {
      blocked.push(file);
    }
  }

  return { allowed, blocked };
}

/**
 * Get git status and changed files
 */
export async function getGitStatus() {
  try {
    // Check if we're in a git repository
    await execAsync('git rev-parse --git-dir');

    // Get status
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    const lines = statusOut.trim().split('\n').filter(Boolean);

    const files = lines.map(line => {
      // Format: XY filename
      // X = staged, Y = unstaged
      const status = line.substring(0, 2);
      const filename = line.substring(3);

      return {
        path: filename,
        staged: status[0] !== ' ' && status[0] !== '?',
        unstaged: status[1] !== ' ',
        untracked: status[0] === '?' && status[1] === '?',
      };
    });

    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Get diff for staged files
 */
export async function getDiff(files) {
  try {
    const diffs = {};

    for (const file of files) {
      try {
        // Get diff for this file
        const { stdout } = await execAsync(`git diff --cached -- "${file}"`);
        if (stdout) {
          diffs[file] = stdout;
        }
      } catch (error) {
        console.warn(`[SAPL] Failed to get diff for ${file}:`, error.message);
      }
    }

    return { ok: true, diffs };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Stage files for commit
 */
export async function stageFiles(files) {
  try {
    if (files.length === 0) {
      return { ok: true, staged: [] };
    }

    // Stage files one by one to handle errors gracefully
    const staged = [];
    const failed = [];

    for (const file of files) {
      try {
        await execAsync(`git add "${file}"`);
        staged.push(file);
      } catch (error) {
        console.warn(`[SAPL] Failed to stage ${file}:`, error.message);
        failed.push({ file, error: error.message });
      }
    }

    return { ok: true, staged, failed };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Create commit
 */
export async function createCommit(message) {
  try {
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Create branch
 */
export async function createBranch(branchName) {
  try {
    // Check if branch exists
    try {
      await execAsync(`git rev-parse --verify "${branchName}"`);
      // Branch exists - use it
      await execAsync(`git checkout "${branchName}"`);
      return { ok: true, existed: true };
    } catch {
      // Branch doesn't exist - create it
      await execAsync(`git checkout -b "${branchName}"`);
      return { ok: true, existed: false };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Push branch to remote
 */
export async function pushBranch(branchName) {
  try {
    await execAsync(`git push -u origin "${branchName}"`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Create PR using gh CLI
 */
export async function createPR(title, body, labels = []) {
  try {
    // Check if gh CLI is available
    try {
      await execAsync('gh --version');
    } catch {
      return { ok: false, error: 'gh CLI not installed' };
    }

    // Build gh pr create command
    let cmd = `gh pr create --title "${title.replace(/"/g, '\\"')}"`;

    if (body) {
      cmd += ` --body "${body.replace(/"/g, '\\"')}"`;
    }

    if (labels.length > 0) {
      cmd += ` --label "${labels.join(',')}"`;
    }

    const { stdout } = await execAsync(cmd);

    // Extract PR URL from output
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : null;

    return { ok: true, url: prUrl, output: stdout.trim() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Enable auto-merge for PR (requires gh CLI)
 */
export async function enableAutoMerge(prNumber) {
  try {
    await execAsync(`gh pr merge ${prNumber} --auto --squash`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Preview PR creation (dry-run)
 *
 * Returns what would happen without actually creating the PR
 */
export async function previewPR(files, title, body) {
  const previewId = ulid();

  console.log(`[SAPL] ${previewId}: Generating preview`);

  // Validate files against allowlist
  const { allowed, blocked } = validateFiles(files);

  // Get current branch
  let currentBranch = 'main';
  try {
    const { stdout } = await execAsync('git branch --show-current');
    currentBranch = stdout.trim();
  } catch (error) {
    console.warn('[SAPL] Failed to get current branch:', error.message);
  }

  // Generate suggested branch name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
  const branchName = `auto-pr/${sanitizedTitle}-${timestamp}`;

  // Get diffs for allowed files
  const diffsResult = await getDiff(allowed);
  const diffs = diffsResult.ok ? diffsResult.diffs : {};

  // Calculate stats
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const diff of Object.values(diffs)) {
    const lines = diff.split('\n');
    totalAdded += lines.filter(l => l.startsWith('+')).length;
    totalRemoved += lines.filter(l => l.startsWith('-')).length;
  }

  const preview = {
    previewId,
    dryRun: true,
    enabled: isEnabled(),
    currentBranch,
    proposedBranch: branchName,
    title,
    body: body || '(No description provided)',
    labels: getLabels(),
    files: {
      total: files.length,
      allowed: allowed.length,
      blocked: blocked.length,
      allowedFiles: allowed,
      blockedFiles: blocked,
    },
    diffs: diffs,
    stats: {
      filesChanged: Object.keys(diffs).length,
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
    },
    allowlist: getAllowlist(),
    autoMerge: String(process.env.AUTO_PR_AUTOMERGE || '0') === '1',
    warnings: [],
  };

  // Add warnings
  if (blocked.length > 0) {
    preview.warnings.push({
      type: 'blocked_files',
      message: `${blocked.length} file(s) blocked by allowlist`,
      files: blocked,
    });
  }

  if (allowed.length === 0) {
    preview.warnings.push({
      type: 'no_files',
      message: 'No files to commit after allowlist filtering',
    });
  }

  if (!isEnabled()) {
    preview.warnings.push({
      type: 'disabled',
      message: 'SAPL is disabled (AUTO_PR_ENABLED=0)',
    });
  }

  console.log(`[SAPL] ${previewId}: Preview generated - ${allowed.length} allowed, ${blocked.length} blocked`);

  return { ok: true, preview };
}

/**
 * Create PR (actual execution)
 */
export async function executePR(files, title, body, context = {}) {
  const executionId = ulid();
  const timestamp = new Date().toISOString();

  console.log(`[SAPL] ${executionId}: Starting PR creation`);

  // Check if enabled
  if (!isEnabled()) {
    return {
      ok: false,
      error: 'SAPL is disabled (AUTO_PR_ENABLED=0)',
      executionId,
    };
  }

  // Check if dry-run
  if (isDryRun()) {
    console.log(`[SAPL] ${executionId}: Dry-run mode - returning preview`);
    return await previewPR(files, title, body);
  }

  // Validate files
  const { allowed, blocked } = validateFiles(files);

  if (allowed.length === 0) {
    return {
      ok: false,
      error: 'No files to commit after allowlist filtering',
      blocked,
      executionId,
    };
  }

  // Generate branch name
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);
  const branchName = `auto-pr/${sanitizedTitle}-${timestamp.replace(/[:.]/g, '-').substring(0, 19)}`;

  // Execution steps
  const steps = [];
  const auditEvent = {
    id: executionId,
    ts: timestamp,
    actor: 'system',
    act: 'auto_pr',
    conv_id: context.convId || null,
    files_total: files.length,
    files_allowed: allowed.length,
    files_blocked: blocked.length,
    branch: branchName,
    title,
    dry_run: false,
  };

  try {
    // Step 1: Create branch
    console.log(`[SAPL] ${executionId}: Creating branch "${branchName}"`);
    const branchResult = await createBranch(branchName);
    if (!branchResult.ok) {
      throw new Error(`Failed to create branch: ${branchResult.error}`);
    }
    steps.push({ step: 'create_branch', ok: true, branch: branchName });

    // Step 2: Stage allowed files
    console.log(`[SAPL] ${executionId}: Staging ${allowed.length} files`);
    const stageResult = await stageFiles(allowed);
    if (!stageResult.ok) {
      throw new Error(`Failed to stage files: ${stageResult.error}`);
    }
    steps.push({ step: 'stage_files', ok: true, staged: stageResult.staged.length });

    // Step 3: Create commit
    const commitMessage = `${title}\n\n${body || ''}\n\n🤖 Generated with SAPL (Safe Auto-PR Loop)`;
    console.log(`[SAPL] ${executionId}: Creating commit`);
    const commitResult = await createCommit(commitMessage);
    if (!commitResult.ok) {
      throw new Error(`Failed to create commit: ${commitResult.error}`);
    }
    steps.push({ step: 'create_commit', ok: true });

    // Step 4: Push branch
    console.log(`[SAPL] ${executionId}: Pushing to origin/${branchName}`);
    const pushResult = await pushBranch(branchName);
    if (!pushResult.ok) {
      throw new Error(`Failed to push branch: ${pushResult.error}`);
    }
    steps.push({ step: 'push_branch', ok: true });

    // Step 5: Create PR
    console.log(`[SAPL] ${executionId}: Creating PR`);
    const prResult = await createPR(title, body, getLabels());
    if (!prResult.ok) {
      throw new Error(`Failed to create PR: ${prResult.error}`);
    }
    steps.push({ step: 'create_pr', ok: true, url: prResult.url });

    auditEvent.pr_url = prResult.url;
    auditEvent.status = 'success';

    // Step 6: Enable auto-merge (if configured)
    if (String(process.env.AUTO_PR_AUTOMERGE || '0') === '1' && prResult.url) {
      const prNumber = prResult.url.split('/').pop();
      console.log(`[SAPL] ${executionId}: Enabling auto-merge for PR #${prNumber}`);
      const mergeResult = await enableAutoMerge(prNumber);
      if (mergeResult.ok) {
        steps.push({ step: 'enable_automerge', ok: true });
        auditEvent.auto_merge = true;
      } else {
        console.warn(`[SAPL] ${executionId}: Failed to enable auto-merge:`, mergeResult.error);
        steps.push({ step: 'enable_automerge', ok: false, error: mergeResult.error });
      }
    }

    console.log(`[SAPL] ${executionId}: PR created successfully - ${prResult.url}`);

    // Emit audit event (if ContextLog available)
    try {
      const contextLog = await import('./server.contextlog.mjs');
      if (contextLog && contextLog.appendEvent) {
        await contextLog.appendEvent(auditEvent);
      }
    } catch (error) {
      console.warn('[SAPL] Failed to emit audit event:', error.message);
    }

    return {
      ok: true,
      executionId,
      branch: branchName,
      prUrl: prResult.url,
      steps,
      files: {
        allowed,
        blocked,
      },
    };
  } catch (error) {
    console.error(`[SAPL] ${executionId}: Execution failed:`, error.message);

    auditEvent.status = 'failed';
    auditEvent.error = error.message;

    // Emit failure audit event
    try {
      const contextLog = await import('./server.contextlog.mjs');
      if (contextLog && contextLog.appendEvent) {
        await contextLog.appendEvent(auditEvent);
      }
    } catch (err) {
      console.warn('[SAPL] Failed to emit audit event:', err.message);
    }

    return {
      ok: false,
      error: error.message,
      executionId,
      steps,
      files: {
        allowed,
        blocked,
      },
    };
  }
}

export default {
  isEnabled,
  isDryRun,
  getAllowlist,
  getLabels,
  isFileAllowed,
  validateFiles,
  previewPR,
  executePR,
  getGitStatus,
};
