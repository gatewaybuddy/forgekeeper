from pathlib import Path
import pytest

pytestmark = pytest.mark.filterwarnings(
    "ignore::pytest.PytestUnhandledThreadExceptionWarning"
)


def test_next_sprint_summary(tmp_path, monkeypatch):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        "## Active\n- [ ] first task\n- [x] done task\n\n## Backlog\n- [ ] second task\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    import forgekeeper.roadmap_committer as rc

    summary = rc._next_sprint_summary(tasks_md, limit=2)
    assert summary == "first task; second task"


def test_start_periodic_commits_env_and_summary(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    import forgekeeper.roadmap_committer as rc

    monkeypatch.setenv("ROADMAP_COMMIT_INTERVAL", "7")
    monkeypatch.setenv("ROADMAP_AUTO_PUSH", "true")

    intervals = []
    def fake_sleep(seconds):
        intervals.append(seconds)
        raise SystemExit

    called = {}
    def fake_commit(repo_path, roadmap_path, memory_file, commit_message,
                    commit_limit, memory_limit, auto_push, rationale):
        called["auto_push"] = auto_push

    logs = []
    monkeypatch.setattr(rc.log, "info", lambda msg, *a: logs.append(msg % a if a else msg))
    monkeypatch.setattr(rc, "commit_roadmap_update", fake_commit)
    monkeypatch.setattr(rc, "_next_sprint_summary", lambda *a, **k: "alpha; beta")
    monkeypatch.setattr(rc.time, "sleep", fake_sleep)

    thread = rc.start_periodic_commits()
    thread.join(timeout=0.5)

    assert intervals == [7]
    assert called["auto_push"] is True
    assert any("Next sprint: alpha; beta" in m for m in logs)
