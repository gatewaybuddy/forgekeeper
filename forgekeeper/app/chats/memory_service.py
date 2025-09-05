from __future__ import annotations

from typing import Any, Dict

from .memory_bank import MemoryBank

# In-memory cache of per-session state
_SESSION_MEMORIES: Dict[str, Dict[str, Any]] = {}
_MEMORY_BANKS: Dict[str, MemoryBank] = {}


def _get_bank(project_id: str) -> MemoryBank:
    bank = _MEMORY_BANKS.get(project_id)
    if bank is None:
        bank = MemoryBank(project_id)
        _MEMORY_BANKS[project_id] = bank
    return bank


def get_memory(session_id: str) -> Dict[str, Any]:
    """Return mutable session memory for ``session_id``."""
    return _SESSION_MEMORIES.setdefault(
        session_id,
        {"shared": [], "internal": [], "goal_stack": [], "task_queue": [], "identity": {}},
    )


def set_memory(session_id: str, memory: Dict[str, Any]) -> None:
    """Replace stored session memory for ``session_id``."""
    _SESSION_MEMORIES[session_id] = memory


def load_memory(session_id: str) -> Dict[str, Any]:
    """Alias for :func:`get_memory` to mirror legacy API."""
    return get_memory(session_id)


def save_message(
    session_id: str,
    role: str,
    content: str,
    *,
    project_id: str | None = None,
) -> None:
    """Persist a message and record it in session memory and :class:`MemoryBank`."""
    memory = get_memory(session_id)
    memory.setdefault("shared", []).append({"role": role, "content": content})
    bank = _get_bank(project_id or session_id)
    bank.add_entry(content, session_id=session_id, type="dialogue", tags=[role])


__all__ = ["get_memory", "set_memory", "load_memory", "save_message"]
