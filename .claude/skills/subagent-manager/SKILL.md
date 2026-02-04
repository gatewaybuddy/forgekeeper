---
name: subagent-manager
description: Manage and coordinate Claude Code subagents for parallel task execution
tags: [agents, orchestration, parallel, task-management]
version: 1.0.0
author: forgekeeper-team
---

# Subagent Manager

## Overview
This skill helps manage and coordinate multiple Claude Code subagents for parallel task execution. It provides patterns for launching, monitoring, and coordinating subagents effectively.

## When to Use
Use this skill when:
- User requests parallel execution of multiple independent tasks
- Need to explore multiple parts of a codebase simultaneously
- Running multiple test suites or builds in parallel
- Coordinating complex multi-step workflows
- Managing long-running background tasks

## Prerequisites
- Claude Code CLI available (`claude` command)
- Understanding of Task tool with subagent_type parameter
- Knowledge of available subagent types: Bash, general-purpose, Explore, Plan

## Instructions

### Step 1: Identify Parallelizable Work
Analyze the user's request to identify:
- Independent tasks that can run in parallel
- Dependencies between tasks (must run sequentially)
- Tasks that require different specializations

### Step 2: Select Appropriate Subagent Types

| Subagent Type | Use For |
|---------------|---------|
| Bash | Git operations, command execution, terminal tasks |
| general-purpose | Complex multi-step tasks, code search, research |
| Explore | Codebase exploration, finding files, understanding architecture |
| Plan | Designing implementation strategies, architectural decisions |

### Step 3: Launch Subagents

For parallel execution, use multiple Task tool calls in a single message.

Example parallel launch pattern:
- Task 1: Use Explore agent to find all API endpoints
- Task 2: Use Explore agent to find all database models
- Task 3: Use Bash agent to run lint checks

### Step 4: Coordinate Results

When subagents return:
1. Collect and summarize outputs from all agents
2. Identify any conflicts or overlapping work
3. Synthesize findings into coherent response
4. Track agent IDs for potential follow-up (resume capability)

### Step 5: Background Task Management

For long-running tasks, use `run_in_background: true`:
- Agent runs asynchronously
- Returns output_file path immediately
- Use Read tool or Bash tail to check progress
- Continue other work while waiting

## Expected Output
- Coordinated execution of multiple subagents
- Aggregated results from parallel tasks
- Clear summary of what each agent accomplished
- Agent IDs preserved for potential resumption

## Error Handling

**Error**: Subagent timeout
- **Cause**: Task too complex or resource intensive
- **Fix**: Break into smaller subtasks, increase timeout, or run in background

**Error**: Conflicting results from parallel agents
- **Cause**: Agents modified same files or reached different conclusions
- **Fix**: Run sequentially with dependencies, or reconcile manually

**Error**: Agent requires information from another agent
- **Cause**: Task has hidden dependencies
- **Fix**: Identify dependency, run prerequisite agent first, then dependent agent

## Examples

### Example 1: Parallel Codebase Exploration
```
User request: "Understand how authentication and authorization work in this codebase"

Subagent coordination:
1. Launch Explore agent: "Find all authentication-related files and explain the auth flow"
2. Launch Explore agent: "Find all authorization/permission-related files and explain access control"
3. Synthesize: Combine findings into comprehensive auth/authz overview
```

### Example 2: Parallel Build and Test
```
User request: "Run the build and tests in parallel"

Subagent coordination:
1. Launch Bash agent (background): "Run npm run build"
2. Launch Bash agent (background): "Run npm test"
3. Monitor: Check output files for completion
4. Report: Aggregate build and test results
```

### Example 3: Multi-Repository Analysis
```
User request: "Compare the API design between v2 and v3"

Subagent coordination:
1. Launch Explore agent: "Analyze v2 API structure and patterns"
2. Launch Explore agent: "Analyze v3 API structure and patterns"
3. Synthesize: Create comparison table highlighting differences
```

## Subagent Capabilities Reference

### Bash Agent
- Execute shell commands
- Git operations (commit, push, branch)
- File system operations via commands
- Process management

### General-Purpose Agent
- Full tool access (except Task, Edit, Write)
- Multi-step reasoning
- Code search and analysis
- Web fetching and research

### Explore Agent
- Fast codebase exploration
- File pattern matching (glob)
- Code keyword search (grep)
- Architecture understanding
- Thoroughness levels: quick, medium, very thorough

### Plan Agent
- Implementation strategy design
- Architectural trade-off analysis
- Step-by-step planning
- Critical file identification

## Best Practices

1. **Minimize Context**: Give agents focused prompts with only necessary context
2. **Use Appropriate Types**: Match agent type to task requirements
3. **Parallel When Possible**: Launch independent tasks together
4. **Sequential When Needed**: Respect dependencies between tasks
5. **Background for Long Tasks**: Use run_in_background for builds, tests
6. **Preserve Agent IDs**: Save IDs for potential follow-up work
7. **Aggregate Clearly**: Synthesize multi-agent results coherently

## Resources
- Claude Code Task tool documentation
- Forgekeeper v3 skills system (v3/skills/)
- Agent orchestration patterns (frontend/server/agents/)

## Notes
- Each subagent starts fresh unless resumed with an agent ID
- Background agents can be checked via output_file
- Prefer haiku model for quick, straightforward tasks
- Use sonnet/opus for complex reasoning tasks

## Version History
- **1.0.0** (2025-02-02): Initial release
