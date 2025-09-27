import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from forgekeeper.tasks.parser import parse_tasks_md, Task
from tools.roadmap.aggregator import format_task_block, sync_status


def test_parse_tasks_md(tmp_path):
    content = (
        "---\n"
        "id: A-1\n"
        "title: Task One\n"
        "status: todo\n"
        "epic: E1\n"
        "owner: bob\n"
        "labels: [a, b]\n"
        "---\n"
        "First body\n\n"
        "---\n"
        "id: A-2\n"
        "title: Task Two\n"
        "status: done\n"
        "---\n"
        "Second body\n"
    )
    p = tmp_path / "tasks.md"
    p.write_text(content)
    tasks = parse_tasks_md(str(p))
    assert len(tasks) == 2
    t1, t2 = tasks
    assert t1.id == "A-1"
    assert t1.title == "Task One"
    assert t1.status == "todo"
    assert t1.epic == "E1"
    assert t1.owner == "bob"
    assert t1.labels == ["a", "b"]
    assert t1.body == "First body"
    assert t2.id == "A-2"
    assert t2.status == "done"
    assert t2.body == "Second body"


def test_format_task_block_roundtrip(tmp_path):
    task = Task(
        id="X1",
        title="Example",
        status="todo",
        epic="E",
        owner="alice",
        labels=["x"],
        body="Details here",
    )
    formatted = format_task_block(task)
    p = tmp_path / "roundtrip.md"
    p.write_text(formatted)
    parsed = parse_tasks_md(str(p))
    assert parsed == [task]


def test_sync_status_updates():
    tasks = [
        Task(id="1", title="t1", status="todo"),
        Task(id="2", title="t2", status="todo"),
        Task(id="3", title="t3", status="todo"),
        Task(id="4", title="t4", status="todo"),
    ]
    pr_map = {
        "1": [{"merged_at": "2024-01-01"}],
        "2": [{"state": "open", "labels": [{"name": "needs_review"}]}],
        "3": [{"state": "open", "labels": []}],
    }
    sync_status(tasks, pr_map)
    assert [t.status for t in tasks] == [
        "done",
        "needs_review",
        "in_progress",
        "todo",
    ]

