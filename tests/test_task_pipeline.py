from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest
from git import Repo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.pipeline.main as tp
import forgekeeper.core.pipeline.task_pipeline as core_tp
from forgekeeper.core.pipeline import loop as pipeline_loop
from forgekeeper.core.pipeline.contracts import ExecutionResult, StageOutcome


@pytest.fixture(autouse=True)
def _capture_goal_add(monkeypatch):
    captured: dict[str, str] = {}

    def fake_add_goal(desc: str, source: str = "task_queue") -> str:
        captured["desc"] = desc
        captured["source"] = source
        return "gid"

    monkeypatch.setattr(core_tp.goal_storage, "add_goal", fake_add_goal)
    return captured


def test_next_task_marks_in_progress(tmp_path: Path, _capture_goal_add: dict[str, str]) -> None:
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
    task = pipeline.next_task()
    assert task is not None
    assert task["title"] == "alpha"
    assert task["status"] == "in_progress"
    assert _capture_goal_add["desc"] == "alpha"
    assert _capture_goal_add["source"] == "task_queue"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [~] alpha" in text

    pipeline.mark_done(task["title"])
    text = tasks_md.read_text(encoding="utf-8")
    assert "- [x] alpha" in text
    active_section = text.split("## Backlog")[0]
    assert "- [ ] alpha" not in active_section


def test_run_next_task_selection_and_completion(
    tmp_path: Path, _capture_goal_add: dict[str, str]
) -> None:
    repo = Repo.init(tmp_path)
    with repo.config_writer() as cw:
        cw.set_value("user", "name", "Forgekeeper Test")
        cw.set_value("user", "email", "forgekeeper@example.com")

    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")
    sample_py = tmp_path / "sample.py"
    sample_py.write_text("print(\"hi\")\n", encoding="utf-8")
    repo.index.add([str(tasks_md), str(sample_py)])
    repo.index.commit("init")

    pipeline = tp.TaskPipeline(tasks_md)

    selected = pipeline.run_next_task(guidelines="be thorough")
    assert selected is not None
    assert selected["status"] in {"selected", "needs_review"}
    assert selected["task"]["status"] in {"in_progress", "needs_review"}
    assert selected["task"]["title"] == "sample"
    assert selected.get("plan") is not None

    text = tasks_md.read_text(encoding="utf-8")
    assert any(marker in text for marker in ("- [~] sample", "- [?] sample"))
    assert 'TODO' in sample_py.read_text(encoding="utf-8")

    completed = pipeline.run_next_task(auto_complete=True)
    assert completed is not None
    assert completed["status"] == "completed"
    assert completed["task"]["status"] == "done"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [x] sample" in text
    assert 'TODO' in sample_py.read_text(encoding="utf-8")
    assert "## Completed" in text


def test_run_next_task_executor_updates_status(tmp_path: Path) -> None:
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")

    pipeline = tp.TaskPipeline(tasks_md)

    def executor(task: dict[str, Any], _guidelines: str) -> dict[str, Any]:
        return ExecutionResult(status="needs_review", data={}).to_dict()

    result = pipeline.run_next_task(executor=executor)
    assert result is not None
    assert result["status"] == "needs_review"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [?] sample" in text


def test_executor_applies_edits(tmp_path: Path) -> None:
    repo = Repo.init(tmp_path)
    with repo.config_writer() as cw:
        cw.set_value("user", "name", "Forgekeeper Test")
        cw.set_value("user", "email", "forgekeeper@example.com")

    workspace_file = tmp_path / "foo.txt"
    workspace_file.write_text("old\n", encoding="utf-8")
    repo.index.add([str(workspace_file)])
    repo.index.commit("init")

    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")

    pipeline = tp.TaskPipeline(tasks_md)

    def executor(task: dict[str, Any], _guidelines: str) -> dict[str, Any]:
        original = workspace_file.read_text(encoding="utf-8")
        payload = {
            "edits": [
                {
                    "path": str(workspace_file),
                    "original": original,
                    "modified": "new\n",
                    "run_sandbox": False,
                }
            ],
        }
        return ExecutionResult(status="needs_review", data=payload).to_dict()

    result = pipeline.run_next_task(executor=executor)
    assert result is not None
    assert result["status"] == "needs_review"
    assert "stage" in result
    stage_entry = StageOutcome.from_dict(result["stage"][0])
    assert stage_entry.outcome == "success"
    assert workspace_file.read_text(encoding="utf-8") == "new\n"
    assert "foo.txt" in repo.git.diff("--name-only", "--cached").splitlines()


def test_pipeline_loop_persists_history(tmp_path: Path) -> None:
    repo = Repo.init(tmp_path)
    with repo.config_writer() as cw:
        cw.set_value("user", "name", "Forgekeeper Test")
        cw.set_value("user", "email", "forgekeeper@example.com")

    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")
    sample_py = tmp_path / "sample.py"
    sample_py.write_text("print(\"hi\")\n", encoding="utf-8")
    repo.index.add([str(tasks_md), str(sample_py)])
    repo.index.commit("init")
    state_path = tmp_path / "state.json"

    context = pipeline_loop.run(
        task_file=tasks_md,
        state_path=state_path,
        auto_complete=True,
        guidelines="focus on tests",
    )

    assert context.selected_task is not None
    assert context.task_result is not None
    assert context.task_result["status"] == "completed"
    assert "TODO" in sample_py.read_text(encoding="utf-8")

    data = json.loads(state_path.read_text(encoding="utf-8"))
    assert data["pipeline"]["auto_complete"] is True
    assert data["pipeline"]["guidelines"] == "focus on tests"
    assert data["history"][-1]["result"]["status"] == "completed"

    text = tasks_md.read_text(encoding="utf-8")
    assert "- [x] sample" in text


def test_default_executor_parses_guidelines(tmp_path: Path) -> None:
    repo = Repo.init(tmp_path)
    with repo.config_writer() as cw:
        cw.set_value("user", "name", "Forgekeeper Test")
        cw.set_value("user", "email", "forgekeeper@example.com")

    target = tmp_path / "foo.txt"
    target.write_text("hello\n", encoding="utf-8")
    repo.index.add([str(target)])
    repo.index.commit("init")

    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Active\n- [ ] sample\n\n## Completed\n", encoding="utf-8")

    pipeline = tp.TaskPipeline(tasks_md)

    instructions = json.dumps(
        {
            "status": "needs_review",
            "edits": [
                {
                    "path": str(target),
                    "content": "updated\n",
                    "run_sandbox": False,
                }
            ],
        }
    )

    result = pipeline.run_next_task(guidelines=instructions)
    assert result is not None
    assert result["status"] == "needs_review"
    assert "stage" in result and result["stage"][0]["result"]["outcome"] == "success"
    assert target.read_text(encoding="utf-8") == "updated\n"

    staged = repo.git.diff("--name-only", "--cached").splitlines()
    assert "foo.txt" in staged




