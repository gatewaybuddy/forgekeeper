from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict, List, Any, Set
import json

from forgekeeper.tasks.queue import TaskQueue
from goal_manager import storage as goal_storage
from forgekeeper.summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_edit.llm_diff import generate_code_edit
from forgekeeper.code_edit.patcher import apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.multi_agent_planner import split_for_agents
from forgekeeper.agent.communication import get_shared_context

from .commit import commit_with_log
from .undo import undo_last_commit

TASK_FILE = Path(__file__).resolve().parents[2] / "tasks.md"


class TaskPipeline:
    """Coordinate task scheduling and persistence."""

    def __init__(self, task_file: Path = TASK_FILE) -> None:
        self.queue = TaskQueue(task_file)

    # ------------------------------------------------------------------
    # Task selection
    def next_task(self) -> Optional[Dict]:
        """Return the highest priority task metadata."""
        meta = self.queue.next_task()
        if not meta or meta.get("status") not in {"todo", "in_progress"}:
            return None

        desc = meta.get("title") or meta.get("description") or ""
        try:
            goal_storage.add_goal(desc, source="task_queue")
        except Exception:  # pragma: no cover - defensive
            pass

        task = self.queue.get_task(desc)
        if task:
            self.queue.mark_in_progress(task)

        return meta

    # ------------------------------------------------------------------
    # End-to-end execution
    def run_next_task(self, guidelines: str = "") -> Optional[Dict]:
        """Run the highest priority task through the edit pipeline."""
        meta = self.next_task()
        if not meta:
            return None

        original_desc = meta.get("title") or meta.get("description") or ""
        task_id = meta.get("id", "manual")

        plan = split_for_agents(original_desc)
        exec_desc = next((p["task"] for p in plan if p["agent"] == "coder"), original_desc)

        summaries = summarize_repository()
        summaries_path = Path("forgekeeper/summaries.json")
        summaries_path.parent.mkdir(parents=True, exist_ok=True)
        summaries_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")

        ranked = analyze_repo_for_task(exec_desc, str(summaries_path))

        changed_files: Set[str] = set()

        for item in ranked:
            file_path = item["file"]
            summary = item.get("summary", "")
            p = Path(file_path)
            if not p.exists():
                continue
            original = p.read_text(encoding="utf-8")
            patch = generate_code_edit(exec_desc, file_path, summary, guidelines)
            changed = apply_unified_diff(patch)
            if file_path in changed or str(p) in changed:
                modified = p.read_text(encoding="utf-8")
                result = diff_and_stage_changes(original, modified, file_path, task_id=task_id)
                if isinstance(result, dict) and "files" in result:
                    changed_files.update(result.get("files", []))
                else:
                    changed_files.add(file_path)

        result = commit_with_log(exec_desc, task_id, sorted(changed_files))

        if result.get("passed"):
            self.mark_done(original_desc)
        else:
            self.mark_needs_review(original_desc)

        result["plan"] = plan
        result["shared_context"] = get_shared_context()
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
        return undo_last_commit()


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
