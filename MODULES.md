# Module Index

Generated automatically on `2025-09-26T19:20:50.497404+00:00` by `tools/nav/build_module_index.py`.
Re-run this script after updating Python packages or modules to keep the index in sync.

## Packages

### `forgekeeper` (forgekeeper)

Forgekeeper (v2 default)

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.__main__` | `forgekeeper/__main__.py` | _No docstring available._ |
| `forgekeeper.change_stager` | `forgekeeper/change_stager.py` | Compatibility wrapper exposing the unified change stager. |
| `forgekeeper.config` | `forgekeeper/config.py` | Configuration helpers for the unified runtime. |
| `forgekeeper.diff_validator` | `forgekeeper/diff_validator.py` | Diff validation helpers for staged Python files. |
| `forgekeeper.git_committer` | `forgekeeper/git_committer.py` | Compatibility wrapper exposing the core git committer. |
| `forgekeeper.logger` | `forgekeeper/logger.py` | Lightweight logging helpers for Forgekeeper. |
| `forgekeeper.main` | `forgekeeper/main.py` | Entry point compatibility module. |
| `forgekeeper.outbox` | `forgekeeper/outbox.py` | Filesystem-backed outbox for pending tool actions. |
| `forgekeeper.self_review` | `forgekeeper/self_review.py` | Simplified self-review helpers used by the git committer. |
| `forgekeeper.state_manager` | `forgekeeper/state_manager.py` | State serialization helpers for the unified runtime. |
| `forgekeeper.task_pipeline` | `forgekeeper/task_pipeline.py` | Compatibility wrapper exposing :class:`TaskPipeline`. |

#### Details for `forgekeeper.__main__`

**Functions**
- `_run_conversation` – _No docstring available._
- `_build_start_command` – _No docstring available._
- `main` – _No docstring available._

#### Details for `forgekeeper.config`

**Functions**
- `_bool_env` – _No docstring available._
- `_split_env` – _No docstring available._

#### Details for `forgekeeper.diff_validator`

**Functions**
- `_extract` – _No docstring available._
- `validate_staged_diffs` – Check staged diffs for removed definitions still referenced elsewhere.

#### Details for `forgekeeper.logger`

**Functions**
- `get_logger` – Return a configured logger instance.

#### Details for `forgekeeper.main`

**Functions**
- `main` – _No docstring available._

#### Details for `forgekeeper.outbox`

**Functions**
- `_action_path` – _No docstring available._
- `write_action` – _No docstring available._
- `remove_action` – _No docstring available._
- `run_action` – _No docstring available._
- `pending_action` – _No docstring available._
- `replay_pending` – _No docstring available._

#### Details for `forgekeeper.self_review`

**Functions**
- `review_staged_changes` – Return a minimal review payload listing staged files.

#### Details for `forgekeeper.state_manager`

**Functions**
- `_ensure_path` – _No docstring available._
- `load_state` – _No docstring available._
- `save_state` – _No docstring available._

### `forgekeeper-v2.forgekeeper_v2` (forgekeeper-v2/forgekeeper_v2)

Forgekeeper v2 package – Thoughtworld Orchestrator.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper-v2.forgekeeper_v2.__main__` | `forgekeeper-v2/forgekeeper_v2/__main__.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.cli` | `forgekeeper-v2/forgekeeper_v2/cli.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.ui.server` | `forgekeeper-v2/forgekeeper_v2/ui/server.py` | _No docstring available._ |

#### Details for `forgekeeper-v2.forgekeeper_v2.cli`

**Functions**
- `_missing_modules` – _No docstring available._
- `_check_tools` – _No docstring available._
- `install_packages` – _No docstring available._
- `do_check` – _No docstring available._
- `_build_llms` – _No docstring available._
- `_run_demo` – _No docstring available._
- `main` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.ui.server`

**Functions**
- `create_app` – _No docstring available._

### `forgekeeper-v2.forgekeeper_v2.memory` (forgekeeper-v2/forgekeeper_v2/memory)

Memory plane utilities: summarizer and facts store.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper-v2.forgekeeper_v2.memory.facts_store` | `forgekeeper-v2/forgekeeper_v2/memory/facts_store.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.memory.summarizer` | `forgekeeper-v2/forgekeeper_v2/memory/summarizer.py` | _No docstring available._ |

#### Details for `forgekeeper-v2.forgekeeper_v2.memory.facts_store`

**Classes**
- `FactsStore` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.memory.summarizer`

**Functions**
- `compact` – _No docstring available._

### `forgekeeper-v2.forgekeeper_v2.memory.agentic` (forgekeeper-v2/forgekeeper_v2/memory/agentic)

_No docstring available._

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper-v2.forgekeeper_v2.memory.agentic.feedback` | `forgekeeper-v2/forgekeeper_v2/memory/agentic/feedback.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.memory.agentic.persistence` | `forgekeeper-v2/forgekeeper_v2/memory/agentic/persistence.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.memory.agentic.retrieval` | `forgekeeper-v2/forgekeeper_v2/memory/agentic/retrieval.py` | _No docstring available._ |

#### Details for `forgekeeper-v2.forgekeeper_v2.memory.agentic.feedback`

**Classes**
- `Feedback` – _No docstring available._
- `FeedbackLog` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.memory.agentic.persistence`

**Classes**
- `AgenticStore` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.memory.agentic.retrieval`

**Classes**
- `Retriever` – _No docstring available._

### `forgekeeper-v2.forgekeeper_v2.orchestrator` (forgekeeper-v2/forgekeeper_v2/orchestrator)

Orchestrator runtime package.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.buffers` | `forgekeeper-v2/forgekeeper_v2/orchestrator/buffers.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.events` | `forgekeeper-v2/forgekeeper_v2/orchestrator/events.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.orchestrator` | `forgekeeper-v2/forgekeeper_v2/orchestrator/orchestrator.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.policies` | `forgekeeper-v2/forgekeeper_v2/orchestrator/policies.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.single` | `forgekeeper-v2/forgekeeper_v2/orchestrator/single.py` | _No docstring available._ |

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.buffers`

**Classes**
- `Buffers` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.events`

**Classes**
- `Event` – _No docstring available._
- `JsonlRecorder` – _No docstring available._
- `Watermark` – _No docstring available._

**Functions**
- `_utc_iso` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.orchestrator`

**Classes**
- `Orchestrator` – _No docstring available._

**Functions**
- `_estimate_tokens` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.policies`

**Classes**
- `TriggerPolicy` – _No docstring available._
- `FloorPolicy` – _No docstring available._

**Functions**
- `_now` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.single`

**Classes**
- `SingleOrchestrator` – _No docstring available._

**Functions**
- `_estimate_tokens` – _No docstring available._

### `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters` (forgekeeper-v2/forgekeeper_v2/orchestrator/adapters)

Adapters for LLMs and tools.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_base` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/llm_base.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_mock` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/llm_mock.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_openai` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/llm_openai.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_triton` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/llm_triton.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_base` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/tool_base.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_powershell` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/tool_powershell.py` | _No docstring available._ |
| `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_shell` | `forgekeeper-v2/forgekeeper_v2/orchestrator/adapters/tool_shell.py` | _No docstring available._ |

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_base`

**Classes**
- `LLMBase` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_mock`

**Classes**
- `LLMMock` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_openai`

**Classes**
- `LLMOpenAI` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.llm_triton`

**Classes**
- `LLMTriton` – Triton Inference Server adapter for local OSS models (e.g., 20B).

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_base`

**Classes**
- `ToolBase` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_powershell`

**Classes**
- `ToolPowerShell` – _No docstring available._

**Functions**
- `_redact` – _No docstring available._

#### Details for `forgekeeper-v2.forgekeeper_v2.orchestrator.adapters.tool_shell`

**Classes**
- `ToolShell` – _No docstring available._

### `forgekeeper.core` (forgekeeper/core)

Unified runtime package exports.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.change_stager` | `forgekeeper/core/change_stager.py` | Utilities for diffing and staging file changes (unified runtime). |

