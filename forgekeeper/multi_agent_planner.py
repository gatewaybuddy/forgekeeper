"""Task planning helpers for delegating work to specialized agents.

The initial version of this module hard-coded a tiny heuristic that only
distinguished between a ``core`` and a ``coder`` agent.  In order to support
more sophisticated multi-agent setups the planner now allows dynamic agent
registration along with a preferred communication protocol.  Each planned
subtask therefore contains the target agent *and* the protocol it should use
when communicating its results.  Planned subtasks also receive a reference to
the shared context log so agents can build on each other's outputs.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from .agent.communication import broadcast_context, get_shared_context

# Registry mapping agent names to their keyword triggers and communication
# protocol.  Each entry maps to ``{"keywords": set[str], "protocol": str}``.
_AGENT_REGISTRY: Dict[str, Dict[str, object]] = {}


def register_agent(name: str, keywords: set[str], protocol: str = "broadcast") -> None:
    """Register a specialized agent.

    Parameters
    ----------
    name:
        Agent identifier used in planning results.
    keywords:
        Set of keywords that should trigger routing to this agent.  Keywords
        are matched against the lowercased subtask description.
    protocol:
        Communication protocol the agent should use (e.g. ``"broadcast"`` or
        ``"direct"``).  The value is returned alongside the planned subtask.
    """

    _AGENT_REGISTRY[name] = {
        "keywords": {k.lower() for k in keywords},
        "protocol": protocol,
    }


# Register the built-in agents.
register_agent("coder", {"code", "bug", "implement", "fix", "refactor"}, protocol="broadcast")
register_agent("core", set(), protocol="broadcast")


def split_for_agents(task: str) -> List[Dict[str, object]]:
    """Split ``task`` into subtasks and assign them to agents.

    Parameters
    ----------
    task:
        Free-form task description which may contain multiple steps joined
        by the word ``and``.  The splitting strategy is intentionally
        lightweight and may be refined in the future.

    Returns
    -------
    List[Dict[str, object]]
        Each item contains ``agent``, ``task`` and ``protocol`` keys specifying
        the responsible agent, subtask text and communication protocol.  A
        ``context`` key provides a handle to the shared context log capturing
        planning decisions.
    """

    context_log = get_shared_context()
    parts = [p.strip() for p in task.replace("\n", " ").split(" and ") if p.strip()]
    subtasks: List[Dict[str, object]] = []
    for part in parts:
        agent, protocol = _choose_agent(part)
        broadcast_context("planner", f"{agent}: {part}")
        subtasks.append({"agent": agent, "task": part, "protocol": protocol, "context": context_log})
    if not subtasks:
        agent, protocol = _choose_agent(task)
        text = task.strip()
        broadcast_context("planner", f"{agent}: {text}")
        subtasks.append({"agent": agent, "task": text, "protocol": protocol, "context": context_log})
    return subtasks


def _choose_agent(text: str) -> Tuple[str, str]:
    lowered = text.lower()
    for name, cfg in _AGENT_REGISTRY.items():
        keywords = cfg.get("keywords", set())
        if keywords and any(word in lowered for word in keywords):
            return name, cfg.get("protocol", "broadcast")
    # Fall back to core agent
    core_cfg = _AGENT_REGISTRY.get("core", {"protocol": "broadcast"})
    return "core", core_cfg.get("protocol", "broadcast")


__all__ = ["split_for_agents", "register_agent"]
