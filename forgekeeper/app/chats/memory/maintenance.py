from typing import Any, Callable, Dict

from .crud import get_memory, set_memory


def default_relevance_check(entry: Dict[str, Any], session_id: str) -> bool:
    """Return True if the memory entry should be kept."""
    return True


def prune_memory(
    session_id: str,
    relevance_fn: Callable[[Dict[str, Any], str], bool] = default_relevance_check,
) -> bool:
    """Remove memory entries deemed irrelevant by ``relevance_fn``.

    Returns True if any entries were removed.
    """
    memory = get_memory(session_id)
    changed = False
    for key in ("shared", "internal"):
        entries = memory.get(key, [])
        filtered = [e for e in entries if relevance_fn(e, session_id)]
        if len(filtered) != len(entries):
            changed = True
        memory[key] = filtered
    if changed:
        set_memory(session_id, memory)
    return changed


def update_memory_entries(
    session_id: str,
    update_fn: Callable[[Dict[str, Any], str], Dict[str, Any]],
    relevance_fn: Callable[[Dict[str, Any], str], bool] = default_relevance_check,
) -> bool:
    """Update memory entries in-place using ``update_fn``.

    ``update_fn`` should return the modified entry or ``None`` to delete it.
    Returns True if any changes were made.
    """
    memory = get_memory(session_id)
    changed = False
    for key in ("shared", "internal"):
        updated = []
        for entry in memory.get(key, []):
            if not relevance_fn(entry, session_id):
                updated.append(entry)
                continue
            new_entry = update_fn(entry, session_id)
            if new_entry is not None:
                updated.append(new_entry)
            if new_entry != entry:
                changed = True
        if updated != memory.get(key):
            changed = True
        memory[key] = updated
    if changed:
        set_memory(session_id, memory)
    return changed
