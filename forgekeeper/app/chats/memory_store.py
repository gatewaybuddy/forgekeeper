from forgekeeper.app.chats.memory_vector import store_memory_entry
import json
import os
from typing import Callable, Dict, Any
from datetime import datetime

MEMORY_FILE = os.path.join(os.path.dirname(__file__), "conversation_memory.json")

def _load_all():
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, "r") as f:
            return json.load(f)
    return {}

def _save_all(data):
    with open(MEMORY_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_memory(session_id):
    data = _load_all()
    return data.get(session_id, {
        "shared": [],
        "internal": [],
        "think_aloud": False,
        "consent_to_think_aloud": False,
        "prompt_mode": "inst",
        "system_prompt": None,
        "pending_confirmation": None
    })

def get_memory(session_id):
    return load_memory(session_id)

def set_memory(session_id, memory):
    data = _load_all()
    data[session_id] = memory
    _save_all(data)

def save_message(session_id, role, content, internal=False):
    memory = get_memory(session_id)
    target = "internal" if internal else "shared"
    memory[target].append({
        "role": role,
        "content": content,
        "timestamp": datetime.utcnow().isoformat()
    })
    set_memory(session_id, memory)
    store_memory_entry(session_id, role, content, type="internal" if internal else "dialogue")

def reset_memory(session_id):
    data = _load_all()
    data[session_id] = {
        "shared": [],
        "internal": [],
        "think_aloud": False,
        "consent_to_think_aloud": False,
        "prompt_mode": "inst",
        "system_prompt": None,
        "pending_confirmation": None
    }
    _save_all(data)

# ✨ Think Aloud Features (preserved from your original)
def request_think_aloud(session_id):
    memory = load_memory(session_id)
    return memory.get("consent_to_think_aloud", False)

def set_think_aloud(session_id, user_request):
    memory = load_memory(session_id)
    if user_request and not memory.get("consent_to_think_aloud", False):
        return False
    memory["think_aloud"] = user_request
    set_memory(session_id, memory)
    return True

def grant_think_aloud_consent(session_id, consent):
    memory = load_memory(session_id)
    memory["consent_to_think_aloud"] = consent
    set_memory(session_id, memory)

def get_think_aloud(session_id):
    return load_memory(session_id).get("think_aloud", False)

def summarize_thoughts(session_id):
    memory = load_memory(session_id)
    internal = memory.get("internal", [])
    summary = "Summary of my internal thoughts so far:\n"
    for i, thought in enumerate(internal[-5:]):
        summary += f"- {thought['content'].strip()}\n"
    return summary.strip()

# 🔁 Intent confirmation
def set_pending_confirmation(session_id, intent):
    memory = get_memory(session_id)
    memory["pending_confirmation"] = intent
    set_memory(session_id, memory)

def get_pending_confirmation(session_id):
    return get_memory(session_id).get("pending_confirmation")


# === Memory Management Enhancements ===
def default_relevance_check(entry: Dict[str, Any], session_id: str) -> bool:
    """Return True if the memory entry should be kept."""
    return True


def prune_memory(session_id: str, relevance_fn: Callable[[Dict[str, Any], str], bool] = default_relevance_check) -> bool:
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