#### Details for `forgekeeper.core.change_stager`

**Classes**
- `StageResult` – _No docstring available._

**Functions**
- `_write_log` – _No docstring available._
- `diff_and_stage_changes` – Compare original and modified content and stage via Git if changed.

### `forgekeeper.core.git` (forgekeeper/core/git)

Git-related helpers for the unified runtime.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.git.checks` | `forgekeeper/core/git/checks.py` | Commit check selection and execution helpers. |
| `forgekeeper.core.git.commit_ops` | `forgekeeper/core/git/commit_ops.py` | Commit and push helpers for the unified runtime. |
| `forgekeeper.core.git.committer` | `forgekeeper/core/git/committer.py` | Git commit orchestration for Forgekeeper. |
| `forgekeeper.core.git.pre_review` | `forgekeeper/core/git/pre_review.py` | Pre-commit review helpers. |
| `forgekeeper.core.git.sandbox` | `forgekeeper/core/git/sandbox.py` | Sandbox execution helpers for the unified runtime. |

#### Details for `forgekeeper.core.git.checks`

**Functions**
- `_run_commands` – _No docstring available._
- `_select_commands` – _No docstring available._
- `run_checks` – Run commit checks derived from ``files`` or ``commands``.

#### Details for `forgekeeper.core.git.commit_ops`

**Functions**
- `commit_changes` – Commit staged changes and capture a textual changelog.
- `push_branch` – Push the working branch to its remote.

#### Details for `forgekeeper.core.git.committer`

**Functions**
- `_commit_and_push_impl` – _No docstring available._
- `commit_and_push_changes` – Commit staged changes and optionally push them to a branch.

#### Details for `forgekeeper.core.git.pre_review`

**Functions**
- `run_pre_review` – Run self-review and diff validation prior to committing.

#### Details for `forgekeeper.core.git.sandbox`

**Functions**
- `_collect_commands` – _No docstring available._
- `_format_command` – _No docstring available._
- `run_sandbox_checks` – Apply a diff inside a temporary worktree and run commands.

### `forgekeeper.core.llm` (forgekeeper/core/llm)

LLM facade definitions used during the legacy migration.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.llm.base` | `forgekeeper/core/llm/base.py` | Shared LLM provider interfaces. |
| `forgekeeper.core.llm.providers` | `forgekeeper/core/llm/providers.py` | Provider registry placeholder. |

#### Details for `forgekeeper.core.llm.base`

**Classes**
- `LLMConfig` – _No docstring available._
- `LLMProvider` – _No docstring available._

#### Details for `forgekeeper.core.llm.providers`

**Functions**
- `register` – _No docstring available._
- `get` – _No docstring available._

### `forgekeeper.core.orchestrator` (forgekeeper/core/orchestrator)

Orchestrator package exposing duet/single agents and helpers.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.orchestrator.adapters` | `forgekeeper/core/orchestrator/adapters.py` | Adapter abstractions used by the orchestrator tests. |
| `forgekeeper.core.orchestrator.buffers` | `forgekeeper/core/orchestrator/buffers.py` | In-memory buffers for orchestrator event tracking. |
| `forgekeeper.core.orchestrator.config` | `forgekeeper/core/orchestrator/config.py` | Configuration helpers for creating orchestrator dependencies. |
| `forgekeeper.core.orchestrator.contracts` | `forgekeeper/core/orchestrator/contracts.py` | Contracts describing orchestrator dependencies and helper factories. |
| `forgekeeper.core.orchestrator.events` | `forgekeeper/core/orchestrator/events.py` | Event primitives and JSONL recorder for the orchestrator. |
| `forgekeeper.core.orchestrator.facts` | `forgekeeper/core/orchestrator/facts.py` | Simple JSON-backed facts store for orchestrator context. |
| `forgekeeper.core.orchestrator.orchestrator` | `forgekeeper/core/orchestrator/orchestrator.py` | Duet orchestrator coordinating two language-model agents. |
| `forgekeeper.core.orchestrator.policies` | `forgekeeper/core/orchestrator/policies.py` | Floor/trigger policies for orchestrator turn-taking. |
| `forgekeeper.core.orchestrator.single` | `forgekeeper/core/orchestrator/single.py` | Single-agent orchestrator used for quick smoke tests. |
| `forgekeeper.core.orchestrator.summary` | `forgekeeper/core/orchestrator/summary.py` | Helpers for condensing event streams into bullet summaries. |

#### Details for `forgekeeper.core.orchestrator.adapters`

**Classes**
- `LLMBase` – Minimal async streaming interface for language models.
- `LLMMock` – Simple mock that emits a canned response on first iteration.
- `ToolBase` – Placeholder interface for future tool integrations.
- `ToolEvent` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.buffers`

**Classes**
- `Buffers` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.config`

**Classes**
- `DefaultOrchestratorConfig` – Helper for assembling :class:`Orchestrator` dependencies.

#### Details for `forgekeeper.core.orchestrator.contracts`

**Classes**
- `LLMEndpoint` – Protocol implemented by language-model endpoints used by the orchestrator.
- `ToolRouter` – Protocol responsible for lifecycle management of registered tools.
- `EventSink` – Protocol for recording orchestrator events.
- `PolicyProvider` – Protocol exposing timing/scheduling policies.
- `OrchestratorContracts` – Aggregate dependencies consumed by :class:`~.orchestrator.Orchestrator`.
- `OrchestratorExpectations` – Documentation for the default dependency expectations.
- `SimpleToolRouter` – Router that simply wraps a static iterable of tools.
- `DefaultPolicyProvider` – Policy provider returning static policies suitable for tests.

**Functions**
- `default_llm_endpoint` – Return the default mock endpoint for the requested role.
- `default_tool_router` – Construct a :class:`ToolRouter` from raw tool instances.
- `default_event_sink` – Create an event sink backed by :class:`~.events.JsonlRecorder`.
- `default_policy_provider` – Build a :class:`PolicyProvider` with forgekeeper's default heuristics.

#### Details for `forgekeeper.core.orchestrator.events`

**Classes**
- `Event` – _No docstring available._
- `JsonlRecorder` – Append-only JSONL recorder with async-safe writes.
- `Watermark` – Monotonic time helper used for event sequencing.

**Functions**
- `_utc_iso` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.facts`

**Classes**
- `FactsStore` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.orchestrator`

**Classes**
- `Orchestrator` – Coordinates two LLM agents, optional tools, and contextual memory.

**Functions**
- `_estimate_tokens` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.policies`

**Classes**
- `TriggerPolicy` – _No docstring available._
- `FloorPolicy` – _No docstring available._

**Functions**
- `_now` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.single`

**Classes**
- `SingleOrchestrator` – _No docstring available._

#### Details for `forgekeeper.core.orchestrator.summary`

**Functions**
- `compact` – _No docstring available._

### `forgekeeper.core.pipeline` (forgekeeper/core/pipeline)

Pipeline utilities for the unified runtime.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.pipeline.contracts` | `forgekeeper/core/pipeline/contracts.py` | Shared type contracts and helpers for the pipeline layer. |
| `forgekeeper.core.pipeline.executor` | `forgekeeper/core/pipeline/executor.py` | Executor helpers for the unified task pipeline. |
| `forgekeeper.core.pipeline.loop` | `forgekeeper/core/pipeline/loop.py` | Pipeline loop implementation for the unified runtime. |
| `forgekeeper.core.pipeline.runner` | `forgekeeper/core/pipeline/runner.py` | Pipeline runner helpers. |
| `forgekeeper.core.pipeline.task_pipeline` | `forgekeeper/core/pipeline/task_pipeline.py` | Task pipeline coordinator built on the unified task queue. |

#### Details for `forgekeeper.core.pipeline.contracts`

