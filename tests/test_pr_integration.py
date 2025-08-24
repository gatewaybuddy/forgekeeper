import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.pipeline.execution as fk_execution
import forgekeeper.pipeline.review as fk_review
import forgekeeper.pipeline.loop as fk_loop
from forgekeeper import main as fk_main
from forgekeeper.vcs import pr_api


def test_pr_creation_and_status_update(tmp_path, monkeypatch):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks\n\n---\nid: T1\ntitle: Demo task (P1)\nstatus: todo\nlabels: [docs]\n---\n""",
        encoding="utf-8",
    )

    state_path = tmp_path / "state.json"
    module_dir = tmp_path / "fk"
    module_dir.mkdir()
    monkeypatch.setattr(fk_main, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_main, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_loop, "TASK_FILE", tasks_md)
    monkeypatch.setattr(fk_loop, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_loop, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_review, "MODULE_DIR", module_dir)
    monkeypatch.setattr(fk_review, "TASK_FILE", tasks_md)
    monkeypatch.setattr(fk_main, "_check_reviewed_tasks", lambda: None)
    def fake_mark(tid):
        text = tasks_md.read_text()
        tasks_md.write_text(text.replace("status: todo", "status: needs_review"))
    monkeypatch.setattr(fk_review, "_mark_task_needs_review", fake_mark)
    fk_main.ROADMAP_COMMIT_INTERVAL = 0

    state = {
        "current_task": {
            "id": "T1",
            "task_id": "T1",
            "title": "Demo task (P1)",
            "labels": ["docs"],
        },
        "pipeline_step": 0,
        "attempt": 1,
    }
    state_path.write_text(json.dumps(state), encoding="utf-8")

    monkeypatch.setattr(fk_execution, "_execute_pipeline", lambda task, st, sp=None: True)
    monkeypatch.setattr(fk_review, "review_change_set", lambda tid: {"passed": True, "tools": {}})
    monkeypatch.setattr(fk_review, "run_self_review", lambda st, p: True)

    monkeypatch.setenv("GH_TOKEN", "tkn")
    monkeypatch.setattr(pr_api, "current_branch", lambda: "feature-branch")
    monkeypatch.setattr(pr_api, "repo_slug_from_env_or_git", lambda: "owner/repo")
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["payload"] = json
        class Resp:
            status_code = 201
            def json(self):
                return {"number": 1, "html_url": "https://github.com/owner/repo/pull/1"}
            def raise_for_status(self):
                return None
        return Resp()

    monkeypatch.setattr(pr_api.requests, "post", fake_post)

    def fake_add_labels(slug, number, labels, token):
        captured["labels"] = set(labels)

    monkeypatch.setattr(pr_api, "add_labels_to_pr", fake_add_labels)

    fk_main.main()

    pr_file = tmp_path / "logs" / "T1" / "pr.json"
    assert pr_file.exists()
    pr_data = json.loads(pr_file.read_text())
    assert pr_data["url"] == "https://github.com/owner/repo/pull/1"

    text = tasks_md.read_text()
    assert "status: needs_review" in text

    assert captured["labels"] == {"docs", "priority:P1"}
    assert captured["payload"]["head"] == "feature-branch"
