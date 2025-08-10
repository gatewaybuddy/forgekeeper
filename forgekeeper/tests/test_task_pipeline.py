import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

pytestmark = pytest.mark.skip("pipeline integration skipped")


@pytest.fixture
def temp_paths(tmp_path, monkeypatch):
    from forgekeeper import main as main_module

    state_path = tmp_path / "state.json"
    tasks_file = tmp_path / "tasks.md"
    monkeypatch.setattr(main_module, "STATE_PATH", state_path)
    monkeypatch.setattr(main_module, "TASK_FILE", tasks_file)
    yield state_path, tasks_file, main_module

    for mod in ["forgekeeper.main", "forgekeeper.git_committer", "forgekeeper.config"]:
        sys.modules.pop(mod, None)


def test_pipeline_resume_and_checkoff(temp_paths, monkeypatch):
    state_path, tasks_file, main_module = temp_paths
    original = """## Canonical Tasks\n\n---\nid: DEMO\ntitle: demo task (P1)\nstatus: todo\nlabels: []\n---\n"""
    tasks_file.write_text(original, encoding="utf-8")

    def fail_step(task, state):
        return False

    monkeypatch.setattr(main_module, "_step_edit", fail_step)
    main_module.PIPELINE[1] = fail_step

    monkeypatch.setattr(main_module, "_step_analyze", lambda task, state: True)
    main_module.PIPELINE[0] = main_module._step_analyze

    review_calls = {"count": 0}

    def fake_review(state, state_path):
        review_calls["count"] += 1
        return True

    monkeypatch.setattr(main_module, "run_self_review", fake_review)

    main_module.main()

    saved_state = json.loads(state_path.read_text())
    assert saved_state["current_task"]["title"].startswith("demo task")
    assert saved_state["pipeline_step"] == 1
    assert saved_state.get("analysis") == []
    assert tasks_file.read_text() == original
    assert review_calls["count"] == 0

    def pass_step(task, state):
        return True

    monkeypatch.setattr(main_module, "_step_edit", pass_step)
    main_module.PIPELINE[1] = pass_step

    monkeypatch.setattr(main_module, "_step_commit", lambda task, state: True)
    main_module.PIPELINE[2] = main_module._step_commit

    main_module.main()

    saved_state = json.loads(state_path.read_text())
    assert saved_state == {}
    assert review_calls["count"] == 1
