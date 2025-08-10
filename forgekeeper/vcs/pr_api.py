from __future__ import annotations

"""GitHub pull request helper."""

from pathlib import Path
import os
import re
import subprocess
from typing import Any, Dict, Set

import requests

from forgekeeper.config import GITHUB_TOKEN_ENV_KEYS
from tools.auto_label_pr import (
    add_labels_to_pr,
    parse_tasks_md,
    repo_slug_from_env_or_git,
)

PRIORITY_PAT = re.compile(r"\((P[0-3])\)", re.IGNORECASE)


def _read_token() -> str:
    for key in GITHUB_TOKEN_ENV_KEYS:
        token = os.getenv(key)
        if token:
            return token
    raise RuntimeError("Missing GitHub token")


def current_branch() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True
    ).strip()


def _template_for_labels(labels: Set[str]) -> Path:
    lbls = {l.lower() for l in labels}
    if {"bug", "bugfix"} & lbls:
        return Path(".github/PULL_REQUEST_TEMPLATE/bugfix.md")
    if "refactor" in lbls:
        return Path(".github/PULL_REQUEST_TEMPLATE/refactor.md")
    if "docs" in lbls:
        return Path(".github/PULL_REQUEST_TEMPLATE/docs.md")
    if {"infra", "chore"} & lbls:
        return Path(".github/PULL_REQUEST_TEMPLATE/infra-chore.md")
    return Path(".github/PULL_REQUEST_TEMPLATE/feature.md")


def _labels_for_task(task_id: str, tasks_file: str) -> Set[str]:
    tasks = parse_tasks_md(tasks_file)
    task = tasks.get(task_id.upper())
    if not task:
        return set()
    labels = set(task.get("labels") or [])
    for src in (task.get("title") or "", task.get("body") or ""):
        m = PRIORITY_PAT.search(src)
        if m:
            labels.add(f"priority:{m.group(1).upper()}")
    if labels:
        return labels
    return {"from:tasks"}


def create_draft_pr(task: Dict[str, Any], tasks_file: str = "tasks.md") -> Dict[str, Any]:
    """Create a draft pull request and apply labels.

    Parameters
    ----------
    task:
        Task metadata with ``id`` and ``title`` fields.
    tasks_file:
        Path to ``tasks.md`` used for label extraction.
    """

    token = _read_token()
    slug = repo_slug_from_env_or_git()
    branch = current_branch()

    labels = _labels_for_task(task["id"], tasks_file)
    body = _template_for_labels(labels).read_text(encoding="utf-8")
    title = f"feat: {task['title']} [{task['id']}]"

    url = f"https://api.github.com/repos/{slug}/pulls"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    payload = {
        "title": title,
        "head": branch,
        "base": "main",
        "body": body,
        "draft": True,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    pr = resp.json()

    add_labels_to_pr(slug, pr["number"], labels, token)
    return pr
