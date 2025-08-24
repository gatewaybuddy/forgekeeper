import json
from pathlib import Path
import sys
import types
import importlib.util
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

pipeline_pkg = types.ModuleType("forgekeeper.pipeline")
pipeline_pkg.__path__ = [str(ROOT / "forgekeeper" / "pipeline")]
sys.modules.setdefault("forgekeeper.pipeline", pipeline_pkg)

spec = importlib.util.spec_from_file_location(
    "forgekeeper.pipeline.runner", ROOT / "forgekeeper" / "pipeline" / "runner.py"
)
fk_runner = importlib.util.module_from_spec(spec)
sys.modules["forgekeeper.pipeline.runner"] = fk_runner
spec.loader.exec_module(fk_runner)

from forgekeeper import main as main_module  # noqa: E402


@pytest.fixture
def setup_env(tmp_path, monkeypatch):
    module_dir = tmp_path / "fk"
    module_dir.mkdir()
    state_path = module_dir / "state.json"
    tasks_file = tmp_path / "tasks.md"
    import forgekeeper.task_review as fk_review

    monkeypatch.setattr(main_module, "MODULE_DIR", module_dir)
    monkeypatch.setattr(main_module, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_runner, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_runner, "TASK_FILE", tasks_file)
    monkeypatch.setattr(fk_runner, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_review, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_review, "TASK_FILE", tasks_file)
    main_module.ROADMAP_COMMIT_INTERVAL = 0
    return module_dir, state_path, tasks_file


def _prep_files(tasks_file: Path):
    tasks_file.write_text(
        """## Active
- [~] demo

## Completed

## Canonical Tasks
---
id: FK-900
title: Demo Task (P1)
status: in_progress
epic: R-001
owner: agent
labels: []
---
""",
        encoding="utf-8",
    )


def test_spawn_task_on_self_review_failure(setup_env, monkeypatch):
    module_dir, state_path, tasks_file = setup_env
    _prep_files(tasks_file)
    state = {"current_task": {"description": "demo", "task_id": "FK-900", "epic": "R-001"}, "pipeline_step": 3}
    state_path.write_text(json.dumps(state), encoding="utf-8")

    monkeypatch.setattr(fk_runner, "_execute_pipeline", lambda task, st: True)
    tool_output = "\n".join(f"line{i}" for i in range(1, 25))
    review = {
        "passed": True,
        "tools": {"pytest": {"passed": False, "output": tool_output}},
        "changed_files": ["foo.py"],
        "summary": "Change-set review passed: pytest: fail",
    }
    monkeypatch.setattr(fk_runner, "review_change_set", lambda tid: review)
    monkeypatch.setattr(fk_runner, "run_self_review", lambda st, sp: False)
    monkeypatch.setattr(fk_runner, "_mark_task_needs_review", lambda tid: None)
    monkeypatch.setattr(main_module, "_check_reviewed_tasks", lambda: None)

    main_module.main()

    content = tasks_file.read_text(encoding="utf-8")
    assert "Fix failures from FK-900" in content
    assert "line20" in content and "line21" not in content

    spawned = json.loads((module_dir.parent / "logs" / "FK-900" / "spawned.json").read_text())
    assert spawned == ["FK-901"]


def test_no_spawn_when_self_review_passes(setup_env, monkeypatch):
    module_dir, state_path, tasks_file = setup_env
    _prep_files(tasks_file)
    state = {"current_task": {"description": "demo", "task_id": "FK-900", "epic": "R-001"}, "pipeline_step": 3}
    state_path.write_text(json.dumps(state), encoding="utf-8")

    monkeypatch.setattr(fk_runner, "_execute_pipeline", lambda task, st: True)
    review = {
        "passed": True,
        "tools": {},
        "changed_files": [],
        "summary": "Change-set review passed: no checks run",
    }
    monkeypatch.setattr(fk_runner, "review_change_set", lambda tid: review)
    monkeypatch.setattr(fk_runner, "run_self_review", lambda st, sp: True)
    monkeypatch.setattr(fk_runner, "_mark_task_needs_review", lambda tid: None)
    monkeypatch.setattr(main_module, "_check_reviewed_tasks", lambda: None)

    main_module.main()

    content = tasks_file.read_text(encoding="utf-8")
    assert "Fix failures from" not in content
    assert not (module_dir.parent / "logs" / "FK-900" / "spawned.json").exists()