**Classes**
- `ExecutionResult` – Structured view over the payload returned by an executor.
- `StageOutcome` – Wrapper for staged file data produced by the pipeline.
- `PlannerSelector` – Callable responsible for providing planner metadata for a task.
- `ExecutorInvoker` – Callable responsible for executing a task.
- `StagingPolicy` – Callable responsible for staging file edits.
- `CommitPolicy` – Callable responsible for committing and optionally pushing changes.

#### Details for `forgekeeper.core.pipeline.executor`

**Classes**
- `ParsedInstructions` – _No docstring available._

**Functions**
- `_parse_structured_text` – _No docstring available._
- `_merge_payloads` – _No docstring available._
- `_load_instructions` – _No docstring available._
- `_resolve_original` – _No docstring available._
- `_apply_edit_spec` – _No docstring available._
- `build_default_executor` – Return a callable that converts structured instructions into pipeline edits.

#### Details for `forgekeeper.core.pipeline.loop`

**Functions**
- `run` – Execute the default pipeline once and persist the resulting state.

#### Details for `forgekeeper.core.pipeline.runner`

**Functions**
- `execute_pipeline` – Iterate over pipeline steps, executing each handler with shared context.

#### Details for `forgekeeper.core.pipeline.task_pipeline`

**Classes**
- `PlanningContext` – Context shared with planning strategies.
- `StageRequest` – Context for staging an individual edit.
- `CommitRequest` – Context for committing staged changes.
- `TaskLifecycleContext` – State shared across lifecycle phases for ``run_next_task``.
- `TaskPipeline` – High-level helper around :class:`~forgekeeper.core.tasks.queue.TaskQueue`.

**Functions**
- `_default_planner` – _No docstring available._
- `_default_stager` – _No docstring available._
- `_default_committer` – _No docstring available._

### `forgekeeper.core.planning` (forgekeeper/core/planning)

Planning helpers for the unified runtime.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.planning.agents` | `forgekeeper/core/planning/agents.py` | Agent routing heuristics for task planning. |
| `forgekeeper.core.planning.analysis` | `forgekeeper/core/planning/analysis.py` | Simple file ranking heuristics for task planning. |
| `forgekeeper.core.planning.planner` | `forgekeeper/core/planning/planner.py` | High-level task planning utilities. |
| `forgekeeper.core.planning.summaries` | `forgekeeper/core/planning/summaries.py` | Repository summarisation helpers. |

#### Details for `forgekeeper.core.planning.agents`

**Functions**
- `register_agent` – Register or update an agent routing rule.
- `_split_description` – _No docstring available._
- `_choose_agent` – _No docstring available._
- `split_for_agents` – Split ``task`` into heuristic subtasks assigned to registered agents.

#### Details for `forgekeeper.core.planning.analysis`

**Functions**
- `_keyword_set` – _No docstring available._
- `analyze_repo_for_task` – Return files ranked by simple keyword overlap with ``task_prompt``.

#### Details for `forgekeeper.core.planning.planner`

**Functions**
- `_synthesize_edit` – _No docstring available._
- `_task_description` – _No docstring available._
- `plan_for_task` – Generate planning metadata for ``task`` using heuristic analysis.

#### Details for `forgekeeper.core.planning.summaries`

**Functions**
- `_should_ignore` – _No docstring available._
- `summarize_file` – _No docstring available._
- `summarize_repository` – _No docstring available._

### `forgekeeper.core.self_review` (forgekeeper/core/self_review)

Self-review loop placeholders.

### `forgekeeper.core.tasks` (forgekeeper/core/tasks)

_No docstring available._

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.core.tasks.memory` | `forgekeeper/core/tasks/memory.py` | Simplified episodic memory interface for task weighting. |
| `forgekeeper.core.tasks.parser` | `forgekeeper/core/tasks/parser.py` | Markdown task parsing helpers for the unified runtime. |
| `forgekeeper.core.tasks.queue` | `forgekeeper/core/tasks/queue.py` | Task queue implementation backed by Markdown + episodic memory. |

#### Details for `forgekeeper.core.tasks.memory`

**Classes**
- `MemoryIndex` – _No docstring available._

**Functions**
- `load_memory_summaries` – Load summary statistics from the configured :class:`MemoryBackend`.
- `memory_weight` – _No docstring available._
- `_tokenize` – _No docstring available._
- `_accumulate_stats` – _No docstring available._
- `_index_payload` – _No docstring available._

#### Details for `forgekeeper.core.tasks.parser`

**Classes**
- `ChecklistTask` – _No docstring available._
- `Task` – _No docstring available._
- `Section` – _No docstring available._

**Functions**
- `_extract_section_name` – _No docstring available._
- `parse_task_file` – _No docstring available._
- `serialize` – _No docstring available._
- `save` – _No docstring available._
- `parse_tasks_md` – _No docstring available._

#### Details for `forgekeeper.core.tasks.queue`

**Classes**
- `CanonicalTask` – _No docstring available._
- `TaskQueue` – Parse and manage tasks defined in ``tasks.md``.

**Functions**
- `_extract_priority` – _No docstring available._

### `forgekeeper.git` (forgekeeper/git)

Compatibility layer for legacy `forgekeeper.git` imports.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.git.checks` | `forgekeeper/git/checks.py` | Compatibility shim for git commit checks. |
| `forgekeeper.git.commit_ops` | `forgekeeper/git/commit_ops.py` | Compatibility shim for commit operations. |
| `forgekeeper.git.outbox` | `forgekeeper/git/outbox.py` | Compatibility shim exposing the global outbox helpers. |
| `forgekeeper.git.pre_review` | `forgekeeper/git/pre_review.py` | Compatibility shim for pre-review helpers. |
| `forgekeeper.git.sandbox` | `forgekeeper/git/sandbox.py` | _No docstring available._ |
| `forgekeeper.git.sandbox_checks` | `forgekeeper/git/sandbox_checks.py` | Compatibility helpers for sandbox execution in the legacy git committer. |

#### Details for `forgekeeper.git.outbox`

**Functions**
- `run_with_outbox` – _No docstring available._

#### Details for `forgekeeper.git.sandbox_checks`

**Functions**
- `_run_sandbox_checks` – Run sandbox checks and record failures for legacy callers.

### `forgekeeper.inference_backends` (forgekeeper/inference_backends)

Inference backend helpers.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.inference_backends.harmony` | `forgekeeper/inference_backends/harmony.py` | Harmony prompt rendering helpers (simplified). |

#### Details for `forgekeeper.inference_backends.harmony`

**Functions**
- `render_harmony` – _No docstring available._

### `forgekeeper.llm` (forgekeeper/llm)

LLM provider facade for the unified runtime.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.llm.benchmark` | `forgekeeper/llm/benchmark.py` | Simple benchmarking helpers. |
| `forgekeeper.llm.llm_service_triton` | `forgekeeper/llm/llm_service_triton.py` | HTTP client for Triton-backed responses. |
| `forgekeeper.llm.transformers_impl` | `forgekeeper/llm/transformers_impl.py` | Minimal transformers-like provider used in tests. |
| `forgekeeper.llm.triton_impl` | `forgekeeper/llm/triton_impl.py` | Minimal Triton provider stub. |

#### Details for `forgekeeper.llm.benchmark`

**Classes**
- `LLMCallable` – _No docstring available._

**Functions**
- `run_benchmark` – _No docstring available._

#### Details for `forgekeeper.llm.llm_service_triton`

**Classes**
- `TritonClient` – _No docstring available._

#### Details for `forgekeeper.llm.transformers_impl`

**Classes**
- `_Tokenizer` – _No docstring available._
- `TransformersLLMProvider` – _No docstring available._

#### Details for `forgekeeper.llm.triton_impl`

**Classes**
- `TritonRTLLMProvider` – _No docstring available._

### `forgekeeper.memory` (forgekeeper/memory)

Memory utilities exposed at the package root.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.memory.backends` | `forgekeeper/memory/backends.py` | Core memory backend interfaces and registry helpers. |
| `forgekeeper.memory.embeddings` | `forgekeeper/memory/embeddings.py` | No-op embedding helpers used by episodic memory. |
| `forgekeeper.memory.episodic` | `forgekeeper/memory/episodic.py` | Episodic memory helpers for recording task outcomes. |
| `forgekeeper.memory.jsonl` | `forgekeeper/memory/jsonl.py` | JSONL-backed memory backend implementation. |

