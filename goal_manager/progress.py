from __future__ import annotations

"""Goal progress logging utilities."""

import json
from datetime import datetime, timezone
from pathlib import Path

# Default log file path; tests may monkeypatch this.
GOAL_LOG_FILE = Path("forgekeeper/goals.log")


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
