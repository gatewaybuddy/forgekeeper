#!/usr/bin/env python3
"""Apply labels to the current pull request based on `tasks.md` metadata."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import List

import requests
import yaml

from forgekeeper.task_queue import TaskQueue, Task

ROOT = Path(__file__).resolve().parents[1]
TASK_FILE = ROOT / "tasks.md"

FK_RE = re.compile(r"FK-\d+")
PRIORITY_RE = re.compile(r"\(P([0-3])\)")


# ---------------------------------------------------------------------------
# Helpers

def extract_labels(task: Task) -> List[str]:
    """Return labels defined in a task's frontmatter."""
    lines = task.lines[1:]
    start = end = None
    for i, line in enumerate(lines):
        if line.strip() == "---":
            if start is None:
                start = i
            else:
                end = i
                break
    if start is None or end is None or end <= start:
        return []
    block = "\n".join(l.lstrip() for l in lines[start + 1 : end])
    data = yaml.safe_load(block) or {}
    labels = data.get("labels", [])
    if isinstance(labels, str):
        return [labels]
    return list(labels)


def priority_label(task: Task) -> str | None:
    match = PRIORITY_RE.search(task.description)
    if match:
        return f"priority:P{match.group(1)}"
    return None


def find_task_by_key(queue: TaskQueue, key: str) -> Task | None:
    for task in queue.list_tasks():
        if FK_RE.search(task.description) and FK_RE.search(task.description).group(0) == key:
            return task
    return None


def existing_labels(owner: str, repo: str, number: int, headers: dict) -> set[str]:
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{number}/labels"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return {l["name"] for l in resp.json()}


def ensure_label(owner: str, repo: str, label: str, headers: dict) -> None:
    url = f"https://api.github.com/repos/{owner}/{repo}/labels"
    resp = requests.post(url, json={"name": label, "color": "6f42c1"}, headers=headers)
    if resp.status_code not in (201, 422):  # 422 = already exists
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Main workflow

def main() -> None:
    token = os.environ["GITHUB_TOKEN"]
    owner, repo = os.environ["GITHUB_REPOSITORY"].split("/")
    with open(os.environ["GITHUB_EVENT_PATH"], "r", encoding="utf-8") as fh:
        event = json.load(fh)
    pr = event["pull_request"]
    text = " ".join([pr.get("title", ""), pr.get("body", ""), pr["head"]["ref"]])
    keys = set(FK_RE.findall(text))
    if not keys:
        print("No FK-### identifiers found")
        return

    queue = TaskQueue(TASK_FILE)
    labels: set[str] = set()
    for key in keys:
        task = find_task_by_key(queue, key)
        if not task:
            continue
        labels.update(extract_labels(task))
        p = priority_label(task)
        if p:
            labels.add(p)
    if not labels:
        print("No labels to apply")
        return

    headers = {"Authorization": f"token {token}"}
    for label in labels:
        ensure_label(owner, repo, label, headers)
    number = pr["number"]
    current = existing_labels(owner, repo, number, headers)
    to_add = [l for l in labels if l not in current]
    if to_add:
        url = f"https://api.github.com/repos/{owner}/{repo}/issues/{number}/labels"
        requests.post(url, json={"labels": to_add}, headers=headers).raise_for_status()
    print("Applied labels:", ", ".join(to_add))


if __name__ == "__main__":
    main()
