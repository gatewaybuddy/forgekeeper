"""Lightweight context sharing for Forgekeeper agents.

This module provides a simple in-memory protocol that allows agents to
share short text messages with one another. Messages are stored in a
process-local log so that subsequent agent calls may include the
previous context when planning or generating responses.
"""

from __future__ import annotations

from typing import Dict, List

# Internal shared context log. Each entry is a mapping containing the
# sending agent's name and the message content.
_SHARED_CONTEXT: List[Dict[str, str]] = []

def broadcast_context(agent: str, message: str) -> None:
    """Record a context ``message`` from ``agent``.

    Parameters
    ----------
    agent:
        Name of the agent publishing the context message.
    message:
        Arbitrary short text describing the agent's state or output.
    """

    _SHARED_CONTEXT.append({"agent": agent, "message": message})


def get_shared_context() -> List[Dict[str, str]]:
    """Return a copy of the current shared context log."""

    return list(_SHARED_CONTEXT)
