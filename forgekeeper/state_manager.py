"""State serialization helpers for the unified runtime."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

DEFAULT_STATE_PATH = Path(".forgekeeper/state.json")


def _ensure_path(path: Optional[Path | str]) -> Path:
    if path is None:
        return DEFAULT_STATE_PATH
    return Path(path)


def load_state(path: Optional[Path | str] = None) -> Dict[str, Any]:
    target = _ensure_path(path)
    if target.exists():
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state: Dict[str, Any], path: Optional[Path | str] = None) -> None:
    target = _ensure_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(state, indent=2), encoding="utf-8")


__all__ = ["DEFAULT_STATE_PATH", "load_state", "save_state"]
