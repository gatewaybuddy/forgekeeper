#!/usr/bin/env python3
"""Apply labels to the current pull request based on `tasks.md` metadata."""

import json
import os
import re
import subprocess
import sys
from typing import Set

try:
    from tools.labels.parser import parse_tasks_md
    from tools.labels.github_api import add_labels_to_pr
except Exception:
    print("Missing dependency: pyyaml or requests", file=sys.stderr)
    sys.exit(2)

TASK_ID_RE = re.compile(r"\b(FK-\d+)\b", re.IGNORECASE)
PRIORITY_PAT = re.compile(r"\((P[0-3])\)", re.IGNORECASE)


def repo_slug_from_env_or_git() -> str:
    """Prefer GITHUB_REPOSITORY env var; fallback to `git remote origin`."""
    slug = os.getenv("GITHUB_REPOSITORY")
    if slug:
        return slug
    url = subprocess.check_output(
        ["git", "config", "--get", "remote.origin.url"], text=True
    ).strip()
    if url.endswith(".git"):
        url = url[:-4]
    if url.startswith("git@"):
        _, slug = url.split(":", 1)
    else:
        parts = url.split("/")
        slug = "/".join(parts[-2:])
    return slug


def main() -> None:
    event_path = os.getenv("GITHUB_EVENT_PATH")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if not (event_path and token):
        print("Missing GITHUB_EVENT_PATH or token", file=sys.stderr)
        sys.exit(2)

    with open(event_path, "r", encoding="utf-8") as fh:
        evt = json.load(fh)

    pr = evt.get("pull_request") or {}
    try:
        pr_number = int(pr.get("number"))
    except (TypeError, ValueError):
        print("Not a pull_request event or missing PR number", file=sys.stderr)
        sys.exit(0)

    title = pr.get("title") or ""
    body = pr.get("body") or ""
    branch = (pr.get("head") or {}).get("ref", "") or ""

    ids: Set[str] = set()
    for blob in (title, body, branch):
        ids.update(t.upper() for t in TASK_ID_RE.findall(blob or ""))

    tasks_path = "tasks.md"
    if not os.path.exists(tasks_path):
        print("tasks.md not found; nothing to label")
        sys.exit(0)

    tasks = parse_tasks_md(tasks_path)

    labels: Set[str] = set()
    for tid in sorted(ids):
        t = tasks.get(tid)
        if not t:
            continue
        for l in (t.get("labels") or []):
            labels.add(str(l))
        for src in (t.get("title") or "", t.get("body") or ""):
            m = PRIORITY_PAT.search(src)
            if m:
                labels.add(f"priority:{m.group(1).upper()}")

    if ids and not labels:
        labels.add("from:tasks")

    slug = repo_slug_from_env_or_git()
    add_labels_to_pr(slug, pr_number, labels, token)


if __name__ == "__main__":
    main()
