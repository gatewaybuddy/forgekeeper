from __future__ import annotations

from types import SimpleNamespace

from forgekeeper.app.chats.memory_service import get_memory, set_memory
from forgekeeper.pipeline import TaskPipeline


def get_next_task(session_id: str):
    """Retrieve the next task from :class:`TaskPipeline` and log it in memory."""
    pipeline = TaskPipeline()
    task = pipeline.next_task()
    if not task:
        return None

    desc = getattr(task, "description", None)
    if desc is None and isinstance(task, dict):
        desc = task.get("title") or task.get("description") or ""

    memory = get_memory(session_id)
    queue = memory.get("task_queue", [])
    queue.append(desc)
    memory["task_queue"] = queue
    set_memory(session_id, memory)

    if isinstance(task, dict):
        return SimpleNamespace(description=desc, **task)
    return task
