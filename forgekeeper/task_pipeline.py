"""Scheduler for selecting and updating tasks from ``tasks.md``.

This module wraps :class:`forgekeeper.task_queue.TaskQueue` to expose the
highest priority task to the agent loop. The selected task is registered with
``goal_manager`` so that other components can retrieve it via the existing goal
APIs. Progress on tasks is persisted back to ``tasks.md`` through the
``TaskQueue.mark_*`` methods.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict
import json

from .task_queue import TaskQueue
from . import goal_manager
from .file_summarizer import summarize_repository
from .file_analyzer import analyze_repo_for_task
from .code_editor import generate_code_edit, apply_unified_diff
from .change_stager import diff_and_stage_changes
from .git_committer import commit_and_push_changes

TASK_FILE = Path(__file__).resolve().parents[1] / "tasks.md"


class TaskPipeline:
    """Coordinate task scheduling and persistence."""

    def __init__(self, task_file: Path = TASK_FILE) -> None:
        self.queue = TaskQueue(task_file)

    # ------------------------------------------------------------------
    # Task selection
    def next_task(self) -> Optional[Dict]:
        """Return the highest priority task metadata.

        Tasks are sourced via :meth:`TaskQueue.next_task`, which supports both
        YAML front-matter and legacy checkbox definitions. Only tasks with
        ``status`` in {``todo``, ``in_progress``} are returned. The description
        is registered with :mod:`goal_manager` for downstream consumption. If a
        corresponding legacy checkbox task exists it is marked in progress.
        """

        meta = self.queue.next_task()
        if not meta or meta.get("status") not in {"todo", "in_progress"}:
            return None

        desc = meta.get("title") or meta.get("description") or ""
        try:  # Best effort – goal_manager may be unavailable during tests
            goal_manager.add_goal(desc, source="task_queue")
        except Exception:  # pragma: no cover - defensive
            pass

        task = self.queue.get_task(desc)
        if task:
            self.queue.mark_in_progress(task)

        return meta

    # ------------------------------------------------------------------
    # End-to-end execution
    def run_next_task(self, guidelines: str = "") -> Optional[Dict]:
        """Run the highest priority task through the edit pipeline.

        The task is fetched via :meth:`next_task` and processed through
        summarization, relevance analysis, code editing, staging, and commit.
        On a successful commit the task is marked done; otherwise it is marked
        as needing review. The commit result dictionary is returned or ``None``
        when no task is available.
        """

        meta = self.next_task()
        if not meta:
            return None

        desc = meta.get("title") or meta.get("description") or ""
        task_id = meta.get("id", "manual")

        summaries = summarize_repository()
        summaries_path = Path("forgekeeper/summaries.json")
        summaries_path.parent.mkdir(parents=True, exist_ok=True)
        summaries_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")

        ranked = analyze_repo_for_task(desc, str(summaries_path))
        for item in ranked:
            file_path = item["file"]
            summary = item.get("summary", "")
            p = Path(file_path)
            if not p.exists():
                continue
            original = p.read_text(encoding="utf-8")
            patch = generate_code_edit(desc, file_path, summary, guidelines)
            changed = apply_unified_diff(patch)
            if file_path in changed or str(p) in changed:
                modified = p.read_text(encoding="utf-8")
                diff_and_stage_changes(original, modified, file_path, task_id=task_id)
                break

        result = commit_and_push_changes(desc, task_id=task_id)
        if result.get("passed"):
            self.mark_done(desc)
        else:
            self.mark_needs_review(desc)
        return result

    # ------------------------------------------------------------------
    # Progress helpers
    def mark_done(self, description: str) -> None:
        """Mark the task with ``description`` as completed."""

        task = self.queue.get_task(description)
        if task:
            self.queue.mark_done(task)

    def mark_needs_review(self, description: str) -> None:
        """Mark the task with ``description`` as needing review."""

        task = self.queue.get_task(description)
        if task:
            self.queue.mark_needs_review(task)
