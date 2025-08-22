"""Helper for executing actions with the outbox."""

from __future__ import annotations

from typing import Any, Callable

from forgekeeper.config import ENABLE_OUTBOX

try:  # pragma: no cover - optional dependency in tests
    from forgekeeper import outbox as _outbox
except Exception:  # pragma: no cover
    _outbox = None


def run_with_outbox(action: dict, func: Callable[..., Any], *args, **kwargs) -> Any:
    """Execute ``func`` under ``outbox.pending_action`` when enabled."""
    if ENABLE_OUTBOX and _outbox is not None:
        with _outbox.pending_action(action):
            return func(*args, **kwargs)
    return func(*args, **kwargs)
