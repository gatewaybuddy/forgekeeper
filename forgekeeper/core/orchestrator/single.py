"""Single-agent orchestrator used for quick smoke tests."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from .adapters import LLMBase, LLMMock
from .events import Event, JsonlRecorder, Watermark


class SingleOrchestrator:
    def __init__(
        self,
        *,
        recorder_path: Path | str = ".forgekeeper/single_events.jsonl",
        llm: Optional[LLMBase] = None,
        tools=None,
    ) -> None:
        self.recorder = JsonlRecorder(recorder_path)
        self.llm = llm or LLMMock("Solo")
        self.wm = Watermark(interval_ms=500)
        self.seq = 0

    def _next_seq(self) -> int:
        self.seq += 1
        return self.seq

    async def _append(self, role: str, act: str, text: str, stream: str) -> None:
        event = Event(
            seq=self._next_seq(),
            wm_event_time_ms=self.wm.tick(),
            role=role,
            stream=stream,
            act=act,
            text=text,
        )
        await self.recorder.append(event)

    async def run(self, *, duration_s: Optional[float] = None) -> None:
        await self._append("user", "INPUT", "orchestrator:start", "system")
        async for chunk, act in self.llm.stream("", max_tokens=64, time_slice_ms=500):
            await self._append("botA", act, chunk, "llm-botA")
            break
        if duration_s:
            await asyncio.sleep(min(duration_s, 0.2))
        await self._append("user", "INPUT", "orchestrator:stop", "system")


__all__ = ["SingleOrchestrator"]
