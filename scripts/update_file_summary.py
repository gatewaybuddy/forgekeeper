#!/usr/bin/env python
"""Regenerate `FILE_SUMMARY.md` with a one-line summary for each tracked file."""

from __future__ import annotations

from pathlib import Path
import datetime
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SUMMARY_FILE = ROOT / "FILE_SUMMARY.md"


def git_tracked_files() -> list[str]:
    """Return a sorted list of tracked file paths relative to repo root."""
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout.strip().splitlines()


def first_line(path: Path) -> str:
    """Return the first line of a file, or note if binary/empty."""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            line = fh.readline().strip()
    except Exception:
        line = "(binary file)"
    return line.replace("`", "\\`")


def build_summary() -> str:
    lines = [
        f"Updated {datetime.date.today().isoformat()}",
        "# Repository File Summary",
        "",
        "Below is a one-line summary for every tracked file in the repository, grouped by directory path.",
        "",
    ]
    for rel_path in git_tracked_files():
        path = ROOT / rel_path
        lines.append(f"- `{rel_path}`: {first_line(path)}")
    return "\n".join(lines) + "\n"


def main() -> None:
    SUMMARY_FILE.write_text(build_summary(), encoding="utf-8")
    print(f"Wrote summary for {len(git_tracked_files())} files to {SUMMARY_FILE}")


if __name__ == "__main__":
    main()

