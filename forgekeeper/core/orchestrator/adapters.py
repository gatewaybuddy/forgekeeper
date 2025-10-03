"""Adapter abstractions used by the orchestrator tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Iterable, Tuple


class LLMBase:
    """Minimal async streaming interface for language models."""

    async def stream(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        time_slice_ms: int = 1000,
    ) -> AsyncIterator[Tuple[str, str]]:
        raise NotImplementedError


@dataclass
class LLMMock(LLMBase):
    """Simple mock that emits a canned response on first iteration."""

    name: str
    message: str = "ready"
    act: str = "REPORT"

    async def stream(
        self,
        prompt: str,
        *,
        max_tokens: int = 256,
        time_slice_ms: int = 1000,
    ) -> AsyncIterator[Tuple[str, str]]:
        yield (f"{self.name}: {self.message}", self.act)


class ToolBase:
    """Placeholder interface for future tool integrations."""

    async def start(self) -> None:  # pragma: no cover - placeholder
        return None

    async def stop(self) -> None:  # pragma: no cover - placeholder
        return None

    async def astream_output(self) -> AsyncIterator["ToolEvent"]:  # pragma: no cover
        if False:
            yield ToolEvent(text="", act="TOOL_OUT")


@dataclass
class ToolEvent:
    text: str
    act: str
    stream: str = "tool"
    meta: dict[str, Any] | None = None


__all__ = ["LLMBase", "LLMMock", "ToolBase", "ToolEvent"]
