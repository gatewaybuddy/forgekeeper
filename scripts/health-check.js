#!/usr/bin/env node
// Forgekeeper v3 Health Check
// Verifies all components are working correctly

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function pass(msg) { console.log(`${colors.green}✓${colors.reset} ${msg}`); }
function warn(msg) { console.log(`${colors.yellow}⚠${colors.reset} ${msg}`); }
function fail(msg) { console.log(`${colors.red}✗${colors.reset} ${msg}`); }
function info(msg) { console.log(`${colors.cyan}→${colors.reset} ${msg}`); }

let passed = 0;
let warned = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      pass(name);
      passed++;
    } else if (result === 'warn') {
      warn(name);
      warned++;
    } else {
      fail(`${name}: ${result}`);
      failed++;
    }
  } catch (e) {
    fail(`${name}: ${e.message}`);
    failed++;
  }
}

async function asyncCheck(name, fn) {
  try {
    const result = await fn();
    if (result === true) {
      pass(name);
      passed++;
    } else if (result === 'warn') {
      warn(name);
      warned++;
    } else {
      fail(`${name}: ${result}`);
      failed++;
    }
  } catch (e) {
    fail(`${name}: ${e.message}`);
    failed++;
  }
}

console.log(`\n${colors.cyan}Forgekeeper v3 Health Check${colors.reset}\n`);

// 1. Check directories
console.log(`${colors.dim}─── Directories ───${colors.reset}`);

check('data/ exists', () => existsSync(join(ROOT, 'data')));
check('data/tasks/ exists', () => existsSync(join(ROOT, 'data', 'tasks')));
check('data/goals/ exists', () => existsSync(join(ROOT, 'data', 'goals')));
check('data/learnings/ exists', () => existsSync(join(ROOT, 'data', 'learnings')));
check('data/conversations/ exists', () => existsSync(join(ROOT, 'data', 'conversations')));

// 2. Check dependencies
console.log(`\n${colors.dim}─── Dependencies ───${colors.reset}`);

check('node_modules/ exists', () => {
  if (existsSync(join(ROOT, 'node_modules'))) return true;
  return 'Run: npm install';
});

check('express installed', () => {
  return existsSync(join(ROOT, 'node_modules', 'express'));
});

check('telegraf installed', () => {
  return existsSync(join(ROOT, 'node_modules', 'telegraf'));
});

check('ws installed', () => {
  return existsSync(join(ROOT, 'node_modules', 'ws'));
});

// 3. Check configuration
console.log(`\n${colors.dim}─── Configuration ───${colors.reset}`);

check('.env exists', () => {
  if (existsSync(join(ROOT, '.env'))) return true;
  return 'Run: npm run setup';
});

check('.env has TELEGRAM_BOT_TOKEN', () => {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return 'warn';
  const content = readFileSync(envPath, 'utf-8');
  const match = content.match(/TELEGRAM_BOT_TOKEN=(.+)/);
  if (!match || !match[1].trim()) return 'warn';
  return true;
});

// 4. Check PM2
console.log(`\n${colors.dim}─── PM2 ───${colors.reset}`);

await asyncCheck('PM2 installed', async () => {
  const { getPM2Versions } = await import('./pm2-utils.js');
  const versions = getPM2Versions();
  if (!versions.installed) return 'PM2 not found';
  return true;
});

await asyncCheck('PM2 version match', async () => {
  const { getPM2Versions, updatePM2 } = await import('./pm2-utils.js');
  const versions = getPM2Versions();
  if (!versions.installed) return 'warn';
  if (versions.mismatch) {
    info(`Mismatch detected (in-memory: ${versions.inMemory}, local: ${versions.local})`);
    info('Attempting auto-update...');
    const result = await updatePM2();
    if (result.success) {
      pass('PM2 auto-updated');
      return true;
    }
    return `Version mismatch - run: pm2 update`;
  }
  return true;
});

// 5. Check Claude CLI
console.log(`\n${colors.dim}─── Claude CLI ───${colors.reset}`);

check('Claude CLI available', () => {
  try {
    execSync('claude --version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return 'warn';
  }
});

// 6. Check modules load
console.log(`\n${colors.dim}─── Module Loading ───${colors.reset}`);

await asyncCheck('config.js loads', async () => {
  await import('../config.js');
  return true;
});

await asyncCheck('core/memory.js loads', async () => {
  await import('../core/memory.js');
  return true;
});

await asyncCheck('core/guardrails.js loads', async () => {
  await import('../core/guardrails.js');
  return true;
});

await asyncCheck('core/loop.js loads', async () => {
  await import('../core/loop.js');
  return true;
});

await asyncCheck('core/claude.js loads', async () => {
  await import('../core/claude.js');
  return true;
});

await asyncCheck('skills/registry.js loads', async () => {
  await import('../skills/registry.js');
  return true;
});

// 7. Test memory operations
console.log(`\n${colors.dim}─── Memory Operations ───${colors.reset}`);

await asyncCheck('Can create task', async () => {
  const { tasks } = await import('../core/memory.js');
  const task = tasks.create({
    description: 'Health check test task',
    origin: 'health-check',
  });
  if (!task.id) return 'No ID returned';
  // Clean up
  const fs = await import('fs');
  const path = join(ROOT, 'data', 'tasks', `${task.id}.json`);
  if (fs.existsSync(path)) fs.unlinkSync(path);
  return true;
});

await asyncCheck('Can create goal', async () => {
  const { goals } = await import('../core/memory.js');
  const goal = goals.create({
    description: 'Health check test goal',
    origin: 'health-check',
  });
  if (!goal.id) return 'No ID returned';
  // Clean up
  const fs = await import('fs');
  const path = join(ROOT, 'data', 'goals', `${goal.id}.json`);
  if (fs.existsSync(path)) fs.unlinkSync(path);
  return true;
});

// 8. Test guardrails
console.log(`\n${colors.dim}─── Guardrails ───${colors.reset}`);

await asyncCheck('Blocks rm -rf /', async () => {
  const { checkGuardrails } = await import('../core/guardrails.js');
  const result = checkGuardrails('rm -rf /');
  return !result.allowed;
});

await asyncCheck('Allows safe commands', async () => {
  const { checkGuardrails } = await import('../core/guardrails.js');
  const result = checkGuardrails('npm install express');
  return result.allowed;
});

// Summary
console.log(`\n${colors.dim}─── Summary ───${colors.reset}`);
console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
console.log(`${colors.yellow}Warnings: ${warned}${colors.reset}`);
console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

if (failed > 0) {
  console.log(`\n${colors.red}Some checks failed. Run 'npm run setup' to fix issues.${colors.reset}\n`);
  process.exit(1);
} else if (warned > 0) {
  console.log(`\n${colors.yellow}System is functional with some warnings.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.green}All checks passed! System is ready.${colors.reset}\n`);
  process.exit(0);
}
