import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from forgekeeper import main as main_module


@pytest.fixture
def temp_paths(tmp_path, monkeypatch):
    state_path = tmp_path / "state.json"
    tasks_file = tmp_path / "tasks.md"
    monkeypatch.setattr(main_module, "STATE_PATH", state_path)
    monkeypatch.setattr(main_module, "TASK_FILE", tasks_file)
    yield state_path, tasks_file


def test_pipeline_resume_and_checkoff(temp_paths, monkeypatch):
    state_path, tasks_file = temp_paths
    tasks_file.write_text("- [ ] demo task\n", encoding="utf-8")

    def fail_step(task, state):
        return False

    monkeypatch.setattr(main_module, "_step_edit", fail_step)
    main_module.PIPELINE[1] = fail_step

    main_module.main()

    saved_state = json.loads(state_path.read_text())
    assert saved_state["current_task"] == "demo task"
    assert saved_state["pipeline_step"] == 1
    assert saved_state.get("analysis") == []
    assert tasks_file.read_text() == "- [ ] demo task\n"

    def pass_step(task, state):
        return True

    monkeypatch.setattr(main_module, "_step_edit", pass_step)
    main_module.PIPELINE[1] = pass_step

    main_module.main()

    assert tasks_file.read_text() == "- [x] demo task\n"
    saved_state = json.loads(state_path.read_text())
    assert saved_state == {}
