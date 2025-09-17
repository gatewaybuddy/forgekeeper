"""Command-line interface for episodic memory utilities."""

from __future__ import annotations

import argparse
import json
from typing import Sequence

from .episodic import MEMORY_FILE


def _tail(n: int, raw: bool = True) -> None:
    """Print the last *n* entries from the episodic memory.

    Parameters
    ----------
    n:
        Number of entries to display.
    raw:
        When ``True`` the JSON for each entry is printed. Otherwise a formatted
        summary including status, sentiment, and emotion is shown.
    """
    if not MEMORY_FILE.exists():
        return
    with MEMORY_FILE.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()[-n:]
    if raw:
        for line in lines:
            print(line.rstrip())
    else:
        for line in lines:
            try:
                data = json.loads(line)
            except Exception:
                print(line.rstrip())
                continue
            tid = data.get("task_id", "")
            status = data.get("status", "")
            sentiment = data.get("sentiment", "")
            emotion = data.get("emotion", "")
            summary = data.get("summary", "")
            rationale = data.get("rationale")
            extra = f" | rationale: {rationale}" if rationale else ""
            print(
                f"[{tid}] {status} ({sentiment}, {emotion}) - {summary}{extra}"
            )


def _recent_pushes(n: int) -> None:
    """Display the last *n* push entries with their rationales and emotions."""
    if not MEMORY_FILE.exists():
        return
    with MEMORY_FILE.open("r", encoding="utf-8") as fh:
        entries = [json.loads(line) for line in fh if line.strip()]
    pushes = [e for e in entries if e.get("status") == "pushed"][-n:]
    for entry in reversed(pushes):
        tid = entry.get("task_id", "")
        title = entry.get("title", "")
        emotion = entry.get("emotion", "")
        rationale = entry.get("rationale", "")
        print(f"[{tid}] {title} ({emotion}) - {rationale}")


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Episodic memory utilities")
    parser.add_argument(
        "--review",
        type=int,
        metavar="N",
        help="Display the last N entries from episodic memory",
    )
    parser.add_argument(
        "--browse",
        type=int,
        metavar="N",
        help="Pretty-print the last N entries",
    )
    parser.add_argument(
        "--pushes",
        type=int,
        metavar="N",
        help="Show the last N automated push entries with rationales",
    )
    args = parser.parse_args(argv)
    if args.review is not None:
        _tail(args.review, raw=True)
    elif args.browse is not None:
        _tail(args.browse, raw=False)
    elif getattr(args, "pushes", None) is not None:
        _recent_pushes(args.pushes)
    else:
        parser.print_help()


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
