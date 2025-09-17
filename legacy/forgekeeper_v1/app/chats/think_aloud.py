from __future__ import annotations

from typing import Dict

_consent: Dict[str, bool] = {}
_state: Dict[str, bool] = {}


def grant_think_aloud_consent(session_id: str, granted: bool) -> None:
    """Store user consent for think-aloud mode."""
    _consent[session_id] = granted


def request_think_aloud(session_id: str) -> bool:
    """Return ``True`` if consent has been granted for think-aloud."""
    return _consent.get(session_id, False)


def set_think_aloud(session_id: str, enabled: bool) -> None:
    """Enable or disable think-aloud mode for ``session_id``."""
    _state[session_id] = enabled


__all__ = ["set_think_aloud", "grant_think_aloud_consent", "request_think_aloud"]
