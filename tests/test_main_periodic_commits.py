from pathlib import Path
import sys
import types


def test_main_starts_periodic_commits(monkeypatch, tmp_path):
    import importlib
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    fm = importlib.import_module("forgekeeper.main")

    called: dict[str, object] = {}

    def fake_start(interval, auto_push=False, rationale=None):
        called["interval"] = interval
        called["auto_push"] = auto_push
        called["rationale"] = rationale

    fake_module = types.SimpleNamespace(start_periodic_commits=fake_start)
    monkeypatch.setitem(sys.modules, "forgekeeper.roadmap_committer", fake_module)
    runner_fake = types.SimpleNamespace(main=lambda state, path: None)
    monkeypatch.setitem(sys.modules, "forgekeeper.pipeline.runner", runner_fake)
    monkeypatch.setattr(fm, "_check_reviewed_tasks", lambda: None)
    monkeypatch.setattr(fm, "load_state", lambda path: {})

    fm.ROADMAP_COMMIT_INTERVAL = 1
    fm.ROADMAP_AUTO_PUSH = True

    fm.main()

    assert called["interval"] == 1
    assert called["auto_push"] is True
    assert called["rationale"]
