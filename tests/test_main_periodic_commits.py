from pathlib import Path


def test_main_starts_periodic_commits(monkeypatch, tmp_path):
    import importlib
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    fm = importlib.import_module("forgekeeper.main")

    called: dict[str, object] = {}

    def fake_start(interval, auto_push=False, rationale=None):
        called["interval"] = interval
        called["auto_push"] = auto_push
        called["rationale"] = rationale

    monkeypatch.setattr(fm, "start_periodic_commits", fake_start)
    monkeypatch.setattr(fm, "_check_reviewed_tasks", lambda: None)
    monkeypatch.setattr(fm, "load_state", lambda path: {})

    class DummyQueue:
        def __init__(self, task_file):
            pass
        def next_task(self):
            return {"title": "task", "id": "1"}

    monkeypatch.setattr(fm, "TaskQueue", DummyQueue)
    monkeypatch.setattr(fm, "_execute_pipeline", lambda task, state: True)
    monkeypatch.setattr(fm, "review_change_set", lambda tid: {"passed": True, "changed_files": [], "summary": ""})
    monkeypatch.setattr(fm, "run_self_review", lambda state, path: True)
    monkeypatch.setattr(fm, "create_draft_pr", lambda meta, path: {})
    monkeypatch.setattr(fm, "_mark_task_needs_review", lambda tid: None)
    monkeypatch.setattr(fm, "append_entry", lambda *a, **k: None)
    monkeypatch.setattr(fm, "save_state", lambda state, path: None)

    monkeypatch.setattr(fm, "STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr(fm, "TASK_FILE", tmp_path / "tasks.md")
    (tmp_path / "tasks.md").write_text("", encoding="utf-8")

    fm.ROADMAP_COMMIT_INTERVAL = 1
    fm.ROADMAP_AUTO_PUSH = True

    fm.main()

    assert called["interval"] == 1
    assert called["auto_push"] is True
    assert called["rationale"]
