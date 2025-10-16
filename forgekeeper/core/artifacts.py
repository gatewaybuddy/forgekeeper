"""Minimal artifact representations for Spec-Kit integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Artifact:
    """Represents a document that can be materialised within the repo."""

    path: str
    body: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Ticket:
    """Represents a planned unit of work derived from Spec-Kit tasks."""

    id: str
    title: str = ""
    path: str | None = None
    inputs: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    acceptance_tests: list[str] = field(default_factory=list)
    artifacts: list[str] = field(default_factory=list)


__all__ = ["Artifact", "Ticket"]

