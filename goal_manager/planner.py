from __future__ import annotations

"""Planning utilities for the goal manager.

This module exposes :func:`_build_subtask_graph` which decomposes a
natural language description into a sequence of :class:`Subtask`
objects. Each clause is assigned a decreasing priority and a dependency
on the preceding clause, yielding a simple linear execution graph.
"""

from dataclasses import dataclass
import re


@dataclass
class Subtask:
    """Representation of a planned subtask."""

    description: str
    priority: float
    depends_on: list[int]


def _build_subtask_graph(description: str) -> list[Subtask]:
    """Decompose ``description`` into an ordered subtask graph."""

    parts = [
        p.strip()
        for p in re.split(r"\band then\b|\bthen\b|\band\b|;|\.\s|\n", description)
        if p.strip()
    ]
    if len(parts) <= 1:
        return [Subtask(description, 1.0, [])]

    n = len(parts)
    graph: list[Subtask] = []
    for idx, part in enumerate(parts):
        priority = 1.0 - idx / n
        depends = [idx - 1] if idx > 0 else []
        graph.append(Subtask(part, priority, depends))
    return graph


__all__ = ["Subtask", "_build_subtask_graph"]
