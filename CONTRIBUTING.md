# Contributing to Forgekeeper

Thank you for your interest in contributing to Forgekeeper! 🎉

This guide will help you get started with development, understand our workflows, and make your first contribution.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Task Cards System](#task-cards-system)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Adding New Features](#adding-new-features)
- [Getting Help](#getting-help)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- ✅ Be respectful and considerate
- ✅ Welcome newcomers and help them learn
- ✅ Focus on what's best for the community
- ✅ Show empathy towards other contributors
- ❌ Don't use inappropriate language or imagery
- ❌ Don't engage in trolling, insulting, or derogatory comments

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Git** installed and configured
- **Python 3.11+** installed
- **Node.js 20+** and npm installed
- **Docker** and **Docker Compose** (for running the full stack)
- **Optional**: NVIDIA GPU with CUDA for accelerated inference

### Fork and Clone

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/forgekeeper.git
   cd forgekeeper
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/gatewaybuddy/forgekeeper.git
   ```

---

## Development Setup

### 1. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env to configure your setup
# Key settings:
#   FK_CORE_KIND=llama          # or vllm
#   FRONTEND_PORT=3000
#   AUTONOMOUS_ENABLED=1        # if testing autonomous agent
```

### 2. Python Setup

```bash
# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install development dependencies
pip install -e forgekeeper[dev]
```

### 3. Frontend Setup

```bash
cd forgekeeper/frontend
npm install
```

### 4. Start Development Stack

**Option A: Full stack with Docker**
```bash
python -m forgekeeper ensure-stack --build
```

**Option B: Frontend only (for UI development)**
```bash
cd forgekeeper/frontend
npm run dev
# Opens on http://localhost:5173
```

### 5. Verify Setup

Run the smoke tests to ensure everything works:

```bash
# Terminal 1: Start mock server
node forgekeeper/scripts/mock_openai_server.mjs

# Terminal 2: Run smoke test
FK_CORE_API_BASE=http://localhost:8001 python forgekeeper/scripts/test_harmony_basic.py
```

---

## Code Style Guidelines

### Python

We follow **PEP 8** with these conventions:

- **Indentation**: 4 spaces (no tabs)
- **Line length**: 100 characters (soft limit)
- **Naming**:
  - `snake_case` for functions and variables
  - `PascalCase` for classes
  - `UPPER_CASE` for constants
- **Type hints**: Use them for function signatures
- **Docstrings**: Google style for functions and classes

**Example:**
```python
def calculate_effort_score(alternatives: list[Alternative], weights: dict[str, float]) -> float:
    """Calculate weighted effort score for alternatives.

    Args:
        alternatives: List of alternative approaches
        weights: Weight configuration dict

    Returns:
        Weighted score between 0 and 1
    """
    total = sum(alt.effort * weights.get('effort', 0.4) for alt in alternatives)
    return total / len(alternatives) if alternatives else 0.0
```

**Linting:**
```bash
cd forgekeeper
ruff check .              # Fast linter
black --check .           # Format checker
mypy forgekeeper/         # Type checker
```

### TypeScript/JavaScript

We use **ESLint** with React and TypeScript configurations:

- **Indentation**: 2 spaces
- **Semicolons**: Yes
- **Quotes**: Single quotes (except for JSX attributes)
- **Naming**:
  - `camelCase` for variables and functions
  - `PascalCase` for components and classes
  - `UPPER_CASE` for constants
- **React**: Functional components with hooks

**Example:**
```typescript
interface TaskCardProps {
  task: TaskCard;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
}

export const TaskCardComponent: React.FC<TaskCardProps> = ({
  task,
  onApprove,
  onDismiss
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove(task.id);
  }, [task.id, onApprove]);

  return (
    <div className="task-card">
      {/* Component implementation */}
    </div>
  );
};
```

**Linting:**
```bash
cd forgekeeper/frontend
npm run lint              # ESLint
npm run typecheck         # TypeScript validation
npm run format            # Prettier (if configured)
```

---

## Task Cards System

Forgekeeper uses a **Task Cards** system (`tasks.md`) to track PRs and enforce scoping.

### What is a Task Card?

Each task card defines:
- **Goal**: What the task accomplishes
- **Scope**: Boundaries and constraints
- **Allowed Touches**: Which files can be modified
- **Done When**: Acceptance criteria
- **Test Level**: Required testing depth

### How It Works

1. **Find or create a task** in `tasks.md`
2. **Reference the task** in your PR description: `Task ID: T123`
3. **CI validates** that your changes only touch allowed files
4. **Local validation** available: `make pr-check TASK=T123`

### Example Task Card

```markdown
## T301: Add User Preference Inference

**Goal**: Automatically infer user coding style preferences from existing code

**Scope**: Preference learning system only, no UI changes

**Allowed Touches**:
- `frontend/core/agent/user-preferences.mjs` (new)
- `frontend/server.mjs` (add routes)
- `tests/autonomous/test_preference_inference.mjs` (new)
- `docs/PHASE5_USER_PREFERENCE_LEARNING.md` (new)

**Done When**:
- Preference inference from code works
- API endpoints functional
- Tests passing (>80% coverage)
- Documentation complete

**Test Level**: Unit + integration tests required
```

### Creating a New Task Card

If your contribution doesn't match an existing task:

1. Add a new task to `tasks.md` following the template
2. Use the next available Task ID (e.g., `T401`)
3. Be specific about **Allowed Touches** (helps reviewers and CI)
4. Get approval from a maintainer before starting large tasks

---

## Making Changes

### Branch Naming

Use descriptive branch names with type prefixes:

```bash
git checkout -b feature/add-user-preferences
git checkout -b fix/autonomous-error-recovery
git checkout -b docs/update-sapl-guide
git checkout -b chore/update-dependencies
```

### Commit Messages

We use **Conventional Commits** format:

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `chore:` - Maintenance tasks
- `test:` - Adding or fixing tests
- `refactor:` - Code restructuring without behavior change
- `perf:` - Performance improvement

**Examples:**
```bash
feat(autonomous): add multi-alternative planning to Phase 6

Implements alternative generator, effort estimator, and plan alignment
checker. Reduces failed iterations by 40-60%.

Task ID: T306
```

```bash
fix(tgt): correct continuation rate calculation threshold

The threshold comparison was inverted, causing false positives.
Now properly detects high continuation rates.

Fixes #123
Task ID: T205
```

```bash
docs(sapl): add user guide with workflow examples

Task ID: T401
```

### Keep Commits Focused

- ✅ **Good**: One logical change per commit
- ✅ **Good**: Small, reviewable commits
- ❌ **Bad**: Mixing unrelated changes
- ❌ **Bad**: Massive commits with many files

---

## Testing

### Running Tests Locally

**Before submitting a PR, ensure all tests pass:**

```bash
# Frontend tests
cd forgekeeper/frontend
npm run typecheck
npm run lint
npm run test
npm run build

# Python tests
cd forgekeeper
pytest -q tests/

# Task card validation
make task-sanity

# PR scope validation (replace T123 with your task ID)
make pr-check TASK=T123
```

### Writing Tests

#### Frontend (Vitest)

Place tests next to the code being tested:

```typescript
// frontend/core/agent/__tests__/alternative-generator.test.mjs
import { describe, it, expect } from 'vitest';
import { generateAlternatives } from '../alternative-generator.mjs';

describe('Alternative Generator', () => {
  it('should generate 3-5 alternatives', async () => {
    const alternatives = await generateAlternatives({
      goal: 'Clone repository',
      context: {},
      availableTools: ['git_clone', 'run_bash'],
    });

    expect(alternatives.length).toBeGreaterThanOrEqual(3);
    expect(alternatives.length).toBeLessThanOrEqual(5);
  });

  it('should include safe fallback alternative', async () => {
    const alternatives = await generateAlternatives({
      goal: 'Install package',
      context: {},
      availableTools: ['run_bash'],
    });

    const fallback = alternatives.find(alt => alt.isSafeFallback);
    expect(fallback).toBeDefined();
  });
});
```

#### Python (pytest)

Place tests in `tests/` directory:

```python
# tests/autonomous/test_effort_estimator.py
import pytest
from forgekeeper.core.agent.effort_estimator import estimate_effort

def test_estimate_effort_simple_task():
    """Simple tasks should have low complexity estimate."""
    result = estimate_effort(
        task="Echo hello world",
        available_tools=["echo"],
        history=[]
    )

    assert result.complexity == "low"
    assert result.estimated_iterations <= 3
    assert 0 <= result.risk <= 1

def test_estimate_effort_complex_task():
    """Complex tasks should have higher estimates."""
    result = estimate_effort(
        task="Implement authentication system",
        available_tools=["read_file", "write_file"],
        history=[]
    )

    assert result.complexity in ["medium", "high"]
    assert result.estimated_iterations >= 10
```

### Test Coverage

- **Minimum**: 70% coverage for new code
- **Target**: 80%+ coverage
- **Critical paths**: 90%+ coverage (autonomous agent, tools, error recovery)

---

## Submitting a Pull Request

### Pre-Submission Checklist

Before opening a PR, ensure:

- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Commit messages follow Conventional Commits
- [ ] Task ID referenced in PR description
- [ ] Changes only touch files allowed by task card
- [ ] Documentation updated (if applicable)
- [ ] No sensitive data or secrets committed

### Opening the PR

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template** with:
   - Clear description of changes
   - `Task ID: T###` reference
   - Testing performed
   - Screenshots (for UI changes)
   - Breaking changes (if any)

4. **Wait for CI checks** to pass

5. **Address review feedback** promptly

### PR Title Format

Use the same format as commit messages:

```
feat(autonomous): add multi-alternative planning
fix(tgt): correct threshold calculation
docs(sapl): add user workflow guide
```

### Review Process

- **Maintainers** will review within 2-3 days
- **CI must pass** before merge
- **At least 1 approval** required
- **Squash and merge** is preferred
- **Delete branch** after merge

---

## Adding New Features

### Adding a New Tool

1. **Create tool file**: `frontend/tools/your_tool.mjs`

```javascript
export const your_tool = {
  name: 'your_tool',
  description: 'Brief description of what the tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param1'],
  },

  async execute({ param1 }) {
    // Tool implementation
    try {
      const result = await performAction(param1);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};
```

2. **Export from index**: `frontend/tools/index.mjs`

```javascript
export { your_tool } from './your_tool.mjs';
```

3. **Add tests**: `frontend/tests/test-your-tool.mjs`

4. **Update documentation**: `docs/api/tools_api.md`

5. **Test via**: `GET /api/tools` (tool should appear in list)

### Adding an API Endpoint

1. **Add route** in `frontend/server.mjs`:

```javascript
app.get('/api/your-feature/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await yourFeatureLogic(id);

    // Log to ContextLog for telemetry
    await appendEvent({
      actor: 'system',
      act: 'your_feature_accessed',
      conv_id: req.headers['x-conversation-id'],
      feature_id: id,
    });

    res.json({ ok: true, result });
  } catch (error) {
    console.error('Error in /api/your-feature:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});
```

2. **Add TypeScript types** if needed

3. **Test endpoint**:
   ```bash
   curl http://localhost:3000/api/your-feature/123
   ```

4. **Document** in `docs/api/API_REFERENCE.md`

### Adding a UI Component

1. **Create component**: `frontend/src/components/YourComponent.tsx`

```typescript
import React from 'react';
import './YourComponent.css';

interface YourComponentProps {
  title: string;
  onAction: () => void;
}

export const YourComponent: React.FC<YourComponentProps> = ({
  title,
  onAction,
}) => {
  return (
    <div className="your-component">
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
};
```

2. **Add styles**: `frontend/src/components/YourComponent.css`

3. **Import and use** in parent component

4. **Test interactively** in the UI

---

## Getting Help

### Documentation

- **README.md** - Project overview and quick start
- **CLAUDE.md** - Comprehensive architecture guide (366 lines, for AI assistants)
- **docs/** - Detailed feature documentation
- **tasks.md** - Active task cards and PR tracking

### Communication

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and ideas
- **Pull Request comments** - Implementation questions

### Common Questions

**Q: Which branch should I base my work on?**
A: Always branch from `main`.

**Q: How do I update my fork with upstream changes?**
A:
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

**Q: My PR failed CI checks, what do I do?**
A: Check the CI logs, fix the issues, and push an update. Common issues:
- Linting errors: Run `npm run lint` or `ruff check .`
- Test failures: Run `npm run test` or `pytest`
- Task card violations: Ensure you only touch allowed files

**Q: How do I add a new task card?**
A: Edit `tasks.md`, follow the template, use next available Task ID. For large features, get maintainer approval first.

**Q: Can I work on multiple tasks simultaneously?**
A: Yes, but create separate branches and PRs for each task.

---

## Thank You!

Your contributions make Forgekeeper better for everyone. Whether it's code, documentation, bug reports, or ideas—we appreciate your help! 🙏

**Happy coding!** 🚀
