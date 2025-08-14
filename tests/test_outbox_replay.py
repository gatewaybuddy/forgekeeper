import importlib
import sys
from pathlib import Path

from forgekeeper import outbox


def test_replay_pending_executes_action(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(outbox, "OUTBOX_PATH", tmp_path / "outbox")
    outbox.OUTBOX_PATH.mkdir()

    mod = tmp_path / "dummy_mod.py"
    mod.write_text("called=[]\n\ndef foo(x):\n    called.append(x)\n", encoding="utf-8")
    sys.path.insert(0, str(tmp_path))

    action = {"module": "dummy_mod", "function": "foo", "args": [42], "kwargs": {}}
    outbox.write_action(action)
    assert list(outbox.OUTBOX_PATH.glob("*.json"))

    outbox.replay_pending()

    dummy = importlib.import_module("dummy_mod")
    assert dummy.called == [42]
    assert not list(outbox.OUTBOX_PATH.glob("*.json"))