#### Details for `forgekeeper.memory.backends`

**Classes**
- `MemoryEntry` – Structured representation of a persisted memory entry.
- `MemoryBackend` – Protocol describing the required memory backend behaviour.

**Functions**
- `register_memory_backend` – Register ``factory`` under ``name``.
- `available_memory_backends` – Return the names of registered backends in registration order.
- `get_memory_backend` – Return an instantiated backend selected via configuration.

#### Details for `forgekeeper.memory.embeddings`

**Functions**
- `store_task_embedding` – Persist an embedding for ``task_id`` (stub implementation).
- `load_episodic_memory` – _No docstring available._
- `retrieve_similar_tasks` – _No docstring available._
- `similar_task_summaries` – _No docstring available._
- `LocalEmbedder` – _No docstring available._
- `SimpleTfidfVectorizer` – _No docstring available._
- `cosine_similarity` – _No docstring available._

#### Details for `forgekeeper.memory.episodic`

**Functions**
- `append_entry` – Append a structured entry to the episodic memory log.

#### Details for `forgekeeper.memory.jsonl`

**Classes**
- `JsonlMemoryReader` – Utility responsible for reading memory entries from a JSONL file.
- `JsonlMemoryBackend` – Persist episodic memories into a JSONL file with fsync semantics.

### `forgekeeper.pipeline` (forgekeeper/pipeline)

