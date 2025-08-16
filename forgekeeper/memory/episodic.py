"""Episodic memory utilities."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Sequence

MEMORY_FILE = Path(".forgekeeper/memory/episodic.jsonl")


def append_entry(
    task_id: str,
    title: str,
    status: str,
    changed_files: Sequence[str] | None,
    summary: str,
    artifacts_paths: Sequence[str] | None,
    sentiment: str | None = None,
    rationale: str | None = None,
) -> None:
    """Append a task attempt entry to the episodic memory file."""
    entry = {
        "task_id": task_id,
        "title": title,
        "status": status,
        "changed_files": list(changed_files or []),
        "summary": summary,
        "artifacts_paths": list(artifacts_paths or []),
        "sentiment": sentiment or "neutral",
        "rationale": rationale,
    }
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(entry) + "\n").encode("utf-8")
    fd = os.open(MEMORY_FILE, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)


def _tail(n: int, raw: bool = True) -> None:
    """Print the last *n* entries from the episodic memory.

    Parameters
    ----------
    n:
        Number of entries to display.
    raw:
        When ``True`` the JSON for each entry is printed. Otherwise a formatted
        summary including status and sentiment is shown.
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
            summary = data.get("summary", "")
            rationale = data.get("rationale")
            extra = f" | rationale: {rationale}" if rationale else ""
            print(f"[{tid}] {status} ({sentiment}) - {summary}{extra}")


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
    args = parser.parse_args(argv)
    if args.review is not None:
        _tail(args.review, raw=True)
    elif args.browse is not None:
        _tail(args.browse, raw=False)
    else:
        parser.print_help()


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
