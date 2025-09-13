from __future__ import annotations

import asyncio
import pytest

from forgekeeper_v2.orchestrator.events import Watermark
from forgekeeper_v2.orchestrator.adapters import ToolPowerShell


@pytest.mark.asyncio
async def test_tool_powershell_basic() -> None:
    wm = Watermark()
    tool = ToolPowerShell(wm)
    await tool.start()
    await tool.send("echo 4242")

    async def _read_one():
        async for ev in tool.astream_output():
            if ev.act == "TOOL_OUT" and "4242" in ev.text:
                return True
    ok = await asyncio.wait_for(_read_one(), timeout=7.0)
    assert ok
    await tool.stop()

