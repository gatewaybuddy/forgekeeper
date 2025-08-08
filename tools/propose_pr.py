#!/usr/bin/env python3
"""Create a stub pull request for the next open task.

This helper picks the next ``todo`` task from ``tasks.md`` and uses the
GitHub API to open a pull request with the appropriate template.  The PR is
created on a new branch named ``fk/<id>-<slug>`` where ``id`` is the task's
index and ``slug`` is a URL friendly form of its description.

Environment variables:
    GH_TOKEN: Personal access token with ``repo`` scope.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional

import requests

from forgekeeper.task_queue import TaskQueue, Task


ROOT = Path(__file__).resolve().parents[1]
TASK_FILE = ROOT / "tasks.md"
PR_TEMPLATES = ROOT / ".github" / "PULL_REQUEST_TEMPLATE"


# ---------------------------------------------------------------------------
# Helpers

def slugify(text: str) -> str:
    """Return a URL-safe slug derived from ``text``."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return slug.strip("-")


def repo_info() -> tuple[str, str]:
    """Return ``(owner, repo)`` from git's ``origin`` remote."""
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
        check=True,
    )
    url = result.stdout.strip()
    if url.endswith(".git"):
        url = url[:-4]
    if url.startswith("git@github.com:"):
        path = url.split(":", 1)[1]
    elif url.startswith("https://github.com/"):
        path = url.split("github.com/", 1)[1]
    else:
        raise RuntimeError(f"Unsupported remote URL: {url}")
    owner, repo = path.split("/", 1)
    return owner, repo


def default_branch() -> str:
    result = subprocess.run(
        ["git", "remote", "show", "origin"],
        capture_output=True,
        text=True,
        check=True,
    )
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("HEAD branch:"):
            return line.split(":", 1)[1].strip()
    return "main"


def detect_template(task: Task) -> str:
    """Return ``"bugfix"`` if task looks like a bug, else ``"feature"``."""
    text = " ".join([task.description] + [l.strip() for l in task.lines[1:]])
    text = text.lower()
    if "bug" in text or "fix" in text:
        return "bugfix"
    return "feature"


def extract_owner(task: Task) -> Optional[str]:
    """Return ``@username`` mentioned in the task, if any."""
    for line in [task.description] + task.lines[1:]:
        match = re.search(r"@([A-Za-z0-9-]+)", line)
        if match:
            return match.group(1)
    return None


def acceptance_criteria(task: Task) -> List[str]:
    ac: List[str] = []
    for line in task.lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        stripped = re.sub(r"^[*-]\s*", "", stripped)
        ac.append(stripped)
    return ac


def task_link(owner: str, repo: str, branch: str, task: Task, queue: TaskQueue) -> str:
    lines = queue.path.read_text(encoding="utf-8").splitlines()
    block = task.lines
    for i in range(len(lines) - len(block) + 1):
        if lines[i : i + len(block)] == block:
            start = i + 1
            end = i + len(block)
            return f"https://github.com/{owner}/{repo}/blob/{branch}/tasks.md#L{start}-L{end}"
    return f"https://github.com/{owner}/{repo}/blob/{branch}/tasks.md"


def build_body(template: Path, ac: List[str], link: str) -> str:
    body = template.read_text(encoding="utf-8")
    if ac:
        body += "\n\n### Acceptance Criteria\n"
        for item in ac:
            body += f"- [ ] {item}\n"
    body += f"\n---\nLinked Task: {link}\n"
    return body


# ---------------------------------------------------------------------------
# Main workflow

def main() -> None:
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise RuntimeError("GH_TOKEN not set")

    queue = TaskQueue(TASK_FILE)
    task = queue.next_task()
    if not task:
        print("No pending tasks")
        return

    tasks = queue.list_tasks()
    task_id = tasks.index(task) + 1
    branch = f"fk/{task_id}-{slugify(task.description)}"

    subprocess.run(["git", "checkout", "-b", branch], check=True)
    subprocess.run(["git", "push", "-u", "origin", branch], check=True)

    owner, repo = repo_info()
    base = default_branch()
    template_name = detect_template(task)
    template_file = PR_TEMPLATES / f"{template_name}.md"
    ac = acceptance_criteria(task)
    link = task_link(owner, repo, base, task, queue)
    body = build_body(template_file, ac, link)

    headers = {"Authorization": f"token {token}"}
    payload = {"title": task.description, "head": branch, "base": base, "body": body}
    resp = requests.post(f"https://api.github.com/repos/{owner}/{repo}/pulls", json=payload, headers=headers)
    resp.raise_for_status()
    pr = resp.json()

    issue_url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pr['number']}"
    patch: dict = {"labels": ["needs_review"]}
    assignee = extract_owner(task)
    if assignee:
        patch["assignees"] = [assignee]
    requests.patch(issue_url, json=patch, headers=headers).raise_for_status()

    print(f"Created PR #{pr['number']}: {pr['html_url']}")


if __name__ == "__main__":
    main()
