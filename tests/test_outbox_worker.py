import asyncio
import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper import outbox, outbox_worker


def test_worker_retries_and_logs(tmp_path, monkeypatch, caplog):
    async def run():
        monkeypatch.chdir(tmp_path)
        monkeypatch.setattr(outbox, "OUTBOX_PATH", tmp_path / "outbox")
        outbox.OUTBOX_PATH.mkdir()
        monkeypatch.setattr(outbox_worker, "OUTBOX_PATH", outbox.OUTBOX_PATH)

        module_path = tmp_path / "dummy_mod.py"
        module_path.write_text(
            "calls=[]\n\n"
            "def foo(x):\n"
            "    calls.append(x)\n"
            "    if len(calls) < 2:\n"
            "        raise RuntimeError('boom')\n",
            encoding="utf-8",
        )
        sys.path.insert(0, str(tmp_path))

        action = {"module": "dummy_mod", "function": "foo", "args": [42], "kwargs": {}}
        outbox.write_action(action)

        monkeypatch.setattr(outbox_worker, "BASE_DELAY", 0.01)
        monkeypatch.setattr(outbox_worker, "MAX_DELAY", 0.01)
        caplog.set_level("INFO")

        task = asyncio.create_task(outbox_worker.run_worker(poll_interval=0.01))

        async def wait_until_empty():
            while list(outbox.OUTBOX_PATH.glob("*.json")):
                await asyncio.sleep(0.05)

        try:
            await asyncio.wait_for(wait_until_empty(), timeout=1)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

        dummy = importlib.import_module("dummy_mod")
        assert dummy.calls == [42, 42]
        assert "failed on attempt 1" in caplog.text
        assert "Action" in caplog.text and "succeeded" in caplog.text

    asyncio.run(run())
