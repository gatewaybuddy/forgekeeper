import json
import time

import goal_manager.manager as hgm


def test_periodic_run_expands_and_executes(tmp_path, monkeypatch):
    calls = []

    class ComplexTask:
        description = "write unit tests and update docs"

    class DummyPipeline:
        def __init__(self):
            self.sent = False

        def next_task(self):
            if not self.sent:
                self.sent = True
                return ComplexTask()
            return None

    def fake_main():
        calls.append(True)

    goals_path = tmp_path / "goals.json"
    monkeypatch.setattr(hgm, "TaskPipeline", lambda: DummyPipeline())
    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", goals_path)
    monkeypatch.setattr(hgm, "GOAL_RUN_INTERVAL", 0.01)

    mgr = hgm.HighLevelGoalManager(autonomous=True)

    timeout = time.time() + 1
    while len(calls) < 2 and time.time() < timeout:
        time.sleep(0.02)

    assert len(calls) == 2, "Pipeline main not invoked for each subtask"

    data = json.loads(goals_path.read_text())
    parent = next(g for g in data if g.get("description") == ComplexTask.description)
    subtasks = [g for g in data if g.get("parent_id") == parent["id"]]
    assert len(subtasks) == 2

    mgr.shutdown()
