from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Optional, Literal

from pydantic import BaseModel, Field


Role = Literal["user", "botA", "botB", "tool"]
Act = Literal[
    "INPUT",
    "ASK(user)",
    "ASK(peer)",
    "PROPOSE(action)",
    "THINK",
    "REPORT",
    "TOOL_OUT",
    "TOOL_ERR",
    "CORRECTION",
]


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Event(BaseModel):
    t_utc_iso: str = Field(default_factory=_utc_iso)
    seq: int
    wm_event_time_ms: int
    role: Role
    stream: str
    act: Act
    text: str = ""
    meta: dict[str, Any] = Field(default_factory=dict)


class JsonlRecorder:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def append(self, event: Event) -> None:
        async with self._lock:
            with self.path.open("a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")

    def read_all(self) -> list[Event]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()
        out: list[Event] = []
        for line in lines:
            if not line.strip():
                continue
            try:
                out.append(Event.model_validate_json(line))
            except Exception:
                continue
        return out

    async def tail(self, start_offset: Optional[int] = None) -> AsyncGenerator[Event, None]:
        while not self.path.exists():
            await asyncio.sleep(0.1)
        with self.path.open("r", encoding="utf-8") as f:
            if start_offset is not None:
                for _ in range(start_offset):
                    f.readline()
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.1)
                    continue
                try:
                    yield Event.model_validate_json(line)
                except Exception:
                    continue


class Watermark:
    def __init__(self, interval_ms: int = 500):
        self.interval_ms = interval_ms
        self._last_ms = self.now_ms()

    @staticmethod
    def now_ms() -> int:
        return int(time.time() * 1000)

    def tick(self) -> int:
        ms = self.now_ms()
        self._last_ms = ms
        return ms

