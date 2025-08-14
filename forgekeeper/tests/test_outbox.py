import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import importlib.util
import types

import forgekeeper.outbox as outbox


spec = importlib.util.spec_from_file_location(
    "tool_utils", ROOT / "forgekeeper" / "agent" / "tool_utils.py"
)
fake_loader = types.SimpleNamespace(load_functions=lambda: {"echo": lambda text: text})
sys.modules["forgekeeper.app.services.function_loader"] = fake_loader
tool_utils = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool_utils)  # type: ignore


def test_outbox_records_and_replays(tmp_path, monkeypatch):
    monkeypatch.setattr(outbox, "OUTBOX_PATH", tmp_path)
    tmp_path.mkdir(exist_ok=True)

    monkeypatch.setattr(tool_utils, "_FUNCTIONS", {"echo": lambda text: text})

    call = {"function": {"name": "echo", "arguments": "{\"text\": \"hi\"}"}}
    result = tool_utils.execute_tool_call(call)
    assert result == "hi"
    assert not list(tmp_path.iterdir())

    outbox.write_action(call)
    results = []
    outbox.replay_pending(lambda c: results.append(tool_utils.execute_tool_call(c, record=False)))
    assert results == ["hi"]
    assert not list(tmp_path.iterdir())
