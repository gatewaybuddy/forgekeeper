"""Inter-agent communication utilities.

The original implementation only supported a broadcast style "context" log
where agents could append short messages for other agents to read.  To
support more explicit communication protocols the module now also exposes a
direct messaging API.  Messages can either be broadcast to all participants
or sent to a specific recipient.  The communication data structures are kept
in memory and are therefore process-local.
"""

from __future__ import annotations

from typing import Dict, List, DefaultDict
from collections import defaultdict

_SHARED_CONTEXT: List[Dict[str, str]] = []

# Direct message inboxes keyed by recipient agent name.  Each message contains
# the sender and the content.
_DIRECT_MESSAGES: DefaultDict[str, List[Dict[str, str]]] = defaultdict(list)

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


def send_direct_message(sender: str, recipient: str, message: str) -> None:
    """Send a message from ``sender`` to ``recipient``.

    Parameters
    ----------
    sender:
        Name of the sending agent.
    recipient:
        Target agent that should receive the message.
    message:
        Message payload.
    """

    _DIRECT_MESSAGES[recipient].append({"from": sender, "message": message})


def get_direct_messages(agent: str) -> List[Dict[str, str]]:
    """Retrieve and clear pending direct messages for ``agent``."""

    messages = _DIRECT_MESSAGES.pop(agent, [])
    return list(messages)


__all__ = [
    "broadcast_context",
    "get_shared_context",
    "send_direct_message",
    "get_direct_messages",
]

