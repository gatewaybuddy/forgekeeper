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
class TaskPipeline:
    """High-level helper around :class:`~forgekeeper.core.tasks.queue.TaskQueue`."""

    task_file: Optional[Path | str] = None
    queue: TaskQueue = field(init=False)
    last_task: Optional[Dict[str, Any]] = field(default=None, init=False)
    repo_root: Path = field(init=False)

    def __post_init__(self) -> None:
        self.queue = TaskQueue(self.task_file)
        self.task_file = self.queue.path
        self.repo_root = Path(self.task_file).resolve().parent

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
        plan_payload: Dict[str, Any] | None = None
        structured_guidelines = bool(guidelines.strip()) and guidelines.lstrip().startswith(("{", "["))
        if default_executor_used and not structured_guidelines and not any(key in selection for key in ("executor_payload", "executor", "instructions")):
            plan_payload = plan_for_task(selection, guidelines=guidelines, repo_root=self.repo_root)
            selection.setdefault("executor_payload", plan_payload)
        else:
            payload_candidate = selection.get("executor_payload") or selection.get("executor") or selection.get("instructions")
            if isinstance(payload_candidate, dict):
                plan_payload = payload_candidate  # best effort
        self.last_task = selection

        description = self.describe_task(selection)
        task_id = str(selection.get("id") or selection.get("task_id") or "manual")
        result: Dict[str, Any] = {
            "task": selection,
            "status": "selected",
            "guidelines": guidelines,
            "auto_complete": auto_complete,
        }
        if plan_payload:
            if "plan" in plan_payload:
                result["plan"] = plan_payload.get("plan")
            if "ranked_files" in plan_payload:
                result["ranked_files"] = plan_payload.get("ranked_files")

        stage_results: list[dict[str, Any]] = []
        commit_result: dict[str, Any] | None = None
        execution: Dict[str, Any] | None = None

        if executor is not None:
            try:
                execution = executor(selection, guidelines)
            except Exception as exc:  # pragma: no cover - defensive wrapper
                execution = {"status": "failed", "error": str(exc)}
            result["execution"] = execution
            exec_status = str(execution.get("status", "") or "").strip().lower()
            if exec_status:
                result["status"] = exec_status
                if exec_status in {"completed", "done", "needs_review", "blocked", "deferred"}:
                    self._apply_status(description, exec_status)

            edits = execution.get("edits") if isinstance(execution, dict) else None
            if edits:
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
                    stage_result = diff_and_stage_changes(
                        original,
                        modified,
                        path,
                        auto_stage=payload.get("auto_stage", True),
                        dry_run=payload.get("dry_run", default_dry_run),
                        task_id=payload.get("task_id", task_id),
                        run_sandbox=payload.get("run_sandbox", default_run_sandbox),
                        extra_files=payload.get("extra_files"),
                    )
                    stage_results.append({"path": str(path), "result": stage_result})
                    outcome = str(stage_result.get("outcome", ""))
                    if outcome and outcome not in {"success", "dry-run"}:
                        result["status"] = outcome

                if stage_results:
                    result["stage"] = stage_results

            if execution and execution.get("commit"):
                commit_message = execution.get("commit_message") or f"Task {description}".strip()
                commit_kwargs = {
                    "create_branch": bool(execution.get("create_branch", False)),
                    "branch_prefix": execution.get("branch_prefix", "forgekeeper/self-edit"),
                    "run_checks": bool(execution.get("run_checks", True)),
                    "commands": execution.get("commands"),
                    "autonomous": bool(execution.get("autonomous", True)),
                    "task_id": execution.get("task_id", task_id),
                    "auto_push": execution.get("auto_push"),
                    "rationale": execution.get("rationale"),
                }
                commit_result = commit_and_push_changes(commit_message, **commit_kwargs)
                result["commit"] = commit_result
                if commit_result.get("passed") and not commit_result.get("aborted"):
                    result["status"] = "committed"
                    self.mark_done(description)

        if auto_complete:
            self.mark_done(description)
            result["status"] = "completed"

        result["task_status"] = selection.get("status")
        if stage_results and "stage" not in result:
            result["stage"] = stage_results
        if commit_result and "commit" not in result:
            result["commit"] = commit_result

        return result

    def undo_last_task(self) -> Optional[Dict[str, Any]]:  # pragma: no cover - placeholder
        """Placeholder undo hook until the git undo flow is ported."""
        return None


__all__ = ["TaskPipeline"]
