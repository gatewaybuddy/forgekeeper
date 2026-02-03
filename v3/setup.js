#!/usr/bin/env node
// Forgekeeper v3 Setup & Configuration Wizard
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { spawn, execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = '') {
  console.log(`${color}${msg}${colors.reset}`);
}

function success(msg) { log(`✓ ${msg}`, colors.green); }
function warn(msg) { log(`⚠ ${msg}`, colors.yellow); }
function error(msg) { log(`✗ ${msg}`, colors.red); }
function info(msg) { log(`→ ${msg}`, colors.cyan); }
function header(msg) { log(`\n${msg}`, colors.bright + colors.blue); }

// Readline interface for prompts
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question, defaultValue = '') {
  const defaultHint = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${defaultHint}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function confirm(question, defaultYes = true) {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  return new Promise((resolve) => {
    rl.question(`${question} ${hint}: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultYes);
      else resolve(a === 'y' || a === 'yes');
    });
  });
}

// Check prerequisites
async function checkPrerequisites() {
  header('Checking Prerequisites...');
  let allGood = true;

  // Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major >= 20) {
    success(`Node.js ${nodeVersion} (requires >= 20)`);
  } else {
    error(`Node.js ${nodeVersion} - requires >= 20`);
    allGood = false;
  }

  // Claude CLI
  try {
    const claudeResult = execSync('claude --version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    success(`Claude CLI installed: ${claudeResult.trim().split('\n')[0]}`);
  } catch (e) {
    warn('Claude CLI not found - install from https://claude.ai/code');
    info('Forgekeeper will work but cannot execute tasks without Claude CLI');
  }

  // npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    success(`npm ${npmVersion}`);
  } catch (e) {
    error('npm not found');
    allGood = false;
  }

  return allGood;
}

// Create data directories
function createDirectories() {
  header('Creating Data Directories...');

  const dirs = [
    'data',
    'data/conversations',
    'data/tasks',
    'data/goals',
    'data/learnings',
  ];

  for (const dir of dirs) {
    const fullPath = join(__dirname, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      success(`Created ${dir}/`);
    } else {
      info(`${dir}/ already exists`);
    }
  }
}

// Install npm dependencies
async function installDependencies() {
  header('Installing Dependencies...');

  const nodeModules = join(__dirname, 'node_modules');
  if (existsSync(nodeModules)) {
    const reinstall = await confirm('node_modules exists. Reinstall?', false);
    if (!reinstall) {
      info('Skipping npm install');
      return;
    }
  }

  return new Promise((resolve, reject) => {
    info('Running npm install...');
    const proc = spawn('npm', ['install'], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        success('Dependencies installed');
        resolve();
      } else {
        error('npm install failed');
        reject(new Error('npm install failed'));
      }
    });
  });
}

// Configure environment
async function configureEnvironment() {
  header('Configuring Environment...');

  const envPath = join(__dirname, '.env');
  const envExamplePath = join(__dirname, '.env.example');

  // Load existing config or start fresh
  let config = {};
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf-8');
    for (const line of existing.split('\n')) {
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, ...vals] = line.split('=');
        config[key.trim()] = vals.join('=').trim();
      }
    }
    info('Loaded existing .env configuration');
  } else if (existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
    info('Created .env from .env.example');
  }

  console.log('');
  log('Configure your Forgekeeper instance:', colors.bright);
  console.log('(Press Enter to keep default/existing values)\n');

  // Telegram configuration
  log('─── Telegram Bot ───', colors.dim);

  const telegramToken = await prompt(
    'Telegram Bot Token (from @BotFather)',
    config.TELEGRAM_BOT_TOKEN || ''
  );

  const telegramAllowed = await prompt(
    'Allowed Telegram User IDs (comma-separated, empty=all)',
    config.TELEGRAM_ALLOWED_USERS || ''
  );

  const telegramAdmin = await prompt(
    'Admin Telegram User IDs (can approve tasks)',
    config.TELEGRAM_ADMIN_USERS || ''
  );

  // Loop configuration
  console.log('');
  log('─── Task Loop ───', colors.dim);

  const loopInterval = await prompt(
    'Loop interval (ms)',
    config.FK_LOOP_INTERVAL_MS || '10000'
  );

  const maxCalls = await prompt(
    'Max Claude calls per hour',
    config.FK_MAX_CALLS_PER_HOUR || '100'
  );

  // Dashboard configuration
  console.log('');
  log('─── Dashboard ───', colors.dim);

  const dashboardEnabled = await confirm(
    'Enable web dashboard?',
    config.FK_DASHBOARD_ENABLED !== '0'
  );

  const dashboardPort = dashboardEnabled
    ? await prompt('Dashboard port', config.FK_DASHBOARD_PORT || '3000')
    : '3000';

  // Build the .env file
  const envContent = `# Forgekeeper v3 Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# ============================================
# TELEGRAM
# ============================================
TELEGRAM_BOT_TOKEN=${telegramToken}
TELEGRAM_ALLOWED_USERS=${telegramAllowed}
TELEGRAM_ADMIN_USERS=${telegramAdmin}

# ============================================
# CORE LOOP
# ============================================
FK_LOOP_INTERVAL_MS=${loopInterval}
FK_MAX_CONCURRENT=1

# ============================================
# CLAUDE CODE
# ============================================
FK_CLAUDE_CMD=claude
FK_CLAUDE_TIMEOUT_MS=300000
FK_MAX_TOKENS_PER_TASK=50000

# ============================================
# STORAGE
# ============================================
FK_DATA_DIR=./data
FK_SKILLS_DIR=./skills
FK_MCP_DIR=./mcp-servers

# ============================================
# GUARDRAILS
# ============================================
FK_MAX_CALLS_PER_HOUR=${maxCalls}
FK_ALLOWED_PATHS=
FK_DENIED_PATHS=~/.ssh,~/.aws,/etc/passwd,/etc/shadow
FK_DENIED_COMMANDS=sudo rm -rf /,chmod 777

# ============================================
# TRIGGERS
# ============================================
FK_TRIGGERS_ENABLED=1
FK_STALE_GOAL_DAYS=3
FK_BLOCKED_TASK_HOURS=24

# ============================================
# LEARNING
# ============================================
FK_LEARNING_ENABLED=1
FK_LEARNING_MIN_CONFIDENCE=0.6

# ============================================
# WEB DASHBOARD
# ============================================
FK_DASHBOARD_ENABLED=${dashboardEnabled ? '1' : '0'}
FK_DASHBOARD_PORT=${dashboardPort}
`;

  writeFileSync(envPath, envContent);
  success('Configuration saved to .env');

  return {
    telegramToken,
    dashboardEnabled,
    dashboardPort,
  };
}

// Test the installation
async function runTests(config) {
  header('Testing Installation...');

  // Test 1: Import modules
  info('Testing module imports...');
  try {
    await import('./config.js');
    await import('./core/memory.js');
    await import('./core/guardrails.js');
    success('All core modules loaded');
  } catch (e) {
    error(`Module import failed: ${e.message}`);
    return false;
  }

  // Test 2: Create a test task
  info('Testing task creation...');
  try {
    const { tasks } = await import('./core/memory.js');
    const testTask = tasks.create({
      description: 'Test task from setup wizard',
      origin: 'setup',
      tags: ['test'],
    });
    success(`Task created: ${testTask.id}`);

    // Clean up
    const fs = await import('fs');
    const taskPath = join(__dirname, 'data', 'tasks', `${testTask.id}.json`);
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }
  } catch (e) {
    error(`Task creation failed: ${e.message}`);
    return false;
  }

  // Test 3: Check Claude CLI
  info('Testing Claude CLI...');
  try {
    const result = execSync('claude --version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    success('Claude CLI responds');
  } catch (e) {
    warn('Claude CLI not available - tasks will not execute');
  }

  // Test 4: Check Telegram token format
  if (config.telegramToken) {
    if (/^\d+:[A-Za-z0-9_-]{35,}$/.test(config.telegramToken)) {
      success('Telegram token format looks valid');
    } else {
      warn('Telegram token format may be invalid');
    }
  }

  return true;
}

// Print final instructions
function printInstructions(config) {
  header('Setup Complete!');

  console.log(`
${colors.bright}Getting Started:${colors.reset}

  ${colors.cyan}1. Start the main loop:${colors.reset}
     npm start

  ${colors.cyan}2. Start Telegram bot (separate terminal):${colors.reset}
     npm run telegram
`);

  if (config.dashboardEnabled) {
    console.log(`  ${colors.cyan}3. Access dashboard:${colors.reset}
     http://localhost:${config.dashboardPort}
`);
  }

  console.log(`${colors.bright}CLI Commands:${colors.reset}

  node index.js task "Fix the login bug"    # Create a task
  node index.js goal "Build user settings"  # Create a goal
  node index.js status                      # Check status
  node index.js help                        # Show help

${colors.bright}Telegram Commands:${colors.reset}

  /task <description>   Create a new task
  /goal <description>   Create a new goal
  /status               Show status
  /approve <id>         Approve pending request
  /reject <id>          Reject pending request

${colors.bright}Next Steps:${colors.reset}

  1. Get your Telegram user ID by messaging @userinfobot
  2. Add your user ID to TELEGRAM_ALLOWED_USERS in .env
  3. Start sending tasks via Telegram!

${colors.dim}For more info, see README.md${colors.reset}
`);
}

// Main setup flow
async function main() {
  console.log(`
${colors.bright}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           Forgekeeper v3 Setup Wizard                     ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  try {
    // Step 1: Check prerequisites
    const prereqsOk = await checkPrerequisites();
    if (!prereqsOk) {
      error('\nPlease fix prerequisites before continuing.');
      process.exit(1);
    }

    // Step 2: Create directories
    createDirectories();

    // Step 3: Install dependencies
    await installDependencies();

    // Step 4: Configure environment
    const config = await configureEnvironment();

    // Step 5: Run tests
    const testsOk = await runTests(config);

    // Step 6: Print instructions
    printInstructions(config);

    rl.close();
    process.exit(0);

  } catch (e) {
    error(`\nSetup failed: ${e.message}`);
    rl.close();
    process.exit(1);
  }
}

// Handle direct execution or import
const args = process.argv.slice(2);

if (args.includes('--check')) {
  // Quick check mode
  checkPrerequisites().then((ok) => process.exit(ok ? 0 : 1));
} else if (args.includes('--dirs')) {
  // Create directories only
  createDirectories();
} else if (args.includes('--help')) {
  console.log(`
Forgekeeper v3 Setup

Usage:
  node setup.js          Run full setup wizard
  node setup.js --check  Check prerequisites only
  node setup.js --dirs   Create data directories only
  node setup.js --help   Show this help
`);
} else {
  main();
}
