"""Backward compatibility wrapper for :mod:`forgekeeper.tasks.queue`.

The TaskQueue implementation now lives under ``forgekeeper/tasks/queue.py``.
This module simply re-exports :class:`TaskQueue` so existing imports continue
working.
"""

from .tasks.queue import TaskQueue

__all__ = ["TaskQueue"]
