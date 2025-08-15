"""Agent package providing core agent utilities.

The package exposes a lazy attribute loader so that importing submodules like
``communication`` does not eagerly import heavier dependencies such as the main
``ForgeAgent`` class.
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
