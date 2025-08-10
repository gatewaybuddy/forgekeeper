from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.mark_done_if_merged import mark_done_if_merged


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
