import json
import os
import re
from pathlib import Path

import requests
import yaml


def parse_tasks(path: Path):
    content = path.read_text(encoding="utf-8")
    segments = []
    tasks = []
    pos = 0
    while True:
        start = content.find("---\n", pos)
        if start == -1:
            segments.append({"text": content[pos:]})
            break
        end = content.find("\n---\n", start + 4)
        if end == -1:
            segments.append({"text": content[pos:]})
            break
        yaml_text = content[start + 4 : end]
        try:
            data = yaml.safe_load(yaml_text) or {}
        except yaml.YAMLError:
            segments.append({"text": content[pos : end + 5]})
            pos = end + 5
            continue
        if not isinstance(data, dict) or "id" not in data:
            segments.append({"text": content[pos : end + 5]})
            pos = end + 5
            continue
        pre_text = content[pos:start]
        segments.append({"text": pre_text})
        pos = end + 5
        next_start = content.find("---\n", pos)
        if next_start == -1:
            body = content[pos:]
            pos = len(content)
        else:
            body = content[pos:next_start]
            pos = next_start
        task_seg = {"data": data, "body": body}
        segments.append({"task": task_seg})
        tasks.append(task_seg)
    return segments, tasks


def write_tasks(path: Path, segments):
    out = []
    for seg in segments:
        if "text" in seg:
            out.append(seg["text"])
        else:
            yaml_text = yaml.safe_dump(seg["task"]["data"], sort_keys=True).strip()
            out.append(f"---\n{yaml_text}\n---\n{seg['task']['body']}")
    path.write_text("".join(out), encoding="utf-8")


def map_prs(repo: str | None, token: str | None):
    if not repo:
        return {}
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    prs = {}
    page = 1
    while True:
        resp = requests.get(
            f"https://api.github.com/repos/{repo}/pulls",
            headers=headers,
            params={"state": "all", "per_page": 100, "page": page},
            timeout=30,
        )
        if resp.status_code != 200:
            break
        batch = resp.json()
        if not batch:
            break
        for pr in batch:
            text = f"{pr.get('title', '')} {pr.get('head', {}).get('ref', '')}"
            m = re.search(r"FK-(\d+)", text, re.IGNORECASE)
            if m:
                prs[m.group(1)] = pr
        page += 1
    return prs


def update_task_statuses(tasks, pr_map):
    for task in tasks:
        tid = task["data"].get("id")
        if tid is None:
            continue
        pr = pr_map.get(str(tid))
        if not pr:
            continue
        if pr.get("merged_at"):
            task["data"]["status"] = "done"
        elif pr.get("state") == "open" and any(l.get("name") == "needs_review" for l in pr.get("labels", [])):
            task["data"]["status"] = "needs_review"


def update_roadmap(path: Path, tasks):
    if not path.exists():
        return
    roadmap = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    milestones = roadmap.get("milestones", [])
    counts: dict[str, dict[str, int]] = {}
    for task in tasks:
        epic = task["data"].get("epic")
        status = task["data"].get("status")
        if not epic:
            continue
        c = counts.setdefault(epic, {"total": 0, "done": 0})
        c["total"] += 1
        if status == "done":
            c["done"] += 1
    for m in milestones:
        epic = m.get("epic")
        c = counts.get(epic, {"total": 0, "done": 0})
        total, done = c["total"], c["done"]
        if total == 0:
            status = m.get("status", "todo")
        elif done == 0:
            status = "todo"
        elif done == total:
            status = "done"
        else:
            status = "in_progress"
        m["status"] = status
    path.write_text(yaml.safe_dump(roadmap, sort_keys=False), encoding="utf-8")


def main():
    root = Path(__file__).resolve().parents[1]
    tasks_path = root / "tasks.md"
    roadmap_path = root / "roadmap.yaml"
    segments, tasks = parse_tasks(tasks_path)
    pr_map = map_prs(os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GH_TOKEN"))
    update_task_statuses(tasks, pr_map)
    write_tasks(tasks_path, segments)
    update_roadmap(roadmap_path, tasks)
    print(json.dumps([t["data"] for t in tasks], indent=2))


if __name__ == "__main__":
    main()
