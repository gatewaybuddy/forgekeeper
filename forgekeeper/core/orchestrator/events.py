"""Event primitives and JSONL recorder for the orchestrator."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

Role = str
Act = str


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class Event:
    seq: int
    wm_event_time_ms: int
    role: Role
    stream: str
    act: Act
    text: str = ""
    meta: dict[str, Any] = field(default_factory=dict)
    t_utc_iso: str = field(default_factory=_utc_iso)

    def to_json(self) -> str:
        payload = {
            "t_utc_iso": self.t_utc_iso,
            "seq": self.seq,
            "wm_event_time_ms": self.wm_event_time_ms,
            "role": self.role,
            "stream": self.stream,
            "act": self.act,
            "text": self.text,
            "meta": self.meta,
        }
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def from_json(line: str) -> Event:
        raw = json.loads(line)
        return Event(
            seq=int(raw.get("seq", 0)),
            wm_event_time_ms=int(raw.get("wm_event_time_ms", 0)),
            role=str(raw.get("role", "")),
            stream=str(raw.get("stream", "")),
            act=str(raw.get("act", "")),
            text=str(raw.get("text", "")),
            meta=dict(raw.get("meta", {})),
            t_utc_iso=str(raw.get("t_utc_iso", _utc_iso())),
        )


class JsonlRecorder:
    """Append-only JSONL recorder with async-safe writes."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def append(self, event: Event | dict[str, Any]) -> None:
        line = event.to_json() if isinstance(event, Event) else json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        async with self._lock:
            await asyncio.to_thread(self._write_line, line)

    def _write_line(self, line: str) -> None:
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def read_all(self) -> list[Event]:
        if not self.path.exists():
            return []
        events: list[Event] = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                events.append(Event.from_json(line))
            except Exception:
                continue
        return events

    async def tail(self, start_offset: Optional[int] = None) -> AsyncGenerator[Event, None]:
        while not self.path.exists():
            await asyncio.sleep(0.1)
        with self.path.open("r", encoding="utf-8") as fh:
            if start_offset is not None:
                for _ in range(start_offset):
                    fh.readline()
            while True:
                line = fh.readline()
                if not line:
                    await asyncio.sleep(0.1)
                    continue
                try:
                    yield Event.from_json(line)
                except Exception:
                    continue


class Watermark:
    """Monotonic time helper used for event sequencing."""

    def __init__(self, interval_ms: int = 500) -> None:
        self.interval_ms = interval_ms
        self._last_ms = self.now_ms()

    @staticmethod
    def now_ms() -> int:
        return int(time.time() * 1000)

    def tick(self) -> int:
        self._last_ms = self.now_ms()
        return self._last_ms


__all__ = ["Event", "JsonlRecorder", "Watermark"]
