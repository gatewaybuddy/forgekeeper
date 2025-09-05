from __future__ import annotations

from collections import defaultdict
from typing import Dict, Literal

from .base import Suggestion
from .metrics import increment
from .registry import all as all_agents

"""Simple feedback utilities for memory agents.

Example:
    >>> record_application("applied", suggestion.agent_id, suggestion)
"""

_STATS: Dict[str, Dict[str, int]] = defaultdict(lambda: {"applied": 0, "reverted": 0})


def record_application(
    outcome: Literal["applied", "reverted"], agent_id: str, suggestion: Suggestion
) -> None:
    _ = suggestion  # unused but kept for future metadata
    _STATS[agent_id][outcome] += 1
    increment(agent_id, outcome)


def credit_assignment() -> None:
    for agent in all_agents():
        stats = _STATS.get(agent.id)
        if not stats:
            continue
        delta = 0.0
        if stats["applied"] > stats["reverted"]:
            delta = 0.05
        elif stats["reverted"] > stats["applied"]:
            delta = -0.05
        if delta:
            agent.learn({"delta_confidence": delta})
        stats["applied"] = 0
        stats["reverted"] = 0
