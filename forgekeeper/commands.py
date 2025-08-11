from __future__ import annotations

"""Command line helpers for task management."""

import argparse
from pathlib import Path
from typing import Optional

from forgekeeper.task_queue import TaskQueue

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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Task queue helpers")
    sub = parser.add_subparsers(dest="command", required=True)

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

    return parser


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    queue = TaskQueue(TASK_FILE)
    args.func(queue, args)
    queue.save()


if __name__ == "__main__":
    main()
