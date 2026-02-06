#!/usr/bin/env node
// Forgekeeper CLI - Simple command-line interface

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const COMMANDS = {
  start: {
    desc: 'Start Forgekeeper (with PM2)',
    run: () => pm2('start', 'ecosystem.config.cjs'),
  },
  stop: {
    desc: 'Stop Forgekeeper',
    run: () => pm2('stop', 'forgekeeper'),
  },
  restart: {
    desc: 'Restart Forgekeeper',
    run: () => pm2('restart', 'forgekeeper'),
  },
  logs: {
    desc: 'View live logs',
    run: () => pm2('logs', 'forgekeeper', '--lines', '50'),
  },
  status: {
    desc: 'Show status',
    run: () => pm2('status'),
  },
  dev: {
    desc: 'Start in development mode (no PM2)',
    run: () => runNode('index.js'),
  },
  setup: {
    desc: 'Run setup wizard',
    run: () => runNode('setup.js'),
  },
  health: {
    desc: 'Run health check',
    run: () => runNode('scripts/health-check.js'),
  },
  help: {
    desc: 'Show this help',
    run: showHelp,
  },
};

function showBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║               Forgekeeper v3.1                            ║
║           Minimal AI Agent with Claude Code               ║
╚═══════════════════════════════════════════════════════════╝
`);
}

function showHelp() {
  showBanner();
  console.log('Usage: forgekeeper <command>\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(12)} ${cmd.desc}`);
  }
  console.log('\nExamples:');
  console.log('  forgekeeper start     Start the agent');
  console.log('  forgekeeper logs      View live logs');
  console.log('  forgekeeper stop      Stop the agent');
  console.log('');
}

function pm2(...args) {
  return new Promise((resolve, reject) => {
    // Use shell: false to prevent command injection.
    // On Windows, resolve the full path to pm2 cmd script.
    const pm2Cmd = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
    const proc = spawn(pm2Cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });
    proc.on('close', resolve);
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('Error: PM2 is not installed.');
        console.error('Install it with: npm install -g pm2');
        process.exit(1);
      }
      reject(err);
    });
  });
}

function runNode(script) {
  return new Promise((resolve) => {
    const scriptPath = join(ROOT, script);
    if (!existsSync(scriptPath)) {
      console.error(`Error: Script not found: ${script}`);
      process.exit(1);
    }
    const proc = spawn('node', [scriptPath], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    proc.on('close', resolve);
  });
}

// Main
const command = process.argv[2] || 'help';

if (!COMMANDS[command]) {
  console.error(`Unknown command: ${command}\n`);
  showHelp();
  process.exit(1);
}

// Run the command
const result = COMMANDS[command].run();

// Handle async commands
if (result && typeof result.then === 'function') {
  result.then((code) => {
    if (command === 'start' && code === 0) {
      console.log('\n✅ Forgekeeper started! Use "forgekeeper logs" to view output.');
    }
  });
}
