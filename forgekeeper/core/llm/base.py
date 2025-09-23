"""Shared LLM provider interfaces."""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Protocol


@dataclass
class LLMConfig:
    name: str
    model: str | None = None
    temperature: float = 0.0


class LLMProvider(Protocol):
    async def stream(self, prompt: str) -> AsyncIterator[str]:
        ...


__all__ = ["LLMConfig", "LLMProvider"]
