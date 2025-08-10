"""Episodic memory utilities."""

from __future__ import annotations

import argparse
import json
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
) -> None:
    """Append a task attempt entry to the episodic memory file."""
    entry = {
        "task_id": task_id,
        "title": title,
        "status": status,
        "changed_files": list(changed_files or []),
        "summary": summary,
        "artifacts_paths": list(artifacts_paths or []),
    }
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with MEMORY_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")


def _tail(n: int) -> None:
    """Print the last *n* entries from the episodic memory."""
    if not MEMORY_FILE.exists():
        return
    with MEMORY_FILE.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()[-n:]
    for line in lines:
        print(line.rstrip())


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Episodic memory utilities")
    sub = parser.add_subparsers(dest="cmd")

    p_tail = sub.add_parser("tail", help="Print last N entries")
    p_tail.add_argument("--n", type=int, default=20, help="Number of entries to show")

    args = parser.parse_args(argv)
    if args.cmd == "tail":
        _tail(args.n)
    else:
        parser.print_help()


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
