import importlib
import sys
from pathlib import Path

from forgekeeper import outbox


def test_replay_pending_executes_action(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(outbox, "OUTBOX_PATH", tmp_path / "outbox")
    outbox.OUTBOX_PATH.mkdir()

    mod = tmp_path / "dummy_mod1.py"
    mod.write_text("called=[]\n\ndef foo(x):\n    called.append(x)\n", encoding="utf-8")
    sys.path.insert(0, str(tmp_path))

    action = {"module": "dummy_mod1", "function": "foo", "args": [42], "kwargs": {}}
    outbox.write_action(action)
    assert list(outbox.OUTBOX_PATH.glob("*.json"))

    outbox.replay_pending()

    dummy = importlib.import_module("dummy_mod1")
    assert dummy.called == [42]
    assert not list(outbox.OUTBOX_PATH.glob("*.json"))


def test_failed_action_remains_and_replays(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(outbox, "OUTBOX_PATH", tmp_path / "outbox")
    outbox.OUTBOX_PATH.mkdir()

    mod = tmp_path / "dummy_mod2.py"
    mod.write_text("called=[]\n\ndef foo(x):\n    called.append(x)\n", encoding="utf-8")
    sys.path.insert(0, str(tmp_path))
    action = {"module": "dummy_mod2", "function": "foo", "args": [7], "kwargs": {}}
    outbox.write_action(action)

    def failing_executor(call):
        raise RuntimeError("boom")

    outbox.replay_pending(executor=failing_executor)
    assert list(outbox.OUTBOX_PATH.glob("*.json")), "file should persist on failure"

    outbox.replay_pending()
    dummy = importlib.import_module("dummy_mod2")
    assert dummy.called == [7]
    assert not list(outbox.OUTBOX_PATH.glob("*.json"))
