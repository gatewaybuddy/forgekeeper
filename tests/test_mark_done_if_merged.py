from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.mark_done_if_merged import mark_done_if_merged
import forgekeeper.task_review as fk_review


def _write_tasks(tmp_path: Path, status: str) -> Path:
    content = (
        "---\n"
        "id: FK-1\n"
        "title: Demo\n"
        f"status: {status}\n"
        "---\n"
        "Body\n"
    )
    p = tmp_path / "tasks.md"
    p.write_text(content)
    return p


def test_marks_done_when_pr_merged(tmp_path, monkeypatch):
    _write_tasks(tmp_path, "needs_review")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GH_TOKEN", "tkn")
    monkeypatch.setattr(
        "tools.mark_done_if_merged.gh_repo_slug", lambda: "owner/repo"
    )

    class Resp:
        def json(self):
            return [{"title": "PR FK-1", "merged_at": "2024-01-01"}]

    monkeypatch.setattr(
        "tools.mark_done_if_merged.requests.get", lambda *a, **k: Resp()
    )

    assert mark_done_if_merged("FK-1") is True
    text = (tmp_path / "tasks.md").read_text()
    assert "status: done" in text


def test_no_change_when_pr_open(tmp_path, monkeypatch):
    _write_tasks(tmp_path, "needs_review")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GH_TOKEN", "tkn")
    monkeypatch.setattr(
        "tools.mark_done_if_merged.gh_repo_slug", lambda: "owner/repo"
    )

    class Resp:
        def json(self):
            return [{"title": "PR FK-1", "merged_at": None, "state": "open"}]

    monkeypatch.setattr(
        "tools.mark_done_if_merged.requests.get", lambda *a, **k: Resp()
    )

    assert mark_done_if_merged("FK-1") is False
    text = (tmp_path / "tasks.md").read_text()
    assert "status: needs_review" in text


def test_check_reviewed_tasks_invokes_for_each_id(tmp_path, monkeypatch):
    tasks_content = (
        "---\n"
        "id: FK-1\n"
        "title: A\n"
        "status: needs_review\n"
        "---\n"
        "Body\n"
        "\n"
        "---\n"
        "id: FK-2\n"
        "title: B\n"
        "status: needs_review\n"
        "---\n"
        "Body\n"
        "\n"
        "---\n"
        "id: FK-3\n"
        "title: C\n"
        "status: done\n"
        "---\n"
        "Body\n"
    )
    tasks_file = tmp_path / "tasks.md"
    tasks_file.write_text(tasks_content)

    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    script = tools_dir / "mark_done_if_merged.py"
    script.write_text("")

    pkg_dir = tmp_path / "forgekeeper"
    pkg_dir.mkdir()
    monkeypatch.setattr(fk_review, "MODULE_DIR", pkg_dir)
    monkeypatch.setattr(fk_review, "TASK_FILE", tasks_file)

    calls = []

    def fake_run(cmd, check=False):
        calls.append(cmd)

    monkeypatch.setattr(fk_review.subprocess, "run", fake_run)

    fk_review._check_reviewed_tasks()

    assert calls == [
        [sys.executable, str(script), "FK-1"],
        [sys.executable, str(script), "FK-2"],
    ]
