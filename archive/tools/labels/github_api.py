"""GitHub label management helpers."""

from __future__ import annotations

from typing import Any, Dict, Set

import requests


def list_existing_labels(slug: str, token: str) -> Dict[str, Dict[str, Any]]:
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
    if not labels:
        return
    existing = list_existing_labels(slug, token)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

    for name in sorted(labels):
        if name in existing:
            continue
        color = "0e8a16" if name.lower().startswith("priority:") else "0366d6"
        payload = {"name": name, "color": color, "description": "auto-created from tasks.md"}
        r = requests.post(
            f"https://api.github.com/repos/{slug}/labels",
            headers=headers,
            json=payload,
            timeout=30,
        )
        if r.status_code not in (200, 201, 422):
            r.raise_for_status()


def add_labels_to_pr(slug: str, pr_number: int, labels: Set[str], token: str) -> None:
    if not labels:
        return
    ensure_labels(slug, labels, token)

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
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
