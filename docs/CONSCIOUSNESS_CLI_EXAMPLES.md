# Consciousness CLI Usage Examples

Complete guide to using the Forgekeeper consciousness CLI for terminal-based interaction with the autonomous consciousness system.

---

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Basic Commands](#basic-commands)
- [Monitoring & Status](#monitoring--status)
- [Interactive Conversations](#interactive-conversations)
- [Goal Management](#goal-management)
- [Dream Cycles](#dream-cycles)
- [Health & Troubleshooting](#health--troubleshooting)
- [Advanced Workflows](#advanced-workflows)
- [Tips & Best Practices](#tips--best-practices)

---

## Installation & Setup

### Prerequisites

```bash
# 1. Ensure consciousness system is enabled
echo "CONSCIOUSNESS_ENABLED=1" >> .env
echo "CONSCIOUSNESS_AUTO_START=1" >> .env

# 2. Start the server
cd frontend
npm run serve

# 3. Verify CLI is available
python -m forgekeeper consciousness --help
# Or using alias:
python -m forgekeeper c --help
```

### Environment Configuration

The CLI communicates with the consciousness system via the frontend server:

```bash
# Default configuration (localhost:3000)
# No additional setup needed

# Custom host/port
export FRONTEND_PORT=3000
export CONSCIOUSNESS_HOST=localhost
```

---

## Basic Commands

### Status Command

**Show current consciousness status:**

```bash
# Full command
python -m forgekeeper consciousness status

# Using alias
python -m forgekeeper c status
```

**Example Output:**
```
State: thinking
Current Cycle: 42
Cycle Interval: 30000ms
API Tokens Remaining: 950,000

Metrics:
  Success Rate: 95.2%
  Avg Cycle Duration: 2450ms
  Uptime: 126.4s

Short-Term Memory (3 items):
  1. Analyzed recent code changes for potential improvements...
  2. Identified pattern in error logs suggesting memory leak...
  3. Formulated hypothesis about performance bottleneck in da...
```

### Health Command

**Check for problems and system health:**

```bash
python -m forgekeeper c health
```

**Example Output (Healthy):**
```
Status: running
State: thinking
Success Rate: 95.2%

✅ No problems detected
```

**Example Output (Problems Detected):**
```
Status: running
State: thinking
Success Rate: 45.8%

⚠️  2 Problem(s) Detected:
  🔴 [CRITICAL] Success rate below 50%: 45.8%
  🟡 [WARNING] Low API budget: 8% remaining
```

### Start/Stop Commands

**Start consciousness:**

```bash
python -m forgekeeper c start
```

**Example Output:**
```
✅ Consciousness started successfully
```

**Stop consciousness:**

```bash
# Basic stop
python -m forgekeeper c stop

# Stop with reason
python -m forgekeeper c stop -r "Maintenance window"
python -m forgekeeper c stop --reason "Deploying updates"
```

**Example Output:**
```
✅ Consciousness stopped: Maintenance window
```

---

## Monitoring & Status

### Watch Command (Real-Time)

**Monitor consciousness in real-time:**

```bash
python -m forgekeeper c watch
```

**Example Output:**
```
Watching consciousness (Ctrl+C to stop)...

[Cycle 42] State: thinking | Success: 95.2% | Tokens: 950,000
[Cycle 43] State: thinking | Success: 95.5% | Tokens: 948,500
[Cycle 44] State: thinking | Success: 95.8% | Tokens: 947,000
^C

Stopped watching
```

**Use Case:** Leave this running in a terminal to monitor consciousness during development or testing.

### Periodic Status Checks

**Check status every 30 seconds:**

```bash
# Linux/macOS
watch -n 30 "python -m forgekeeper c status"

# Windows PowerShell
while ($true) { python -m forgekeeper c status; Start-Sleep 30; Clear-Host }
```

---

## Interactive Conversations

### Ask Command

**Ask consciousness questions:**

```bash
# Basic question
python -m forgekeeper c ask "What are you thinking about?"

# Multiple word question (automatic joining)
python -m forgekeeper c ask What recent insights have you discovered?
```

**Example Output:**
```
Consciousness (Cycle 42):

Recent thoughts:
  • Analyzed code review patterns, identified recurring feedback themes
  • Detected correlation between test coverage and bug reports
  • Formulated hypothesis about optimal commit frequency
  • Noticed unused dependencies in package.json
  • Considering refactoring opportunity in authentication module

Current state: thinking
```

### Conversation Workflows

**1. Check status before asking:**
```bash
python -m forgekeeper c status
python -m forgekeeper c ask "What patterns have you noticed?"
```

**2. Multi-turn conversation:**
```bash
# First question
python -m forgekeeper c ask "What code improvements have you identified?"

# Follow-up based on response
python -m forgekeeper c ask "Tell me more about the authentication module"

# Check memory to see if context is retained
python -m forgekeeper c status  # Check STM for conversation context
```

**3. Debugging workflow:**
```bash
# Check health
python -m forgekeeper c health

# Ask about specific issue
python -m forgekeeper c ask "Have you noticed any error patterns?"

# Review thoughts
python -m forgekeeper c status  # Check STM for insights
```

---

## Goal Management

### List Goals

**Show all active goals:**

```bash
python -m forgekeeper c goal list
```

**Example Output:**
```
Active Goals (3):

  [goal-001] Improve test coverage
    Type: improvement
    Priority: high
    Progress: 45%

  [goal-002] Investigate memory leak
    Type: investigation
    Priority: medium
    Progress: 30%

  [goal-003] Learn GraphQL best practices
    Type: learning
    Priority: low
    Progress: 15%
```

### Add Goals

**Create new goals:**

```bash
# Basic goal (defaults to improvement/medium)
python -m forgekeeper c goal add "Improve performance"

# With type
python -m forgekeeper c goal add "Investigate database queries" -t investigation

# With priority
python -m forgekeeper c goal add "Refactor authentication" -p high

# With type and priority
python -m forgekeeper c goal add "Learn TypeScript patterns" -t learning -p low

# With description
python -m forgekeeper c goal add "Optimize API endpoints" -t improvement -p high -d "Focus on response times and payload sizes"
```

**Example Output:**
```
✅ Goal created: Improve performance
   ID: goal-004
   Type: IMPROVEMENT
   Priority: MEDIUM
```

### Goal Management Workflows

**1. Sprint planning:**
```bash
# Add sprint goals
python -m forgekeeper c goal add "Implement feature X" -t improvement -p high
python -m forgekeeper c goal add "Fix bug Y" -t improvement -p high
python -m forgekeeper c goal add "Research framework Z" -t learning -p medium

# Review all goals
python -m forgekeeper c goal list
```

**2. Investigation workflow:**
```bash
# Create investigation goal
python -m forgekeeper c goal add "Investigate performance issue" -t investigation -p high

# Let consciousness work on it
python -m forgekeeper c watch  # Monitor progress

# Check for insights
python -m forgekeeper c ask "What have you learned about the performance issue?"
```

**3. Learning session:**
```bash
# Set learning goals
python -m forgekeeper c goal add "Learn Docker best practices" -t learning -p medium
python -m forgekeeper c goal add "Understand GraphQL subscriptions" -t learning -p medium

# Check progress later
python -m forgekeeper c goal list
python -m forgekeeper c ask "What have you learned about Docker?"
```

---

## Dream Cycles

### Trigger Dream Manually

**Manually trigger a dream cycle for memory consolidation:**

```bash
python -m forgekeeper c dream
```

**Example Output:**
```
✅ Dream cycle completed:
   Memories consolidated: 5
   Insights generated: 3
   Biases challenged: 1
```

### Dream Workflows

**1. After intensive work session:**
```bash
# Check STM status
python -m forgekeeper c status  # See if STM is full

# Trigger consolidation
python -m forgekeeper c dream

# Verify STM cleared
python -m forgekeeper c status
```

**2. Before major milestone:**
```bash
# Consolidate learnings before release
python -m forgekeeper c dream

# Review insights
python -m forgekeeper c ask "What insights did you discover in your last dream?"
```

**3. Scheduled consolidation:**
```bash
# Daily dream via cron (Linux/macOS)
# Add to crontab: 0 2 * * * /path/to/python -m forgekeeper c dream

# Or Windows Task Scheduler equivalent
```

---

## Health & Troubleshooting

### Diagnose Problems

**1. System not responding:**
```bash
# Check if server is running
curl http://localhost:3000/api/consciousness/health

# If server down, start it
cd frontend
npm run serve

# Check CLI connection
python -m forgekeeper c health
```

**2. Low success rate:**
```bash
# Check health
python -m forgekeeper c health

# If critical, stop and investigate
python -m forgekeeper c stop -r "Low success rate, investigating"

# Check logs (server terminal)
# Fix issues, then restart
python -m forgekeeper c start
```

**3. Budget exhausted:**
```bash
# Check status
python -m forgekeeper c status  # Look at "API Tokens Remaining"

# If low, either:
# Option 1: Increase budget in .env
echo "CONSCIOUSNESS_DAILY_API_BUDGET=2000000" >> .env

# Option 2: Switch to local-only mode
# Remove CONSCIOUSNESS_DEEP_API_KEY from .env

# Restart server to apply changes
```

**4. No thoughts generating:**
```bash
# Check if consciousness is running
python -m forgekeeper c status

# If stopped, start it
python -m forgekeeper c start

# Watch for activity
python -m forgekeeper c watch
```

### Health Check Scripts

**Complete health check script:**

```bash
#!/bin/bash
# health-check.sh

echo "=== Consciousness Health Check ==="
echo

echo "1. Health Status:"
python -m forgekeeper c health
echo

echo "2. Current State:"
python -m forgekeeper c status
echo

echo "3. Active Goals:"
python -m forgekeeper c goal list
echo

echo "=== End Health Check ==="
```

**Usage:**
```bash
chmod +x health-check.sh
./health-check.sh
```

---

## Advanced Workflows

### Development Workflow

**Morning startup routine:**
```bash
#!/bin/bash
# morning-start.sh

# Start server
cd frontend
npm run serve &
sleep 5

# Check health
python -m forgekeeper c health

# Start consciousness if stopped
python -m forgekeeper c start

# Check status
python -m forgekeeper c status

# Set daily goals
python -m forgekeeper c goal add "Today's primary task" -t improvement -p high
```

### Continuous Monitoring

**Monitor consciousness throughout development:**
```bash
# Terminal 1: Run server
cd frontend
npm run serve

# Terminal 2: Watch consciousness
python -m forgekeeper c watch

# Terminal 3: Work on code
# ... normal development ...

# Periodically ask for insights
python -m forgekeeper c ask "Any insights about my recent changes?"
```

### Integration with Git Workflow

**Pre-commit hook:**
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Ask consciousness for review
python -m forgekeeper c ask "Review my pending changes for issues"

# Check if any critical problems detected
python -m forgekeeper c health | grep -q "CRITICAL"
if [ $? -eq 0 ]; then
  echo "⚠️  Consciousness detected critical issues"
  python -m forgekeeper c status
  exit 1
fi

exit 0
```

### Automated Reporting

**Daily report script:**
```bash
#!/bin/bash
# daily-report.sh

echo "=== Daily Consciousness Report ===" > report.txt
date >> report.txt
echo >> report.txt

echo "Status:" >> report.txt
python -m forgekeeper c status >> report.txt
echo >> report.txt

echo "Health:" >> report.txt
python -m forgekeeper c health >> report.txt
echo >> report.txt

echo "Goals:" >> report.txt
python -m forgekeeper c goal list >> report.txt
echo >> report.txt

echo "Recent Insights:" >> report.txt
python -m forgekeeper c ask "Summarize today's key insights" >> report.txt

# Email or post to Slack
cat report.txt | mail -s "Consciousness Daily Report" team@example.com
```

---

## Tips & Best Practices

### Command Aliases

**Add to your shell profile (.bashrc, .zshrc, or PowerShell profile):**

```bash
# Bash/Zsh
alias fgk='python -m forgekeeper'
alias fgkc='python -m forgekeeper c'
alias fgk-status='python -m forgekeeper c status'
alias fgk-health='python -m forgekeeper c health'
alias fgk-watch='python -m forgekeeper c watch'
alias fgk-ask='python -m forgekeeper c ask'

# PowerShell
function fgk { python -m forgekeeper $args }
function fgkc { python -m forgekeeper c $args }
function fgk-status { python -m forgekeeper c status }
function fgk-health { python -m forgekeeper c health }
```

**Usage after aliases:**
```bash
fgkc status
fgkc health
fgk-ask "What are you thinking?"
```

### Best Practices

**1. Regular health checks:**
- Check health before important operations
- Monitor during long-running tasks
- Review after deployments

**2. Meaningful goal management:**
- Create specific, actionable goals
- Use appropriate types (improvement/investigation/learning)
- Set realistic priorities
- Review and update goals regularly

**3. Strategic dream timing:**
- Trigger dreams after intensive work sessions
- Consolidate before major milestones
- Schedule regular automated dreams

**4. Effective questioning:**
- Ask specific questions for better responses
- Check STM to understand current context
- Use natural language (no special syntax needed)

**5. Integration with workflow:**
- Incorporate into morning/evening routines
- Use in pre-commit hooks for automated reviews
- Monitor during CI/CD pipelines
- Generate periodic reports for team visibility

### Troubleshooting Quick Reference

| Problem | Command | Solution |
|---------|---------|----------|
| System not responding | `python -m forgekeeper c health` | Check server running, restart if needed |
| Low success rate | `python -m forgekeeper c health` | Stop, investigate logs, fix issues, restart |
| Budget exhausted | `python -m forgekeeper c status` | Increase budget or switch to local-only |
| No thoughts | `python -m forgekeeper c status` | Check if running, start if stopped |
| Connection errors | `curl http://localhost:3000/api/consciousness/health` | Verify server running on correct port |

---

## Appendix: All Available Commands

### Command Reference

```bash
# Status & Monitoring
python -m forgekeeper c status              # Show current status
python -m forgekeeper c health              # Check for problems
python -m forgekeeper c watch               # Real-time monitoring

# Control
python -m forgekeeper c start               # Start consciousness
python -m forgekeeper c stop                # Stop consciousness
python -m forgekeeper c stop -r "reason"    # Stop with reason

# Interaction
python -m forgekeeper c ask "question"      # Ask a question

# Goals
python -m forgekeeper c goal list           # List active goals
python -m forgekeeper c goal add "title"    # Add goal (default: improvement/medium)
python -m forgekeeper c goal add "title" -t TYPE -p PRIORITY -d "description"

# Dreams
python -m forgekeeper c dream               # Trigger dream cycle

# Help
python -m forgekeeper c --help              # Show help
python -m forgekeeper c COMMAND --help      # Command-specific help
```

### Command Options

**Goal Types:**
- `improvement` - Feature improvements or enhancements
- `investigation` - Problem investigation or analysis
- `learning` - Learning new concepts or technologies

**Goal Priorities:**
- `low` - Nice to have
- `medium` - Standard priority (default)
- `high` - Important, should prioritize

---

## Examples by Use Case

### Use Case: Code Review

```bash
# 1. Check consciousness awareness
python -m forgekeeper c status

# 2. Ask for code review
python -m forgekeeper c ask "Review recent changes for issues"

# 3. Check for specific patterns
python -m forgekeeper c ask "Any anti-patterns in the new code?"

# 4. Get improvement suggestions
python -m forgekeeper c ask "How can we improve the new feature?"
```

### Use Case: Bug Investigation

```bash
# 1. Create investigation goal
python -m forgekeeper c goal add "Investigate login timeout issue" -t investigation -p high

# 2. Ask about error patterns
python -m forgekeeper c ask "What error patterns have you noticed?"

# 3. Monitor while testing
python -m forgekeeper c watch

# 4. Get analysis
python -m forgekeeper c ask "What could cause the login timeout?"
```

### Use Case: Performance Optimization

```bash
# 1. Set improvement goal
python -m forgekeeper c goal add "Optimize API response times" -t improvement -p high

# 2. Ask for analysis
python -m forgekeeper c ask "What performance bottlenecks have you identified?"

# 3. Monitor during profiling
python -m forgekeeper c watch

# 4. Review insights
python -m forgekeeper c status  # Check STM for discoveries

# 5. Consolidate learnings
python -m forgekeeper c dream
```

---

**CLI Examples Complete!**

For more information:
- **Integration Guide**: `CONSCIOUSNESS_INTEGRATION.md`
- **System Overview**: `CONSCIOUSNESS_SYSTEM_COMPLETE.md`
- **Sprint 7 Complete**: `SPRINT_7_COMPLETE.md`
- **GraphQL API**: `http://localhost:3000/graphql`
