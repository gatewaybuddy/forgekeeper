import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.task_pipeline as tp


def test_pipeline_selects_and_marks(tmp_path, monkeypatch):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Active
- [ ] alpha

## Backlog
- [ ] beta

## Completed
""",
        encoding="utf-8",
    )
    pipeline = tp.TaskPipeline(tasks_md)

    captured = {}

    def fake_add_goal(desc: str, source: str = "task_queue") -> str:
        captured["desc"] = desc
        return "gid"

    monkeypatch.setattr(tp.goal_manager, "add_goal", fake_add_goal)

    task = pipeline.next_task()
    assert task is not None
    assert task.description == "alpha"
    assert captured["desc"] == "alpha"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [~] alpha" in text

    pipeline.mark_done(task.description)
    text = tasks_md.read_text(encoding="utf-8")
    assert "## Completed" in text
    assert "- [x] alpha" in text
    assert "alpha" not in text.split("## Backlog")[0]  # removed from Active