Compatibility layer for legacy `forgekeeper.pipeline` imports.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.pipeline.loop` | `forgekeeper/pipeline/loop.py` | _No docstring available._ |
| `forgekeeper.pipeline.main` | `forgekeeper/pipeline/main.py` | Legacy entrypoint for `forgekeeper.pipeline.main`. |

### `forgekeeper.tasks` (forgekeeper/tasks)

Compatibility surface for legacy `forgekeeper.tasks` imports.

| Module | Path | Summary |
| --- | --- | --- |
| `forgekeeper.tasks.queue` | `forgekeeper/tasks/queue.py` | _No docstring available._ |

### `goal_manager` (goal_manager)

_No docstring available._

| Module | Path | Summary |
| --- | --- | --- |
| `goal_manager.delegator` | `goal_manager/delegator.py` | _No docstring available._ |
| `goal_manager.interfaces` | `goal_manager/interfaces.py` | Interfaces for goal manager dependencies. |
| `goal_manager.manager` | `goal_manager/manager.py` | _No docstring available._ |
| `goal_manager.planner` | `goal_manager/planner.py` | _No docstring available._ |
| `goal_manager.progress` | `goal_manager/progress.py` | _No docstring available._ |
| `goal_manager.storage` | `goal_manager/storage.py` | _No docstring available._ |

#### Details for `goal_manager.delegator`

**Functions**
- `_dispatch_subtasks` – Route ``description`` to specialized agents with message passing.

#### Details for `goal_manager.interfaces`

**Classes**
- `PipelineExecutor` – Protocol for the task pipeline executor used by the goal manager.

#### Details for `goal_manager.manager`

**Classes**
- `_TaskPipelineAdapter` – Wrap :class:`TaskPipeline` to present the ``PipelineExecutor`` protocol.
- `HighLevelGoalManager` – Manage autonomous goal execution.

**Functions**
- `_build_default_pipeline` – _No docstring available._

#### Details for `goal_manager.planner`

**Classes**
- `Subtask` – Representation of a planned subtask.

**Functions**
- `_build_subtask_graph` – Decompose ``description`` into an ordered subtask graph.

#### Details for `goal_manager.progress`

**Functions**
- `log_goal_progress` – Append a progress note for ``goal_id`` to the goal log file.

#### Details for `goal_manager.storage`

**Functions**
- `_migrate_from_state_if_needed` – If goals.json is missing, try to migrate from state['active_goals'].
- `load_goals` – Load all goals from disk (or migrate from state if file missing).
- `save_goals` – Persist the given goals list to disk.
- `get_active_goals` – Return descriptions of currently active goals.
- `add_goal` – Add a new goal and return its identifier.
- `deactivate_goal` – Mark the goal with ``goal_id`` as inactive. Return True if found.

### `thoughts` (thoughts)

Thought management utilities for Forgekeeper.

| Module | Path | Summary |
| --- | --- | --- |
| `thoughts.generator` | `thoughts/generator.py` | _No docstring available._ |
| `thoughts.loop` | `thoughts/loop.py` | _No docstring available._ |
| `thoughts.summary` | `thoughts/summary.py` | _No docstring available._ |

#### Details for `thoughts.generator`

**Functions**
- `_load_thought_log` – _No docstring available._
- `_save_thought_log` – _No docstring available._
- `generate_internal_prompt` – Create an internal prompt based on state, goals, and recent thoughts.
- `should_interact_with_user` – Return True if the thought should be surfaced to the user.
- `_append_thought` – _No docstring available._
- `process_thought` – Persist the thought and evaluate whether to expose it.

#### Details for `thoughts.loop`

**Classes**
- `RecursiveThinker` – Background thread that generates and reflects on thoughts.

#### Details for `thoughts.summary`

**Functions**
- `reflect_recent_thoughts` – Generate a reflection on recent thoughts.
- `summarize_thoughts` – Condense recent thoughts and tag the dominant emotion.
- `get_last_summary` – Return the most recent summary and emotion tag.

### `tools.labels` (tools/labels)

Label parsing and GitHub API helpers.

| Module | Path | Summary |
| --- | --- | --- |
| `tools.labels.github_api` | `tools/labels/github_api.py` | GitHub label management helpers. |
| `tools.labels.parser` | `tools/labels/parser.py` | Parse `tasks.md` blocks for metadata used in PR labeling. |

#### Details for `tools.labels.github_api`

**Functions**
- `list_existing_labels` – _No docstring available._
- `ensure_labels` – _No docstring available._
- `add_labels_to_pr` – _No docstring available._

#### Details for `tools.labels.parser`

**Functions**
- `parse_tasks_md` – Return a mapping of task ID → metadata parsed from a `tasks.md` file.

### `tools.roadmap` (tools/roadmap)

Roadmap helper utilities.

| Module | Path | Summary |
| --- | --- | --- |
| `tools.roadmap.aggregator` | `tools/roadmap/aggregator.py` | _No docstring available._ |
| `tools.roadmap.github` | `tools/roadmap/github.py` | _No docstring available._ |

#### Details for `tools.roadmap.aggregator`

**Functions**
- `format_task_block` – _No docstring available._
- `write_tasks_md` – _No docstring available._
- `sync_status` – _No docstring available._
- `rollup_roadmap` – _No docstring available._

#### Details for `tools.roadmap.github`

**Functions**
- `gh_repo_slug` – Return the GitHub slug for the current repository.
- `fetch_prs_for_tasks` – _No docstring available._

## Standalone Modules

| Module | Path | Summary |
| --- | --- | --- |
| `conftest` | `conftest.py` | _No docstring available._ |
| `forgekeeper-v2.scripts.demo_duet` | `forgekeeper-v2/scripts/demo_duet.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_events` | `forgekeeper-v2/tests/test_events.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_llm_openai` | `forgekeeper-v2/tests/test_llm_openai.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_memory_agentic_basic` | `forgekeeper-v2/tests/test_memory_agentic_basic.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_orchestrator_duet` | `forgekeeper-v2/tests/test_orchestrator_duet.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_policies` | `forgekeeper-v2/tests/test_policies.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_tools_powershell` | `forgekeeper-v2/tests/test_tools_powershell.py` | _No docstring available._ |
| `forgekeeper-v2.tests.test_tools_shell` | `forgekeeper-v2/tests/test_tools_shell.py` | _No docstring available._ |
| `forgekeeper-v2.tmp_fk_o_test` | `forgekeeper-v2/tmp_fk_o_test.py` | _No docstring available._ |
| `forgekeeper-v2.tmp_fk_o_test_run_tmp` | `forgekeeper-v2/tmp_fk_o_test_run_tmp.py` | _No docstring available._ |
| `scripts.download_hf_model` | `scripts/download_hf_model.py` | _No docstring available._ |
| `scripts.dual_llm_agent` | `scripts/dual_llm_agent.py` | _No docstring available._ |
| `scripts.fft_visualizer` | `scripts/fft_visualizer.py` | _No docstring available._ |
| `scripts.generate_roadmap_yaml` | `scripts/generate_roadmap_yaml.py` | _No docstring available._ |
| `scripts.generate_tasks_from_roadmap` | `scripts/generate_tasks_from_roadmap.py` | _No docstring available._ |
| `scripts.infer_cli` | `scripts/infer_cli.py` | Simple CLI for querying a vLLM OpenAI-compatible endpoint. |
| `scripts.llm_benchmark` | `scripts/llm_benchmark.py` | _No docstring available._ |
| `scripts.llm_smoke_test` | `scripts/llm_smoke_test.py` | _No docstring available._ |
| `scripts.mqtt_forgekeeper_listener` | `scripts/mqtt_forgekeeper_listener.py` | MQTT listener for Forgekeeper tasks. |
| `scripts.smoke_e2e_roundtrip` | `scripts/smoke_e2e_roundtrip.py` | _No docstring available._ |
| `scripts.smoke_graphql_append` | `scripts/smoke_graphql_append.py` | _No docstring available._ |
| `scripts.update_file_summary` | `scripts/update_file_summary.py` | Regenerate `FILE_SUMMARY.md` with a one-line summary for each tracked file. |
| `scripts.update_requirements` | `scripts/update_requirements.py` | Lock top-level dependencies in requirements.txt to exact versions. |
| `scripts.wait_for_url` | `scripts/wait_for_url.py` | _No docstring available._ |
| `tests.git_committer.conftest` | `tests/git_committer/conftest.py` | _No docstring available._ |
| `tests.git_committer.test_abort_paths` | `tests/git_committer/test_abort_paths.py` | _No docstring available._ |
| `tests.git_committer.test_checks` | `tests/git_committer/test_checks.py` | _No docstring available._ |
| `tests.git_committer.test_diff_validation` | `tests/git_committer/test_diff_validation.py` | _No docstring available._ |
| `tests.git_committer.test_push` | `tests/git_committer/test_push.py` | _No docstring available._ |
| `tests.high_level_goal_manager.conftest` | `tests/high_level_goal_manager/conftest.py` | _No docstring available._ |
| `tests.high_level_goal_manager.test_autonomy_loop` | `tests/high_level_goal_manager/test_autonomy_loop.py` | _No docstring available._ |
| `tests.high_level_goal_manager.test_delegator` | `tests/high_level_goal_manager/test_delegator.py` | _No docstring available._ |
| `tests.high_level_goal_manager.test_planner` | `tests/high_level_goal_manager/test_planner.py` | _No docstring available._ |
| `tests.memory.conftest` | `tests/memory/conftest.py` | _No docstring available._ |
| `tests.memory.test_append_and_tail` | `tests/memory/test_append_and_tail.py` | _No docstring available._ |
| `tests.memory.test_backends_interface` | `tests/memory/test_backends_interface.py` | _No docstring available._ |
| `tests.memory.test_cli_utils` | `tests/memory/test_cli_utils.py` | _No docstring available._ |
| `tests.memory.test_jsonl_backend` | `tests/memory/test_jsonl_backend.py` | _No docstring available._ |
| `tests.memory_agentic.test_ast_patcher` | `tests/memory_agentic/test_ast_patcher.py` | _No docstring available._ |
| `tests.memory_agentic.test_cli` | `tests/memory_agentic/test_cli.py` | _No docstring available._ |
| `tests.memory_agentic.test_orchestrator` | `tests/memory_agentic/test_orchestrator.py` | _No docstring available._ |
| `tests.memory_agentic.test_persistence` | `tests/memory_agentic/test_persistence.py` | _No docstring available._ |
| `tests.memory_agentic.test_retrieval` | `tests/memory_agentic/test_retrieval.py` | _No docstring available._ |
| `tests.memory_agentic.test_teh_typo` | `tests/memory_agentic/test_teh_typo.py` | _No docstring available._ |
| `tests.task_queue.conftest` | `tests/task_queue/conftest.py` | _No docstring available._ |
| `tests.task_queue.test_parser` | `tests/task_queue/test_parser.py` | _No docstring available._ |
| `tests.task_queue.test_queue_helpers` | `tests/task_queue/test_queue_helpers.py` | _No docstring available._ |
| `tests.task_queue.test_queue_ops` | `tests/task_queue/test_queue_ops.py` | _No docstring available._ |
| `tests.task_queue.test_weighting` | `tests/task_queue/test_weighting.py` | _No docstring available._ |
| `tests.test_change_stager` | `tests/test_change_stager.py` | _No docstring available._ |
| `tests.test_chat_session` | `tests/test_chat_session.py` | _No docstring available._ |
| `tests.test_cli_wrapper` | `tests/test_cli_wrapper.py` | _No docstring available._ |
| `tests.test_code_edit` | `tests/test_code_edit.py` | _No docstring available._ |
| `tests.test_commands` | `tests/test_commands.py` | _No docstring available._ |
| `tests.test_embeddings` | `tests/test_embeddings.py` | _No docstring available._ |
| `tests.test_git_committer` | `tests/test_git_committer.py` | Legacy Git committer test shim. |
| `tests.test_git_committer_checks` | `tests/test_git_committer_checks.py` | _No docstring available._ |
| `tests.test_git_committer_sandbox` | `tests/test_git_committer_sandbox.py` | _No docstring available._ |
| `tests.test_goal_manager` | `tests/test_goal_manager.py` | _No docstring available._ |
| `tests.test_harmony_prompt_utils` | `tests/test_harmony_prompt_utils.py` | _No docstring available._ |
| `tests.test_harmony_tool_call` | `tests/test_harmony_tool_call.py` | _No docstring available._ |
| `tests.test_high_level_goal_manager` | `tests/test_high_level_goal_manager.py` | _No docstring available._ |
| `tests.test_inline_tool_call` | `tests/test_inline_tool_call.py` | _No docstring available._ |
| `tests.test_labels_parser` | `tests/test_labels_parser.py` | _No docstring available._ |
| `tests.test_llm_benchmark` | `tests/test_llm_benchmark.py` | _No docstring available._ |
| `tests.test_llm_service_triton` | `tests/test_llm_service_triton.py` | _No docstring available._ |
| `tests.test_main_periodic_commits` | `tests/test_main_periodic_commits.py` | _No docstring available._ |
| `tests.test_mark_done_if_merged` | `tests/test_mark_done_if_merged.py` | _No docstring available._ |
| `tests.test_memory_bank` | `tests/test_memory_bank.py` | _No docstring available._ |
| `tests.test_memory_query` | `tests/test_memory_query.py` | _No docstring available._ |
| `tests.test_multi_agent_planner` | `tests/test_multi_agent_planner.py` | _No docstring available._ |
| `tests.test_openai_tool_call` | `tests/test_openai_tool_call.py` | _No docstring available._ |
| `tests.test_outbox` | `tests/test_outbox.py` | _No docstring available._ |
| `tests.test_outbox_replay` | `tests/test_outbox_replay.py` | _No docstring available._ |
| `tests.test_outbox_worker` | `tests/test_outbox_worker.py` | _No docstring available._ |
| `tests.test_pr_integration` | `tests/test_pr_integration.py` | _No docstring available._ |
| `tests.test_pre_commit_review` | `tests/test_pre_commit_review.py` | _No docstring available._ |
| `tests.test_prompt_guard` | `tests/test_prompt_guard.py` | _No docstring available._ |
| `tests.test_recursive_thinker_loop` | `tests/test_recursive_thinker_loop.py` | _No docstring available._ |
| `tests.test_review_change_set` | `tests/test_review_change_set.py` | _No docstring available._ |
| `tests.test_review_staged_changes` | `tests/test_review_staged_changes.py` | _No docstring available._ |
| `tests.test_roadmap_committer` | `tests/test_roadmap_committer.py` | _No docstring available._ |
| `tests.test_roadmap_sync` | `tests/test_roadmap_sync.py` | _No docstring available._ |
| `tests.test_roadmap_updater` | `tests/test_roadmap_updater.py` | _No docstring available._ |
| `tests.test_run_checks` | `tests/test_run_checks.py` | _No docstring available._ |
| `tests.test_safe_update` | `tests/test_safe_update.py` | _No docstring available._ |
| `tests.test_sandbox` | `tests/test_sandbox.py` | _No docstring available._ |
| `tests.test_self_review` | `tests/test_self_review.py` | _No docstring available._ |
| `tests.test_self_review_smoke` | `tests/test_self_review_smoke.py` | _No docstring available._ |
| `tests.test_spawn_followup_task` | `tests/test_spawn_followup_task.py` | _No docstring available._ |
| `tests.test_task_pipeline` | `tests/test_task_pipeline.py` | _No docstring available._ |
| `tests.test_thoughts_summary` | `tests/test_thoughts_summary.py` | _No docstring available._ |
| `tests.test_transformers_default_model` | `tests/test_transformers_default_model.py` | _No docstring available._ |
| `tests.test_triton_provider` | `tests/test_triton_provider.py` | _No docstring available._ |
| `tests.test_ts_support` | `tests/test_ts_support.py` | _No docstring available._ |
| `tests.test_v2_modes` | `tests/test_v2_modes.py` | _No docstring available._ |
| `tools.auto_label_pr` | `tools/auto_label_pr.py` | Apply labels to the current pull request based on `tasks.md` metadata. |
| `tools.mark_done_if_merged` | `tools/mark_done_if_merged.py` | _No docstring available._ |
| `tools.nav.build_module_index` | `tools/nav/build_module_index.py` | Build a repository-wide index of Python packages and modules. |
| `tools.preview_task_status` | `tools/preview_task_status.py` | _No docstring available._ |
| `tools.propose_pr` | `tools/propose_pr.py` | _No docstring available._ |
| `tools.roadmap_sync` | `tools/roadmap_sync.py` | _No docstring available._ |
| `tools.smoke_backend` | `tools/smoke_backend.py` | Run a simple backend smoke test. |

#### Details for `forgekeeper-v2.scripts.demo_duet`

**Functions**
- `main` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_events`

