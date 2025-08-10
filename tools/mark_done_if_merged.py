import os
import re
import sys
import subprocess
from dataclasses import dataclass
from typing import List

try:
    import yaml  # PyYAML
except Exception:
    print("Missing dependency: pyyaml", file=sys.stderr)
    sys.exit(2)

try:
    import requests
except Exception:
    print("Missing dependency: requests", file=sys.stderr)
    sys.exit(2)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)


@dataclass
class Task:
    id: str
    title: str
    status: str
    epic: str | None = None
    owner: str | None = None
    labels: List[str] | None = None
    body: str = ""


def parse_tasks_md(path: str) -> List[Task]:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    tasks: List[Task] = []
    idx = 0
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            break
        fm_text = m.group(1)
        fm = yaml.safe_load(fm_text) or {}
        start, end = m.span()
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end : (next_m.start() if next_m else len(text))].strip()
        tasks.append(
            Task(
                id=str(fm.get("id")),
                title=(fm.get("title", "") or "").strip(),
                status=(fm.get("status", "todo") or "").strip(),
                epic=fm.get("epic"),
                owner=fm.get("owner"),
                labels=fm.get("labels") or [],
                body=body,
            )
        )
        idx = end
    return tasks


def format_task_block(t: Task) -> str:
    fm = {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        "epic": t.epic,
        "owner": t.owner,
        "labels": t.labels or [],
    }
    front = yaml.safe_dump(fm, sort_keys=False).strip()
    return f"---\n{front}\n---\n{t.body.strip()}\n\n"


def write_tasks_md(path: str, tasks: List[Task]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for t in tasks:
            f.write(format_task_block(t))


def gh_repo_slug() -> str:
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


def fetch_prs_for_task(task_id: str, token: str) -> List[dict]:
    owner_repo = gh_repo_slug()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    url = f"https://api.github.com/repos/{owner_repo}/pulls?state=all&per_page=100"
    prs = requests.get(url, headers=headers, timeout=30).json()
    return [p for p in prs if task_id in p.get("title", "")]


def mark_done_if_merged(task_id: str, tasks_path: str = "tasks.md") -> bool:
    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        print("GH_TOKEN not set", file=sys.stderr)
        return False
    tasks = parse_tasks_md(tasks_path)
    task = next((t for t in tasks if t.id == task_id), None)
    if not task or task.status == "done":
        return False
    prs = fetch_prs_for_task(task_id, token)
    if any(p.get("merged_at") for p in prs):
        task.status = "done"
        write_tasks_md(tasks_path, tasks)
        return True
    return False


def main(argv: List[str] | None = None) -> None:
    argv = argv or sys.argv[1:]
    if not argv:
        print("Usage: mark_done_if_merged.py TASK_ID", file=sys.stderr)
        sys.exit(1)
    task_id = argv[0]
    mark_done_if_merged(task_id)


if __name__ == "__main__":
    main()
