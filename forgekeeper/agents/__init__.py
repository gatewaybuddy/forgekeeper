"""Legacy task-specific agent helpers.

This package hosts the higher-level ``ask_*`` functions and orchestration
utilities used by the multi-agent planner.  It remains separate from
``forgekeeper.agent`` which provides the foundational :class:`ForgeAgent`
implementation and shared communication helpers.
"""

from forgekeeper.load_env import init_env
init_env()

from .core import ask_core
from .coder import ask_coder
from .router import route_intent, postprocess_response
from .session_memory import add_goal, add_subtasks
from .task_retriever import get_next_task
from .task_executor import execute_next_task

__all__ = [
    "ask_core",
    "ask_coder",
    "route_intent",
    "postprocess_response",
    "add_goal",
    "add_subtasks",
    "get_next_task",
    "execute_next_task",
]
