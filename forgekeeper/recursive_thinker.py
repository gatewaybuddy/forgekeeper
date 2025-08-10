"""Background recursive thinking module for Forgekeeper.

This module spawns a lightweight background thread that periodically generates
internal prompts, queries the LLM, and stores thoughts to a persistent log.
It supports self-reflection, summarisation to limit depth, and heuristics for
interacting with human users when needed.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from forgekeeper.app.shared.models import llm_core

from .state_manager import load_state
from .goal_manager import get_active_goals
from .user_interface import expose

THOUGHT_LOG_PATH = Path("forgekeeper/thought_log.json")
DEFAULT_SLEEP = 10
REFLECTION_INTERVAL = 5
SUMMARY_INTERVAL = 10
MAX_DEPTH = 50

# Internal state
_thought_history: List[str] = []
_last_thought: str = ""
_redundant_count = 0
_sleep_interval = DEFAULT_SLEEP
_running = False
_thread: threading.Thread | None = None
_last_summary: Dict[str, str] = {"summary": "", "emotion": "neutral"}


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


def summarize_thoughts() -> Dict[str, str]:
    """Condense recent thoughts and tag the dominant emotion."""
    global _last_summary
    if not _thought_history:
        return _last_summary
    recent = _thought_history[-10:]
    prompt = (
        "Summarize the following thoughts and classify the dominant emotion "
        "as one of [neutral, positive, negative, curious, frustrated].\n"
        + "\n".join(recent)
    )
    try:
        response = llm_core.ask(prompt)
        data = json.loads(response)
        summary = data.get("summary", "")
        emotion = data.get("emotion", "neutral")
    except Exception as exc:  # pragma: no cover - defensive
        summary = f"Summary error: {exc}"
        emotion = "neutral"
    _thought_history.clear()
    _thought_history.append(summary)
    _append_thought(summary)
    _last_summary = {"summary": summary, "emotion": emotion}
    return _last_summary


def get_last_summary() -> Dict[str, str]:
    """Return the most recent summary and emotion tag."""
    return _last_summary


def _thinking_loop() -> None:
    global _running
    iteration = 0
    while _running:
        state = load_state()
        goals = get_active_goals()
        prompt = generate_internal_prompt(state, goals)
        try:
            response = llm_core.ask(prompt)
        except Exception as exc:  # pragma: no cover - defensive
            response = f"Thought generation error: {exc}"
        result = process_thought(response)
        if result["expose"]:
            expose(result["thought"])
        iteration += 1
        if iteration % REFLECTION_INTERVAL == 0:
            reflection_prompt = (
                "Self-reflection: Review recent thoughts for alignment with goals."\
                "\nRecent thoughts:\n" + "\n".join(_thought_history[-5:])
            )
            try:
                reflection = llm_core.ask(reflection_prompt)
            except Exception as exc:  # pragma: no cover - defensive
                reflection = f"Reflection error: {exc}"
            process_thought(reflection)
        if iteration % SUMMARY_INTERVAL == 0 or len(_thought_history) >= MAX_DEPTH or _redundant_count >= 3:
            summarize_thoughts()
        time.sleep(_sleep_interval)


def start_thinking_loop(sleep_interval: int = DEFAULT_SLEEP) -> None:
    """Start the background recursive thinking loop."""
    global _running, _thread, _sleep_interval
    if _running:
        return
    _sleep_interval = sleep_interval
    _running = True
    _thread = threading.Thread(target=_thinking_loop, daemon=True)
    _thread.start()


def stop_thinking_loop() -> None:
    """Stop the background thinking loop."""
    global _running
    _running = False
    if _thread and _thread.is_alive():
        _thread.join(timeout=_sleep_interval)
