import os, re, json, sys, subprocess
from dataclasses import dataclass, asdict
from typing import List, Dict, Any

try:
    import yaml  # PyYAML
except Exception:
    print("Missing dependency: pyyaml", file=sys.stderr)
    sys.exit(2)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL|re.MULTILINE)


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
        # Body extends until next frontmatter or EOF
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end: next_m.start() if next_m else len(text)].strip()
        tasks.append(Task(
            id=str(fm.get("id")),
            title=fm.get("title", "").strip(),
            status=fm.get("status", "todo").strip(),
            epic=fm.get("epic"),
            owner=fm.get("owner"),
            labels=fm.get("labels") or [],
            body=body
        ))
        idx = end
    return tasks


def format_task_block(t: Task) -> str:
    fm = {
        "id": t.id, "title": t.title, "status": t.status,
        "epic": t.epic, "owner": t.owner, "labels": t.labels or []
    }
    front = yaml.safe_dump(fm, sort_keys=False).strip()
    return f"---\n{front}\n---\n{t.body.strip()}\n\n"


def write_tasks_md(path: str, tasks: List[Task]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for t in tasks:
            f.write(format_task_block(t))


def gh_repo_slug() -> str:
    # e.g., 'user/repo'
    out = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], text=True).strip()
    # support https and ssh
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
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    url = f"https://api.github.com/repos/{owner_repo}/pulls?state=all&per_page=100"
    prs = requests.get(url, headers=headers, timeout=30).json()
    by_task: Dict[str, list] = {}
    for pr in prs:
        title = pr.get("title", "")
        for t in tasks:
            if t.id and t.id in title:
                by_task.setdefault(t.id, []).append(pr)
    return by_task


def sync_status(tasks: List[Task], pr_map: Dict[str, List[Dict[str, Any]]]) -> None:
    for t in tasks:
        prs = pr_map.get(t.id, [])
        if not prs:
            continue
        # Priority: merged -> done; open+label needs_review -> needs_review; open -> in_progress
        merged = any(p.get("merged_at") for p in prs)
        if merged:
            t.status = "done"
        else:
            open_prs = [p for p in prs if p.get("state") == "open"]
            if any("needs_review" in [lbl["name"] for lbl in p.get("labels", [])] for p in open_prs):
                t.status = "needs_review"
            elif open_prs:
                t.status = "in_progress"


def rollup_roadmap(tasks: List[Task], road_path: str) -> None:
    with open(road_path, "r", encoding="utf-8") as f:
        roadmap = yaml.safe_load(f) or {}
    epics = {e["id"]: e for e in (roadmap.get("epics") or [])}
    for epic_id, epic in epics.items():
        # compute completion by tasks referencing this epic
        epic_tasks = [t for t in tasks if t.epic == epic_id]
        done = sum(1 for t in epic_tasks if t.status == "done")
        total = max(1, len(epic_tasks))
        epic["progress"] = round(100 * done / total, 1)
        # auto-update milestone statuses if all tasks for a milestone are done (best‑effort heuristic via title match)
        for m in (epic.get("milestones") or []):
            title = (m.get("title") or "").lower()
            m_tasks = [t for t in epic_tasks if title and title in (t.title or "").lower()]
            if m_tasks and all(t.status == "done" for t in m_tasks):
                m["status"] = "done"
    roadmap["epics"] = list(epics.values())
    with open(road_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(roadmap, f, sort_keys=False)


def main():
    gh_token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    tasks_path = "tasks.md"
    road_path = "roadmap.yaml"
    tasks = parse_tasks_md(tasks_path)
    if gh_token:
        pr_map = fetch_prs_for_tasks(tasks, gh_token)
        sync_status(tasks, pr_map)
    write_tasks_md(tasks_path, tasks)
    if os.path.exists(road_path):
        rollup_roadmap(tasks, road_path)


if __name__ == "__main__":
    main()

