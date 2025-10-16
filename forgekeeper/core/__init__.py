"""Unified runtime package exports."""

from __future__ import annotations

import importlib
from typing import Any

from .artifacts import Artifact, Ticket

_CLASS_EXPORTS = {"Artifact": Artifact, "Ticket": Ticket}
_MODULE_EXPORTS = [
    "artifacts",
    "change_stager",
    "git",
    "llm",
    "orchestrator",
    "pipeline",
    "planning",
    "self_review",
    "tasks",
]

__all__ = list(_CLASS_EXPORTS) + _MODULE_EXPORTS


def __getattr__(name: str) -> Any:
    if name in _CLASS_EXPORTS:
        return _CLASS_EXPORTS[name]
    if name in _MODULE_EXPORTS:
        module = importlib.import_module(f"{__name__}.{name}")
        globals()[name] = module
        return module
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:  # pragma: no cover - trivial helper
    return sorted(list(globals().keys()) + __all__)

