from __future__ import annotations

import subprocess
from typing import Any, Dict, List

from forgekeeper.tasks.parser import Task


def gh_repo_slug() -> str:
    """Return the GitHub slug for the current repository."""
    out = subprocess.check_output(
        ["git", "config", "--get", "remote.origin.url"], text=True
    ).strip()
    if out.endswith(".git"):
        out = out[:-4]
    if out.startswith("git@"):
        _, rest = out.split(":", 1)
        return rest
    if out.startswith("https://") or out.startswith("http://"):
        parts = out.split("/")
        return "/".join(parts[-2:])
    return out


def fetch_prs_for_tasks(tasks: List[Task], token: str) -> Dict[str, Any]:
    import requests

    owner_repo = gh_repo_slug()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    url = f"https://api.github.com/repos/{owner_repo}/pulls?state=all&per_page=100"
    prs = requests.get(url, headers=headers, timeout=30).json()
    by_task: Dict[str, list] = {}
    for pr in prs:
        title = pr.get("title", "")
        for t in tasks:
            if t.id and t.id in title:
                by_task.setdefault(t.id, []).append(pr)
    return by_task