**Functions**
- `test_jsonl_recorder_roundtrip` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_llm_openai`

**Classes**
- `_CreateSequence` – _No docstring available._
- `_StubMessage` – _No docstring available._
- `_StubChoice` – _No docstring available._
- `_StubResponse` – _No docstring available._

**Functions**
- `test_stream_handles_structured_reasoning` – _No docstring available._
- `test_stream_falls_back_to_completion_text` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_memory_agentic_basic`

**Functions**
- `test_agentic_store_roundtrip` – _No docstring available._
- `test_retriever_sets_context` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_orchestrator_duet`

**Functions**
- `test_orchestrator_duet_runs` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_policies`

**Functions**
- `test_trigger_policy_basic` – _No docstring available._
- `test_floor_policy_preemption` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_tools_powershell`

**Functions**
- `test_tool_powershell_basic` – _No docstring available._

#### Details for `forgekeeper-v2.tests.test_tools_shell`

**Functions**
- `test_tool_shell_echo` – _No docstring available._

#### Details for `forgekeeper-v2.tmp_fk_o_test`

**Functions**
- `main` – _No docstring available._

#### Details for `forgekeeper-v2.tmp_fk_o_test_run_tmp`

**Functions**
- `main` – _No docstring available._

#### Details for `scripts.download_hf_model`

**Functions**
- `main` – _No docstring available._

#### Details for `scripts.fft_visualizer`

**Functions**
- `load_model` – Load a model and its tokenizer.
- `main` – _No docstring available._

#### Details for `scripts.generate_roadmap_yaml`

**Functions**
- `parse` – _No docstring available._
- `to_yaml` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.generate_tasks_from_roadmap`

**Functions**
- `parse_tasks` – _No docstring available._
- `render` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.infer_cli`

**Functions**
- `_normalize_base_url` – Ensure the base URL contains the ``/v1`` prefix expected by OpenAI APIs.
- `build_headers` – _No docstring available._
- `build_payload` – _No docstring available._
- `_default_base_url` – _No docstring available._
- `parse_args` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.llm_benchmark`

**Functions**
- `_load_backend` – _No docstring available._
- `_make_prompt` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.llm_smoke_test`

**Functions**
- `main` – _No docstring available._

#### Details for `scripts.mqtt_forgekeeper_listener`

**Functions**
- `process_forgekeeper_message` – Stub handler for Forgekeeper messages.
- `on_connect` – _No docstring available._
- `on_disconnect` – _No docstring available._
- `on_message` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.smoke_e2e_roundtrip`

**Functions**
- `post_json` – _No docstring available._
- `gql_append` – _No docstring available._
- `run_cli` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.smoke_graphql_append`

**Functions**
- `post_json` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.update_file_summary`

**Functions**
- `git_tracked_files` – Return a sorted list of tracked file paths relative to repo root.
- `first_line` – Return the first line of a file, or note if binary/empty.
- `build_summary` – _No docstring available._
- `main` – _No docstring available._

#### Details for `scripts.update_requirements`

**Functions**
- `main` – _No docstring available._

#### Details for `scripts.wait_for_url`

**Functions**
- `wait_for` – _No docstring available._
- `main` – _No docstring available._

#### Details for `tests.git_committer.conftest`

**Functions**
- `init_repo` – _No docstring available._

#### Details for `tests.git_committer.test_abort_paths`

**Functions**
- `test_failing_checks_abort_commit` – _No docstring available._
- `test_diff_validation_blocks_commit` – _No docstring available._
- `test_diff_validation_allows_consistent_changes` – _No docstring available._

#### Details for `tests.git_committer.test_checks`

**Functions**
- `test_python_checks_selected` – _No docstring available._
- `test_ts_checks_selected` – _No docstring available._
- `test_py_and_ts_checks_selected` – _No docstring available._
- `test_no_checks_when_no_supported_files` – _No docstring available._

#### Details for `tests.git_committer.test_diff_validation`

**Functions**
- `test_diff_validation_blocks_commit` – _No docstring available._
- `test_diff_validation_allows_consistent_changes` – _No docstring available._

#### Details for `tests.git_committer.test_push`

**Functions**
- `test_changelog_returned` – _No docstring available._
- `test_outcome_logged_to_memory` – _No docstring available._

#### Details for `tests.high_level_goal_manager.conftest`

**Functions**
- `repo_root` – Return the repository root path.

#### Details for `tests.high_level_goal_manager.test_autonomy_loop`

**Functions**
- `test_periodic_run_expands_and_executes` – Complex goals are split into subtasks and executed periodically.
- `test_periodic_run_executes_single_task` – Simple goals execute without manual triggers.

#### Details for `tests.high_level_goal_manager.test_delegator`

