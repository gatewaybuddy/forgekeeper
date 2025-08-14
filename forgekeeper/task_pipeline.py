"""Scheduler for selecting and updating tasks from ``tasks.md``.

This module wraps :class:`forgekeeper.task_queue.TaskQueue` to expose the
highest priority task to the agent loop. The selected task is registered with
``goal_manager`` so that other components can retrieve it via the existing goal
APIs. Progress on tasks is persisted back to ``tasks.md`` through the
``TaskQueue.mark_*`` methods.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict, List, Any, Set
import json
import re

from .task_queue import TaskQueue
from . import goal_manager
from .file_summarizer import summarize_repository
from .file_analyzer import analyze_repo_for_task
from .code_editor import generate_code_edit, apply_unified_diff
from .change_stager import diff_and_stage_changes
from .git_committer import commit_and_push_changes
from .memory.episodic import append_entry
from git import Repo

TASK_FILE = Path(__file__).resolve().parents[1] / "tasks.md"


def sanitize_and_insert_tasks(tasks: List[Dict[str, Any]], task_file: Path = TASK_FILE) -> List[str]:
    """Sanitize and append canonical tasks to ``tasks.md``.

    Each task dictionary may contain ``id``, ``title``, ``status``, ``epic``,
    ``owner``, ``labels``, and ``body``/``description`` fields. Existing task
    IDs are preserved and duplicates are skipped. All string values are
    stripped and ``---`` sequences removed to avoid corrupting the YAML
    structure. A record of each inserted task is written to episodic memory.

    Parameters
    ----------
    tasks:
        Iterable of task dictionaries to insert.
    task_file:
        Optional path to the ``tasks.md`` file.

    Returns
    -------
    List[str]
        The IDs of tasks that were inserted.
    """

    text = task_file.read_text(encoding="utf-8") if task_file.exists() else ""
    existing = set(re.findall(r"^id:\s*(.+)$", text, flags=re.MULTILINE))
    if text and not text.endswith("\n"):
        text += "\n"

    def _clean(value: Any) -> str:
        return str(value).replace("---", "").strip()

    inserted: List[str] = []
    for raw in tasks:
        tid = _clean(raw.get("id", ""))
        if not tid or tid in existing:
            continue
        title = _clean(raw.get("title", ""))
        status = _clean(raw.get("status", "todo"))
        epic = _clean(raw.get("epic", ""))
        owner = _clean(raw.get("owner", ""))
        labels = raw.get("labels") or []
        body = _clean(raw.get("body", raw.get("description", "")))

        block = [
            "---",
            f"id: {tid}",
            f"title: {title}",
            f"status: {status}",
            f"epic: {epic}",
            f"owner: {owner}",
            f"labels: {json.dumps(labels)}",
            "---",
        ]
        if body:
            block.append(body)
        block.append("")
        text += "\n".join(block)
        append_entry(tid, title, "generated", [], body, [])
        inserted.append(tid)
        existing.add(tid)

    task_file.write_text(text, encoding="utf-8")
    return inserted


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

        # Use a set to avoid duplicates across multiple edit passes
        changed_files: Set[str] = set()

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
                # Support both return styles (dict-with-files or None)
                result = diff_and_stage_changes(original, modified, file_path, task_id=task_id)
                if isinstance(result, dict) and "files" in result:
                    changed_files.update(result.get("files", []))
                else:
                    changed_files.add(file_path)

        result = commit_and_push_changes(desc, task_id=task_id)

        # Unified episodic logging (single entry)
        passed = bool(result.get("passed"))
        status = "success" if passed else "failed"
        sentiment = "positive" if passed else "negative"
        summary_text = f"Task '{desc}' {status}."
        artifacts = [result.get("artifacts_path")] if result.get("artifacts_path") else []
        sorted_changed = sorted(changed_files)

        append_entry(task_id, desc, status, sorted_changed, summary_text, artifacts, sentiment)

        if passed:
            self.mark_done(desc)
        else:
            self.mark_needs_review(desc)

        result["changed_files"] = sorted_changed
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

    # ------------------------------------------------------------------
    # Undo helpers
    def undo_last_task(self) -> Optional[Dict[str, Any]]:
        """Revert the most recent commit and log the undo in episodic memory."""

        repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)
        try:
            last_commit = repo.head.commit
        except Exception:
            return None

        files = repo.git.diff("--name-only", "HEAD~1").splitlines()
        title = last_commit.message.splitlines()[0]
        try:
            repo.git.revert("HEAD", no_edit=True)
            append_entry(
                last_commit.hexsha,
                title,
                "undo",
                files,
                f"Reverted {last_commit.hexsha}",
                [],
            )
            return {"reverted_commit": last_commit.hexsha, "files": files}
        except Exception as exc:
            append_entry(
                last_commit.hexsha,
                title,
                "undo-failed",
                files,
                str(exc),
                [],
            )
            return {"error": str(exc), "files": files}


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    import argparse
    parser = argparse.ArgumentParser(description="Task pipeline utilities")
    parser.add_argument(
        "--undo-last",
        action="store_true",
        help="Revert the most recent task's changes and commit",
    )
    args = parser.parse_args()
    pipeline = TaskPipeline()
    if args.undo_last:
        info = pipeline.undo_last_task()
        print(json.dumps(info, indent=2))
    else:
        result = pipeline.run_next_task()
        print(json.dumps(result or {}, indent=2))
