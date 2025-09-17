from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict, Any

from git import Repo

from forgekeeper.memory.episodic import append_entry


def undo_last_commit(repo_dir: Path | None = None) -> Optional[Dict[str, Any]]:
    """Revert the most recent commit and log the undo in episodic memory."""
    repo_path = repo_dir or Path(__file__).resolve().parents[2]
    repo = Repo(repo_path, search_parent_directories=True)
    try:
        last_commit = repo.head.commit
    except Exception:
        return None

    files = repo.git.diff("--name-only", "HEAD~1").splitlines()
    title = last_commit.message.splitlines()[0]
    try:
        repo.git.revert("HEAD", no_edit=True)
        append_entry(
            last_commit.hexsha,
            title,
            "undo",
            files,
            f"Reverted {last_commit.hexsha}",
            [],
        )
        return {"reverted_commit": last_commit.hexsha, "files": files}
    except Exception as exc:
        append_entry(
            last_commit.hexsha,
            title,
            "undo-failed",
            files,
            str(exc),
            [],
        )
        return {"error": str(exc), "files": files}
