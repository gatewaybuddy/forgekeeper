from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))


def test_autonomous_manager_triggers_pipeline(monkeypatch):
    import forgekeeper.high_level_goal_manager as hgm

    class DummyTask:
        description = "demo"

    class DummyPipeline:
        def next_task(self):
            return DummyTask()

    called = []

    def fake_main():
        called.append(True)

    monkeypatch.setattr(hgm, "TaskPipeline", lambda: DummyPipeline())
    monkeypatch.setattr(hgm.pipeline_main, "main", fake_main)
    monkeypatch.setattr(hgm, "start_periodic_updates", lambda *a, **k: None)

    mgr = hgm.HighLevelGoalManager(autonomous=True)
    assert mgr.run() is True
    assert called, "Pipeline main not invoked"


def test_manager_no_autonomy(monkeypatch):
    import forgekeeper.high_level_goal_manager as hgm

    class DummyPipeline:
        def next_task(self):
            raise AssertionError("should not be called")

    monkeypatch.setattr(hgm, "TaskPipeline", lambda: DummyPipeline())
    monkeypatch.setattr(hgm, "start_periodic_updates", lambda *a, **k: None)
    mgr = hgm.HighLevelGoalManager(autonomous=False)
    assert mgr.run() is False

