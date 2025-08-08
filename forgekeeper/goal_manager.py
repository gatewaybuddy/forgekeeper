from __future__ import annotations

"""Simple goal manager module.

This placeholder fetches active goals from the persisted state file. If no
active goals are stored, an empty list is returned. The module is designed to
be extended with more robust goal management in the future.
"""

from typing import List

from .state_manager import load_state


def get_active_goals() -> List[str]:
    """Return a list of active goals from the saved state."""
    state = load_state()
    goals = state.get("active_goals", [])
    if isinstance(goals, list):
        return goals
    return []
