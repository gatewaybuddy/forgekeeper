#!/usr/bin/env node
// Self-update script for Forgekeeper
// Pulls latest changes from git and triggers a graceful restart

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Configuration
const config = {
  remote: process.env.FK_UPDATE_REMOTE || 'origin',
  branch: process.env.FK_UPDATE_BRANCH || 'main',
  preUpdateScript: process.env.FK_PRE_UPDATE_SCRIPT || null,
  postUpdateScript: process.env.FK_POST_UPDATE_SCRIPT || null,
  restartDelayMs: parseInt(process.env.FK_RESTART_DELAY_MS || '2000'),
  dryRun: process.argv.includes('--dry-run'),
  force: process.argv.includes('--force'),
  skipRestart: process.argv.includes('--no-restart'),
};

async function main() {
  console.log('[Self-Update] Starting update check...');
  console.log(`[Self-Update] Remote: ${config.remote}/${config.branch}`);

  if (config.dryRun) {
    console.log('[Self-Update] DRY RUN - no changes will be made');
  }

  try {
    // Step 1: Check git status
    const status = await checkGitStatus();
    if (!status.clean && !config.force) {
      console.error('[Self-Update] Working directory has uncommitted changes.');
      console.error('[Self-Update] Commit or stash changes, or use --force to override.');
      process.exit(1);
    }

    // Step 2: Fetch latest
    console.log('[Self-Update] Fetching latest from remote...');
    if (!config.dryRun) {
      execSync(`git fetch ${config.remote}`, { cwd: ROOT, stdio: 'inherit' });
    }

    // Step 3: Check if we're behind
    const behind = await checkIfBehind();
    if (!behind.needsUpdate) {
      console.log('[Self-Update] Already up to date.');
      process.exit(0);
    }

    console.log(`[Self-Update] ${behind.commitsBehind} commit(s) behind. Changes:`);
    console.log(behind.changes);

    // Step 4: Run pre-update script if configured
    if (config.preUpdateScript) {
      console.log(`[Self-Update] Running pre-update script: ${config.preUpdateScript}`);
      if (!config.dryRun) {
        execSync(config.preUpdateScript, { cwd: ROOT, stdio: 'inherit' });
      }
    }

    // Step 5: Pull changes
    console.log('[Self-Update] Pulling changes...');
    if (!config.dryRun) {
      execSync(`git pull ${config.remote} ${config.branch}`, { cwd: ROOT, stdio: 'inherit' });
    }

    // Step 6: Check if package.json changed (need npm install)
    const packageChanged = await didFileChange('package.json');
    if (packageChanged) {
      console.log('[Self-Update] package.json changed, running npm install...');
      if (!config.dryRun) {
        execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
      }
    }

    // Step 7: Run post-update script if configured
    if (config.postUpdateScript) {
      console.log(`[Self-Update] Running post-update script: ${config.postUpdateScript}`);
      if (!config.dryRun) {
        execSync(config.postUpdateScript, { cwd: ROOT, stdio: 'inherit' });
      }
    }

    // Step 8: Log the update
    const updateLog = {
      timestamp: new Date().toISOString(),
      from: behind.localCommit,
      to: behind.remoteCommit,
      commits: behind.commitsBehind,
      packageChanged,
    };
    console.log('[Self-Update] Update complete:', updateLog);

    // Append to update history
    if (!config.dryRun) {
      appendUpdateLog(updateLog);
    }

    // Step 9: Trigger restart
    if (!config.skipRestart) {
      await triggerRestart();
    } else {
      console.log('[Self-Update] Restart skipped (--no-restart flag)');
    }

  } catch (error) {
    console.error('[Self-Update] Error:', error.message);
    process.exit(1);
  }
}

async function checkGitStatus() {
  try {
    const output = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    return { clean: output.trim() === '', output };
  } catch (e) {
    throw new Error(`Git status failed: ${e.message}`);
  }
}

async function checkIfBehind() {
  try {
    const localCommit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const remoteCommit = execSync(`git rev-parse ${config.remote}/${config.branch}`, { cwd: ROOT, encoding: 'utf8' }).trim();

    if (localCommit === remoteCommit) {
      return { needsUpdate: false, localCommit, remoteCommit };
    }

    // Count commits behind
    const countOutput = execSync(
      `git rev-list --count HEAD..${config.remote}/${config.branch}`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    const commitsBehind = parseInt(countOutput) || 0;

    // Get commit messages for what's coming
    const changes = execSync(
      `git log --oneline HEAD..${config.remote}/${config.branch}`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();

    return {
      needsUpdate: commitsBehind > 0,
      commitsBehind,
      localCommit,
      remoteCommit,
      changes,
    };
  } catch (e) {
    throw new Error(`Git comparison failed: ${e.message}`);
  }
}

async function didFileChange(filename) {
  try {
    const output = execSync(
      `git diff --name-only HEAD@{1} HEAD -- ${filename}`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    return output.includes(filename);
  } catch (e) {
    // If HEAD@{1} doesn't exist, assume it changed
    return true;
  }
}

function appendUpdateLog(entry) {
  const logFile = join(ROOT, 'data', 'update-history.jsonl');
  try {
    const line = JSON.stringify(entry) + '\n';
    writeFileSync(logFile, line, { flag: 'a' });
  } catch (e) {
    console.warn('[Self-Update] Could not write update log:', e.message);
  }
}

async function triggerRestart() {
  const isRunningUnderPM2 = !!process.env.PM2_HOME || !!process.env.pm_id;

  if (isRunningUnderPM2) {
    console.log(`[Self-Update] Scheduling PM2 restart in ${config.restartDelayMs}ms...`);
    if (!config.dryRun) {
      setTimeout(() => {
        // PM2 will auto-restart when we exit
        process.exit(0);
      }, config.restartDelayMs);
    }
  } else {
    // Try to restart via pm2 command
    console.log('[Self-Update] Not running under PM2. Attempting pm2 restart...');
    if (!config.dryRun) {
      try {
        spawn('pm2', ['restart', 'forgekeeper'], {
          detached: true,
          stdio: 'ignore',
          shell: true,
        }).unref();

        setTimeout(() => process.exit(0), config.restartDelayMs);
      } catch (e) {
        console.log('[Self-Update] PM2 restart failed. Manual restart required.');
        console.log('[Self-Update] Run: npm start');
      }
    }
  }
}

// Run if called directly
main();

export { main as selfUpdate, checkIfBehind, checkGitStatus };
