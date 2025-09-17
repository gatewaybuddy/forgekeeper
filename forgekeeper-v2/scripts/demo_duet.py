from __future__ import annotations

import asyncio
import webbrowser
from pathlib import Path

from forgekeeper_v2.orchestrator.adapters import ToolPowerShell, ToolShell
from forgekeeper_v2.orchestrator.events import Watermark
from forgekeeper_v2.orchestrator.orchestrator import Orchestrator
from forgekeeper_v2.ui.server import create_app
import uvicorn


async def main() -> None:
    wm = Watermark()
    tools = [ToolShell(wm), ToolPowerShell(wm)]
    orch = Orchestrator(tools=tools)

    app = create_app(Path(".forgekeeper/events.jsonl"))
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8787, log_level="warning")
    server = uvicorn.Server(config)

    async def _server():
        await server.serve()

    async def _run_orch():
        await orch.run(duration_s=8.0)
        server.should_exit = True

    async def _tool_commands():
        await asyncio.sleep(1.0)
        try:
            await tools[0].send("echo duet-online")
            await tools[1].send("echo duet-online")
            await asyncio.sleep(2.0)
            await tools[1].send("Get-Date")
        except Exception:
            pass

    webbrowser.open("http://127.0.0.1:8787/healthz")
    await asyncio.gather(_server(), _run_orch(), _tool_commands())


if __name__ == "__main__":
    asyncio.run(main())
