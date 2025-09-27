"""Agent routing heuristics for task planning."""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Tuple

AgentConfig = Dict[str, object]

_AGENT_REGISTRY: Dict[str, AgentConfig] = {}


def register_agent(name: str, keywords: Iterable[str] | None = None, *, protocol: str = "broadcast") -> None:
    """Register or update an agent routing rule."""

    keyword_set = {kw.lower() for kw in keywords or []}
    _AGENT_REGISTRY[name] = {"keywords": keyword_set, "protocol": protocol}


register_agent("coder", {"code", "bug", "implement", "fix", "refactor"})
register_agent("reviewer", {"review", "test", "verify", "assess"})
register_agent("researcher", {"research", "investigate", "explore", "analyze"}, protocol="direct")
register_agent("core", set())


def _split_description(description: str) -> List[str]:
    parts = [
        part.strip()
        for part in re.split(r"\band then\b|\bthen\b|\band\b|;|,|\.\s|\n", description)
        if part.strip()
    ]
    return parts


def _choose_agent(text: str) -> Tuple[str, str]:
    lowered = text.lower()
    for name, cfg in _AGENT_REGISTRY.items():
        keywords = cfg.get("keywords", set())
        if keywords and any(word in lowered for word in keywords):
            return name, str(cfg.get("protocol", "broadcast"))
    core_cfg = _AGENT_REGISTRY.get("core", {"protocol": "broadcast"})
    return "core", str(core_cfg.get("protocol", "broadcast"))


def split_for_agents(task: str) -> List[Dict[str, object]]:
    """Split ``task`` into heuristic subtasks assigned to registered agents."""

    description = task.strip()
    if not description:
        return []
    parts = _split_description(description)
    if not parts:
        parts = [description]

    subtasks: List[Dict[str, object]] = []
    for part in parts:
        agent, protocol = _choose_agent(part)
        subtasks.append(
            {
                "agent": agent,
                "task": part,
                "protocol": protocol,
            }
        )
    return subtasks


__all__ = ["register_agent", "split_for_agents"]
