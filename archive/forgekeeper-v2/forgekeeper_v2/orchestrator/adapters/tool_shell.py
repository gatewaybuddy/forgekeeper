from __future__ import annotations

import asyncio
import os
import platform

from forgekeeper_v2.orchestrator.events import Event, Watermark
from .tool_base import ToolBase


class ToolShell(ToolBase):
    def __init__(self, watermark: Watermark) -> None:
        super().__init__(name="shell")
        self._wm = watermark

    async def start(self) -> None:
        if platform.system() == "Windows":
            cmd = ["cmd.exe", "/Q"]
        else:
            sh = "/bin/sh" if os.path.exists("/bin/sh") else "sh"
            cmd = [sh, "-i"]
        self._proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        asyncio.create_task(self._pump(self._proc.stdout, False))
        asyncio.create_task(self._pump(self._proc.stderr, True))

    async def _pump(self, stream: asyncio.StreamReader, is_err: bool) -> None:
        while True:
            if stream.at_eof():
                await asyncio.sleep(0.05)
            try:
                line = await stream.readline()
            except Exception:
                break
            if not line:
                await asyncio.sleep(0.05)
                continue
            text = line.decode(errors="ignore").rstrip()
            ev = Event(
                seq=0,
                wm_event_time_ms=self._wm.now_ms(),
                role="tool",
                stream="shell",
                act="TOOL_ERR" if is_err else "TOOL_OUT",
                text=text,
                meta={"tool": "shell"},
            )
            (self._err_q if is_err else self._out_q).put_nowait(ev)

    async def send(self, cmd: str) -> None:
        if not self._proc or not self._proc.stdin:
            return
        data = (cmd + ("\r\n" if platform.system() == "Windows" else "\n")).encode()
        self._proc.stdin.write(data)
        await self._proc.stdin.drain()

