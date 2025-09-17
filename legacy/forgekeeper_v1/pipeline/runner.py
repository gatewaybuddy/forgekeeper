from __future__ import annotations

from pathlib import Path

from .loop import run, STATE_PATH
from .review import run_review, run_self_review, review_change_set

__all__ = ["main", "run_review", "run_self_review", "review_change_set"]


def main(state: dict, state_path: Path = STATE_PATH) -> None:
    """Thin wrapper that delegates to :func:`loop.run`."""
    run(state, state_path)
