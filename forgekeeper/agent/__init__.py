"""Foundational agent utilities and :class:`ForgeAgent`.

This subpackage provides the core agent implementation along with shared
helpers like :mod:`communication` and :mod:`tool_utils`.  It is distinct from
``forgekeeper.agents`` which contains legacy task-specific wrappers (``ask_core``,
``ask_coder`` and friends) used by the multi-agent planner.
"""

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - for type checkers only
    from .agent import ForgeAgent


def __getattr__(name: str):  # pragma: no cover - simple delegation
    if name == "ForgeAgent":
        return import_module("forgekeeper.agent.agent").ForgeAgent
    raise AttributeError(name)


__all__ = ["ForgeAgent"]
