from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable


SuggestionType = Literal["annotation", "patch", "prompt_aug", "route", "score"]


@dataclass(slots=True)
class Event:
    """Lightweight event passed to memory agents."""

    kind: str
    payload: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Suggestion:
    """Action proposed by a memory agent."""

    type: SuggestionType
    content: str
    span: tuple[int, int] | None = None
    replacement: str | None = None
    agent_id: str = ""
    confidence: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class MemoryAgent(Protocol):
    """Protocol implemented by memory agents."""

    id: str
    kind: str
    cost_cap: float
    confidence: float

    def system_prompt(self) -> str: ...

    def match(self, event: Event) -> bool: ...

    def act(self, event: Event) -> list[Suggestion]: ...

    def learn(self, feedback: dict[str, Any]) -> None: ...
