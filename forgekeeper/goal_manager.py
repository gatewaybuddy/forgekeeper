from __future__ import annotations

"""Goal manager utilities.

- Primary storage: JSON files under forgekeeper/ (goals + progress log).
- Backward compatibility: if no goals file exists, migrate `active_goals`
  from the persisted state (via state_manager.load_state()) into goals.json.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from .state_manager import load_state
from .memory.embedding import load_episodic_memory, similar_task_summaries

GOALS_FILE = Path("forgekeeper/goals.json")
GOAL_LOG_FILE = Path("forgekeeper/goals.log")


def _migrate_from_state_if_needed() -> List[Dict]:
    """If goals.json is missing, try to migrate from state['active_goals']."""
    state = {}
    try:
        state = load_state()
    except Exception:
        # If state loading fails, just return an empty list and proceed.
        return []

    goals_list = state.get("active_goals", [])
    if not isinstance(goals_list, list):
        return []

    migrated: List[Dict] = []
    now = datetime.now(timezone.utc).isoformat()
    for desc in goals_list:
        if not isinstance(desc, str):
            continue
        migrated.append(
            {
                "id": str(uuid.uuid4()),
                "description": desc,
                "source": "state_migration",
                "created_at": now,
                "active": True,
            }
        )
    if migrated:
        save_goals(migrated)
    return migrated


def load_goals() -> List[Dict]:
    """Load all goals from disk (or migrate from state if file missing)."""
    if GOALS_FILE.is_file():
        try:
            with open(GOALS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    # No file: try migrating from legacy state
    return _migrate_from_state_if_needed()


def save_goals(goals: List[Dict]) -> None:
    """Persist the given goals list to disk."""
    GOALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(GOALS_FILE, "w", encoding="utf-8") as f:
        json.dump(goals, f, indent=2)


def get_active_goals() -> List[str]:
    """Return descriptions of currently active goals."""
    return [g.get("description", "") for g in load_goals() if g.get("active", True)]


def add_goal(
    description: str,
    source: str = "user",
    *,
    parent_id: Optional[str] = None,
    priority: float = 0,
    depends_on: Optional[List[str]] = None,
) -> str:
    """Add a new goal and return its identifier.

    Parameters
    ----------
    description:
        The textual description of the goal or subtask.
    source:
        A label indicating where the goal originated.
    parent_id:
        If provided, the goal is treated as a subtask of ``parent_id``.
    priority:
        Ordering hint used when scheduling subtasks. Higher values denote
        earlier execution preference.
    depends_on:
        List of goal identifiers that must be completed before this goal.
    """

    goals = load_goals()

    # Avoid duplicates when the same goal/parent pair already exists
    for g in goals:
        if g.get("description") == description and g.get("parent_id") == parent_id:
            return g.get("id", "")

    goal_id = str(uuid.uuid4())
    goal = {
        "id": goal_id,
        "description": description,
        "source": source,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
        "priority": priority,
    }
    if parent_id:
        goal["parent_id"] = parent_id
    if depends_on:
        goal["depends_on"] = list(depends_on)

    # Look for related past tasks via embeddings
    try:
        embedder, summary = load_episodic_memory()
        summaries = similar_task_summaries(description, summary, embedder)
        if summaries:
            goal["memory_context"] = summaries
    except Exception:
        pass

    goals.append(goal)

    if parent_id:
        for g in goals:
            if g.get("id") == parent_id:
                g.setdefault("subtasks", []).append(goal_id)
                break

    save_goals(goals)
    return goal_id


def deactivate_goal(goal_id: str) -> bool:
    """Mark the goal with ``goal_id`` as inactive. Return True if found."""
    goals = load_goals()
    for goal in goals:
        if goal.get("id") == goal_id and goal.get("active", True):
            goal["active"] = False
            save_goals(goals)
            return True
    return False


def log_goal_progress(goal_id: str, note: str) -> None:
    """Append a progress note for ``goal_id`` to the goal log file."""
    GOAL_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "goal_id": goal_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "note": note,
    }
    with open(GOAL_LOG_FILE, "a", encoding="utf-8") as f:
        json.dump(entry, f)
        f.write("\n")
