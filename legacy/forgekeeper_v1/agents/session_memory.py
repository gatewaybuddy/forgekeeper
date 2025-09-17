from forgekeeper.app.chats.memory_service import get_memory, set_memory


def add_goal(session_id: str, goal: str) -> None:
    """Append ``goal`` to the session's goal stack."""
    memory = get_memory(session_id)
    goals = memory.get("goal_stack", [])
    goals.append(goal)
    memory["goal_stack"] = goals
    set_memory(session_id, memory)


def add_subtasks(session_id: str, subtasks: list[str]) -> None:
    """Replace the session's ``task_queue`` with ``subtasks``."""
    memory = get_memory(session_id)
    memory["task_queue"] = list(subtasks)
    set_memory(session_id, memory)
