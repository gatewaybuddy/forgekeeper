"""Unified runtime package exports."""

from __future__ import annotations

import importlib
from typing import Any

__all__ = ["change_stager", "git", "llm", "orchestrator", "pipeline", "planning", "self_review", "tasks"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        module = importlib.import_module(f"{__name__}.{name}")
        globals()[name] = module
        return module
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:  # pragma: no cover - trivial helper
    return sorted(list(globals().keys()) + __all__)

