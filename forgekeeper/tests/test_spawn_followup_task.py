import json
from pathlib import Path
import sys
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from forgekeeper import main as main_module  # noqa: E402


@pytest.fixture
def setup_env(tmp_path, monkeypatch):
    module_dir = tmp_path / "fk"
    module_dir.mkdir()
    state_path = module_dir / "state.json"
    tasks_file = tmp_path / "tasks.md"
    monkeypatch.setattr(main_module, "MODULE_DIR", module_dir)
    monkeypatch.setattr(main_module, "STATE_PATH", state_path)
    monkeypatch.setattr(main_module, "TASK_FILE", tasks_file)
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

    monkeypatch.setattr(main_module, "_execute_pipeline", lambda task, st: True)
    tool_output = "\n".join(f"line{i}" for i in range(1, 25))
    review = {"passed": True, "tools": {"pytest": {"passed": False, "output": tool_output}}}
    monkeypatch.setattr(main_module, "review_change_set", lambda tid: review)
    monkeypatch.setattr(main_module, "run_self_review", lambda st, sp: False)

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

    monkeypatch.setattr(main_module, "_execute_pipeline", lambda task, st: True)
    review = {"passed": True, "tools": {}}
    monkeypatch.setattr(main_module, "review_change_set", lambda tid: review)
    monkeypatch.setattr(main_module, "run_self_review", lambda st, sp: True)

    main_module.main()

    content = tasks_file.read_text(encoding="utf-8")
    assert "Fix failures from" not in content
    assert not (module_dir.parent / "logs" / "FK-900" / "spawned.json").exists()
