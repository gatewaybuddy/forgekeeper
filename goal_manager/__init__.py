from .manager import HighLevelGoalManager
from . import storage

GOALS_FILE = storage.GOALS_FILE
GOAL_LOG_FILE = storage.GOAL_LOG_FILE
load_goals = storage.load_goals
save_goals = storage.save_goals
get_active_goals = storage.get_active_goals
add_goal = storage.add_goal
deactivate_goal = storage.deactivate_goal
log_goal_progress = storage.log_goal_progress

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
]
