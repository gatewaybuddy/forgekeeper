#!/usr/bin/env node
// PM2 Utilities for Forgekeeper
// Handles PM2 version checking and auto-updating

import { execSync, exec } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * Check if PM2 is installed and get version info
 * @returns {Object} { installed: boolean, inMemory: string|null, local: string|null, mismatch: boolean }
 */
export function getPM2Versions() {
  try {
    // Run pm2 list which shows version mismatch warnings
    const output = execSync('npx pm2 list 2>&1', {
      encoding: 'utf-8',
      timeout: 30000,
      windowsHide: true,
    });

    const result = {
      installed: true,
      inMemory: null,
      local: null,
      mismatch: false,
    };

    // Parse version info from output
    // Format: "In memory PM2 version: X.X.X" and "Local PM2 version: X.X.X"
    const inMemoryMatch = output.match(/In memory PM2 version:\s*([\d.]+)/);
    const localMatch = output.match(/Local PM2 version:\s*([\d.]+)/);

    if (inMemoryMatch) result.inMemory = inMemoryMatch[1];
    if (localMatch) result.local = localMatch[1];

    // Check for mismatch
    if (result.inMemory && result.local && result.inMemory !== result.local) {
      result.mismatch = true;
    }

    // Also check for the explicit warning
    if (output.includes('PM2 is out-of-date')) {
      result.mismatch = true;
    }

    return result;
  } catch (e) {
    return {
      installed: false,
      inMemory: null,
      local: null,
      mismatch: false,
      error: e.message,
    };
  }
}

/**
 * Update PM2 daemon to match local version
 * @returns {Object} { success: boolean, message: string }
 */
export async function updatePM2() {
  return new Promise((resolve) => {
    console.log(`${colors.cyan}[PM2]${colors.reset} Updating PM2 daemon...`);

    exec('npx pm2 update', {
      timeout: 60000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`${colors.red}[PM2]${colors.reset} Update failed:`, error.message);
        resolve({ success: false, message: error.message });
        return;
      }

      if (stdout.includes('PM2 updated') || stdout.includes('Restoring processes')) {
        console.log(`${colors.green}[PM2]${colors.reset} Update successful`);
        resolve({ success: true, message: 'PM2 updated successfully' });
      } else {
        console.log(`${colors.yellow}[PM2]${colors.reset} Update completed (check logs)`);
        resolve({ success: true, message: stdout });
      }
    });
  });
}

/**
 * Check and update PM2 if needed
 * @returns {Object} { checked: boolean, updated: boolean, versions: Object }
 */
export async function checkAndUpdatePM2() {
  const versions = getPM2Versions();

  if (!versions.installed) {
    console.log(`${colors.yellow}[PM2]${colors.reset} PM2 not installed or not accessible`);
    return { checked: true, updated: false, versions };
  }

  if (!versions.mismatch) {
    console.log(`${colors.green}[PM2]${colors.reset} Version OK (${versions.local || versions.inMemory || 'unknown'})`);
    return { checked: true, updated: false, versions };
  }

  console.log(`${colors.yellow}[PM2]${colors.reset} Version mismatch detected:`);
  console.log(`  In-memory: ${versions.inMemory}`);
  console.log(`  Local: ${versions.local}`);

  const updateResult = await updatePM2();

  return {
    checked: true,
    updated: updateResult.success,
    versions: updateResult.success ? getPM2Versions() : versions,
  };
}

/**
 * Check if running under PM2
 * @returns {boolean}
 */
export function isRunningUnderPM2() {
  return !!(process.env.PM2_HOME || process.env.pm_id);
}

/**
 * Get PM2 process status
 * @param {string} appName - Name of the PM2 app to check
 * @returns {Object|null} Process status or null if not found
 */
export function getPM2Status(appName = 'forgekeeper') {
  try {
    const output = execSync(`npx pm2 jlist 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    });

    const processes = JSON.parse(output);
    return processes.find(p => p.name === appName) || null;
  } catch {
    return null;
  }
}

// CLI mode - run checks directly
const scriptPath = process.argv[1] || '';
if (scriptPath.includes('pm2-utils')) {
  console.log(`\n${colors.cyan}PM2 Utilities${colors.reset}\n`);

  const result = await checkAndUpdatePM2();

  if (result.updated) {
    console.log(`\n${colors.green}PM2 was updated successfully${colors.reset}`);
  } else if (result.versions.mismatch) {
    console.log(`\n${colors.red}PM2 update failed - manual intervention may be required${colors.reset}`);
    console.log(`Try running: pm2 kill && pm2 resurrect`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}PM2 is up to date${colors.reset}`);
  }
}
