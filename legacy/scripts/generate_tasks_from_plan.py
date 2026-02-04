from __future__ import annotations

import argparse
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import yaml

PLAN_PATH = Path("docs/plans/multi_role_pipeline.yaml")
OUTPUT_PATH = Path("tasks.md")


@dataclass
class Milestone:
    id: str
    title: str
    target_date: str | None
    owner: str | None
    summary: str | None


@dataclass
class Task:
    id: str
    milestone: str
    title: str
    description: str | None
    assignee: str | None
    deliverables: list[str]
    order: int

    @property
    def slug(self) -> str:
        base = self.title.lower()
        base = re.sub(r"[^a-z0-9]+", "-", base)
        base = re.sub(r"-+", "-", base)
        return base.strip("-")


class Plan:
    def __init__(self, milestones: dict[str, Milestone], tasks: list[Task]):
        self.milestones = milestones
        self.tasks = tasks

    @classmethod
    def from_yaml(cls, data: dict) -> "Plan":
        milestones: dict[str, Milestone] = {}
        for raw in data.get("milestones", []):
            milestone = Milestone(
                id=str(raw.get("id", "")).strip(),
                title=str(raw.get("title", "")).strip(),
                target_date=(str(raw.get("target_date")) if raw.get("target_date") else None),
                owner=(str(raw.get("owner")) if raw.get("owner") else None),
                summary=(str(raw.get("summary")) if raw.get("summary") else None),
            )
            if milestone.id:
                milestones[milestone.id] = milestone

        tasks: list[Task] = []
        for idx, raw in enumerate(data.get("tasks", [])):
            deliverables_raw = raw.get("deliverables") or []
            deliverables = [str(item).strip() for item in deliverables_raw if str(item).strip()]
            task = Task(
                id=str(raw.get("id", "")).strip(),
                milestone=str(raw.get("milestone", "")).strip(),
                title=str(raw.get("title", "")).strip(),
                description=(str(raw.get("description")) if raw.get("description") else None),
                assignee=(str(raw.get("assignee")) if raw.get("assignee") else None),
                deliverables=deliverables,
                order=idx,
            )
            if task.id and task.milestone:
                tasks.append(task)
        return cls(milestones=milestones, tasks=tasks)


def iter_grouped_tasks(plan: Plan) -> Iterable[tuple[Milestone, list[Task]]]:
    grouped: dict[str, list[Task]] = defaultdict(list)
    for task in plan.tasks:
        grouped[task.milestone].append(task)
    for milestone_id, milestone in plan.milestones.items():
        yield milestone, sorted(grouped.get(milestone_id, []), key=lambda t: t.order)


def format_task(task: Task) -> list[str]:
    owner = f" (Assignee: {task.assignee})" if task.assignee else ""
    description_text = " ".join(task.description.strip().split()) if task.description else ""
    description = f" — {description_text}" if description_text else ""
    header = f"- [ ] {task.id} · {task.slug} — {task.title}{owner}{description}"
    lines = [header]
    if task.deliverables:
        deliverables = "; ".join(task.deliverables)
        lines.append(f"  - Deliverables: {deliverables}")
    return lines


def render(plan: Plan) -> str:
    lines: list[str] = []
    lines.append("# ? Forgekeeper Tasks")
    lines.append("")
    lines.append(
        "> Generated from docs/plans/multi_role_pipeline.yaml via `python scripts/generate_tasks_from_plan.py`."
    )
    lines.append(
        "> Do not edit directly; update the plan and re-run the generator."
    )
    lines.append("")
    for milestone, tasks in iter_grouped_tasks(plan):
        title = milestone.title or milestone.id
        meta_bits: list[str] = []
        if milestone.owner:
            meta_bits.append(f"Owner: {milestone.owner}")
        if milestone.target_date:
            meta_bits.append(f"Target: {milestone.target_date}")
        meta = f" ({'; '.join(meta_bits)})" if meta_bits else ""
        lines.append(f"## {milestone.id} — {title}{meta}")
        if milestone.summary:
            summary = " ".join(milestone.summary.strip().split())
            lines.append(f"{summary}")
        else:
            lines.append("")
        if tasks:
            for task in tasks:
                lines.extend(format_task(task))
            lines.append("")
        else:
            lines.append("- [ ] No tasks defined for this milestone yet.")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate tasks.md from the multi-role plan")
    parser.add_argument(
        "--plan",
        type=Path,
        default=PLAN_PATH,
        help="Path to the YAML plan file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="Destination Markdown file.",
    )
    args = parser.parse_args(argv)

    if not args.plan.exists():
        parser.error(f"Plan file not found: {args.plan}")

    data = yaml.safe_load(args.plan.read_text(encoding="utf-8"))
    plan = Plan.from_yaml(data)
    args.output.write_text(render(plan), encoding="utf-8")
    print(f"Wrote tasks to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
