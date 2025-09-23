"""Self-review loop placeholders."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass
class ReviewOutcome:
    approved: bool
    notes: list[str]


def run_self_review(changes: Iterable[str]) -> ReviewOutcome:
    """Placeholder for the self-review flow."""
    raise NotImplementedError("Self-review migration pending.")


__all__ = ["ReviewOutcome", "run_self_review"]
