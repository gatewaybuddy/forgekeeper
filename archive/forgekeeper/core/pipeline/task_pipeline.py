"""Task pipeline coordinator built on the unified task queue."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from goal_manager import storage as goal_storage

from forgekeeper.logger import get_logger
from forgekeeper.core.change_stager import diff_and_stage_changes
from forgekeeper.core.git.committer import commit_and_push_changes
from forgekeeper.core.tasks import TaskQueue
from forgekeeper.core.planning import plan_for_task
from forgekeeper.core.tasks.parser import ChecklistTask

LOG = get_logger(__name__)

TaskExecutor = Callable[[dict[str, Any], str], Dict[str, Any]]


@dataclass
class PlanningContext:
    """Context shared with planning strategies."""

    task: Dict[str, Any]
    guidelines: str
    repo_root: Path
    default_executor_used: bool
    structured_guidelines: bool
    existing_payload: Optional[Dict[str, Any]] = None


@dataclass
class StageRequest:
    """Context for staging an individual edit."""

    original: str
    modified: str
    path: Path
    auto_stage: bool
    dry_run: bool
    task_id: str
    run_sandbox: bool
    extra_files: Optional[Any] = None


@dataclass
class CommitRequest:
    """Context for committing staged changes."""

    message: str
    create_branch: bool
    branch_prefix: str
    run_checks: bool
    commands: Optional[Any]
    autonomous: bool
    task_id: str
    auto_push: Optional[bool]
    rationale: Optional[str]


@dataclass
class TaskLifecycleContext:
    """State shared across lifecycle phases for ``run_next_task``."""

    selection: Dict[str, Any]
    description: str
    guidelines: str
    task_id: str
    repo_root: Path
    auto_complete: bool
    executor: Optional[TaskExecutor]
    default_executor_used: bool
    structured_guidelines: bool
    result: Dict[str, Any]
    plan_payload: Optional[Dict[str, Any]] = None
    execution: Optional[Dict[str, Any]] = None
    stage_results: list[dict[str, Any]] = field(default_factory=list)
    commit_result: Optional[Dict[str, Any]] = None


PlannerStrategy = Callable[[PlanningContext], Optional[Dict[str, Any]]]
StageStrategy = Callable[[StageRequest], Dict[str, Any]]
CommitStrategy = Callable[[CommitRequest], Dict[str, Any]]


def _default_planner(context: PlanningContext) -> Optional[Dict[str, Any]]:
    existing = context.existing_payload
    if isinstance(existing, dict):
        return existing
    if context.default_executor_used and not context.structured_guidelines:
        return plan_for_task(context.task, guidelines=context.guidelines, repo_root=context.repo_root)
    return None


def _default_stager(request: StageRequest) -> Dict[str, Any]:
    return diff_and_stage_changes(
        request.original,
        request.modified,
        request.path,
        auto_stage=request.auto_stage,
        dry_run=request.dry_run,
        task_id=request.task_id,
        run_sandbox=request.run_sandbox,
        extra_files=request.extra_files,
    )


def _default_committer(request: CommitRequest) -> Dict[str, Any]:
    return commit_and_push_changes(
        request.message,
        create_branch=request.create_branch,
        branch_prefix=request.branch_prefix,
        run_checks=request.run_checks,
        commands=request.commands,
        autonomous=request.autonomous,
        task_id=request.task_id,
        auto_push=request.auto_push,
        rationale=request.rationale,
    )


@dataclass
class TaskPipeline:
    """High-level helper around :class:`~forgekeeper.core.tasks.queue.TaskQueue`."""

    task_file: Optional[Path | str] = None
    planner: PlannerStrategy | None = None
    stager: StageStrategy | None = None
    committer: CommitStrategy | None = None
    queue: TaskQueue = field(init=False)
    last_task: Optional[Dict[str, Any]] = field(default=None, init=False)
    repo_root: Path = field(init=False)

    def __post_init__(self) -> None:
        self.queue = TaskQueue(self.task_file)
        self.task_file = self.queue.path
        self.repo_root = Path(self.task_file).resolve().parent
        if self.planner is None:
            self.planner = _default_planner
        if self.stager is None:
            self.stager = _default_stager
        if self.committer is None:
            self.committer = _default_committer

    # ------------------------------------------------------------------
    def _locate(self, description: str) -> Optional[ChecklistTask]:
        if not description:
            return None
        return self.queue.get_task(description)

    def _update_last_status(self, description: str, status: str) -> None:
        if self.last_task is None:
            return
        title = str(self.last_task.get("title") or "")
        desc = str(self.last_task.get("description") or "")
        if description in {title, desc}:
            self.last_task["status"] = status

    def _task_description(self, meta: Dict[str, Any]) -> str:
        return str(meta.get("title") or meta.get("description") or "").strip()

    def describe_task(self, meta: Dict[str, Any]) -> str:
        return self._task_description(meta)

    def _apply_status(self, description: str, status: str) -> None:
        if not description:
            return
        if status in {"completed", "done"}:
            self.mark_done(description)
        elif status == "needs_review":
            self.mark_needs_review(description)
        elif status == "blocked":
            self.mark_blocked(description)
        elif status == "deferred":
            self.defer(description)

    # ------------------------------------------------------------------
    def next_task(self) -> Optional[Dict[str, Any]]:
        """Return the next task metadata and mark it in progress if available."""

        meta = self.queue.next_task()
        if not meta:
            self.last_task = None
            return None

        meta = dict(meta)
        description = self.describe_task(meta)
        if description:
            try:
                goal_storage.add_goal(description, source="task_queue")
            except Exception:  # pragma: no cover - best-effort bookkeeping
                LOG.debug("Failed to register goal for task '%s'", description, exc_info=True)

        task = self._locate(description)
        if task:
            self.queue.mark_in_progress(task)
            meta["status"] = task.status
            meta["section"] = task.section
            meta["priority"] = task.priority

        self.last_task = meta
        return meta

    # ------------------------------------------------------------------
    def mark_done(self, description: str) -> None:
        task = self._locate(description)
        if task:
            self.queue.mark_done(task)
            self._update_last_status(description, "done")

    def mark_needs_review(self, description: str) -> None:
        task = self._locate(description)
        if task:
            self.queue.mark_needs_review(task)
            self._update_last_status(description, "needs_review")

    def mark_blocked(self, description: str) -> None:
        task = self._locate(description)
        if task:
            self.queue.mark_blocked(task)
            self._update_last_status(description, "blocked")

    def defer(self, description: str) -> None:
        task = self._locate(description)
        if task:
            self.queue.defer(task)
            self._update_last_status(description, "deferred")

    # ------------------------------------------------------------------
    def run_next_task(
        self,
        guidelines: str = "",
        *,
        auto_complete: bool = False,
        executor: TaskExecutor | None = None,
    ) -> Optional[Dict[str, Any]]:
        """Select the next task and track its execution lifecycle."""

        default_executor_used = False
        if executor is None:
            try:
                from .executor import build_default_executor  # type: ignore
            except Exception:
                build_default_executor = None  # type: ignore
            if build_default_executor is not None:
                executor = build_default_executor()
                default_executor_used = True

        selection = self.last_task or self.next_task()
        if not selection:
            return None

        selection = dict(selection)
        selection.setdefault("_repo_root", str(self.repo_root))
        structured_guidelines = bool(guidelines.strip()) and guidelines.lstrip().startswith(("{", "["))
        description = self.describe_task(selection)
        task_id = str(selection.get("id") or selection.get("task_id") or "manual")
        result: Dict[str, Any] = {
            "task": selection,
            "status": "selected",
            "guidelines": guidelines,
            "auto_complete": auto_complete,
        }

        context = TaskLifecycleContext(
            selection=selection,
            description=description,
            guidelines=guidelines,
            task_id=task_id,
            repo_root=self.repo_root,
            auto_complete=auto_complete,
            executor=executor,
            default_executor_used=default_executor_used,
            structured_guidelines=structured_guidelines,
            result=result,
        )

        self.last_task = selection

        self._plan(context)
        self._execute(context)
        self._stage(context)
        self._commit(context)

        if auto_complete:
            self.mark_done(description)
            result["status"] = "completed"

        result["task_status"] = selection.get("status")
        if context.stage_results and "stage" not in result:
            result["stage"] = context.stage_results
        if context.commit_result and "commit" not in result:
            result["commit"] = context.commit_result

        return result

    # ------------------------------------------------------------------
    def _plan(self, context: TaskLifecycleContext) -> None:
        payload_candidate = context.selection.get("executor_payload") or context.selection.get("executor") or context.selection.get("instructions")
        existing_payload = payload_candidate if isinstance(payload_candidate, dict) else None
        planning_context = PlanningContext(
            task=context.selection,
            guidelines=context.guidelines,
            repo_root=context.repo_root,
            default_executor_used=context.default_executor_used,
            structured_guidelines=context.structured_guidelines,
            existing_payload=existing_payload,
        )
        plan_payload = self.planner(planning_context) if self.planner is not None else existing_payload
        if plan_payload is None and isinstance(existing_payload, dict):
            plan_payload = existing_payload

        context.plan_payload = plan_payload
        if plan_payload:
            context.selection.setdefault("executor_payload", plan_payload)
            if "plan" in plan_payload:
                context.result["plan"] = plan_payload.get("plan")
            if "ranked_files" in plan_payload:
                context.result["ranked_files"] = plan_payload.get("ranked_files")

    def _execute(self, context: TaskLifecycleContext) -> None:
        executor = context.executor
        if executor is None:
            return

        try:
            execution = executor(context.selection, context.guidelines)
        except Exception as exc:  # pragma: no cover - defensive wrapper
            execution = {"status": "failed", "error": str(exc)}

        context.execution = execution
        context.result["execution"] = execution

        exec_status = str(execution.get("status", "") or "").strip().lower() if isinstance(execution, dict) else ""
        if exec_status:
            context.result["status"] = exec_status
            if exec_status in {"completed", "done", "needs_review", "blocked", "deferred"}:
                self._apply_status(context.description, exec_status)

    def _stage(self, context: TaskLifecycleContext) -> None:
        execution = context.execution or {}
        edits = execution.get("edits") if isinstance(execution, dict) else None
        if not edits:
            return

        default_run_sandbox = bool(execution.get("run_sandbox", True))
        default_dry_run = bool(execution.get("dry_run", False))
        for payload in edits:
            path = Path(payload["path"])
            original = payload.get("original")
            if original is None and path.exists():
                original = path.read_text(encoding="utf-8")
            if original is None:
                original = ""
            modified = payload.get("modified", original)
            stage_request = StageRequest(
                original=original,
                modified=modified,
                path=path,
                auto_stage=payload.get("auto_stage", True),
                dry_run=payload.get("dry_run", default_dry_run),
                task_id=payload.get("task_id", context.task_id),
                run_sandbox=payload.get("run_sandbox", default_run_sandbox),
                extra_files=payload.get("extra_files"),
            )
            stage_strategy = self.stager or _default_stager
            stage_result = stage_strategy(stage_request)
            outcome = str(stage_result.get("outcome", ""))
            context.stage_results.append({"path": str(path), "result": stage_result})
            if outcome and outcome not in {"success", "dry-run"}:
                context.result["status"] = outcome

        if context.stage_results:
            context.result["stage"] = context.stage_results

    def _commit(self, context: TaskLifecycleContext) -> None:
        execution = context.execution or {}
        if not execution or not execution.get("commit"):
            return

        commit_message = execution.get("commit_message") or f"Task {context.description}".strip()
        commit_request = CommitRequest(
            message=commit_message,
            create_branch=bool(execution.get("create_branch", False)),
            branch_prefix=execution.get("branch_prefix", "forgekeeper/self-edit"),
            run_checks=bool(execution.get("run_checks", True)),
            commands=execution.get("commands"),
            autonomous=bool(execution.get("autonomous", True)),
            task_id=execution.get("task_id", context.task_id),
            auto_push=execution.get("auto_push"),
            rationale=execution.get("rationale"),
        )
        commit_strategy = self.committer or _default_committer
        commit_result = commit_strategy(commit_request)
        context.commit_result = commit_result
        context.result["commit"] = commit_result
        if commit_result.get("passed") and not commit_result.get("aborted"):
            context.result["status"] = "committed"
            self.mark_done(context.description)

    def undo_last_task(self) -> Optional[Dict[str, Any]]:  # pragma: no cover - placeholder
        """Placeholder undo hook until the git undo flow is ported."""
        return None


__all__ = ["TaskPipeline"]
