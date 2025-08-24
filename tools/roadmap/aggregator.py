from __future__ import annotations

from typing import Any, Dict, List

from forgekeeper.tasks.parser import Task

try:
    import yaml  # type: ignore
except Exception as exc:  # pragma: no cover - dependency missing
    raise ImportError("Missing dependency: pyyaml") from exc


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


def sync_status(tasks: List[Task], pr_map: Dict[str, List[Dict[str, Any]]]) -> None:
    for t in tasks:
        prs = pr_map.get(t.id, [])
        if not prs:
            continue
        merged = any(p.get("merged_at") for p in prs)
        if merged:
            t.status = "done"
        else:
            open_prs = [p for p in prs if p.get("state") == "open"]
            if any(
                "needs_review" in [lbl["name"] for lbl in p.get("labels", [])]
                for p in open_prs
            ):
                t.status = "needs_review"
            elif open_prs:
                t.status = "in_progress"


def rollup_roadmap(tasks: List[Task], road_path: str) -> None:
    with open(road_path, "r", encoding="utf-8") as f:
        roadmap = yaml.safe_load(f) or {}
    epics = {e["id"]: e for e in (roadmap.get("epics") or [])}
    for epic_id, epic in epics.items():
        epic_tasks = [t for t in tasks if t.epic == epic_id]
        done = sum(1 for t in epic_tasks if t.status == "done")
        total = max(1, len(epic_tasks))
        epic["progress"] = round(100 * done / total, 1)
        for m in (epic.get("milestones") or []):
            title = (m.get("title") or "").lower()
            m_tasks = [
                t for t in epic_tasks if title and title in (t.title or "").lower()
            ]
            if m_tasks and all(t.status == "done" for t in m_tasks):
                m["status"] = "done"
    roadmap["epics"] = list(epics.values())
    with open(road_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(roadmap, f, sort_keys=False)
