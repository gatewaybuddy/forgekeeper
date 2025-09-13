from __future__ import annotations

import asyncio
from asyncio import Queue
from typing import AsyncGenerator, Optional

from forgekeeper_v2.orchestrator.events import Event


class ToolBase:
    def __init__(self, name: str) -> None:
        self.name = name
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._out_q: "Queue[Event]" = Queue()
        self._err_q: "Queue[Event]" = Queue()

    async def start(self) -> None:
        raise NotImplementedError

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                self._proc.kill()
        self._proc = None

    async def send(self, cmd: str) -> None:
        raise NotImplementedError

    async def astream_output(self) -> AsyncGenerator[Event, None]:
        while True:
            out_task = asyncio.create_task(self._out_q.get())
            err_task = asyncio.create_task(self._err_q.get())
            done, pending = await asyncio.wait(
                {out_task, err_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()
            for t in done:
                yield t.result()

