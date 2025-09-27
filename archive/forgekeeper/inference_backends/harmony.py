"""Harmony prompt rendering helpers (simplified)."""

from __future__ import annotations

import json
from typing import Any, Iterable


def render_harmony(messages: Iterable[dict], _config: Any = None) -> str:
    return json.dumps({"messages": list(messages)}, ensure_ascii=False)


__all__ = ["render_harmony"]
