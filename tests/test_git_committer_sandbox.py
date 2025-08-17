import types
import forgekeeper.git_committer as gc


def test_commit_aborts_when_sandbox_fails(monkeypatch):
    class FakeRepo:
        def __init__(self):
            self.active_branch = types.SimpleNamespace(name="main")
            self.git = types.SimpleNamespace(diff=lambda *a, **k: "")

    monkeypatch.setattr(gc, "Repo", lambda *a, **k: FakeRepo())
    monkeypatch.setattr(gc.self_review, "review_staged_changes", lambda task_id: {"passed": True, "staged_files": ["foo.py"]})
    monkeypatch.setattr(gc.diff_validator, "validate_staged_diffs", lambda: {"passed": True})
    monkeypatch.setattr(gc, "append_entry", lambda *a, **k: None)

    called = {}

    def fake_sandbox(files, task_id):
        called["files"] = files
        called["task_id"] = task_id
        return {"passed": False, "artifacts_path": "", "results": []}

    monkeypatch.setattr(gc.sandbox, "run_sandbox_checks", fake_sandbox)

    res = gc.commit_and_push_changes("msg", task_id="tid")
    assert res["aborted"]
    assert not res["passed"]
    assert called["files"] == ["foo.py"]
    assert called["task_id"] == "tid"

