"""Backward-compatible alias for high-level goal manager.

The high-level goal manager has moved to the standalone :mod:`goal_manager`
package.  This module re-exports :class:`HighLevelGoalManager` so existing
imports from ``forgekeeper.high_level_goal_manager`` continue to work.
"""
from goal_manager import HighLevelGoalManager

__all__ = ["HighLevelGoalManager"]