**Functions**
- `test_label_based_agent_selection` – _No docstring available._
- `test_success_history_agent_selection` – _No docstring available._

#### Details for `tests.high_level_goal_manager.test_planner`

**Classes**
- `DummyTask` – _No docstring available._
- `DummyPipeline` – _No docstring available._

**Functions**
- `test_autonomous_manager_triggers_pipeline` – High-level manager invokes pipeline when autonomous.
- `test_manager_no_autonomy` – Manager returns immediately when not autonomous.
- `test_complex_goal_breakdown` – Planner splits complex descriptions into subtasks.

#### Details for `tests.memory.conftest`

**Functions**
- `repo_root` – Return the repository root path.

#### Details for `tests.memory.test_append_and_tail`

**Functions**
- `test_append_and_tail` – _No docstring available._

#### Details for `tests.memory.test_backends_interface`

**Classes**
- `_DummyBackend` – _No docstring available._

**Functions**
- `test_memory_entry_roundtrip_preserves_metadata` – _No docstring available._
- `test_get_memory_backend_uses_configuration` – _No docstring available._

#### Details for `tests.memory.test_cli_utils`

**Functions**
- `test_recent_pushes_cli` – _No docstring available._

#### Details for `tests.memory.test_jsonl_backend`

**Functions**
- `test_jsonl_backend_reads_existing_file` – _No docstring available._

#### Details for `tests.memory_agentic.test_ast_patcher`

**Functions**
- `test_docstring_patch` – _No docstring available._

#### Details for `tests.memory_agentic.test_cli`

**Functions**
- `run_cli` – _No docstring available._
- `test_cli_list` – _No docstring available._
- `test_cli_run_and_shadow` – _No docstring available._

#### Details for `tests.memory_agentic.test_orchestrator`

**Classes**
- `DummyAgent` – _No docstring available._

**Functions**
- `test_ranking_and_merge` – _No docstring available._

#### Details for `tests.memory_agentic.test_persistence`

**Functions**
- `test_render_system_prompt` – _No docstring available._

#### Details for `tests.memory_agentic.test_retrieval`

**Functions**
- `test_index_and_search` – _No docstring available._

#### Details for `tests.memory_agentic.test_teh_typo`

**Functions**
- `test_typo_replacement` – _No docstring available._
- `test_no_identifier_url_changes` – _No docstring available._
- `test_multiple_occurrences_stable` – _No docstring available._

#### Details for `tests.task_queue.conftest`

**Classes**
- `StubMemoryBackend` – _No docstring available._

**Functions**
- `tasks_file` – _No docstring available._
- `queue_from_text` – _No docstring available._

#### Details for `tests.task_queue.test_parser`

**Functions**
- `test_front_matter_skips_completed` – _No docstring available._
- `test_checkbox_tasks_ignore_completed` – _No docstring available._
- `test_legacy_checkbox_fallback` – _No docstring available._

#### Details for `tests.task_queue.test_queue_helpers`

**Functions**
- `test_find_canonical_tasks` – _No docstring available._
- `test_select_best_task_prefers_canonical` – _No docstring available._
- `test_select_best_task_falls_back` – _No docstring available._

#### Details for `tests.task_queue.test_queue_ops`

**Functions**
- `test_next_task_priority_ordering` – _No docstring available._
- `test_state_persistence` – _No docstring available._
- `test_next_task_priority_and_fifo` – _No docstring available._

#### Details for `tests.task_queue.test_weighting`

**Functions**
- `test_memory_weight_affects_order` – _No docstring available._
- `test_similarity_recall_affects_order` – _No docstring available._

#### Details for `tests.test_change_stager`

**Functions**
- `init_repo` – _No docstring available._
- `test_diff_and_stage_changes_success` – _No docstring available._
- `test_diff_and_stage_changes_failure` – _No docstring available._
- `test_diff_and_stage_changes_dry_run` – _No docstring available._
- `test_diff_and_stage_changes_accumulates` – _No docstring available._
- `test_diff_and_stage_changes_runs_sandbox` – _No docstring available._

#### Details for `tests.test_chat_session`

**Functions**
- `test_generate_response` – _No docstring available._

#### Details for `tests.test_cli_wrapper`

**Functions**
- `_fake_result` – _No docstring available._
- `test_main_invokes_start_wrapper` – _No docstring available._
- `test_main_cli_only_passthrough` – _No docstring available._
- `test_windows_extra_args_not_supported` – _No docstring available._
- `test_stack_child_env` – _No docstring available._

#### Details for `tests.test_code_edit`

**Functions**
- `test_generate_code_edit_returns_diff` – _No docstring available._
- `test_apply_unified_diff` – _No docstring available._

#### Details for `tests.test_commands`

**Functions**
- `test_add_command_appends_canonical_task` – _No docstring available._
- `test_pushes_flag_displays_recent_pushes` – _No docstring available._

#### Details for `tests.test_embeddings`

**Functions**
- `test_vector_storage` – _No docstring available._
- `test_blended_scoring` – _No docstring available._
- `test_store_embeddings_persist` – Embeddings are stored and retrieved from the default SQLite path.
- `test_cosine_similarity_influences_ranking` – Cosine similarity from embeddings affects file ranking.

#### Details for `tests.test_git_committer_checks`

**Functions**
- `test_git_committer_checks` – _No docstring available._

#### Details for `tests.test_git_committer_sandbox`

**Functions**
- `test_commit_aborts_when_sandbox_fails` – _No docstring available._

#### Details for `tests.test_goal_manager`

**Functions**
- `test_goal_lifecycle` – _No docstring available._
- `test_deactivate_missing` – _No docstring available._

#### Details for `tests.test_harmony_prompt_utils`

**Functions**
- `test_extract_directives` – _No docstring available._
- `test_extract_directives_multiple` – _No docstring available._

#### Details for `tests.test_harmony_tool_call`

**Functions**
- `test_harmony_tool_call` – _No docstring available._

#### Details for `tests.test_high_level_goal_manager`

**Functions**
- `test_autonomous_manager_triggers_pipeline` – _No docstring available._
- `test_manager_no_autonomy` – _No docstring available._
- `test_complex_goal_breakdown` – _No docstring available._
- `test_label_based_agent_selection` – _No docstring available._
- `test_success_history_agent_selection` – _No docstring available._

#### Details for `tests.test_inline_tool_call`

**Functions**
- `test_inline_tool_call` – _No docstring available._

#### Details for `tests.test_labels_parser`

**Functions**
- `test_parse_tasks_md_multiple_blocks` – _No docstring available._
- `test_parse_tasks_md_ignores_missing_id` – _No docstring available._

#### Details for `tests.test_llm_benchmark`

**Functions**
- `test_run_benchmark_calls_warmup` – _No docstring available._

#### Details for `tests.test_llm_service_triton`

**Functions**
- `test_triton_request` – _No docstring available._
- `test_triton_harmony_format` – _No docstring available._

#### Details for `tests.test_main_periodic_commits`

**Functions**
- `test_main_starts_periodic_commits` – _No docstring available._

#### Details for `tests.test_mark_done_if_merged`

**Functions**
- `_write_tasks` – _No docstring available._
- `test_marks_done_when_pr_merged` – _No docstring available._
- `test_no_change_when_pr_open` – _No docstring available._
- `test_check_reviewed_tasks_invokes_for_each_id` – _No docstring available._

#### Details for `tests.test_memory_bank`

**Classes**
- `DummyCollection` – _No docstring available._

**Functions**
- `setup_bank` – _No docstring available._
- `test_add_update_list_delete` – _No docstring available._
- `test_evaluate_relevance_scores` – _No docstring available._

#### Details for `tests.test_memory_query`

**Functions**
- `test_query_similar_tasks` – _No docstring available._

#### Details for `tests.test_multi_agent_planner`

