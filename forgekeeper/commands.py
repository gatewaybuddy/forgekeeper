from __future__ import annotations

"""Command line helpers for task management."""

import argparse
from pathlib import Path
from typing import Optional

from forgekeeper.task_queue import TaskQueue
from forgekeeper.memory import episodic

MODULE_DIR = Path(__file__).resolve().parent
TASK_FILE = MODULE_DIR.parent / "tasks.md"


def cmd_list(queue: TaskQueue, _: argparse.Namespace) -> None:
    for idx, task in enumerate(queue.list_tasks()):
        status = "x" if task.status == "done" else " "
        print(f"{idx}: [{status}] {task.description} (priority={task.priority})")


def cmd_pick(queue: TaskQueue, _: argparse.Namespace) -> None:
    task = queue.next_task()
    if task:
        title = task.get("title") or task.get("description") or ""
        print(title)
    else:
        print("No tasks available")


def cmd_defer(queue: TaskQueue, args: argparse.Namespace) -> None:
    task = queue.task_by_index(args.index)
    queue.defer(task)


def cmd_done(queue: TaskQueue, args: argparse.Namespace) -> None:
    task = queue.task_by_index(args.index)
    queue.mark_done(task)


def cmd_add(queue: TaskQueue, args: argparse.Namespace) -> None:
    """Append a canonical task to ``tasks.md``.

    Tasks are added to the "Canonical Tasks" section using the
    :func:`sanitize_and_insert_tasks` helper.  The task ID and title are
    required.  Optional metadata may be supplied via command-line flags.
    """

    from forgekeeper.tasks.inserter import sanitize_and_insert_tasks

    labels = [l.strip() for l in (args.labels or "").split(",") if l.strip()]
    task = {
        "id": args.id,
        "title": args.title,
        "status": args.status,
        "epic": args.epic,
        "owner": args.owner,
        "labels": labels,
        "body": args.body,
    }

    inserted = sanitize_and_insert_tasks([task], TASK_FILE)
    if inserted:
        print(f"Inserted {inserted[0]}")
    else:
        print("Task not inserted: ID exists or missing data")

    # Reload queue so that the subsequent ``save`` call preserves the update
    queue.__init__(TASK_FILE)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Task queue helpers")
    parser.add_argument(
        "--pushes",
        type=int,
        metavar="N",
        help="Show the last N automated push entries",
    )
    sub = parser.add_subparsers(dest="command")

    p_list = sub.add_parser("list", help="List all tasks")
    p_list.set_defaults(func=cmd_list)

    p_pick = sub.add_parser("pick", help="Show next task")
    p_pick.set_defaults(func=cmd_pick)

    p_defer = sub.add_parser("defer", help="Move task to backlog")
    p_defer.add_argument("index", type=int, help="Task index from list")
    p_defer.set_defaults(func=cmd_defer)

    p_done = sub.add_parser("done", help="Mark task as completed")
    p_done.add_argument("index", type=int, help="Task index from list")
    p_done.set_defaults(func=cmd_done)

    p_add = sub.add_parser("add", help="Append a canonical task")
    p_add.add_argument("id", help="Task identifier")
    p_add.add_argument("title", help="Task title including priority marker")
    p_add.add_argument("--status", default="todo", help="Initial status")
    p_add.add_argument("--epic", default="", help="Epic identifier")
    p_add.add_argument("--owner", default="", help="Task owner")
    p_add.add_argument(
        "--labels", default="", help="Comma-separated list of labels"
    )
    p_add.add_argument("--body", default="", help="Task description body")
    p_add.set_defaults(func=cmd_add)

    return parser


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if getattr(args, "pushes", None) is not None:
        episodic._recent_pushes(args.pushes)
        return
    if not hasattr(args, "func"):
        parser.print_help()
        return
    queue = TaskQueue(TASK_FILE)
    args.func(queue, args)
    queue.save()


if __name__ == "__main__":
    main()
