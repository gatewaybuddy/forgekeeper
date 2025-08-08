import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

GOALS_FILE = Path("forgekeeper/goals.json")
GOAL_LOG_FILE = Path("forgekeeper/goals.log")


def load_goals() -> List[Dict]:
    """Load all goals from disk. Return empty list if file missing or invalid."""
    if not GOALS_FILE.is_file():
        return []
    try:
        with open(GOALS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return []


def save_goals(goals: List[Dict]) -> None:
    """Persist the given goals list to disk."""
    GOALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(GOALS_FILE, "w", encoding="utf-8") as f:
        json.dump(goals, f, indent=2)


def get_active_goals() -> List[str]:
    """Return descriptions of currently active goals."""
    return [g["description"] for g in load_goals() if g.get("active", True)]


def add_goal(description: str, source: str = "user") -> str:
    """Add a new goal and return its identifier."""
    goals = load_goals()
    goal_id = str(uuid.uuid4())
    goal = {
        "id": goal_id,
        "description": description,
        "source": source,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    goals.append(goal)
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
