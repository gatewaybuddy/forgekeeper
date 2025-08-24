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

import time
from contextlib import contextmanager
from typing import Dict, List, Tuple

from .agent.communication import broadcast_context, get_shared_context
from .telemetry import record_agent_result
from .memory import query_similar_tasks

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


# Register the built-in agents.  Besides the traditional ``core`` and
# ``coder`` agents we also expose a ``researcher`` for information gathering
# and a ``reviewer`` for result validation.  Additional agents may be
# registered at runtime using :func:`register_agent`.
register_agent(
    "coder",
    {"code", "bug", "implement", "fix", "refactor"},
    protocol="broadcast",
)
register_agent("core", set(), protocol="broadcast")
register_agent(
    "researcher",
    {"research", "investigate", "study", "analyze"},
    protocol="direct",
)
register_agent(
    "reviewer",
    {"review", "evaluate", "test", "assess"},
    protocol="broadcast",
)


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
    available_agents = list(_AGENT_REGISTRY.keys())
    parts = [p.strip() for p in task.replace("\n", " ").split(" and ") if p.strip()]
    subtasks: List[Dict[str, object]] = []
    for part in parts:
        agent, protocol = _choose_agent(part)
        broadcast_context("planner", f"{agent}: {part}")

        memory_context = query_similar_tasks(part)
        subtasks.append(
            {
                "agent": agent,
                "task": part,
                "protocol": protocol,
                "context": context_log,
                "memory_context": memory_context,
                "available_agents": available_agents
            }
        )
    if not subtasks:
        agent, protocol = _choose_agent(task)
        text = task.strip()
        broadcast_context("planner", f"{agent}: {text}")
        memory_context = query_similar_tasks(text)

        subtasks.append(
            {
                "agent": agent,
                "task": text,
                "protocol": protocol,
                "context": context
                "memory_context": memory_context
                "available_agents": available_agents
            }
        )
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


@contextmanager
def track_agent(agent: str):
    """Context manager to record agent execution metrics.

    The wrapped block is timed and success/failure are reported to the
    telemetry subsystem via :func:`record_agent_result`.

    Parameters
    ----------
    agent:
        Name of the agent executing the block.
    """

    start = time.perf_counter()
    success = True
    try:
        yield
    except Exception:
        success = False
        raise
    finally:
        duration = time.perf_counter() - start
        record_agent_result(agent, duration, success)


__all__ = ["split_for_agents", "register_agent", "track_agent"]
