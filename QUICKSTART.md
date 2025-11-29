# Forgekeeper Quickstart Guide

**Get from zero to your first contribution in under 10 minutes.**

This is the fast track. For comprehensive details, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## ✅ Prerequisites Check

Before you start, ensure you have:

- [ ] **Git** - `git --version` (any recent version)
- [ ] **Python 3.11+** - `python3 --version` or `python --version`
- [ ] **Node.js 20+** - `node --version`
- [ ] **npm** - `npm --version`
- [ ] **Docker & Docker Compose** - `docker --version && docker compose version`

**Optional but recommended:**
- [ ] **GitHub CLI** - `gh --version` (for PR creation)
- [ ] **NVIDIA GPU with CUDA** (for fast local inference)

**Missing something?** See [CONTRIBUTING.md - Prerequisites](CONTRIBUTING.md#prerequisites) for installation links.

---

## 🚀 Quick Setup (5 Minutes)

### 1. Fork and Clone

```bash
# Fork the repo on GitHub (click "Fork" button)
# Then clone your fork:
git clone https://github.com/YOUR_USERNAME/forgekeeper.git
cd forgekeeper

# Add upstream remote
git remote add upstream https://github.com/gatewaybuddy/forgekeeper.git
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Install Python dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e forgekeeper[dev]

# Install frontend dependencies
cd forgekeeper/frontend
npm install
cd ../..
```

### 3. Start Development Environment

**Option A: Frontend Only (Fast - No GPU Required)**

Perfect for UI/docs work:

```bash
cd forgekeeper/frontend
npm run dev
```

Opens at `http://localhost:5173`. The UI will proxy to a mock backend.

**Option B: Full Stack (Requires Docker)**

For backend/tool development:

```bash
# Start inference + frontend
python -m forgekeeper ensure-stack --build

# Or use the wrapper script:
bash scripts/ensure_stack.sh  # Linux/macOS
# pwsh scripts/ensure_stack.ps1  # Windows
```

Access at `http://localhost:3000`

---

## ✏️ Your First Contribution (3 Minutes)

Let's make a simple but real contribution. Here are three beginner-friendly options:

### Option 1: Fix a Typo or Improve Docs

**Find and fix:**
1. Browse `docs/` for typos, unclear wording, or broken links
2. Or improve code comments in `frontend/src/components/`
3. Make your edit

**Example:**
```bash
# Edit a file
nano docs/README.md  # Or use your favorite editor

# Make a small improvement (fix typo, clarify wording, add example)
```

### Option 2: Add a Test Case

**Add a simple test:**

```bash
# Frontend test example
cd forgekeeper/frontend
# Create or edit a test file in src/components/__tests__/
nano src/components/__tests__/Chat.test.tsx
```

```typescript
// Add a simple test
it('should render chat input', () => {
  const { getByPlaceholderText } = render(<Chat />);
  expect(getByPlaceholderText('Type a message...')).toBeInTheDocument();
});
```

### Option 3: Improve Error Messages

**Make error messages more helpful:**

```bash
# Find a generic error message in the codebase
grep -r "Error:" frontend/src/ | head -5

# Pick one and make it more specific/helpful
# Example: "Error: Failed" → "Error: Failed to load chat history. Please refresh the page."
```

---

## 🧪 Test Your Changes

**Frontend tests:**
```bash
cd forgekeeper/frontend
npm run typecheck  # Check TypeScript
npm run lint       # Check code style
npm run test       # Run tests
npm run build      # Ensure it builds
```

**Python tests:**
```bash
cd forgekeeper
pytest tests/
```

**Manual testing:**
```bash
# Start dev server and check your change works
cd forgekeeper/frontend
npm run dev
# Open http://localhost:5173 and verify your change
```

---

## 📤 Submit Your Pull Request

### 1. Create a Branch

```bash
git checkout -b docs/fix-readme-typo
# Or: git checkout -b feat/add-chat-test
# Or: git checkout -b fix/improve-error-message
```

Branch naming: `type/short-description`
- `docs/` - Documentation changes
- `feat/` - New features
- `fix/` - Bug fixes
- `test/` - Test improvements
- `chore/` - Maintenance tasks

### 2. Commit Your Changes

```bash
git add .
git commit -m "docs: fix typo in README quickstart section"
# Or: git commit -m "test: add Chat component render test"
# Or: git commit -m "fix: improve error message clarity in chat loader"
```

Commit format: `type: brief description`

### 3. Push and Create PR

```bash
# Push to your fork
git push origin docs/fix-readme-typo

# Create PR using GitHub CLI (recommended)
gh pr create --title "docs: fix typo in README quickstart section" --body "
## Summary
Fixed typo in QUICKSTART.md section on environment setup.

## Changes
- Corrected 'enviroment' to 'environment'

## Test Plan
- [x] Proofread the changed section
- [x] Verified markdown renders correctly
"

# Or create PR manually on GitHub
# Go to: https://github.com/YOUR_USERNAME/forgekeeper
# Click "Compare & pull request"
```

**Important:** If your change relates to a task card in [tasks.md](tasks.md), include `Task ID: T###` in your PR description.

### 4. Wait for Review

- CI will run automatically (tests, linting, task card validation)
- A maintainer will review within 2-3 days
- Address any feedback promptly
- Once approved, your PR will be merged!

---

## 🎯 What's Next?

### Learn More

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Comprehensive contribution guide
  - Code style guidelines (PEP 8, ESLint)
  - Task Cards system (PR scoping)
  - Testing requirements
  - Adding tools, API endpoints, UI components

- **[CLAUDE.md](CLAUDE.md)** - Architecture deep dive
  - Three-layer architecture (Inference, Server, UI)
  - Tool orchestration
  - ContextLog event system
  - Autonomous agent (7 phases)

- **[README.md](README.md)** - Project overview and features

### Explore the Codebase

**Frontend (React + TypeScript):**
- `frontend/src/components/` - UI components
- `frontend/src/lib/` - Client libraries
- `frontend/server.mjs` - Express server
- `frontend/tools/` - Tool definitions

**Backend (Python):**
- `forgekeeper/core/` - Core orchestrator
- `forgekeeper/services/` - Context log, memory
- `forgekeeper/tools/` - Tool specs

**Docs:**
- `docs/api/` - API reference
- `docs/autonomous/` - Autonomous agent guides
- `docs/autonomous/tgt/` - TGT (Telemetry-Driven Task Generation)
- `docs/sapl/` - SAPL (Safe Auto-PR Loop)

### Find Good First Issues

```bash
# Look for issues labeled "good first issue" on GitHub
gh issue list --label "good first issue"

# Or browse tasks.md for small tasks
less tasks.md
```

### Join the Community

- **GitHub Issues** - Report bugs, request features
- **GitHub Discussions** - Ask questions, share ideas
- **Pull Requests** - Review others' code, learn from feedback

---

## 🆘 Common Issues

### "Docker daemon not running"

```bash
# Start Docker Desktop (Windows/macOS)
# Or start Docker service (Linux):
sudo systemctl start docker
```

### "npm install" fails

```bash
# Clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### "pytest: command not found"

```bash
# Ensure virtual environment is activated
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -e forgekeeper[dev]
```

### "Permission denied" on WSL/Windows

If you're on WSL and hit permission issues:
- Use Git Bash or PowerShell instead of WSL for git operations
- Or run: `git config core.fileMode false`

### More Help

- [CONTRIBUTING.md - Getting Help](CONTRIBUTING.md#getting-help)
- [docs/troubleshooting/](docs/troubleshooting/)
- [GitHub Issues](https://github.com/gatewaybuddy/forgekeeper/issues)

---

## 📋 Quick Reference

### Useful Commands

```bash
# Start frontend dev server
cd forgekeeper/frontend && npm run dev

# Run all tests
npm run test                    # Frontend
pytest tests/                   # Python

# Linting
npm run lint                    # Frontend
ruff check forgekeeper/         # Python

# Build
npm run build                   # Frontend

# Start full stack
python -m forgekeeper ensure-stack --build
```

### Project Structure

```
forgekeeper/
├── .env                    # Configuration (create from .env.example)
├── README.md               # Project overview
├── CONTRIBUTING.md         # Detailed contribution guide
├── QUICKSTART.md          # This file
├── CLAUDE.md              # Architecture guide
├── tasks.md               # Task cards for PR tracking
├── frontend/              # React UI + Express server
│   ├── src/              # React components
│   ├── tools/            # Tool definitions
│   └── server.mjs        # Main server
├── forgekeeper/           # Python package
│   ├── core/             # Orchestrator
│   ├── services/         # Context log, memory
│   └── tools/            # Tool specs
├── docs/                  # Documentation
└── tests/                 # Python tests
```

---

**Ready to contribute?** Pick one of the three contribution options above, make your change, and submit your first PR!

**Questions?** Open an issue or check [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

**Welcome to Forgekeeper!** 🎉
