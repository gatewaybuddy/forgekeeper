"""Compatibility shim exposing the global outbox helpers."""

from __future__ import annotations

from forgekeeper.outbox import pending_action, remove_action, replay_pending, run_action, write_action


def run_with_outbox(action, func, *args, **kwargs):
    from forgekeeper.config import ENABLE_OUTBOX

    if ENABLE_OUTBOX:
        with pending_action(action):
            return func(*args, **kwargs)
    return func(*args, **kwargs)


__all__ = [
    "pending_action",
    "remove_action",
    "replay_pending",
    "run_action",
    "write_action",
    "run_with_outbox",
]
