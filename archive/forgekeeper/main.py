"""Entry point compatibility module."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from forgekeeper.pipeline import loop
from forgekeeper.state_manager import load_state

TASK_FILE = Path("tasks.md")
STATE_PATH = Path("state.json")


def main() -> None:  # pragma: no cover - exercised via tests
    state: Dict[str, Any] = load_state(STATE_PATH)
    try:
        from forgekeeper.tasks.queue import TaskQueue

        queue = TaskQueue(TASK_FILE)
        state.setdefault("current_task", queue.next_task())
    except Exception:
        state.setdefault("current_task", None)
    loop.run(state, STATE_PATH)


__all__ = ["TASK_FILE", "STATE_PATH", "main", "load_state"]
