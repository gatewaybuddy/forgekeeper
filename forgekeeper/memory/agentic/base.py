"""Core dataclasses and protocols for the agentic memory plane."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

SuggestionKind = Literal["annotation", "patch", "prompt_aug", "route", "score"]


@dataclass(slots=True)
class Event:
    """Lightweight event passed to memory agents."""

    kind: str
    payload: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Suggestion:
    """Action proposed by a memory agent.

    The :attr:`data` field stores suggestion specific information such as the
    patch replacement text.  For ``patch`` suggestions the optional
    :attr:`span` identifies the byte range the patch applies to.
    """

    kind: SuggestionKind
    data: dict[str, Any]
    confidence: float
    agent_id: str
    span: tuple[int, int] | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class MemoryAgent(Protocol):
    """Protocol implemented by memory agents."""

    id: str
    kind: str
    cost_cap: float
    confidence: float
    modes: set[str] | list[str] | tuple[str, ...]

    def system_prompt(self) -> str:
        """Human readable system prompt."""

    def match(self, event: Event) -> bool:
        """Return ``True`` if the agent wants to act on ``event``."""

    def act(
        self, event: Event, retriever: RetrievalProvider | None = None
    ) -> list[Suggestion]:
        """Return zero or more suggestions for ``event``."""

    def learn(self, feedback: dict[str, Any]) -> None:
        """Update internal confidence metrics."""


@runtime_checkable
class RetrievalProvider(Protocol):
    """Minimal retrieval interface used by memory agents."""

    def index(self, items: list[dict]) -> None:
        """Add ``items`` to the retrieval index."""

    def search(self, query: str, k: int = 5) -> list[dict]:
        """Return the top ``k`` items for ``query``."""
