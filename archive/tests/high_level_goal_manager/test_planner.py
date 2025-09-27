import json
import pytest

import goal_manager.manager as hgm


class DummyTask:
    description = "demo"


class DummyPipeline:
    def next_task(self):
        return DummyTask()

    def run_task(self, *_, **__):
        return None

    def update_status(self, *_args, **_kwargs):
        return None


def test_autonomous_manager_triggers_pipeline(tmp_path, monkeypatch):
    """High-level manager invokes pipeline when autonomous."""
    called = []

    def fake_main():
        called.append(True)

    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", tmp_path / "goals.json")

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipeline()
    )
    assert mgr.run() is True
    assert called == [True], "Pipeline main not invoked once"


def test_manager_no_autonomy(tmp_path, monkeypatch):
    """Manager returns immediately when not autonomous."""
    class DummyPipelineNoTask:
        def next_task(self):
            raise AssertionError("should not be called")

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", tmp_path / "goals.json")

    mgr = hgm.HighLevelGoalManager(
        autonomous=False, pipeline_factory=lambda: DummyPipelineNoTask()
    )
    assert mgr.run() is False


def test_complex_goal_breakdown(tmp_path, monkeypatch):
    """Planner splits complex descriptions into subtasks."""
    class ComplexTask:
        description = "write unit tests and update docs"

    class DummyPipelineComplex:
        def next_task(self):
            return ComplexTask()

        def run_task(self, *_, **__):
            return None

        def update_status(self, *_args, **_kwargs):
            return None

    calls = []

    def fake_main():
        calls.append(True)

    goals_path = tmp_path / "goals.json"
    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_commits", lambda *a, **k: None)
    monkeypatch.setattr(hgm.goal_manager, "GOALS_FILE", goals_path)

    mgr = hgm.HighLevelGoalManager(
        autonomous=True, pipeline_factory=lambda: DummyPipelineComplex()
    )
    assert mgr.run() is True
    assert len(calls) == 2

    data = json.loads(goals_path.read_text())
    assert len(data) == 3
    parent = next(g for g in data if g.get("description") == ComplexTask.description)
    subtasks = [g for g in data if g.get("parent_id") == parent["id"]]
    assert [g.get("priority") for g in subtasks] == pytest.approx([1.0, 0.5])
    assert subtasks[0].get("depends_on", []) == []
    assert subtasks[1].get("depends_on") == [subtasks[0]["id"]]
    assert parent.get("subtasks") == [g["id"] for g in subtasks]
