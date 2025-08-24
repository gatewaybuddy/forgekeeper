from __future__ import annotations

import os

from forgekeeper.tasks.parser import parse_tasks_md
from tools.roadmap.github import fetch_prs_for_tasks
from tools.roadmap.aggregator import write_tasks_md, sync_status, rollup_roadmap


def main() -> None:
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
