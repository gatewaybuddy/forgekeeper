import json
import os
from datetime import datetime
from typing import Any, Dict

from forgekeeper.app.memory.store import store_memory_entry

MEMORY_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "conversation_memory.json")
)


def _load_all() -> Dict[str, Any]:
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_all(data: Dict[str, Any]) -> None:
    with open(MEMORY_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_memory(session_id: str) -> Dict[str, Any]:
    data = _load_all()
    return data.get(
        session_id,
        {
            "shared": [],
            "internal": [],
            "think_aloud": False,
            "consent_to_think_aloud": False,
            "prompt_mode": "inst",
            "system_prompt": None,
            "pending_confirmation": None,
        },
    )


def get_memory(session_id: str) -> Dict[str, Any]:
    return load_memory(session_id)


def set_memory(session_id: str, memory: Dict[str, Any]) -> None:
    data = _load_all()
    data[session_id] = memory
    _save_all(data)


def save_message(
    session_id: str,
    role: str,
    content: str,
    internal: bool = False,
    project_id: str = "default",
) -> None:
    memory = get_memory(session_id)
    target = "internal" if internal else "shared"
    memory[target].append(
        {
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    set_memory(session_id, memory)
    store_memory_entry(
        project_id,
        session_id,
        role,
        content,
        type="internal" if internal else "dialogue",
    )


def reset_memory(session_id: str) -> None:
    data = _load_all()
    data[session_id] = {
        "shared": [],
        "internal": [],
        "think_aloud": False,
        "consent_to_think_aloud": False,
        "prompt_mode": "inst",
        "system_prompt": None,
        "pending_confirmation": None,
    }
    _save_all(data)


def summarize_thoughts(session_id: str) -> str:
    memory = load_memory(session_id)
    internal = memory.get("internal", [])
    summary = "Summary of my internal thoughts so far:\n"
    for thought in internal[-5:]:
        summary += f"- {thought['content'].strip()}\n"
    return summary.strip()


def set_pending_confirmation(session_id: str, intent: Any) -> None:
    memory = get_memory(session_id)
    memory["pending_confirmation"] = intent
    set_memory(session_id, memory)


def get_pending_confirmation(session_id: str) -> Any:
    return get_memory(session_id).get("pending_confirmation")
