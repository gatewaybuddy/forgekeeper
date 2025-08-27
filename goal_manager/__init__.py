"""Public interface for goal management utilities.

When ``AUTONOMY_MODE`` is enabled the goal manager should wake up
periodically and attempt to execute the next high level goal.  To keep the
application entry points lean we spin up the manager here on import so any
consumer that touches :mod:`goal_manager` automatically benefits from the
background loop.
"""

from forgekeeper.config import AUTONOMY_MODE

from .manager import HighLevelGoalManager
from . import storage, progress

GOALS_FILE = storage.GOALS_FILE
GOAL_LOG_FILE = progress.GOAL_LOG_FILE
load_goals = storage.load_goals
save_goals = storage.save_goals
get_active_goals = storage.get_active_goals
add_goal = storage.add_goal
deactivate_goal = storage.deactivate_goal
log_goal_progress = progress.log_goal_progress

# Start a background manager if autonomy is enabled.  ``HighLevelGoalManager``
# launches its own periodic thread in ``__post_init__`` so merely
# instantiating it is sufficient.
_autonomous_manager = HighLevelGoalManager() if AUTONOMY_MODE else None

__all__ = [
    "HighLevelGoalManager",
    "GOALS_FILE",
    "GOAL_LOG_FILE",
    "load_goals",
    "save_goals",
    "get_active_goals",
    "add_goal",
    "deactivate_goal",
    "log_goal_progress",
    "storage",
    "progress",
]

