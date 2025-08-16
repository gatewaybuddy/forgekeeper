"""Automatically commit roadmap updates by synthesizing recent progress."""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Optional

from git import Repo

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.roadmap_updater import update_roadmap
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.memory.episodic import append_entry

log = get_logger(__name__, debug=DEBUG_MODE)


def commit_roadmap_update(
    repo_path: Path | None = None,
    roadmap_path: Path | None = None,
    memory_file: Path | None = None,
    commit_message: str = "chore: update roadmap",
    commit_limit: int = 5,
    memory_limit: int = 5,
    auto_push: bool = False,
    rationale: str | None = None,
) -> dict:
    """Append a roadmap update and commit the change autonomously."""

    section = update_roadmap(
        repo_path, roadmap_path, memory_file, commit_limit, memory_limit
    )
    repo = Repo(repo_path or Path.cwd(), search_parent_directories=True)
    path = roadmap_path or Path("Roadmap.md")
    repo.git.add(str(path))
    result = commit_and_push_changes(
        commit_message,
        run_checks=False,
        autonomous=True,
        task_id="roadmap-update",
        auto_push=auto_push,
    )

    summary = _extract_summary(section)
    try:
        append_entry(
            "roadmap-update",
            "Autonomous roadmap update",
            "done" if result.get("passed", False) else "failed",
            [str(path)],
            summary or commit_message,
            [],
            rationale=rationale,
        )
    except Exception as exc:  # pragma: no cover - best effort
        log.error(f"Failed to log roadmap commit: {exc}")
    return result


def start_periodic_commits(
    interval_seconds: int,
    repo_path: Path | None = None,
    roadmap_path: Path | None = None,
    memory_file: Path | None = None,
    commit_message: str = "chore: update roadmap",
    commit_limit: int = 5,
    memory_limit: int = 5,
    auto_push: bool = False,
    rationale: str | None = None,
) -> threading.Thread:
    """Start a background thread that periodically commits roadmap updates."""

    def _loop() -> None:
        while True:
            try:
                commit_roadmap_update(
                    repo_path,
                    roadmap_path,
                    memory_file,
                    commit_message,
                    commit_limit,
                    memory_limit,
                    auto_push,
                    rationale,
                )
            except Exception as exc:  # pragma: no cover - best effort
                log.error(f"Roadmap commit failed: {exc}")
            time.sleep(interval_seconds)

    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
    return thread


def _extract_summary(section: str) -> str:
    """Return the summary text from a roadmap update section."""
    lines = section.splitlines()
    try:
        start = lines.index("### Summary") + 1
    except ValueError:
        return ""
    end = len(lines)
    for idx in range(start, len(lines)):
        if lines[idx].startswith("### ") and idx != start:
            end = idx
            break
    return "\n".join(lines[start:end]).strip()


__all__ = ["commit_roadmap_update", "start_periodic_commits"]
