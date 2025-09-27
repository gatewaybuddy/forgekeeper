from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from . import queue
from .parser import parse_task_file, serialize


TaskQueue = queue.TaskQueue


@dataclass
class Task:
    id: str
    title: str
    status: str
    labels: list[str] | None = None
    body: str = ""


def load_tasks(path: str | None = None) -> list[Task]:
    task_path = queue.TaskQueue(path).path
    text = task_path.read_text(encoding="utf-8") if task_path.exists() else ""
    from .parser import parse_tasks_md

    return parse_tasks_md(str(task_path)) if text else []


__all__ = ["TaskQueue", "Task", "load_tasks", "queue", "parse_task_file", "serialize"]
