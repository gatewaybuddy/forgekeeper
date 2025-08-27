import json
from pathlib import Path
import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

pytestmark = pytest.mark.skip(reason="self-review pipeline not available")

import forgekeeper.pipeline.execution as fk_execution
import forgekeeper.pipeline.review as fk_review
import forgekeeper.pipeline.loop as fk_loop
from forgekeeper import main as main_module


@pytest.fixture
def setup_env(tmp_path, monkeypatch):
    module_dir = tmp_path / "fk"
    module_dir.mkdir()
    state_path = module_dir / "state.json"
    tasks_file = tmp_path / "tasks.md"
    import forgekeeper.task_review as fk_task_review

    monkeypatch.setattr(main_module, "MODULE_DIR", module_dir)
    monkeypatch.setattr(main_module, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_loop, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_loop, "TASK_FILE", tasks_file)
    monkeypatch.setattr(fk_loop, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_review, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_review, "TASK_FILE", tasks_file)
    monkeypatch.setattr(fk_task_review, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_task_review, "TASK_FILE", tasks_file)
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

    monkeypatch.setattr(fk_execution, "_execute_pipeline", lambda task, st, sp=None: True)
    tool_output = "\n".join(f"line{i}" for i in range(1, 25))
    review = {
        "passed": True,
        "tools": {"pytest": {"passed": False, "output": tool_output}},
        "changed_files": ["foo.py"],
        "summary": "Change-set review passed: pytest: fail",
    }
    monkeypatch.setattr(fk_review, "review_change_set", lambda tid: review)
    monkeypatch.setattr(fk_review, "run_self_review", lambda st, sp: False)
    monkeypatch.setattr(fk_review, "_mark_task_needs_review", lambda tid: None)
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

    monkeypatch.setattr(fk_execution, "_execute_pipeline", lambda task, st, sp=None: True)
    review = {
        "passed": True,
        "tools": {},
        "changed_files": [],
        "summary": "Change-set review passed: no checks run",
    }
    monkeypatch.setattr(fk_review, "review_change_set", lambda tid: review)
    monkeypatch.setattr(fk_review, "run_self_review", lambda st, sp: True)
    monkeypatch.setattr(fk_review, "_mark_task_needs_review", lambda tid: None)
    monkeypatch.setattr(main_module, "_check_reviewed_tasks", lambda: None)

    main_module.main()

    content = tasks_file.read_text(encoding="utf-8")
    assert "Fix failures from" not in content
    assert not (module_dir.parent / "logs" / "FK-900" / "spawned.json").exists()
