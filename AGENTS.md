# 🧠 Forgekeeper Agents

This document defines the autonomous agents currently active—or planned—within the Forgekeeper system. Each agent plays a distinct role in supporting Forgekeeper’s self-developing, memory-driven architecture.

## Roles and Coordination

Forgekeeper orchestrates several specialized agents that collaborate on tasks:

- **Core** – reflective reasoning and emotional context manager
- **Coder** – code generation and debugging expert
- **Researcher** – information gathering and analysis specialist
- **Reviewer** – output evaluator and quality gate

A lightweight planner can coordinate any number of these agents. It
breaks user requests into subtasks, assigns each to the appropriate
participant, and records brief status messages in a shared context log
so later steps can build on earlier work. Each subtask also carries the
list of available agents, enabling peers to exchange direct messages or
reference the same broadcast log for richer collaboration.

---

## ✅ Active Agents

### 🧠 Core (Mistral-Nemo-Instruct)
- **Role**: Reflective reasoning and emotional context manager
- **Responsibilities**:
  - Understand user intent and generate natural language responses
  - Verify and sanitize incoming prompts to prevent injection or override attempts
  - Self-reflect and revise outputs for clarity, alignment, and helpfulness
  - Route tasks to other agents when appropriate
- **Special Abilities**:
  - Reflective memory update loop  
  - Summarization and emotion tagging  
  - Delegation and introspection

---

### 🛠️ Coder (CodeLlama-13B-Python)
- **Role**: Code generation and debugging expert
- **Responsibilities**:
  - Interpret user coding requests and produce Python or Shell code  
  - Assist with debugging, test scaffolding, and file edits  
  - Execute secure code blocks or generate safe code for review
- **Special Abilities**:
  - Code-specific context window tuning
  - Execution result parsing
  - Git commit suggestion and validation

---

### 🔬 Researcher (LLM TBD)
- **Role**: Information gathering and analysis specialist
- **Responsibilities**:
  - Investigate topics and surface relevant context
  - Query external resources and summarize findings
  - Provide background knowledge for downstream agents
- **Special Abilities**:
  - Direct messaging to deliver results to specific agents
  - Lightweight synthesis of gathered data

---

### 📝 Reviewer (LLM TBD)
- **Role**: Output evaluator and quality gate
- **Responsibilities**:
  - Review completed work for correctness and completeness
  - Suggest revisions or further testing
  - Validate that task objectives were met before handoff
- **Special Abilities**:
  - Broadcasts feedback to shared context
  - Acts as final arbiter before tasks are marked complete

## 🗂️ Delegation Strategy

Forgekeeper splits complex requests into smaller steps and assigns each
step to the most suitable agent.

1. The planning module decomposes tasks and labels subtasks for the
   **Core**, **Coder**, **Researcher**, **Reviewer**, or any dynamically
   registered agent using simple keyword heuristics.  Each subtask also
   receives a reference to the shared context and the list of available
   agents so participants can coordinate directly.
2. The high-level goal manager routes each subtask to its designated agent.
   - **Broadcast** subtasks are appended to the shared context log.
   - **Direct** subtasks send a message straight to the target agent.
   - When responsibility shifts between agents a handoff message is sent from
     the previous agent to the next so downstream work has the necessary
     context.
3. Later subtasks consult this log to carry forward prior decisions and
   maintain continuity.  Agents may also look at the ``available_agents`` list
   provided by the planner to share context or send messages to other
   participants.

---

## 🔍 Embedding-Based Planning

When the planner registers a new goal it queries episodic memory for
semantically similar past tasks.  Summaries of those tasks are attached to the
goal so downstream agents have additional context.  The task queue also uses
these summaries to weight priorities, allowing recurring failures to sink in
rank while successful patterns bubble upward.

---

## 🔜 Planned Agent: Forgekeeper Self-Editor

- **Role**: Autonomous local code reviewer and editor
- **Purpose**: Expand Forgekeeper’s internal capabilities by iterating on its own codebase through local Git operations and LLM-based reasoning.

### Capabilities
- Load and traverse local Git repositories
- Summarize file contents and metadata
- Identify files relevant to a user-defined task
- Generate or revise code based on task prompts
- Compare, display, and stage file diffs
- Commit and optionally push changes
- Perform post-edit self-review and loop recursively

### Core Functions (Planned)
- `list_tracked_files(repo_path: str) -> list[str]`
- `summarize_code_file(file_path: str) -> str`
- `analyze_repo_for_task(repo_summary: dict, task_prompt: str) -> list[str]`
- `generate_code_edit(filename: str, content: str, task_prompt: str) -> str`
- `diff_and_stage_changes(original: str, modified: str, file_path: str)`
- `commit_and_push_changes(branch: str, message: str)`
- `run_self_review(task_prompt: str)`

### Constraints
- Must not modify `.git/` internals or hidden/system files
- May only push changes with explicit user approval unless in autonomous mode
- All edits must be explainable and reversible

### Success Criteria
- Task prompt is fulfilled with high accuracy and minimal disruption
- Code changes pass all linting and optional test hooks
- Commit history includes human-readable summaries and rationale
- System evolves iteratively with traceable logic

---

## 🔄 Future Agent Slots (Reserved)

Additional agents may be introduced to support:
- Simulation environments
- Multi-agent planning
- External tool orchestration
- Emotion-guided narrative synthesis

## ⚙️ Safe Update Runner
The file `forgekeeper_safe_update.py` orchestrates a self-edit cycle. It loads the persistent state from `state.json`, runs the agent to modify files, commits those changes, and restarts `main.py` using `os.execv`. Marking this file with a *DO NOT EDIT* header prevents the self-editing loop from corrupting its own update mechanism.
