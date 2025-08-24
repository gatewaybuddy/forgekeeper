"""Utilities to draft and append roadmap updates.

The updater reads recent commit messages and episodic memory entries and
appends a summary to ``Roadmap.md``.  A helper is provided to schedule periodic
updates which can be triggered by the high level goal manager when operating
autonomously.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from git import Repo

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.memory.episodic import MEMORY_FILE
from forgekeeper.sprint_planner import update_sprint_plan

log = get_logger(__name__, debug=DEBUG_MODE)


def _recent_commits(repo: Repo, limit: int = 5) -> Sequence[str]:
    return [c.summary for c in repo.iter_commits(max_count=limit)]


def _recent_memory(path: Path, limit: int = 5) -> Sequence[str]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()[-limit:]
    entries = []
    for line in lines:
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        entries.append(data.get("summary", ""))
    return entries


def generate_progress_summary(
    commits: Sequence[str], mem_entries: Sequence[str]
) -> str:
    """Return a deterministic progress summary from commits and memory.

    The function intentionally avoids LLM prompts so that periodic roadmap
    updates can run autonomously.  Only a small slice of recent commit
    messages and episodic memory summaries are included to keep the result
    concise and reproducible.
    """

    if not commits and not mem_entries:
        return ""

    parts: list[str] = []
    if commits:
        joined = ", ".join(commits[:3])
        parts.append(f"Recent commits: {joined}")
    if mem_entries:
        joined = ", ".join(mem_entries[:3])
        parts.append(f"Recent memory: {joined}")
    return "; ".join(parts)


def draft_update(
    repo_path: Path | None = None,
    memory_file: Path | None = None,
    commit_limit: int = 5,
    memory_limit: int = 5,
) -> str:
    """Create a markdown section summarising recent work."""

    repo = Repo(repo_path or Path.cwd(), search_parent_directories=True)
    commits = _recent_commits(repo, commit_limit)
    mem_entries = _recent_memory(memory_file or MEMORY_FILE, memory_limit)

    summary = generate_progress_summary(commits, mem_entries)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"## Update {timestamp}"]
    if summary:
        lines.append("### Summary")
        lines.append(summary)
    if commits:
        lines.append("\n### Recent Commits")
        lines.extend(f"- {msg}" for msg in commits)
    if mem_entries:
        lines.append("\n### Recent Memory")
        lines.extend(f"- {m}" for m in mem_entries)
    return "\n".join(lines) + "\n"


def append_update(section: str, roadmap_path: Path | None = None) -> None:
    path = roadmap_path or Path("Roadmap.md")
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    text = existing.rstrip() + "\n\n" + section
    path.write_text(text, encoding="utf-8")


def update_roadmap(
    repo_path: Path | None = None,
    roadmap_path: Path | None = None,
    memory_file: Path | None = None,
    commit_limit: int = 5,
    memory_limit: int = 5,
) -> str:
    """Generate an update section and append it to the roadmap."""

    section = draft_update(repo_path, memory_file, commit_limit, memory_limit)
    append_update(section, roadmap_path)
    log.info("Roadmap updated")
    return section


def start_periodic_updates(
    interval_seconds: int,
    repo_path: Path | None = None,
    roadmap_path: Path | None = None,
    memory_file: Path | None = None,
    sprint_plan_path: Path | None = None,
) -> threading.Thread:
    """Start a background thread that updates the roadmap periodically."""

    def _loop() -> None:
        while True:
            try:
                update_roadmap(repo_path, roadmap_path, memory_file)
                update_sprint_plan(plan_path=sprint_plan_path)
            except Exception as exc:  # pragma: no cover - best effort
                log.error(f"Roadmap update failed: {exc}")
            time.sleep(interval_seconds)

    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
    return thread


__all__ = [
    "generate_progress_summary",
    "draft_update",
    "append_update",
    "update_roadmap",
    "start_periodic_updates",
]

