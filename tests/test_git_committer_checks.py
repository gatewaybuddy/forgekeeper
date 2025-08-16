import json
import sys
import types
import importlib
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import forgekeeper.config as config
import forgekeeper.git_committer as gc


@pytest.mark.parametrize(
    "staged, expected_keys",
    [
        (["foo.py"], ["py"]),
        (["backend/app.ts"], ["ts"]),
        (["frontend/app.tsx"], ["ts"]),
        (["foo.py", "backend/app.ts"], ["py", "ts"]),
        ([], []),
    ],
)
def test_git_committer_checks(monkeypatch, staged, expected_keys):
    monkeypatch.setenv("CHECKS_PY", "bash -c 'echo PYOUT; echo PYERR 1>&2'")
    monkeypatch.setenv("CHECKS_TS", "bash -c 'echo TSOUT; echo TSERR 1>&2'")

    importlib.reload(config)
    importlib.reload(gc)

    captured = {}
    orig_run_checks = gc._run_checks

    def capture(commands, task_id):
        captured["commands"] = list(commands)
        return orig_run_checks(commands, task_id)

    monkeypatch.setattr(gc, "_run_checks", capture)

    class FakeGit:
        def __init__(self, files):
            self.files = files

        def diff(self, *args):
            return "\n".join(self.files)

    class FakeRepo:
        def __init__(self, files):
            self.git = FakeGit(files)
            self.active_branch = types.SimpleNamespace(name="main")

        def is_dirty(self, **kwargs):
            return False

    monkeypatch.setattr(gc, "Repo", lambda *a, **k: FakeRepo(staged))
    monkeypatch.setattr(
        gc.self_review, "review_staged_changes", lambda task_id: {"passed": True, "staged_files": staged}
    )

    task_id = "case" + ("_".join(f.replace("/", "_").replace(".", "_") for f in staged) or "none")
    log_dir = Path(gc.__file__).resolve().parent.parent / "logs" / task_id
    if log_dir.exists():
        shutil.rmtree(log_dir)

    gc.commit_and_push_changes("msg", task_id=task_id)

    expected_commands = []
    if "py" in expected_keys:
        expected_commands.extend(gc.CHECKS_PY)
    if "ts" in expected_keys:
        expected_commands.extend(gc.CHECKS_TS)

    assert captured.get("commands", []) == expected_commands

    log_path = log_dir / "commit-checks.json"
    data = json.loads(log_path.read_text())
    assert len(data) == len(expected_commands)
    if expected_commands:
        outputs = {
            "py": ("PYOUT\n", "PYERR\n"),
            "ts": ("TSOUT\n", "TSERR\n"),
        }
        for result, key in zip(data, expected_keys):
            out, err = outputs[key]
            assert result["stdout"] == out
            assert result["stderr"] == err
    else:
        assert data == []

    shutil.rmtree(log_dir)
