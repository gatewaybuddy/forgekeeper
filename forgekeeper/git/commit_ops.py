"""Commit and push helper functions."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Iterable

from git import Repo

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.memory.episodic import append_entry


log = get_logger(__name__, debug=DEBUG_MODE)


def commit_changes(
    repo: Repo,
    commit_message: str,
    files: Iterable[str],
    task_id: str,
    create_branch: bool,
    branch_prefix: str,
    autonomous: bool,
    artifacts_path: str = "",
) -> dict:
    """Commit staged changes and record the changelog."""

    repo_root = Path(repo.working_tree_dir)
    log_dir = repo_root / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    changelog_path = log_dir / "changelog.txt"
    branch_name = repo.active_branch.name

    if repo.is_dirty(index=True, working_tree=False, untracked_files=False):
        if create_branch:
            origin = repo.remote()
            origin.fetch()
            branch_name = f"{branch_prefix}/{datetime.now().strftime('%Y%m%d%H%M%S')}"
            repo.git.checkout("-b", branch_name)
        if not autonomous:
            resp = input("Commit changes? [y/N]: ").strip().lower()
            if resp not in {"y", "yes"}:
                log.info("Commit aborted by user")
                append_entry(
                    task_id,
                    commit_message,
                    "commit-declined",
                    files,
                    "Commit aborted by user",
                    [artifacts_path] if artifacts_path else [],
                )
                return {
                    "committed": False,
                    "branch_name": branch_name,
                    "changelog": "",
                    "changelog_path": "",
                    "aborted": True,
                }
        repo.index.commit(commit_message)
        log.info(f"Committed changes on {branch_name}: {commit_message}")
        changelog = repo.git.log("-1", "--stat")
        changelog_path.write_text(changelog, encoding="utf-8")
        append_entry(
            task_id,
            commit_message,
            "committed",
            files,
            f"Committed changes on {branch_name}: {commit_message}",
            [artifacts_path] if artifacts_path else [],
        )
        return {
            "committed": True,
            "branch_name": branch_name,
            "changelog": changelog,
            "changelog_path": str(changelog_path),
            "aborted": False,
        }

    log.info("No staged changes to commit")
    append_entry(
        task_id,
        commit_message,
        "no-changes",
        [],
        "No staged changes to commit",
        [artifacts_path] if artifacts_path else [],
    )
    return {
        "committed": False,
        "branch_name": branch_name,
        "changelog": "",
        "changelog_path": "",
        "aborted": False,
    }


def push_branch(
    repo: Repo,
    branch_name: str,
    commit_message: str,
    files: Iterable[str],
    task_id: str,
    autonomous: bool,
    auto_push: bool,
    changelog_path: str,
    changelog: str,
    rationale: str | None = None,
) -> dict:
    """Push ``branch_name`` to the remote repository."""

    pushed = False
    try:
        origin = repo.remote()
        if autonomous or auto_push:
            origin.push(branch_name)
            pushed = True
            log.info("Pushed to remote")
        else:
            if (
                input(f"Push branch {branch_name} to remote? [y/N]: ")
                .strip()
                .lower()
                in {"y", "yes"}
            ):
                origin.push(branch_name)
                pushed = True
                log.info("Pushed to remote")
            else:
                log.info("Push to remote skipped")
    except Exception as exc:  # pragma: no cover - network errors
        log.error(f"Push failed: {exc}")
        append_entry(
            task_id,
            commit_message,
            "push-failed",
            files,
            f"Push failed: {exc}",
            [changelog_path] if changelog_path else [],
            rationale=rationale or commit_message,
        )
        return {"pushed": False}

    if pushed:
        summary = (
            f"Pushed changes on {branch_name}: {commit_message}. "
            f"Changelog at {changelog_path}"
        )
        log.info(summary)
        append_entry(
            task_id,
            commit_message,
            "pushed",
            files,
            summary,
            [changelog_path] if changelog_path else [],
            rationale=rationale or commit_message,
        )
    return {"pushed": pushed}

