from __future__ import annotations

"""Task delegation utilities for the goal manager."""

from typing import Optional, Tuple

from forgekeeper.multi_agent_planner import split_for_agents
from forgekeeper.agent.communication import broadcast_context, send_direct_message


def _dispatch_subtasks(
    description: str,
    success_history: dict[str, int],
    prev_agent: Optional[str] = None,
    prev_task: Optional[str] = None,
    default_agent: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Route ``description`` to specialized agents with message passing."""

    steps = split_for_agents(description)
    for step in steps:
        agent = step["agent"]
        text = step["task"]
        protocol = step.get("protocol", "broadcast")
        reason = "planner"

        if default_agent:
            agent = default_agent
            reason = "label"
        else:
            best_agent, best_score = max(
                success_history.items(), key=lambda x: x[1]
            )
            if best_score > success_history.get(agent, 0):
                agent = best_agent
                reason = "history"
            elif prev_agent and agent == "core":
                agent = prev_agent
                reason = "history"

        broadcast_context(
            "goal_manager", f"delegated '{text}' to {agent} (reason: {reason})"
        )

        if protocol == "direct":
            sender = "goal_manager"
            send_direct_message(sender, agent, text)
        else:
            broadcast_context(agent, text)

        if prev_agent and prev_agent != agent and prev_task:
            send_direct_message(prev_agent, agent, f"handoff complete: {prev_task}")

        prev_agent, prev_task = agent, text

    return prev_agent, prev_task


__all__ = ["_dispatch_subtasks"]
