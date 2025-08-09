#!/usr/bin/env python3
"""Apply labels to the current pull request based on `tasks.md` metadata."""

import os, re, sys, json, subprocess
from typing import List, Dict, Any, Set

try:
    import yaml  # PyYAML
except Exception:
    print("Missing dependency: pyyaml", file=sys.stderr)
    sys.exit(2)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)
TASK_ID_RE = re.compile(r"\b(FK-\d+)\b", re.IGNORECASE)  # matches FK-123
PRIORITY_PAT = re.compile(r"\((P[0-3])\)", re.IGNORECASE)  # matches (P0)..(P3)


def parse_tasks_md(path: str) -> Dict[str, Dict[str, Any]]:
    """
    Scan tasks.md for blocks of:

    ---
    id: FK-123
    title: ...
    labels: [a, b]
    ...
    ---
    <body until next frontmatter or EOF>

    Returns a dict keyed by uppercased task id (e.g., FK-123).
    """
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    tasks: Dict[str, Dict[str, Any]] = {}
    idx = 0
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            break
        fm = yaml.safe_load(m.group(1)) or {}
        start, end = m.span()
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end : (next_m.start() if next_m else len(text))].strip()
        tid = (fm.get("id") or "").strip()
        if tid:
            key = tid.upper()
            tasks[key] = {
                "id": key,
                "title": (fm.get("title") or "").strip(),
                "labels": fm.get("labels") or [],
                "body": body,
            }
        idx = end
    return tasks


def repo_slug_from_env_or_git() -> str:
    """
    Prefer GITHUB_REPOSITORY=owner/repo when running in Actions.
    Fallback to parsing `git remote origin` URL.
    """
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


def list_existing_labels(slug: str, token: str) -> Dict[str, Dict[str, Any]]:
    import requests

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    existing: Dict[str, Dict[str, Any]] = {}
    page = 1
    while True:
        r = requests.get(
            f"https://api.github.com/repos/{slug}/labels?per_page=100&page={page}",
            headers=headers,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            break
        for lab in data:
            existing[lab["name"]] = lab
        page += 1
    return existing


def ensure_labels(slug: str, labels: Set[str], token: str) -> None:
    import requests

    if not labels:
        return
    existing = list_existing_labels(slug, token)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

    for name in sorted(labels):
        if name in existing:
            continue
        # deterministic colors: priorities green-ish, others blue-ish
        color = "0e8a16" if name.lower().startswith("priority:") else "0366d6"
        payload = {"name": name, "color": color, "description": "auto-created from tasks.md"}
        r = requests.post(
            f"https://api.github.com/repos/{slug}/labels",
            headers=headers,
            json=payload,
            timeout=30,
        )
        if r.status_code not in (200, 201, 422):  # 422: already exists (race)
            r.raise_for_status()


def add_labels_to_pr(slug: str, pr_number: int, labels: Set[str], token: str) -> None:
    import requests

    if not labels:
        return
    ensure_labels(slug, labels, token)

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    # Fetch current labels so we only add missing ones
    cur = requests.get(
        f"https://api.github.com/repos/{slug}/issues/{pr_number}/labels",
        headers=headers,
        timeout=30,
    )
    cur.raise_for_status()
    existing = {l["name"] for l in cur.json()}

    to_add = sorted({l for l in labels if l not in existing})
    if not to_add:
        print(f"No new labels to add for PR #{pr_number}")
        return

    r = requests.post(
        f"https://api.github.com/repos/{slug}/issues/{pr_number}/labels",
        headers=headers,
        json={"labels": to_add},
        timeout=30,
    )
    if r.status_code not in (200, 201):
        r.raise_for_status()
    print(f"Applied labels to PR #{pr_number}: {to_add}")


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

    # Collect FK ids from PR title/body/branch
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
        # labels from frontmatter
        for l in (t.get("labels") or []):
            labels.add(str(l))
        # priority from title or body: (P0)..(P3) → priority:P0
        for src in (t.get("title") or "", t.get("body") or ""):
            m = PRIORITY_PAT.search(src)
            if m:
                labels.add(f"priority:{m.group(1).upper()}")

    # If FK IDs exist but no labels, add a breadcrumb
    if ids and not labels:
        labels.add("from:tasks")

    slug = repo_slug_from_env_or_git()
    add_labels_to_pr(slug, pr_number, labels, token)


if __name__ == "__main__":
    main()
