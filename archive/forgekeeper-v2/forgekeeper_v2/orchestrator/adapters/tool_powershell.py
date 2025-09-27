from __future__ import annotations

import asyncio
import platform
import re
import shutil
from typing import Optional

from forgekeeper_v2.orchestrator.events import Event, Watermark
from .tool_base import ToolBase
from .tool_shell import ToolShell


_SECRET_PATTERNS = [
    re.compile(r"(?i)(token\s*[:=]\s*)(\S+)"),
    re.compile(r"(?i)(password\s*[:=]\s*)(\S+)"),
    re.compile(r"(?i)(apikey\s*[:=]\s*)(\S+)"),
]


def _redact(s: str) -> str:
    for pat in _SECRET_PATTERNS:
        s = pat.sub(r"\1[REDACTED]", s)
    return s


class ToolPowerShell(ToolBase):
    def __init__(self, watermark: Watermark) -> None:
        super().__init__(name="powershell")
        self._wm = watermark
        self._fallback: Optional[ToolShell] = None

    async def start(self) -> None:
        system = platform.system()
        if system == "Windows":
            cmd = ["powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass"]
        else:
            if shutil.which("pwsh"):
                cmd = ["pwsh", "-NoLogo", "-NoProfile"]
            else:
                self._fallback = ToolShell(self._wm)
                await self._fallback.start()
                return
        self._proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        asyncio.create_task(self._pump(self._proc.stdout, False))
        asyncio.create_task(self._pump(self._proc.stderr, True))

    async def _pump(self, stream: asyncio.StreamReader, is_err: bool) -> None:
        while True:
            try:
                line = await stream.readline()
            except Exception:
                break
            if not line:
                await asyncio.sleep(0.05)
                continue
            text = _redact(line.decode(errors="ignore").rstrip())
            ev = Event(
                seq=0,
                wm_event_time_ms=self._wm.now_ms(),
                role="tool",
                stream="powershell",
                act="TOOL_ERR" if is_err else "TOOL_OUT",
                text=text,
                meta={"tool": "powershell"},
            )
            (self._err_q if is_err else self._out_q).put_nowait(ev)

    async def send(self, cmd: str) -> None:
        if self._fallback:
            await self._fallback.send(cmd)
            return
        if not self._proc or not self._proc.stdin:
            return
        data = (cmd + ("\r\n" if platform.system() == "Windows" else "\n")).encode()
        self._proc.stdin.write(data)
        await self._proc.stdin.drain()

    async def stop(self) -> None:
        if self._fallback:
            await self._fallback.stop()
            self._fallback = None
            return
        await super().stop()

