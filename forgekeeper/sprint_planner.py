"""Utilities to assemble a simple sprint plan from goals and tasks."""
from __future__ import annotations

from pathlib import Path
from typing import List

from forgekeeper.goal_manager import load_goals
from forgekeeper.tasks.queue import TaskQueue


def generate_sprint_plan(
    tasks_file: Path | str | None = None,
    limit: int = 5,
) -> str:
    """Return a markdown sprint plan.

    The plan lists active goals followed by pending tasks. Only a small
    number of items are included so that automated runs produce concise and
    deterministic results.
    """

    goals = [g.get("description", "") for g in load_goals() if g.get("active", True)]
    queue = TaskQueue(tasks_file)
    tasks = [t.description for t in queue.list_tasks() if t.status != "done"]

    lines: List[str] = ["## Next Sprint Plan"]
    if goals:
        lines.append("### Goals")
        lines.extend(f"- {g}" for g in goals[:limit])
        lines.append("")
    if tasks:
        lines.append("### Tasks")
        lines.extend(f"- {t}" for t in tasks[:limit])
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def update_sprint_plan(
    tasks_file: Path | str | None = None,
    plan_path: Path | str | None = None,
    limit: int = 5,
) -> str:
    """Generate a sprint plan and write it to ``plan_path``.

    Returns the generated markdown string.
    """

    plan = generate_sprint_plan(tasks_file, limit)
    path = Path(plan_path) if plan_path else Path("SprintPlan.md")
    path.write_text(plan, encoding="utf-8")
    return plan


__all__ = ["generate_sprint_plan", "update_sprint_plan"]
