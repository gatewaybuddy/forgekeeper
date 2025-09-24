"""Provider registry placeholder."""

from __future__ import annotations

from typing import Dict

from .base import LLMProvider

registry: Dict[str, LLMProvider] = {}


def register(name: str, provider: LLMProvider) -> None:
    registry[name] = provider


def get(name: str) -> LLMProvider:
    try:
        return registry[name]
    except KeyError as exc:
        raise KeyError(f"LLM provider '{name}' is not registered yet") from exc


__all__ = ["registry", "register", "get"]
