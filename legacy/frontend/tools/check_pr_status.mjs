/**
 * check_pr_status - Check GitHub PR status (CI, reviews, mergeable)
 *
 * Enables the autonomous agent to monitor pull request status including:
 * - CI check status (passed, failed, pending)
 * - Review decisions (approved, changes requested, pending)
 * - Mergeable status
 * - Ready to merge determination
 *
 * Part of the autonomous self-improvement loop (codex.plan Phase 1).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const def = {
  type: 'function',
  function: {
    name: 'check_pr_status',
    description: 'Check GitHub PR status including CI checks, review decisions, and mergeable state using gh CLI',
    parameters: {
      type: 'object',
      properties: {
        pr_number: {
          type: 'number',
          description: 'GitHub pull request number to check (e.g., 123)'
        }
      },
      required: ['pr_number'],
      additionalProperties: false
    },
    strict: true
  }
};

export async function run(args = {}) {
  const { pr_number } = args;

  // Validate pr_number
  if (!pr_number || typeof pr_number !== 'number' || pr_number <= 0) {
    return {
      error: 'pr_number is required and must be a positive number'
    };
  }

  const cwd = process.env.REPO_ROOT || process.cwd();

  try {
    // Use gh CLI to get PR status
    // Fields: state, title, statusCheckRollup, reviewDecision, mergeable
    const { stdout, stderr } = await execFileAsync(
      'gh',
      [
        'pr', 'view',
        pr_number.toString(),
        '--json', 'state,title,statusCheckRollup,reviewDecision,mergeable,author,createdAt,url'
      ],
      {
        cwd,
        timeout: 10000,
        maxBuffer: 1024 * 1024
      }
    );

    if (stderr) {
      console.warn('gh CLI stderr:', stderr);
    }

    // Parse JSON response
    const pr = JSON.parse(stdout);

    // Analyze status checks
    const checks = pr.statusCheckRollup || [];
    const failedChecks = checks.filter(c =>
      c.conclusion === 'FAILURE' ||
      c.conclusion === 'CANCELLED' ||
      c.conclusion === 'TIMED_OUT' ||
      c.conclusion === 'ACTION_REQUIRED'
    );
    const pendingChecks = checks.filter(c =>
      c.status === 'IN_PROGRESS' ||
      c.status === 'QUEUED' ||
      c.status === 'PENDING' ||
      c.status === 'WAITING'
    );
    const passedChecks = checks.filter(c =>
      c.conclusion === 'SUCCESS'
    );

    // Determine if PR is ready to merge
    const readyToMerge =
      pr.state === 'OPEN' &&
      pr.mergeable === 'MERGEABLE' &&
      pr.reviewDecision === 'APPROVED' &&
      failedChecks.length === 0 &&
      pendingChecks.length === 0;

    return {
      pr_number,
      state: pr.state,
      title: pr.title,
      author: pr.author?.login || 'unknown',
      created_at: pr.createdAt,
      url: pr.url,
      mergeable: pr.mergeable,
      review_decision: pr.reviewDecision || 'NONE',
      checks: {
        total: checks.length,
        passed: passedChecks.length,
        failed: failedChecks.length,
        pending: pendingChecks.length,
        failed_checks: failedChecks.map(c => ({
          name: c.name,
          conclusion: c.conclusion,
          detailsUrl: c.detailsUrl
        })),
        pending_checks: pendingChecks.map(c => ({
          name: c.name,
          status: c.status
        }))
      },
      ready_to_merge: readyToMerge,
      blocking_reasons: getBlockingReasons(pr, failedChecks, pendingChecks)
    };

  } catch (err) {
    // Handle specific error cases
    if (err.code === 'ENOENT') {
      return {
        error: 'gh CLI not found. Please install GitHub CLI: https://cli.github.com/',
        tool_missing: 'gh'
      };
    }

    if (err.message && err.message.includes('could not find pull request')) {
      return {
        error: `Pull request #${pr_number} not found in this repository`,
        not_found: true
      };
    }

    if (err.message && err.message.includes('authentication')) {
      return {
        error: 'GitHub authentication failed. Run: gh auth login',
        auth_required: true
      };
    }

    return {
      error: `Failed to check PR status: ${err.message}`,
      stderr: err.stderr
    };
  }
}

/**
 * Determine what's blocking the PR from being merged
 */
function getBlockingReasons(pr, failedChecks, pendingChecks) {
  const reasons = [];

  if (pr.state !== 'OPEN') {
    reasons.push(`PR is ${pr.state}, not OPEN`);
  }

  if (pr.mergeable !== 'MERGEABLE') {
    if (pr.mergeable === 'CONFLICTING') {
      reasons.push('PR has merge conflicts');
    } else {
      reasons.push(`PR mergeable status: ${pr.mergeable}`);
    }
  }

  if (!pr.reviewDecision || pr.reviewDecision === 'REVIEW_REQUIRED') {
    reasons.push('Review required');
  } else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    reasons.push('Changes requested in review');
  }

  if (failedChecks.length > 0) {
    reasons.push(`${failedChecks.length} CI check(s) failed`);
  }

  if (pendingChecks.length > 0) {
    reasons.push(`${pendingChecks.length} CI check(s) pending`);
  }

  return reasons;
}
