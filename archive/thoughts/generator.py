from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List

THOUGHT_LOG_PATH = Path("forgekeeper/thought_log.json")

# Internal state
_thought_history: List[str] = []
_last_thought: str = ""
_redundant_count = 0
_existing_entries: List[Dict[str, str]] = []


def _load_thought_log() -> List[Dict[str, str]]:
    if THOUGHT_LOG_PATH.is_file():
        try:
            with open(THOUGHT_LOG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return []
    return []


def _save_thought_log(entries: List[Dict[str, str]]) -> None:
    THOUGHT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(THOUGHT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)


# Load existing thoughts on import
_existing_entries = _load_thought_log()
_thought_history.extend(entry.get("thought", "") for entry in _existing_entries)


def generate_internal_prompt(state: Dict, goals: List[str]) -> str:
    """Create an internal prompt based on state, goals, and recent thoughts."""
    recent = "\n".join(_thought_history[-5:])
    prompt = (
        "You are Forgekeeper's recursive thinker generating internal monologue.\n"
        f"System state: {state}\n"
        f"Active goals: {goals}\n"
        f"Recent thoughts: {recent}\n"
        "Provide the next thought to progress toward the goals."
    )
    return prompt


def should_interact_with_user(thought: str) -> bool:
    """Return True if the thought should be surfaced to the user."""
    triggers = ["ask the user", "user?", "request", "notify user", "feedback"]
    lower = thought.lower()
    return any(word in lower for word in triggers)


def _append_thought(thought: str) -> None:
    entry = {"timestamp": datetime.utcnow().isoformat(), "thought": thought}
    _existing_entries.append(entry)
    _save_thought_log(_existing_entries)


def process_thought(response: str) -> Dict[str, object]:
    """Persist the thought and evaluate whether to expose it."""
    global _last_thought, _redundant_count
    thought = response.strip()
    if not thought:
        return {"thought": "", "expose": False}
    if thought == _last_thought:
        _redundant_count += 1
    else:
        _redundant_count = 0
    _last_thought = thought
    _thought_history.append(thought)
    _append_thought(thought)
    return {"thought": thought, "expose": should_interact_with_user(thought)}
