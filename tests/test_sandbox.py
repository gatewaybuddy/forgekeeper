import types
import json
import shutil
from pathlib import Path

import forgekeeper.sandbox as sb


def test_sandbox_runs_commands(monkeypatch, tmp_path):
    cmds = []

    class FakeGit:
        def diff(self, arg):
            assert arg == "--staged"
            return "patch"

        def worktree(self, action, path, *rest, **kwargs):
            cmds.append(("worktree", action, path))

    class FakeRepo:
        def __init__(self):
            self.git = FakeGit()

    monkeypatch.setattr(sb, "Repo", lambda *a, **k: FakeRepo())

    def fake_run(cmd, cwd=None, input=None, text=None, capture_output=None):
        cmds.append(tuple(cmd))
        return types.SimpleNamespace(returncode=0, stdout="out", stderr="err")

    monkeypatch.setattr(sb.subprocess, "run", fake_run)

    res = sb.run_sandbox_checks(["foo.py"], commands=["echo hi"], task_id="t")
    assert res["passed"]
    assert Path(res["artifacts_path"]).exists()
    log = json.loads(Path(res["artifacts_path"]).read_text())
    assert len(log) == 2  # git apply + echo hi
    assert any(c[0] == "worktree" and c[1] == "add" for c in cmds)
    shutil.rmtree(Path(res["artifacts_path"]).parents[1])

