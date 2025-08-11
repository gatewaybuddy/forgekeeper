import sys
import os
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
    assert task["title"] == "alpha"
    assert captured["desc"] == "alpha"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [~] alpha" in text

    pipeline.mark_done(task["title"])
    text = tasks_md.read_text(encoding="utf-8")
    assert "## Completed" in text
    assert "- [x] alpha" in text
    assert "alpha" not in text.split("## Backlog")[0]  # removed from Active


def test_run_next_task_executes_chain(tmp_path, monkeypatch):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")
    repo_file = tmp_path / "foo.py"
    repo_file.write_text("print('hi')\n", encoding="utf-8")

    pipeline = tp.TaskPipeline(tasks_md)

    monkeypatch.setattr(
        tp,
        "summarize_repository",
        lambda root=".": {str(repo_file): {"summary": "print", "lang": "py"}},
    )
    monkeypatch.setattr(
        tp,
        "analyze_repo_for_task",
        lambda *_: [{"file": str(repo_file), "summary": "print", "lang": "py"}],
    )

    def fake_generate(task, file_path, file_summary, guidelines):
        return (
            f"--- a/{file_path}\n+++ b/{file_path}\n@@ -1 +1 @@\n-print('hi')\n+print('bye')\n"
        )

    monkeypatch.setattr(tp, "generate_code_edit", fake_generate)
    monkeypatch.setattr(tp, "commit_and_push_changes", lambda *a, **k: {"passed": True})
    monkeypatch.setattr(
        tp,
        "diff_and_stage_changes",
        lambda *a, **k: {"files": [str(repo_file)], "outcome": "success"},
    )

    cwd = os.getcwd()
    os.chdir(tmp_path)
    try:
        result = pipeline.run_next_task()
    finally:
        os.chdir(cwd)

    assert result and result["passed"]
    assert repo_file.read_text(encoding="utf-8") == "print('bye')\n"
    task = pipeline.queue.get_task("sample")
    assert task is not None and task.status == "done"
