"""Task planning helpers for delegating work to specialized agents.

The planning heuristics here are intentionally simple: a task description
is split into smaller chunks and each chunk is assigned to an agent based
on keyword matching.  "Code"-centric phrases are routed to the ``coder``
agent while general reasoning tasks go to the ``core`` agent.
"""

from __future__ import annotations

from typing import Dict, List

CODE_KEYWORDS = {"code", "bug", "implement", "fix", "refactor"}

def split_for_agents(task: str) -> List[Dict[str, str]]:
    """Split ``task`` into subtasks and assign them to agents.

    Parameters
    ----------
    task:
        Free-form task description which may contain multiple steps joined
        by the word ``and``.  The splitting strategy is intentionally
        lightweight and may be refined in the future.

    Returns
    -------
    List[Dict[str, str]]
        Each item contains ``agent`` and ``task`` keys specifying the
        responsible agent and the subtask text.
    """

    parts = [p.strip() for p in task.replace("\n", " ").split(" and ") if p.strip()]
    subtasks: List[Dict[str, str]] = []
    for part in parts:
        agent = _choose_agent(part)
        subtasks.append({"agent": agent, "task": part})
    return subtasks or [{"agent": _choose_agent(task), "task": task.strip()}]

def _choose_agent(text: str) -> str:
    lowered = text.lower()
    if any(word in lowered for word in CODE_KEYWORDS):
        return "coder"
    return "core"