**Functions**
- `test_planner_registers_custom_agent_and_protocol` – _No docstring available._
- `test_direct_message_roundtrip` – _No docstring available._
- `test_subtask_distribution_across_agents` – _No docstring available._
- `test_broadcast_context_shared_across_agents` – _No docstring available._
- `test_goal_manager_routes_and_handoffs_between_agents` – _No docstring available._
- `test_planner_includes_memory_context` – _No docstring available._

#### Details for `tests.test_openai_tool_call`

**Functions**
- `test_openai_tool_call` – _No docstring available._

#### Details for `tests.test_outbox`

**Functions**
- `test_outbox_records_and_replays` – _No docstring available._

#### Details for `tests.test_outbox_replay`

**Functions**
- `test_replay_pending_executes_action` – _No docstring available._
- `test_failed_action_remains_and_replays` – _No docstring available._

#### Details for `tests.test_outbox_worker`

**Functions**
- `test_worker_retries_and_logs` – _No docstring available._

#### Details for `tests.test_pr_integration`

**Functions**
- `test_pr_creation_and_status_update` – _No docstring available._

#### Details for `tests.test_pre_commit_review`

**Functions**
- `setup_repo` – _No docstring available._
- `test_pre_commit_review_blocks_commit` – _No docstring available._
- `test_pre_commit_review_acknowledged_allows_commit` – _No docstring available._

#### Details for `tests.test_prompt_guard`

**Functions**
- `test_blocks_injection_phrase` – _No docstring available._
- `test_escapes_control_tokens` – _No docstring available._

#### Details for `tests.test_recursive_thinker_loop`

**Functions**
- `test_recursive_thinker_start_stop` – _No docstring available._

#### Details for `tests.test_review_change_set`

**Functions**
- `test_review_change_set_integration` – _No docstring available._
- `test_review_change_set_detects_changed` – _No docstring available._

#### Details for `tests.test_review_staged_changes`

**Functions**
- `test_review_staged_changes_integration` – _No docstring available._
- `test_review_staged_changes_detects_staged` – _No docstring available._

#### Details for `tests.test_roadmap_committer`

**Functions**
- `test_generate_sprint_plan` – _No docstring available._
- `test_start_periodic_commits_env_and_summary` – _No docstring available._

#### Details for `tests.test_roadmap_sync`

**Functions**
- `test_parse_tasks_md` – _No docstring available._
- `test_format_task_block_roundtrip` – _No docstring available._
- `test_sync_status_updates` – _No docstring available._

#### Details for `tests.test_roadmap_updater`

**Functions**
- `init_repo` – _No docstring available._
- `test_update_roadmap_appends` – _No docstring available._
- `test_commit_logs_memory` – _No docstring available._

#### Details for `tests.test_run_checks`

**Functions**
- `_fake_run_tool_factory` – _No docstring available._
- `test_run_checks_pass` – _No docstring available._
- `test_run_checks_fail` – _No docstring available._

#### Details for `tests.test_safe_update`

**Functions**
- `test_failed_self_review_resets_commit` – _No docstring available._

#### Details for `tests.test_sandbox`

**Functions**
- `test_sandbox_runs_commands` – _No docstring available._

#### Details for `tests.test_self_review`

**Functions**
- `_fake_run_factory` – _No docstring available._
- `test_run_self_review_pass` – _No docstring available._
- `test_run_self_review_fails_when_tests_missing` – _No docstring available._
- `test_run_self_review_fails_llm` – _No docstring available._

#### Details for `tests.test_self_review_smoke`

**Functions**
- `init_repo` – _No docstring available._
- `commit_backend_change` – _No docstring available._
- `test_smoke_test_pass` – _No docstring available._
- `test_smoke_test_fail` – _No docstring available._
- `_stub_pipeline` – _No docstring available._
- `test_pipeline_aborts_on_failed_commit` – _No docstring available._
- `test_pipeline_propagates_review_status` – _No docstring available._

#### Details for `tests.test_spawn_followup_task`

**Functions**
- `setup_env` – _No docstring available._
- `_prep_files` – _No docstring available._
- `test_spawn_task_on_self_review_failure` – _No docstring available._
- `test_no_spawn_when_self_review_passes` – _No docstring available._

#### Details for `tests.test_task_pipeline`

**Functions**
- `_capture_goal_add` – _No docstring available._
- `test_next_task_marks_in_progress` – _No docstring available._
- `test_run_next_task_selection_and_completion` – _No docstring available._
- `test_run_next_task_executor_updates_status` – _No docstring available._
- `test_executor_applies_edits` – _No docstring available._
- `test_pipeline_loop_persists_history` – _No docstring available._
- `test_default_executor_parses_guidelines` – _No docstring available._
- `test_pipeline_accepts_injected_strategies` – _No docstring available._

#### Details for `tests.test_thoughts_summary`

**Functions**
- `test_summarize_thoughts_with_emotion` – _No docstring available._

#### Details for `tests.test_transformers_default_model`

**Functions**
- `test_transformers_default_model` – _No docstring available._
- `test_tiny_model_overrides_other_settings` – _No docstring available._

#### Details for `tests.test_triton_provider`

**Functions**
- `test_fake_response` – Triton provider returns fake response when stubbed.
- `test_missing_model_path_raises` – Missing TRITON_MODEL env var triggers a clear error.

#### Details for `tests.test_ts_support`

**Functions**
- `test_ts_summary_extraction` – _No docstring available._
- `test_tsx_summary_extraction` – _No docstring available._
- `test_analyzer_ranks_ts_files` – _No docstring available._

#### Details for `tests.test_v2_modes`

**Classes**
- `EchoTool` – _No docstring available._

**Functions**
- `test_single_mode_records_events` – _No docstring available._
- `test_duet_mode_records_events` – _No docstring available._
- `test_tool_events_recorded` – _No docstring available._
- `test_inbox_messages_are_ingested` – _No docstring available._
- `test_orchestrator_allows_custom_contracts` – _No docstring available._

#### Details for `tools.auto_label_pr`

**Functions**
- `repo_slug_from_env_or_git` – Prefer GITHUB_REPOSITORY env var; fallback to `git remote origin`.
- `main` – _No docstring available._

#### Details for `tools.mark_done_if_merged`

**Classes**
- `Task` – _No docstring available._

**Functions**
- `parse_tasks_md` – _No docstring available._
- `format_task_block` – _No docstring available._
- `write_tasks_md` – _No docstring available._
- `gh_repo_slug` – _No docstring available._
- `fetch_prs_for_task` – _No docstring available._
- `mark_done_if_merged` – _No docstring available._
- `main` – _No docstring available._

#### Details for `tools.nav.build_module_index`

**Classes**
- `DefinitionSummary` – Description of a top-level class or function.
- `ModuleSummary` – Summary of a Python module.
- `PackageSummary` – Summary of a Python package.

**Functions**
- `normalize_docstring` – _No docstring available._
- `short_doc` – Return a single-line summary for Markdown output.
- `parse_python_file` – Parse a Python module and capture its docstrings.
- `module_name_from_path` – _No docstring available._
- `iter_python_files` – _No docstring available._
- `find_package_parts` – _No docstring available._
- `attach_modules_to_packages` – _No docstring available._
- `build_index` – _No docstring available._
- `render_markdown` – _No docstring available._
- `render_module_details` – _No docstring available._
- `parse_args` – _No docstring available._
- `main` – _No docstring available._

#### Details for `tools.preview_task_status`

**Functions**
- `parse_tasks_md` – _No docstring available._
- `gh` – _No docstring available._
- `main` – _No docstring available._

#### Details for `tools.propose_pr`

**Functions**
- `slugify` – _No docstring available._
- `pick_next` – _No docstring available._
- `run` – _No docstring available._
- `main` – _No docstring available._

#### Details for `tools.roadmap_sync`

**Functions**
- `main` – _No docstring available._

#### Details for `tools.smoke_backend`

**Functions**
- `main` – _No docstring available._
